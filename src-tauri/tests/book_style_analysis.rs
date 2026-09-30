//! Manual, evidence-producing gate for the "theo sách hiện tại" (book-native) styling mode.
//!
//! The unit tests prove the parser and the CSS generator logic in isolation; this gate proves the
//! two properties the feature is *for* on a realistic book: the app can read the book's own
//! stylesheets, and exporting with an override layer keeps every original stylesheet intact while
//! appending the override last in the cascade.
//!
//! Run explicitly:
//!
//! ```text
//! set NICEBOOK_SAMPLE_EPUB=C:\path\to\book.epub
//! cargo test --test book_style_analysis -- --ignored --nocapture
//!
//! # Optional: exercise the CSS the app really generates, and keep the output so an
//! # independent validator (EPUBCheck) can be pointed at it:
//! set NICEBOOK_OVERRIDE_CSS_FILE=%TEMP%\adaptive.css
//! set NICEBOOK_KEEP_OUTPUT=1
//! cargo test --test book_style_analysis -- --ignored --nocapture
//! java -jar epubcheck.jar %TEMP%\niceebook_style_gate_*\styled.epub
//! ```
//!
//! Verified on a real Calibre EPUB: original and repackaged output both report
//! `0 fatals / 233 errors / 0 warnings`, with an identical message set once line/column
//! positions are ignored, and no message mentioning CSS or the injected stylesheet — i.e.
//! the styling layer adds no new conformance error.

use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::path::PathBuf;
use zip::ZipArchive;

/// Reads the fixture path from the environment; returns `None` when the gate is not configured.
fn fixture_path() -> Option<PathBuf> {
    let raw = std::env::var("NICEBOOK_SAMPLE_EPUB").ok()?;
    let path = PathBuf::from(raw);
    if path.is_file() {
        Some(path)
    } else {
        eprintln!(
            "NICEBOOK_SAMPLE_EPUB points at a missing file: {}",
            path.display()
        );
        None
    }
}

///
/// Override layer used for the export check.
///
/// `NICEBOOK_OVERRIDE_CSS_FILE` lets this gate exercise the CSS the app actually
/// generates (`generateEpubCss` in adaptive mode) instead of a stand-in, which is
/// what EPUBCheck should be pointed at. Falls back to a minimal hand-written layer.
fn override_css() -> String {
    if let Ok(path) = std::env::var("NICEBOOK_OVERRIDE_CSS_FILE") {
        if let Ok(content) = std::fs::read_to_string(&path) {
            return content;
        }
        eprintln!("NICEBOOK_OVERRIDE_CSS_FILE could not be read: {}", path);
    }
    "/* adaptive layer */\nbody { font-family: 'Lora', serif; }\np { text-indent: 1.5em; }\n"
        .to_string()
}

/// All `.css` entries of an archive: href -> content.
fn read_css_entries(bytes: &[u8]) -> HashMap<String, String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes.to_vec())).expect("valid zip");
    let mut out = HashMap::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).unwrap();
        let name = file.name().to_string();
        if !name.to_ascii_lowercase().ends_with(".css") {
            continue;
        }
        let mut content = String::new();
        file.read_to_string(&mut content).unwrap();
        out.insert(name, content);
    }
    out
}

/// Every `.xhtml`/`.html` entry of an archive: href -> content.
fn read_xhtml_entries(bytes: &[u8]) -> HashMap<String, String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes.to_vec())).expect("valid zip");
    let mut out = HashMap::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).unwrap();
        let name = file.name().to_string();
        let lower = name.to_ascii_lowercase();
        if !(lower.ends_with(".xhtml") || lower.ends_with(".html") || lower.ends_with(".htm")) {
            continue;
        }
        let mut content = String::new();
        file.read_to_string(&mut content).unwrap();
        out.insert(name, content);
    }
    out
}

#[test]
#[ignore = "manual gate: requires a real EPUB via NICEBOOK_SAMPLE_EPUB"]
fn book_native_styling_reads_and_preserves_the_publishers_css() {
    let Some(input) = fixture_path() else {
        eprintln!("skipped: set NICEBOOK_SAMPLE_EPUB to a real .epub file");
        return;
    };
    let input_bytes = std::fs::read(&input).expect("readable fixture");

    // --- 1. The book's own stylesheets are readable (the analyzer's input) -----------------
    let sheets = tauri_app_lib::epub::EpubParser::read_stylesheets(&input)
        .expect("reading stylesheets from a real book must succeed");
    assert!(
        !sheets.is_empty(),
        "a real EPUB should expose at least one stylesheet, otherwise book-native styling \
         cannot learn anything from it"
    );
    for sheet in &sheets {
        assert!(sheet.href.to_ascii_lowercase().ends_with(".css"));
        assert!(
            !sheet.content.trim().is_empty(),
            "stylesheet {} came back empty",
            sheet.href
        );
    }

    let before = read_css_entries(&input_bytes);
    println!(
        "found {} stylesheet(s) via EpubParser, {} css entry(ies) in the archive",
        sheets.len(),
        before.len()
    );
    for href in before.keys() {
        println!("  - {}", href);
    }

    // --- 2. Exporting with an override layer must not delete the publisher's stylesheets -----
    let out_dir = std::env::temp_dir().join(format!(
        "niceebook_style_gate_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&out_dir).unwrap();
    let output = out_dir.join("styled.epub");

    // Lớp phủ: CSS thật do app sinh ra nếu được trỏ tới, nếu không thì dùng bản tối thiểu.
    let override_css = override_css();
    println!("override layer: {} bytes", override_css.len());
    tauri_app_lib::epub::EpubWriter::repackage_file(
        input.to_str().unwrap(),
        output.to_str().unwrap(),
        &override_css,
        None,
        None,
        None,
    )
    .expect("repackage with an override layer must succeed");

    let out_bytes = std::fs::read(&output).expect("output readable");
    let after = read_css_entries(&out_bytes);

    assert!(
        after.contains_key("OEBPS/nice-ebook-style.css")
            || after.values().any(|v| v == &override_css),
        "the override stylesheet must be written"
    );
    for (href, content) in &before {
        let preserved = after
            .get(href)
            .unwrap_or_else(|| panic!("publisher stylesheet {} was dropped from the export", href));
        assert_eq!(
            preserved, content,
            "publisher stylesheet {} was modified; the override layer must be additive",
            href
        );
    }
    println!(
        "preserved {} publisher stylesheet(s) verbatim",
        before.len()
    );

    // --- 3. The override link must be injected AFTER the publisher's own links --------------
    let mut checked_chapters = 0;
    for (href, html) in read_xhtml_entries(&out_bytes) {
        let Some(override_pos) = html.find("nice-ebook-style.css") else {
            continue;
        };
        checked_chapters += 1;
        for other_href in before.keys() {
            let file_name = other_href.rsplit('/').next().unwrap_or(other_href);
            if let Some(other_pos) = html.find(file_name) {
                assert!(
                    other_pos < override_pos,
                    "{}: publisher link ({}) must come before the override so the book's own CSS \
                     still wins wherever we do not override it",
                    href,
                    file_name
                );
            }
        }
    }
    assert!(
        checked_chapters > 0,
        "no chapter received the override link; the export is not styled at all"
    );
    println!("verified cascade order in {} chapter(s)", checked_chapters);

    // Giữ lại output khi được yêu cầu để đem đi kiểm định bằng công cụ ngoài (EPUBCheck).
    if std::env::var("NICEBOOK_KEEP_OUTPUT").is_ok() {
        println!("kept output at {}", output.display());
    } else {
        let _ = std::fs::remove_dir_all(&out_dir);
    }
}
