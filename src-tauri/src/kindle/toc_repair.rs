//! Ensures an EPUB has the navigation structures a Kindle conversion needs.
//!
//! Verified empirically against `epub3-kindle` 0.4.1 with Calibre as an independent reader:
//!
//! | Source EPUB        | Result of conversion                                   |
//! |--------------------|--------------------------------------------------------|
//! | no nav, no NCX     | `InvalidFile: Not a valid b'INDX' section` — unusable   |
//! | has nav + NCX      | reads back cleanly                                      |
//!
//! A source without a navigation document and without an NCX therefore produced a structurally
//! broken AZW3 (its table-of-contents index was malformed), which also breaks navigation and
//! anything that depends on it. This pass synthesizes whichever of the two is missing, derived from
//! the OPF spine, so the converter always has valid navigation input.

use std::collections::HashMap;
use std::io::Read;
use std::path::Path;

use serde::{Deserialize, Serialize};
use zip::ZipArchive;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TocRepairReport {
    pub had_ncx: bool,
    pub had_nav: bool,
    pub added_ncx: bool,
    pub added_nav: bool,
    pub entry_count: usize,
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn find_opf_path(archive: &mut ZipArchive<std::fs::File>) -> Result<String, String> {
    let mut container = archive
        .by_name("META-INF/container.xml")
        .map_err(|_| "EPUB thiếu META-INF/container.xml".to_string())?;
    let mut content = String::new();
    container
        .read_to_string(&mut content)
        .map_err(|e| format!("Lỗi đọc container.xml: {}", e))?;

    let marker = "full-path=\"";
    let start = content
        .find(marker)
        .ok_or_else(|| "container.xml không khai báo rootfile".to_string())?
        + marker.len();
    let rest = &content[start..];
    let end = rest
        .find('"')
        .ok_or_else(|| "container.xml có full-path không hợp lệ".to_string())?;
    Ok(rest[..end].to_string())
}

/// Builds the NCX document for the given TOC entries.
fn build_ncx(title: &str, uid: &str, entries: &[(String, String)]) -> String {
    let mut points = String::new();
    for (index, (href, label)) in entries.iter().enumerate() {
        points.push_str(&format!(
            "    <navPoint id=\"navPoint-{n}\" playOrder=\"{n}\">\n\
             \x20     <navLabel><text>{label}</text></navLabel>\n\
             \x20     <content src=\"{href}\"/>\n\
             \x20   </navPoint>\n",
            n = index + 1,
            label = escape_xml(label),
            href = escape_xml(href)
        ));
    }

    format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n\
         <ncx xmlns=\"http://www.daisy.org/z3986/2005/ncx/\" version=\"2005-1\">\n\
         \x20 <head>\n\
         \x20   <meta name=\"dtb:uid\" content=\"{uid}\"/>\n\
         \x20   <meta name=\"dtb:depth\" content=\"1\"/>\n\
         \x20   <meta name=\"dtb:totalPageCount\" content=\"0\"/>\n\
         \x20   <meta name=\"dtb:maxPageNumber\" content=\"0\"/>\n\
         \x20 </head>\n\
         \x20 <docTitle><text>{title}</text></docTitle>\n\
         \x20 <navMap>\n{points}  </navMap>\n\
         </ncx>\n",
        uid = escape_xml(uid),
        title = escape_xml(title),
        points = points
    )
}

/// Builds the EPUB 3 navigation document for the given TOC entries.
fn build_nav(title: &str, entries: &[(String, String)]) -> String {
    let mut items = String::new();
    for (href, label) in entries {
        items.push_str(&format!(
            "      <li><a href=\"{}\">{}</a></li>\n",
            escape_xml(href),
            escape_xml(label)
        ));
    }

    format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n\
         <!DOCTYPE html>\n\
         <html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\">\n\
         <head><title>{title}</title></head>\n\
         <body>\n\
         \x20 <nav epub:type=\"toc\" id=\"toc\">\n\
         \x20   <h1>{title}</h1>\n\
         \x20   <ol>\n{items}  </ol>\n\
         \x20 </nav>\n\
         </body>\n\
         </html>\n",
        title = escape_xml(title),
        items = items
    )
}

/// Adds `toc="ncx"` to the `<spine>` element when it is absent.
fn ensure_spine_toc_attribute(opf: &str) -> String {
    let Some(start) = opf.find("<spine") else {
        return opf.to_string();
    };
    let Some(relative_end) = opf[start..].find('>') else {
        return opf.to_string();
    };
    let spine_tag = &opf[start..start + relative_end];
    if spine_tag.contains("toc=") {
        return opf.to_string();
    }

    let mut result = opf[..start].to_string();
    result.push_str(&format!("{spine_tag} toc=\"ncx\""));
    result.push_str(&opf[start + relative_end..]);
    result
}

/// Synthesizes the NCX and/or navigation document when the EPUB is missing them.
pub fn ensure_navigation_documents(epub_path: &Path) -> Result<TocRepairReport, String> {
    let mut report = TocRepairReport::default();
    let mut replacements: HashMap<String, String> = HashMap::new();
    let mut additions: HashMap<String, String> = HashMap::new();

    {
        let file = std::fs::File::open(epub_path)
            .map_err(|e| format!("Không mở được EPUB để bổ sung mục lục: {}", e))?;
        let mut archive =
            ZipArchive::new(file).map_err(|e| format!("EPUB không phải ZIP hợp lệ: {}", e))?;

        let opf_path = find_opf_path(&mut archive)?;
        let opf_base_dir = match opf_path.rfind('/') {
            Some(idx) => opf_path[..=idx].to_string(),
            None => String::new(),
        };

        let mut opf_content = String::new();
        archive
            .by_name(&opf_path)
            .map_err(|e| format!("Không đọc được OPF '{}': {}", opf_path, e))?
            .read_to_string(&mut opf_content)
            .map_err(|e| format!("Lỗi đọc OPF: {}", e))?;

        let (meta, manifest, spine_ids, _cover) = crate::epub::EpubParser::parse_opf(&opf_content)?;

        report.had_ncx = manifest
            .values()
            .any(|href| href.to_ascii_lowercase().ends_with(".ncx"));
        // `properties="nav"` is the EPUB 3 way of declaring the navigation document.
        report.had_nav = opf_content.contains("properties=") && opf_content.contains("nav");

        if report.had_ncx && report.had_nav {
            return Ok(report);
        }

        // Build the TOC from the spine, in reading order, using each chapter's own title.
        let mut entries: Vec<(String, String)> = Vec::new();
        for id in &spine_ids {
            let Some(href) = manifest.get(id) else {
                continue;
            };
            let full_path = format!("{}{}", opf_base_dir, href);

            let label = archive
                .by_name(&full_path)
                .ok()
                .and_then(|mut entry| {
                    let mut content = String::new();
                    entry.read_to_string(&mut content).ok()?;
                    crate::epub::EpubWriter::extract_document_title(&content)
                })
                .unwrap_or_else(|| format!("Chương {}", entries.len() + 1));

            entries.push((href.clone(), label));
        }
        report.entry_count = entries.len();

        if entries.is_empty() {
            // Nothing to navigate; leave the book untouched rather than emitting an empty TOC.
            return Ok(report);
        }

        let mut manifest_items = String::new();

        if !report.had_ncx {
            additions.insert(
                format!("{}toc.ncx", opf_base_dir),
                build_ncx(&meta.title, "urn:nice-ebook:toc", &entries),
            );
            manifest_items.push_str(
                "    <item id=\"nice-ebook-ncx\" href=\"toc.ncx\" media-type=\"application/x-dtbncx+xml\"/>\n",
            );
            report.added_ncx = true;
        }

        if !report.had_nav {
            additions.insert(
                format!("{}nav.xhtml", opf_base_dir),
                build_nav(&meta.title, &entries),
            );
            manifest_items.push_str(
                "    <item id=\"nice-ebook-nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>\n",
            );
            report.added_nav = true;
        }

        let mut updated_opf = opf_content.clone();
        if let Some(pos) = updated_opf.find("</manifest>") {
            updated_opf.insert_str(pos, &manifest_items);
        }
        if report.added_ncx {
            updated_opf = ensure_spine_toc_attribute(&updated_opf);
        }
        replacements.insert(opf_path, updated_opf);
    }

    super::epub_rewrite::rewrite_epub_entries(epub_path, &replacements, &additions)?;

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;
    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipWriter};

    fn unique_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "tocrepair_{}_{}",
            tag,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Builds an EPUB with an optional NCX and nav document.
    fn build_epub(path: &Path, with_ncx: bool, with_nav: bool) {
        let mut manifest = String::new();
        let mut spine = String::new();
        if with_nav {
            manifest.push_str(
                "<item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>",
            );
        }
        if with_ncx {
            manifest.push_str(
                "<item id=\"ncx\" href=\"toc.ncx\" media-type=\"application/x-dtbncx+xml\"/>",
            );
        }
        manifest.push_str(
            "<item id=\"ch1\" href=\"ch1.xhtml\" media-type=\"application/xhtml+xml\"/>\
             <item id=\"ch2\" href=\"ch2.xhtml\" media-type=\"application/xhtml+xml\"/>",
        );
        spine.push_str("<itemref idref=\"ch1\"/><itemref idref=\"ch2\"/>");

        let toc_attr = if with_ncx { " toc=\"ncx\"" } else { "" };
        let opf = format!(
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
             <package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"pub-id\">\
             <metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\
             <dc:identifier id=\"pub-id\">urn:uuid:toc-test</dc:identifier>\
             <dc:title>Tiêu Đề Sách</dc:title><dc:creator>Tác Giả</dc:creator><dc:language>vi</dc:language>\
             </metadata>\
             <manifest>{manifest}</manifest>\
             <spine{toc_attr}>{spine}</spine></package>"
        );

        let file = std::fs::File::create(path).unwrap();
        let mut writer = ZipWriter::new(file);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        writer.start_file("mimetype", stored).unwrap();
        writer.write_all(b"application/epub+zip").unwrap();
        writer
            .start_file("META-INF/container.xml", deflated)
            .unwrap();
        writer
            .write_all(
                br#"<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#,
            )
            .unwrap();
        writer.start_file("OEBPS/content.opf", deflated).unwrap();
        writer.write_all(opf.as_bytes()).unwrap();

        let ch1 = r#"<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chương Một</title></head><body><h1>Chương Một</h1><p>a</p></body></html>"#;
        let ch2 = r#"<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chương Hai</title></head><body><h1>Chương Hai</h1><p>b</p></body></html>"#;
        writer.start_file("OEBPS/ch1.xhtml", deflated).unwrap();
        writer.write_all(ch1.as_bytes()).unwrap();
        writer.start_file("OEBPS/ch2.xhtml", deflated).unwrap();
        writer.write_all(ch2.as_bytes()).unwrap();

        writer.finish().unwrap();
    }

    fn read_entry(path: &Path, name: &str) -> Option<String> {
        let file = std::fs::File::open(path).ok()?;
        let mut archive = ZipArchive::new(file).ok()?;
        let mut content = String::new();
        archive
            .by_name(name)
            .ok()?
            .read_to_string(&mut content)
            .ok()?;
        Some(content)
    }

    #[test]
    fn test_synthesizes_both_documents_when_both_are_missing() {
        // This is the shape that produced `Not a valid b'INDX' section`.
        let dir = unique_dir("both");
        let epub = dir.join("book.epub");
        build_epub(&epub, false, false);

        let report = ensure_navigation_documents(&epub).unwrap();

        assert!(!report.had_ncx);
        assert!(!report.had_nav);
        assert!(report.added_ncx);
        assert!(report.added_nav);
        assert_eq!(report.entry_count, 2);

        // Both files must exist with real content derived from the spine.
        let ncx = read_entry(&epub, "OEBPS/toc.ncx").expect("toc.ncx must be added");
        assert!(ncx.contains("Chương Một"), "ncx: {}", ncx);
        assert!(ncx.contains("Chương Hai"));
        assert!(ncx.contains(r#"<content src="ch1.xhtml"/>"#));

        let nav = read_entry(&epub, "OEBPS/nav.xhtml").expect("nav.xhtml must be added");
        assert!(nav.contains(r#"epub:type="toc""#), "nav: {}", nav);
        assert!(nav.contains(r#"<a href="ch1.xhtml">Chương Một</a>"#));

        // The OPF must register both and declare the spine's NCX.
        let opf = read_entry(&epub, "OEBPS/content.opf").unwrap();
        assert!(opf.contains("nice-ebook-ncx"), "opf: {}", opf);
        assert!(opf.contains("nice-ebook-nav"), "opf: {}", opf);
        assert!(opf.contains(r#"toc="ncx""#), "opf: {}", opf);
        assert!(opf.contains(r#"properties="nav""#), "opf: {}", opf);
    }

    #[test]
    fn test_leaves_a_book_that_already_has_navigation_untouched() {
        let dir = unique_dir("present");
        let epub = dir.join("book.epub");
        build_epub(&epub, true, true);

        let before_opf = read_entry(&epub, "OEBPS/content.opf").unwrap();
        let report = ensure_navigation_documents(&epub).unwrap();

        assert!(report.had_ncx);
        assert!(report.had_nav);
        assert!(!report.added_ncx);
        assert!(!report.added_nav);

        let after_opf = read_entry(&epub, "OEBPS/content.opf").unwrap();
        assert_eq!(before_opf, after_opf, "OPF must be byte-identical");
    }

    #[test]
    fn test_adds_only_the_ncx_when_the_nav_document_exists() {
        let dir = unique_dir("navonly");
        let epub = dir.join("book.epub");
        build_epub(&epub, false, true);

        let report = ensure_navigation_documents(&epub).unwrap();
        assert!(report.added_ncx);
        assert!(!report.added_nav);
        assert!(read_entry(&epub, "OEBPS/toc.ncx").is_some());
        assert!(read_entry(&epub, "OEBPS/nav.xhtml").is_none());
    }

    #[test]
    fn test_adds_only_the_nav_when_the_ncx_exists() {
        let dir = unique_dir("ncxonly");
        let epub = dir.join("book.epub");
        build_epub(&epub, true, false);

        let report = ensure_navigation_documents(&epub).unwrap();
        assert!(!report.added_ncx);
        assert!(report.added_nav);
        assert!(read_entry(&epub, "OEBPS/nav.xhtml").is_some());
    }

    #[test]
    fn test_is_idempotent() {
        let dir = unique_dir("idem");
        let epub = dir.join("book.epub");
        build_epub(&epub, false, false);

        ensure_navigation_documents(&epub).unwrap();
        let second = ensure_navigation_documents(&epub).unwrap();

        assert!(second.had_ncx, "second pass must see the synthesized NCX");
        assert!(second.had_nav, "second pass must see the synthesized nav");
        assert!(!second.added_ncx);
        assert!(!second.added_nav);
    }

    #[test]
    fn test_generated_ncx_and_nav_escape_xml_in_titles() {
        let entries = vec![
            ("ch1.xhtml".to_string(), "Tom & Jerry".to_string()),
            ("ch2.xhtml".to_string(), "<script>".to_string()),
        ];

        let ncx = build_ncx("Tiêu Đề", "urn:x", &entries);
        assert!(ncx.contains("Tom &amp; Jerry"), "{}", ncx);
        assert!(!ncx.contains("<script>"), "title must be escaped: {}", ncx);

        let nav = build_nav("Tiêu Đề", &entries);
        assert!(nav.contains("Tom &amp; Jerry"));
        assert!(!nav.contains("<script>"));
    }

    #[test]
    fn test_spine_attribute_is_added_only_when_absent() {
        let without = r#"<package><spine><itemref idref="a"/></spine></package>"#;
        assert!(ensure_spine_toc_attribute(without).contains(r#"<spine toc="ncx">"#));

        let with = r#"<package><spine toc="ncx"><itemref idref="a"/></spine></package>"#;
        assert_eq!(ensure_spine_toc_attribute(with), with);
    }
}
