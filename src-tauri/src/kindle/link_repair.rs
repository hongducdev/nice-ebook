//! Repairs internal links that would otherwise abort a Kindle conversion.
//!
//! The KF8 builder is strict: every internal link must resolve to a document that was actually
//! generated. Books in the wild frequently link to documents that are missing from the archive or
//! absent from the spine, which fails the whole build with:
//!
//! ```text
//! KF8 build failed: output error: internal link target does not resolve to a generated document:
//! start_split9.xhtml#b7
//! ```
//!
//! This pass runs on the staged EPUB — the exact bytes handed to the converter — so it also covers
//! documents the frontend never enumerates (non-spine XHTML, stray files). Links are unwrapped to
//! plain text rather than deleted, so no readable content is lost.

use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LinkRepairReport {
    pub documents_scanned: usize,
    pub dangling_links_removed: usize,
    pub fragments_stripped: usize,
    pub missing_targets: Vec<String>,
}

const DOCUMENT_EXTENSIONS: [&str; 3] = ["xhtml", "html", "htm"];

fn is_document_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    DOCUMENT_EXTENSIONS
        .iter()
        .any(|ext| lower.ends_with(&format!(".{}", ext)))
}

/// Minimal percent-decoding, used so `ch%202.xhtml` compares equal to `ch 2.xhtml`.
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(value) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(value);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// Collapses `.` and `..` segments in an archive-relative path.
fn normalize_segments(segments: &[&str]) -> String {
    let mut out: Vec<&str> = Vec::new();
    for segment in segments {
        match *segment {
            "" | "." => continue,
            ".." => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    out.join("/")
}

fn normalize_path(path: &str) -> String {
    let decoded = percent_decode(path);
    let segments: Vec<&str> = decoded.split('/').collect();
    normalize_segments(&segments)
}

/// Resolves a reference relative to the document that contains it.
fn resolve_target(current_doc: &str, reference: &str) -> String {
    if reference.starts_with('/') {
        let segments: Vec<&str> = reference.split('/').collect();
        return normalize_segments(&segments);
    }
    let dir = match current_doc.rfind('/') {
        Some(idx) => &current_doc[..idx],
        None => "",
    };
    let mut segments: Vec<&str> = if dir.is_empty() {
        Vec::new()
    } else {
        dir.split('/').collect()
    };
    segments.extend(reference.split('/'));
    normalize_segments(&segments)
}

fn is_external_href(href: &str) -> bool {
    let trimmed = href.trim();
    if trimmed.starts_with("//") {
        return true;
    }
    // A scheme like `https:`, `mailto:`, `tel:` — but not a relative path such as `ch1.xhtml`.
    let mut chars = trimmed.chars();
    match chars.next() {
        Some(first) if first.is_ascii_alphabetic() => {}
        _ => return false,
    }
    for c in chars {
        if c == ':' {
            return true;
        }
        if !(c.is_ascii_alphanumeric() || c == '+' || c == '-' || c == '.') {
            return false;
        }
    }
    false
}

/// Calls `visit` for each tag in the document. Returning `Some(replacement)` substitutes the tag.
///
/// Quoted attribute values are respected, so a `>` inside `alt="a > b"` cannot end a tag early.
fn map_tags<F>(html: &str, mut visit: F) -> String
where
    F: FnMut(&str) -> Option<String>,
{
    let bytes = html.as_bytes();
    let mut out = String::with_capacity(html.len());
    let mut cursor = 0;

    while cursor < bytes.len() {
        let Some(offset) = html[cursor..].find('<') else {
            out.push_str(&html[cursor..]);
            break;
        };
        let lt = cursor + offset;
        out.push_str(&html[cursor..lt]);

        // Comments, doctype and processing instructions are copied verbatim.
        if html[lt..].starts_with("<!--") {
            let end = html[lt..]
                .find("-->")
                .map(|i| lt + i + 3)
                .unwrap_or(bytes.len());
            out.push_str(&html[lt..end]);
            cursor = end;
            continue;
        }

        let mut i = lt + 1;
        let mut quote: Option<u8> = None;
        while i < bytes.len() {
            let b = bytes[i];
            match quote {
                Some(q) => {
                    if b == q {
                        quote = None;
                    }
                }
                None => {
                    if b == b'"' || b == b'\'' {
                        quote = Some(b);
                    } else if b == b'>' {
                        break;
                    }
                }
            }
            i += 1;
        }

        let end = if i >= bytes.len() { bytes.len() } else { i + 1 };
        let raw = &html[lt..end];
        match visit(raw) {
            Some(replacement) => out.push_str(&replacement),
            None => out.push_str(raw),
        }
        cursor = end;
    }

    out
}

/// Lower-cased tag name, or `None` when this is not a start/end tag.
fn tag_name(raw: &str) -> Option<(String, bool)> {
    if !raw.starts_with('<') {
        return None;
    }
    let rest = &raw[1..];
    let (rest, is_closing) = match rest.strip_prefix('/') {
        Some(r) => (r, true),
        None => (rest, false),
    };
    if rest.starts_with('!') || rest.starts_with('?') {
        return None;
    }
    let name: String = rest
        .chars()
        .take_while(|c| !c.is_whitespace() && *c != '>' && *c != '/')
        .collect();
    if name.is_empty() {
        None
    } else {
        Some((name.to_ascii_lowercase(), is_closing))
    }
}

/// Location of an attribute inside a raw tag.
struct AttrLocation {
    value: String,
    value_start: usize,
    value_end: usize,
    /// Start of the attribute *name*, so the whole attribute can be removed.
    name_start: usize,
    /// Whether the value was quoted, so removal spans can include the closing quote.
    quoted: bool,
}

/// Returns the value of `attr` inside a raw tag, with the byte ranges needed to rewrite or drop it.
fn find_attribute(raw: &str, attr: &str) -> Option<AttrLocation> {
    let bytes = raw.as_bytes();
    let lower = raw.to_ascii_lowercase();
    let needle = format!("{}=", attr);
    let mut search_from = 0usize;

    while let Some(found) = lower[search_from..].find(&needle) {
        let name_start = search_from + found;
        // Must sit at an attribute boundary, so `data-href=` is never mistaken for `href=`.
        let boundary_ok =
            matches!(lower[..name_start].chars().last(), Some(c) if c.is_whitespace());
        if !boundary_ok {
            search_from = name_start + needle.len();
            continue;
        }

        let mut i = name_start + needle.len();
        while i < bytes.len() && (bytes[i] as char).is_whitespace() {
            i += 1;
        }
        if i >= bytes.len() {
            return None;
        }

        let quote = bytes[i];
        if quote == b'"' || quote == b'\'' {
            let value_start = i + 1;
            let mut j = value_start;
            while j < bytes.len() && bytes[j] != quote {
                j += 1;
            }
            return Some(AttrLocation {
                value: raw[value_start..j].to_string(),
                value_start,
                // `value_end` is the index of the closing quote, which is exactly what a value
                // replacement needs; removal spans add one to include the quote itself.
                value_end: j,
                name_start,
                quoted: true,
            });
        }

        let value_start = i;
        let mut j = value_start;
        while j < bytes.len() {
            let c = bytes[j];
            if c == b'>' || (c as char).is_whitespace() {
                break;
            }
            j += 1;
        }
        return Some(AttrLocation {
            value: raw[value_start..j].to_string(),
            value_start,
            value_end: j,
            name_start,
            quoted: false,
        });
    }

    None
}

/// Span covering the whole attribute including its leading separator whitespace.
///
/// For a quoted value the closing quote is included, so deleting this span cannot leave an
/// unbalanced quote behind (which would make the document invalid XML).
fn attribute_span(raw: &str, attr: &str) -> Option<(usize, usize)> {
    let location = find_attribute(raw, attr)?;
    let mut start = location.name_start;
    while start > 0 && (raw.as_bytes()[start - 1] as char).is_whitespace() {
        start -= 1;
    }
    let end = if location.quoted {
        location.value_end + 1
    } else {
        location.value_end
    };
    Some((start, end.min(raw.len())))
}

/// Collects anchor names (`id` on any element, `name` on `<a>`) defined by a document.
fn collect_anchors(html: &str) -> HashSet<String> {
    let mut anchors = HashSet::new();
    let out = map_tags(html, |raw| {
        if let Some((name, is_closing)) = tag_name(raw) {
            if !is_closing {
                if let Some(location) = find_attribute(raw, "id") {
                    anchors.insert(location.value);
                }
                if name == "a" {
                    if let Some(location) = find_attribute(raw, "name") {
                        anchors.insert(location.value);
                    }
                }
            }
        }
        None
    });
    // `map_tags` is used purely for iteration here.
    let _ = out;
    anchors
}

/// Rewrites one document, returning the repaired HTML.
fn repair_document(
    html: &str,
    doc_path: &str,
    documents: &HashSet<String>,
    anchors: &HashMap<String, HashSet<String>>,
    report: &mut LinkRepairReport,
) -> String {
    let current = normalize_path(doc_path);

    map_tags(html, |raw| {
        let (name, is_closing) = tag_name(raw)?;
        if is_closing || (name != "a" && name != "area") {
            return None;
        }

        let href_location = find_attribute(raw, "href")?;
        let href = href_location.value.clone();
        let value_start = href_location.value_start;
        let value_end = href_location.value_end;
        if href.trim().is_empty() || is_external_href(&href) {
            return None;
        }

        let (path_part, fragment) = match href.find('#') {
            Some(idx) => (&href[..idx], &href[idx + 1..]),
            None => (href.as_str(), ""),
        };

        let same_document = path_part.trim().is_empty();
        let target = if same_document {
            current.clone()
        } else {
            resolve_target(&current, &percent_decode(path_part))
        };
        let target_anchors = if same_document {
            anchors.get(&current)
        } else {
            anchors.get(&target)
        };

        // Case 1: the linked document is not in the archive at all -> unwrap the link.
        if !documents.contains(&target) {
            report.dangling_links_removed += 1;
            if !report.missing_targets.contains(&href) {
                report.missing_targets.push(href.clone());
            }
            let (start, end) = attribute_span(raw, "href")?;
            let mut replaced = String::with_capacity(raw.len());
            replaced.push_str(&raw[..start]);
            replaced.push_str(&raw[end..]);
            return Some(replaced);
        }

        // Case 2: the document exists but the anchor does not -> keep the link, drop the fragment.
        if !fragment.is_empty() {
            let missing_anchor = target_anchors
                .map(|set| !set.contains(&percent_decode(fragment)))
                .unwrap_or(false);
            if missing_anchor {
                report.fragments_stripped += 1;
                if same_document {
                    let (start, end) = attribute_span(raw, "href")?;
                    let mut replaced = String::with_capacity(raw.len());
                    replaced.push_str(&raw[..start]);
                    replaced.push_str(&raw[end..]);
                    return Some(replaced);
                }
                let mut replaced = String::with_capacity(raw.len());
                replaced.push_str(&raw[..value_start]);
                replaced.push_str(path_part);
                replaced.push_str(&raw[value_end..]);
                return Some(replaced);
            }
        }

        None
    })
}

/// Repairs dangling internal links inside an EPUB file, in place.
pub fn repair_dangling_links_in_epub(epub_path: &Path) -> Result<LinkRepairReport, String> {
    use zip::ZipArchive;

    let mut report = LinkRepairReport::default();
    let mut repaired: HashMap<String, String> = HashMap::new();

    {
        let file = std::fs::File::open(epub_path)
            .map_err(|e| format!("Không mở được EPUB để sửa liên kết: {}", e))?;
        let mut archive =
            ZipArchive::new(file).map_err(|e| format!("EPUB không phải ZIP hợp lệ: {}", e))?;

        // Pass 1: collect the document set and each document's anchors.
        let mut documents: HashSet<String> = HashSet::new();
        let mut html_by_entry: HashMap<String, String> = HashMap::new();

        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| format!("Lỗi đọc entry trong EPUB: {}", e))?;
            let name = entry.name().to_string();

            if is_document_path(&name) {
                let mut content = String::new();
                if entry.read_to_string(&mut content).is_ok() {
                    documents.insert(normalize_path(&name));
                    html_by_entry.insert(name, content);
                }
            }
        }

        let mut anchors: HashMap<String, HashSet<String>> = HashMap::new();
        for (name, html) in &html_by_entry {
            anchors.insert(normalize_path(name), collect_anchors(html));
        }

        // Pass 2: repair each document.
        for (name, html) in &html_by_entry {
            report.documents_scanned += 1;
            let fixed = repair_document(html, name, &documents, &anchors, &mut report);
            if &fixed != html {
                repaired.insert(name.clone(), fixed);
            }
        }
    }

    if repaired.is_empty() {
        return Ok(report);
    }

    // Pass 3: rewrite the archive, replacing only the repaired documents.
    super::epub_rewrite::rewrite_epub_entries(epub_path, &repaired, &HashMap::new())?;

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    // The production import no longer needs `Write`; the test fixtures below do.
    use std::io::Write;
    use std::path::PathBuf;
    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipWriter};

    fn unique_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "linkfix_{}_{}",
            tag,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn empty_sets() -> (HashSet<String>, HashMap<String, HashSet<String>>) {
        (HashSet::new(), HashMap::new())
    }

    #[test]
    fn test_external_links_are_never_considered_internal() {
        assert!(is_external_href("https://example.com"));
        assert!(is_external_href("HTTP://example.com"));
        assert!(is_external_href("mailto:a@b.c"));
        assert!(is_external_href("tel:+841234"));
        assert!(is_external_href("//cdn.example.com/a"));
        assert!(!is_external_href("ch1.xhtml"));
        assert!(!is_external_href("../Text/ch1.xhtml"));
        assert!(!is_external_href("#anchor"));
        assert!(!is_external_href("/abs/path.xhtml"));
    }

    #[test]
    fn test_path_resolution() {
        assert_eq!(
            resolve_target("OEBPS/Text/ch1.xhtml", "ch2.xhtml"),
            "OEBPS/Text/ch2.xhtml"
        );
        // A single `..` climbs out of Text/ into OEBPS/.
        assert_eq!(
            resolve_target("OEBPS/Text/ch1.xhtml", "../a.xhtml"),
            "OEBPS/a.xhtml"
        );
        assert_eq!(
            resolve_target("OEBPS/Text/ch1.xhtml", "./ch3.xhtml"),
            "OEBPS/Text/ch3.xhtml"
        );
        // Archive-absolute references are resolved from the root.
        assert_eq!(
            resolve_target("OEBPS/Text/ch1.xhtml", "/root.xhtml"),
            "root.xhtml"
        );
        // Climbing past the root must terminate, not underflow.
        assert_eq!(resolve_target("ch1.xhtml", "../../a.xhtml"), "a.xhtml");
        // Percent-encoded and literal forms must compare equal.
        assert_eq!(normalize_path("OEBPS/ch%202.xhtml"), "OEBPS/ch 2.xhtml");
        assert_eq!(normalize_path("OEBPS/ch 2.xhtml"), "OEBPS/ch 2.xhtml");
    }

    #[test]
    fn test_repairs_the_exact_reported_failure() {
        // Mirrors: internal link target does not resolve ... start_split9.xhtml#b7
        let html =
            r#"<html><body><p>Xem <a href="start_split9.xhtml#b7">phần bảy</a>.</p></body></html>"#;
        let (documents, anchors) = empty_sets();
        let mut report = LinkRepairReport::default();

        let fixed = repair_document(html, "OEBPS/ch1.xhtml", &documents, &anchors, &mut report);

        assert!(
            !fixed.contains("start_split9.xhtml"),
            "dangling target survived: {}",
            fixed
        );
        assert!(
            fixed.contains("<a"),
            "the anchor element itself should remain"
        );
        assert!(
            fixed.contains("phần bảy"),
            "readable text must be preserved"
        );
        assert_eq!(report.dangling_links_removed, 1);
        assert_eq!(
            report.missing_targets,
            vec!["start_split9.xhtml#b7".to_string()]
        );
    }

    #[test]
    fn test_valid_links_are_left_byte_identical() {
        let html = r#"<html><body><p><a href="ch2.xhtml#sec2">ok</a> <a href="https://x.y">ext</a></p></body></html>"#;
        let mut documents = HashSet::new();
        documents.insert("OEBPS/Text/ch2.xhtml".to_string());
        let mut anchors = HashMap::new();
        anchors.insert(
            "OEBPS/Text/ch2.xhtml".to_string(),
            HashSet::from(["sec2".to_string()]),
        );
        let mut report = LinkRepairReport::default();

        let fixed = repair_document(
            html,
            "OEBPS/Text/ch1.xhtml",
            &documents,
            &anchors,
            &mut report,
        );

        assert_eq!(fixed, html);
        assert_eq!(report.dangling_links_removed, 0);
        assert_eq!(report.fragments_stripped, 0);
    }

    #[test]
    fn test_missing_anchor_keeps_the_document_link() {
        let html = r#"<html><body><a href="ch2.xhtml#nope">x</a></body></html>"#;
        let mut documents = HashSet::new();
        documents.insert("OEBPS/ch2.xhtml".to_string());
        let mut anchors = HashMap::new();
        anchors.insert("OEBPS/ch2.xhtml".to_string(), HashSet::new());
        let mut report = LinkRepairReport::default();

        let fixed = repair_document(html, "OEBPS/ch1.xhtml", &documents, &anchors, &mut report);

        assert!(fixed.contains(r#"href="ch2.xhtml""#), "got: {}", fixed);
        assert!(!fixed.contains("#nope"));
        assert_eq!(report.fragments_stripped, 1);
        assert_eq!(report.dangling_links_removed, 0);
    }

    #[test]
    fn test_a_gt_inside_a_quoted_attribute_does_not_break_parsing() {
        let html = r#"<p><img alt="a > b" src="x.png"/><a href="ghost.xhtml">t</a></p>"#;
        let (documents, anchors) = empty_sets();
        let mut report = LinkRepairReport::default();

        let fixed = repair_document(html, "OEBPS/c.xhtml", &documents, &anchors, &mut report);

        assert!(
            fixed.contains(r#"alt="a > b""#),
            "attribute was mangled: {}",
            fixed
        );
        assert!(!fixed.contains("ghost.xhtml"));
        assert_eq!(report.dangling_links_removed, 1);
    }

    #[test]
    fn test_removing_an_attribute_leaves_balanced_quotes() {
        // Regression guard: an earlier version ended the removal span at the closing quote, which
        // left a stray `"` behind and produced invalid XML (`tag not closed`).
        let html = r#"<html><body><a href="ghost.xhtml">text</a></body></html>"#;
        let (documents, anchors) = empty_sets();
        let mut report = LinkRepairReport::default();

        let fixed = repair_document(html, "OEBPS/c.xhtml", &documents, &anchors, &mut report);

        assert_eq!(
            fixed.matches('"').count(),
            0,
            "unbalanced quote left behind: {}",
            fixed
        );
        assert!(fixed.contains("<a>text</a>"), "got: {}", fixed);
    }

    #[test]
    fn test_removing_an_unquoted_attribute_is_well_formed() {
        let html = r#"<html><body><a href=ghost.xhtml class="c">text</a></body></html>"#;
        let (documents, anchors) = empty_sets();
        let mut report = LinkRepairReport::default();

        let fixed = repair_document(html, "OEBPS/c.xhtml", &documents, &anchors, &mut report);

        assert!(!fixed.contains("ghost.xhtml"), "got: {}", fixed);
        assert!(
            fixed.contains(r#"class="c""#),
            "sibling attribute lost: {}",
            fixed
        );
        assert_eq!(
            fixed.matches('"').count() % 2,
            0,
            "unbalanced quotes: {}",
            fixed
        );
    }

    #[test]
    fn test_anchor_collection_reads_id_and_legacy_name() {
        let html =
            r#"<html><body><h1 id="top">t</h1><a name="legacy"></a><p id="p1"></p></body></html>"#;
        let anchors = collect_anchors(html);
        assert!(anchors.contains("top"));
        assert!(anchors.contains("legacy"));
        assert!(anchors.contains("p1"));
        assert!(!anchors.contains("missing"));
    }

    #[test]
    fn test_end_to_end_repairs_a_real_epub_archive() {
        let dir = unique_dir("e2e");
        let epub = dir.join("book.epub");

        {
            let file = std::fs::File::create(&epub).unwrap();
            let mut writer = ZipWriter::new(file);
            let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            let deflated =
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

            writer.start_file("mimetype", stored).unwrap();
            writer.write_all(b"application/epub+zip").unwrap();
            writer
                .start_file("META-INF/container.xml", deflated)
                .unwrap();
            writer
                .write_all(
                    br#"<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>"#,
                )
                .unwrap();
            writer.start_file("OEBPS/content.opf", deflated).unwrap();
            writer
                .write_all(
                    br#"<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>"#,
                )
                .unwrap();
            writer.start_file("OEBPS/ch1.xhtml", deflated).unwrap();
            writer
                .write_all(
                    r#"<html xmlns="http://www.w3.org/1999/xhtml"><head><title>C1</title></head><body><p><a href="start_split9.xhtml#b7">phần bảy</a></p></body></html>"#
                        .as_bytes(),
                )
                .unwrap();
            writer.finish().unwrap();
        }

        let report = repair_dangling_links_in_epub(&epub).unwrap();
        assert_eq!(report.dangling_links_removed, 1);
        assert_eq!(report.documents_scanned, 1);

        // The rewritten archive must still be a readable EPUB with mimetype first.
        let file = std::fs::File::open(&epub).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let first = archive.by_index(0).unwrap();
        assert_eq!(first.name(), "mimetype");
        assert_eq!(first.compression(), CompressionMethod::Stored);
        drop(first);

        let mut ch1 = String::new();
        archive
            .by_name("OEBPS/ch1.xhtml")
            .unwrap()
            .read_to_string(&mut ch1)
            .unwrap();
        assert!(!ch1.contains("start_split9.xhtml"));
        assert!(ch1.contains("phần bảy"));

        // A second pass must be a no-op (idempotent).
        let second = repair_dangling_links_in_epub(&epub).unwrap();
        assert_eq!(second.dangling_links_removed, 0);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
