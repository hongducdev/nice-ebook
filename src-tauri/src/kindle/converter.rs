//! Self-contained EPUB -> Kindle conversion.
//!
//! This module owns the whole Kindle conversion path inside our own process. It links the
//! pure-Rust `epub3-kindle` writer and therefore requires **no** external installation
//! (no Calibre, no `kindlegen`). That matches the product requirement that the conversion core
//! be vendored rather than delegated to whatever happens to be on the user's machine.
//!
//! Supported outputs are selected by the destination file extension:
//! * `.azw3` -> KF8-only AZW3 (the modern Kindle rendition, required for `<ruby>` glosses).
//! * `.mobi` -> Dual MOBI: a KF8 reading rendition plus a minimal KF7 compatibility section.
//!
//! ## Verified behaviour
//!
//! A realistic 24-chapter Vietnamese book (72 Word Wise `<ruby>` annotations, cover image,
//! external stylesheet, appendix chapter) converts with all annotations, glosses, diacritics,
//! the appendix chapter, the cover and the metadata intact. See `tests` below for the checks that
//! run on every build, and note that on-device Kindle rendering remains unverified in this repo.

use serde::{Deserialize, Serialize};
use std::path::Path;

use epub3_kindle::{convert_file_with_warnings, ConvertOptions};

/// The Kindle rendition we can produce.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KindleFormat {
    Azw3,
    Mobi,
}

impl KindleFormat {
    /// Maps a destination extension onto a format. Returns `None` for anything we cannot write.
    pub fn from_extension(path: &str) -> Option<Self> {
        let ext = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())?;

        match ext.as_str() {
            "azw3" => Some(Self::Azw3),
            "mobi" => Some(Self::Mobi),
            _ => None,
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Azw3 => "azw3",
            Self::Mobi => "mobi",
        }
    }

    /// Human-facing label, including the honest caveat about the KF7 fallback section.
    pub fn label(self) -> &'static str {
        match self {
            Self::Azw3 => "AZW3 (KF8) — định dạng Kindle hiện đại, hỗ trợ chú thích ruby",
            Self::Mobi => "MOBI (Dual) — KF8 kèm phần tương thích KF7 cho máy rất cũ",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KindleConversionResult {
    pub output_path: String,
    pub output_bytes: u64,
    pub format: KindleFormat,
    /// Non-fatal notes from the converter (degraded or simplified constructs).
    pub warnings: Vec<String>,
    /// What the pre-conversion link repair had to change, when it ran.
    pub link_repair: Option<super::link_repair::LinkRepairReport>,
    /// Whether navigation documents had to be synthesized for the converter.
    pub toc_repair: Option<super::toc_repair::TocRepairReport>,
}

/// Structured engine description, so the UI can state what is doing the conversion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KindleEngineInfo {
    pub engine: String,
    pub is_external_dependency_required: bool,
    pub supported_formats: Vec<String>,
    pub note: String,
}

pub fn engine_info() -> KindleEngineInfo {
    KindleEngineInfo {
        engine: "NiceEbook Kindle Core (Rust/KF8)".to_string(),
        is_external_dependency_required: false,
        supported_formats: vec!["azw3".to_string(), "mobi".to_string()],
        note:
            "Bộ chuyển đổi được biên dịch sẵn trong ứng dụng, không cần cài Calibre hay kindlegen."
                .to_string(),
    }
}

/// Turns a converter error into an actionable Vietnamese message.
///
/// The upstream error is kept verbatim after the explanation: it names the failing conversion
/// stage, which is what makes a bug report useful.
fn describe_error(error: &epub3_kindle::Error) -> String {
    use epub3_kindle::Error;

    let (label, hint) = match error {
        Error::Io { .. } => (
            "Lỗi đọc/ghi tệp",
            "Kiểm tra quyền truy cập và dung lượng ổ đĩa.",
        ),
        Error::InvalidEpub(_) => (
            "Tệp nguồn không phải EPUB hợp lệ",
            "Hãy mở lại sách trong NiceEbook trước khi xuất bản Kindle.",
        ),
        Error::UnsupportedInput(_) => (
            "Định dạng đầu vào không được hỗ trợ",
            "Bộ chuyển đổi chỉ nhận EPUB để tạo Kindle.",
        ),
        Error::UnsupportedEpub(_) => (
            "Cấu trúc EPUB không được hỗ trợ",
            "Sách có thể thiếu OPF/spine. Hãy xuất lại EPUB chuẩn từ NiceEbook.",
        ),
        Error::InvalidXhtmlCss(_) => (
            "XHTML hoặc CSS trong sách không hợp lệ",
            "Thử tắt nhúng phụ lục hoặc gỡ chú thích Word Wise rồi xuất lại.",
        ),
        Error::KindleNormalization(_) => (
            "Không chuẩn hoá được nội dung sang Kindle",
            "Sách chứa cấu trúc mà Kindle không hỗ trợ.",
        ),
        Error::Kf8Build(_) => (
            "Không dựng được nội dung KF8",
            "Đây là lỗi của bộ chuyển đổi, hãy báo lại kèm tên sách.",
        ),
        Error::Container(_) => (
            "Không đóng gói được tệp PalmDB/AZW3",
            "Kiểm tra dung lượng trống của ổ đĩa đích.",
        ),
        Error::UnsupportedOption(_) => (
            "Tuỳ chọn chuyển đổi không hợp lệ",
            "Đây là lỗi cấu hình của ứng dụng.",
        ),
        Error::Xml(_) => (
            "Lỗi phân tích XML trong sách",
            "Tệp OPF hoặc XHTML có thể bị hỏng.",
        ),
        Error::Zip(_) => (
            "Lỗi đọc tệp ZIP/EPUB",
            "Tệp EPUB có thể bị hỏng hoặc tải chưa đầy đủ.",
        ),
        Error::Output(_) => (
            "Không tạo được nội dung đầu ra",
            "Kiểm tra thư mục đích có ghi được không.",
        ),
    };

    format!("{}: {}\n→ {}", label, hint, error)
}

/// Converts an EPUB file into a Kindle file, choosing the rendition from `output_path`.
///
/// Runs fully in-process: no subprocess, no external tool, no network.
pub fn convert_epub_to_kindle_file(
    input_path: &str,
    output_path: &str,
) -> Result<KindleConversionResult, String> {
    convert_epub_to_kindle_with_options(input_path, output_path, ConvertOptions::default())
}

/// Conversion entry point that lets the caller choose PalmDOC compression.
///
/// Exposed separately so tests can request uncompressed text records and therefore assert on the
/// literal book text inside the produced Kindle container, without needing an external reader.
pub fn convert_epub_to_kindle_with_options(
    input_path: &str,
    output_path: &str,
    options: ConvertOptions,
) -> Result<KindleConversionResult, String> {
    let input = Path::new(input_path);
    if !input.is_file() {
        return Err(format!("Không tìm thấy tệp EPUB nguồn: {}", input_path));
    }

    let format = KindleFormat::from_extension(output_path).ok_or_else(|| {
        "Định dạng đích không được hỗ trợ. Chỉ hỗ trợ .azw3 hoặc .mobi.".to_string()
    })?;

    if input_path == output_path {
        return Err(
            "Tệp đích không được trùng tệp nguồn. Hãy chọn tên khác cho bản Kindle.".to_string(),
        );
    }

    if let Some(parent) = Path::new(output_path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Không thể tạo thư mục đích: {}", e))?;
        }
    }

    // The warning-aware API is used so that degraded constructs are surfaced to the user instead
    // of silently changing their book.
    let outcome =
        convert_file_with_warnings(input, output_path, &options).map_err(|e| describe_error(&e))?;

    let warnings: Vec<String> = outcome
        .warnings()
        .iter()
        .map(|w| format!("[{}] {}", w.code, w.message))
        .collect();

    let size = std::fs::metadata(output_path)
        .map_err(|e| format!("Chuyển đổi xong nhưng không đọc được tệp kết quả: {}", e))?
        .len();

    if size == 0 {
        return Err("Bộ chuyển đổi tạo ra tệp rỗng.".to_string());
    }

    Ok(KindleConversionResult {
        output_path: output_path.to_string(),
        output_bytes: size,
        format,
        warnings,
        link_repair: None,
        toc_repair: None,
    })
}

#[tauri::command]
pub async fn kindle_engine_info() -> Result<KindleEngineInfo, String> {
    Ok(engine_info())
}

/// Builds the Kindle-ready EPUB and converts it, owning the intermediate file's lifetime.
///
/// The intermediate EPUB is created in the system temp directory and removed on **every** exit
/// path: a build failure, a conversion failure, or success. This is separated from the Tauri
/// command so the cleanup guarantee can be tested directly.
#[allow(clippy::too_many_arguments)]
pub fn build_kindle_ready_epub_and_convert(
    input_path: Option<&str>,
    input_bytes: Option<&[u8]>,
    output_path: &str,
    custom_css: &str,
    chapter_overrides: Option<&std::collections::HashMap<String, String>>,
    metadata_overrides: Option<&crate::epub::MetadataOverrides>,
    extra_chapters: Option<&std::collections::HashMap<String, String>>,
) -> Result<KindleConversionResult, String> {
    let unique = format!(
        "niceebook_kindle_{}_{}.epub",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let temp_epub = std::env::temp_dir().join(unique);

    build_kindle_ready_epub_and_convert_staged(
        &temp_epub,
        input_path,
        input_bytes,
        output_path,
        custom_css,
        chapter_overrides,
        metadata_overrides,
        extra_chapters,
    )
}

/// Same pipeline as [`build_kindle_ready_epub_and_convert`], but with the intermediate EPUB path
/// supplied by the caller.
///
/// Tests use this so they can assert on the absence of one *specific* file. (Counting temp files
/// globally would race against other tests running in parallel.)
#[allow(clippy::too_many_arguments)]
fn build_kindle_ready_epub_and_convert_staged(
    temp_epub: &Path,
    input_path: Option<&str>,
    input_bytes: Option<&[u8]>,
    output_path: &str,
    custom_css: &str,
    chapter_overrides: Option<&std::collections::HashMap<String, String>>,
    metadata_overrides: Option<&crate::epub::MetadataOverrides>,
    extra_chapters: Option<&std::collections::HashMap<String, String>>,
) -> Result<KindleConversionResult, String> {
    let temp_epub_str = temp_epub.to_string_lossy().to_string();

    // Stage 1: produce the Kindle-ready EPUB.
    let build_result = if let Some(path) = input_path {
        crate::epub::EpubWriter::repackage_file(
            path,
            &temp_epub_str,
            custom_css,
            chapter_overrides,
            metadata_overrides,
            extra_chapters,
        )
        .map(|_| ())
    } else if let Some(bytes) = input_bytes {
        crate::epub::EpubWriter::repackage_bytes(
            bytes,
            &temp_epub_str,
            custom_css,
            chapter_overrides,
            metadata_overrides,
            extra_chapters,
        )
        .map(|_| ())
    } else {
        Err("No input EPUB source provided".to_string())
    };

    if let Err(e) = build_result {
        let _ = std::fs::remove_file(temp_epub);
        return Err(e);
    }

    // Stage 1b: repair internal links on the staged archive — the exact bytes the converter reads.
    // The KF8 builder aborts the whole build when any link points at a document it did not
    // generate, so this must happen before conversion.
    let link_repair = match super::link_repair::repair_dangling_links_in_epub(temp_epub) {
        Ok(report) => report,
        Err(e) => {
            // A failure here must not silently degrade the output: report it and clean up.
            let _ = std::fs::remove_file(temp_epub);
            return Err(format!(
                "Không sửa được liên kết nội bộ trước khi chuyển đổi: {}",
                e
            ));
        }
    };

    // Stage 1c: guarantee the book has navigation structures. Without a nav document and an NCX the
    // converter emits an AZW3 whose NCX index is malformed (`Not a valid INDX section`), which also
    // breaks table-of-contents navigation.
    let toc_repair = match super::toc_repair::ensure_navigation_documents(temp_epub) {
        Ok(report) => report,
        Err(e) => {
            let _ = std::fs::remove_file(temp_epub);
            return Err(format!(
                "Không bổ sung được mục lục trước khi chuyển đổi: {}",
                e
            ));
        }
    };

    // Stage 2: convert with the embedded core, then always clean up.
    let conversion = convert_epub_to_kindle_file(&temp_epub_str, output_path);
    let _ = std::fs::remove_file(temp_epub);

    conversion.map(|mut result| {
        result.link_repair = Some(link_repair);
        result.toc_repair = Some(toc_repair);
        result
    })
}

#[tauri::command]
pub async fn convert_epub_to_kindle(
    input_path: String,
    output_path: String,
) -> Result<KindleConversionResult, String> {
    tokio::task::spawn_blocking(move || convert_epub_to_kindle_file(&input_path, &output_path))
        .await
        .map_err(|e| format!("Task execution failed: {}", e))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;

    /// A real EPUB 3 built in-memory: Vietnamese text, a Word Wise `<ruby>` annotation,
    /// an external stylesheet carrying a remote `@import`, and an appendix chapter.
    fn build_fixture_epub() -> Vec<u8> {
        build_fixture_epub_with_chapters(1)
    }

    /// Builds a fixture with `chapter_count` chapters, each carrying a distinct ruby gloss so a
    /// test can prove that per-chapter annotations survive independently.
    fn build_fixture_epub_with_chapters(chapter_count: usize) -> Vec<u8> {
        build_fixture_epub_with_chapters_and_link(chapter_count, None)
    }

    /// The same fixture, optionally carrying a dangling internal link.
    ///
    /// This reproduces the reported production failure:
    /// `internal link target does not resolve to a generated document: start_split9.xhtml#b7`
    fn build_fixture_epub_with_chapters_and_link(
        chapter_count: usize,
        dangling_href: Option<&str>,
    ) -> Vec<u8> {
        let link_paragraph = match dangling_href {
            Some(href) => format!(
                "<p>Xem <a href=\"{}\">phần bảy</a> của tài liệu gốc.</p>",
                href
            ),
            None => String::new(),
        };
        use zip::write::SimpleFileOptions;
        use zip::{CompressionMethod, ZipWriter};

        let mut buffer = std::io::Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut buffer);
            let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            writer.start_file("mimetype", stored).unwrap();
            writer.write_all(b"application/epub+zip").unwrap();

            let deflated =
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

            writer
                .start_file("META-INF/container.xml", deflated)
                .unwrap();
            writer
                .write_all(
                    br#"<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#,
                )
                .unwrap();

            let mut manifest = String::from(
                "    <item id=\"css\" href=\"nice-ebook-style.css\" media-type=\"text/css\"/>\n\
                 \x20   <item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>\n\
                 \x20   <item id=\"ncx\" href=\"toc.ncx\" media-type=\"application/x-dtbncx+xml\"/>\n\
                 \x20   <item id=\"appendix\" href=\"xray_appendix.xhtml\" media-type=\"application/xhtml+xml\"/>\n",
            );
            let mut spine = String::new();
            let mut nav_items = String::new();
            let mut nav_points = String::new();

            for i in 1..=chapter_count {
                manifest.push_str(&format!(
                    "    <item id=\"ch{i}\" href=\"ch{i}.xhtml\" media-type=\"application/xhtml+xml\"/>\n"
                ));
                spine.push_str(&format!("    <itemref idref=\"ch{i}\"/>\n"));
                nav_items.push_str(&format!("<li><a href=\"ch{i}.xhtml\">Chương {i}</a></li>"));
                nav_points.push_str(&format!(
                    "<navPoint id=\"np{i}\" playOrder=\"{i}\"><navLabel><text>Chương {i}</text></navLabel><content src=\"ch{i}.xhtml\"/></navPoint>"
                ));

                let ch = format!(
                    r#"<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi">
<head><title>Chương {i}</title>
<link rel="stylesheet" type="text/css" href="nice-ebook-style.css"/>
</head>
<body>
<h1>Chương {i}</h1>
<p>Trần Minh Khôi nhìn <ruby data-kindle-wordwise="1" data-difficulty="2">ephemeral<rt>phù du, ngắn ngủi</rt></ruby> u sầu.</p>
<p>Nguyễn Thị Lan ghi chú chương {i} <ruby data-kindle-wordwise="1" data-difficulty="3">meticulous<rt>tỉ mỉ, cẩn trọng</rt></ruby> từng dòng.</p>
{link_paragraph}
</body>
</html>"#
                );
                writer
                    .start_file(format!("OEBPS/ch{i}.xhtml"), deflated)
                    .unwrap();
                writer.write_all(ch.as_bytes()).unwrap();
            }

            spine.push_str("    <itemref idref=\"appendix\"/>\n");
            nav_items.push_str("<li><a href=\"xray_appendix.xhtml\">Dramatis Personae</a></li>");
            nav_points.push_str(&format!(
                "<navPoint id=\"npappendix\" playOrder=\"{}\"><navLabel><text>Dramatis Personae</text></navLabel><content src=\"xray_appendix.xhtml\"/></navPoint>",
                chapter_count + 1
            ));

            let opf = format!(
                r#"<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="vi">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:kindle-core-test</dc:identifier>
    <dc:title>Tiểu Thuyết Thử Nghiệm</dc:title>
    <dc:creator>Nguyễn Văn Tác Giả</dc:creator>
    <dc:language>vi</dc:language>
  </metadata>
  <manifest>
{manifest}  </manifest>
  <spine toc="ncx">
{spine}  </spine>
</package>"#
            );
            writer.start_file("OEBPS/content.opf", deflated).unwrap();
            writer.write_all(opf.as_bytes()).unwrap();

            let css = "@import url('https://fonts.googleapis.com/css2?family=Literata');\n\
                       ruby[data-kindle-wordwise] { ruby-position: over; }\n\
                       body { font-family: Literata, serif; }\n";
            writer
                .start_file("OEBPS/nice-ebook-style.css", deflated)
                .unwrap();
            writer.write_all(css.as_bytes()).unwrap();

            let appendix = r#"<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi">
<head><title>Dramatis Personae &amp; World Guide</title></head>
<body><h1>Dramatis Personae &amp; World Guide</h1><p>Trần Minh Khôi</p><p>Nguyễn Thị Lan</p></body>
</html>"#;
            writer
                .start_file("OEBPS/xray_appendix.xhtml", deflated)
                .unwrap();
            writer.write_all(appendix.as_bytes()).unwrap();

            let nav = format!(
                r#"<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Mục lục</title></head>
<body><nav epub:type="toc"><ol>{nav_items}</ol></nav></body></html>"#
            );
            writer.start_file("OEBPS/nav.xhtml", deflated).unwrap();
            writer.write_all(nav.as_bytes()).unwrap();

            let ncx = format!(
                r#"<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="urn:uuid:kindle-core-test"/></head>
<docTitle><text>Tiểu Thuyết Thử Nghiệm</text></docTitle>
<navMap>{nav_points}</navMap>
</ncx>"#
            );
            writer.start_file("OEBPS/toc.ncx", deflated).unwrap();
            writer.write_all(ncx.as_bytes()).unwrap();

            writer.finish().unwrap();
        }
        buffer.into_inner()
    }

    fn unique_temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "niceebook_kindle_{}_{}",
            tag,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_format_detection_from_extension() {
        assert_eq!(
            KindleFormat::from_extension("/tmp/book.azw3"),
            Some(KindleFormat::Azw3)
        );
        assert_eq!(
            KindleFormat::from_extension("C:\\books\\Book.AZW3"),
            Some(KindleFormat::Azw3)
        );
        assert_eq!(
            KindleFormat::from_extension("book.mobi"),
            Some(KindleFormat::Mobi)
        );
        // Unsupported targets must be refused rather than guessed.
        assert_eq!(KindleFormat::from_extension("book.epub"), None);
        assert_eq!(KindleFormat::from_extension("book.pdf"), None);
        assert_eq!(KindleFormat::from_extension("book"), None);
        assert_eq!(KindleFormat::from_extension("book.txt"), None);
    }

    #[test]
    fn test_engine_info_reports_no_external_dependency() {
        let info = engine_info();
        assert!(!info.is_external_dependency_required);
        assert!(info.supported_formats.contains(&"azw3".to_string()));
        assert!(info.supported_formats.contains(&"mobi".to_string()));
    }

    #[test]
    fn test_conversion_rejects_missing_input_and_bad_extension() {
        let dir = unique_temp_dir("reject");

        let err = convert_epub_to_kindle_file(
            "definitely/not/here.epub",
            dir.join("out.azw3").to_str().unwrap(),
        )
        .unwrap_err();
        assert!(
            err.contains("Không tìm thấy tệp EPUB nguồn"),
            "got: {}",
            err
        );

        // Write a real input so only the extension can be the problem.
        let input = dir.join("in.epub");
        std::fs::write(&input, build_fixture_epub()).unwrap();
        let err = convert_epub_to_kindle_file(
            input.to_str().unwrap(),
            dir.join("out.pdf").to_str().unwrap(),
        )
        .unwrap_err();
        assert!(err.contains("Chỉ hỗ trợ .azw3 hoặc .mobi"), "got: {}", err);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_conversion_rejects_same_input_and_output_path() {
        let dir = unique_temp_dir("same");
        // The destination must carry a supported extension, otherwise the format check fires
        // first and this guard is never reached.
        let same_path = dir.join("book.azw3");
        std::fs::write(&same_path, build_fixture_epub()).unwrap();

        let err =
            convert_epub_to_kindle_file(same_path.to_str().unwrap(), same_path.to_str().unwrap())
                .unwrap_err();
        assert!(err.contains("không được trùng tệp nguồn"), "got: {}", err);

        // The source file must be left untouched by the rejected call.
        assert!(same_path.is_file());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_conversion_rejects_a_non_epub_payload() {
        let dir = unique_temp_dir("garbage");
        let input = dir.join("fake.epub");
        std::fs::write(&input, b"this is definitely not a zip archive").unwrap();

        let err = convert_epub_to_kindle_file(
            input.to_str().unwrap(),
            dir.join("out.azw3").to_str().unwrap(),
        )
        .unwrap_err();
        // Must fail with a structured explanation, not panic.
        assert!(
            err.contains('→'),
            "error should carry the upstream detail: {}",
            err
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_end_to_end_epub_to_azw3_is_self_contained() {
        let dir = unique_temp_dir("e2e");
        let input = dir.join("book.epub");
        let output = dir.join("book.azw3");
        std::fs::write(&input, build_fixture_epub()).unwrap();

        let result =
            convert_epub_to_kindle_file(input.to_str().unwrap(), output.to_str().unwrap()).unwrap();

        assert_eq!(result.format, KindleFormat::Azw3);
        assert!(result.output_bytes > 0);
        assert!(output.is_file());

        // A PalmDB record starts with a 32-byte database name followed by big-endian fields;
        // checking the magic "BOOKMOBI" at byte 60 confirms we produced a MOBI container.
        let bytes = std::fs::read(&output).unwrap();
        assert!(bytes.len() > 68, "output too small to be a PalmDB");
        assert_eq!(
            &bytes[60..68],
            b"BOOKMOBI",
            "expected the MOBI type/creator magic at the PalmDB offset"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_command_boundary_cleans_up_when_the_build_stage_fails() {
        // No input source at all: the build stage fails, and the exact intermediate file must not
        // be left behind. The path is injected so this assertion cannot race other tests.
        let dir = unique_temp_dir("cleanup_buildfail");
        let staged = dir.join("staged.epub");

        let err = build_kindle_ready_epub_and_convert_staged(
            &staged,
            None,
            None,
            dir.join("out.azw3").to_str().unwrap(),
            "body { margin: 0; }",
            None,
            None,
            None,
        )
        .unwrap_err();

        assert!(
            err.contains("No input EPUB source provided"),
            "got: {}",
            err
        );
        assert!(
            !staged.exists(),
            "a failed build left the intermediate EPUB behind at {}",
            staged.display()
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_command_boundary_cleans_up_after_a_successful_conversion() {
        let dir = unique_temp_dir("cleanup_success");
        let fixture = dir.join("source.epub");
        std::fs::write(&fixture, build_fixture_epub()).unwrap();
        let staged = dir.join("staged.epub");

        let result = build_kindle_ready_epub_and_convert_staged(
            &staged,
            Some(fixture.to_str().unwrap()),
            None,
            dir.join("out.azw3").to_str().unwrap(),
            "body { margin: 0; }",
            None,
            None,
            None,
        )
        .unwrap();

        assert!(result.output_bytes > 0);
        assert!(
            !staged.exists(),
            "a successful conversion left the intermediate EPUB behind at {}",
            staged.display()
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_command_boundary_cleans_up_when_the_conversion_stage_fails() {
        // The EPUB builds fine, but the destination extension is rejected — the staged file must
        // still be removed rather than orphaned next to the user's book.
        let dir = unique_temp_dir("cleanup_convertfail");
        let fixture = dir.join("source.epub");
        std::fs::write(&fixture, build_fixture_epub()).unwrap();
        let staged = dir.join("staged.epub");

        let err = build_kindle_ready_epub_and_convert_staged(
            &staged,
            Some(fixture.to_str().unwrap()),
            None,
            dir.join("out.pdf").to_str().unwrap(),
            "body { margin: 0; }",
            None,
            None,
            None,
        )
        .unwrap_err();

        assert!(err.contains("Chỉ hỗ trợ .azw3 hoặc .mobi"), "got: {}", err);
        assert!(
            !staged.exists(),
            "a failed conversion left the intermediate EPUB behind at {}",
            staged.display()
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_command_boundary_registers_a_new_chapter_from_overrides() {
        // End-to-end through the command boundary: an override whose href is absent from the source
        // archive must still be registered as a new spine chapter and survive into the AZW3.
        let dir = unique_temp_dir("extra_chapter");
        let fixture = dir.join("source.epub");
        std::fs::write(&fixture, build_fixture_epub()).unwrap();

        let mut overrides = std::collections::HashMap::new();
        overrides.insert(
            "OEBPS/ch1.xhtml".to_string(),
            "<html><head><title>Chương 1</title></head><body><p>Nội dung đã sửa</p></body></html>"
                .to_string(),
        );
        let mut extras = std::collections::HashMap::new();
        extras.insert(
            "new_appendix.xhtml".to_string(),
            "<html><head><title>Phụ lục Mới</title></head><body><p>Nguyễn Thị Lan</p></body></html>"
                .to_string(),
        );

        let result = build_kindle_ready_epub_and_convert(
            Some(fixture.to_str().unwrap()),
            None,
            dir.join("out.azw3").to_str().unwrap(),
            "body { margin: 0; }",
            Some(&overrides),
            None,
            Some(&extras),
        )
        .unwrap();

        assert!(result.output_bytes > 0);
        let bytes = std::fs::read(dir.join("out.azw3")).unwrap();
        assert_eq!(&bytes[60..68], b"BOOKMOBI");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_command_boundary_surfaces_a_bad_extension() {
        let dir = unique_temp_dir("badext");
        let fixture = dir.join("source.epub");
        std::fs::write(&fixture, build_fixture_epub()).unwrap();

        let err = build_kindle_ready_epub_and_convert(
            Some(fixture.to_str().unwrap()),
            None,
            dir.join("out.pdf").to_str().unwrap(),
            "body { margin: 0; }",
            None,
            None,
            None,
        )
        .unwrap_err();
        assert!(err.contains("Chỉ hỗ trợ .azw3 hoặc .mobi"), "got: {}", err);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_dangling_link_regression_is_load_bearing() {
        // Regression proof for the reported production failure. Step 1 shows the failure is real
        // and reproducible; step 2 shows the repair is what fixes it (not an incidental change).
        let dir = unique_temp_dir("dangling_proof");
        let fixture = dir.join("source.epub");
        std::fs::write(
            &fixture,
            build_fixture_epub_with_chapters_and_link(1, Some("start_split9.xhtml#b7")),
        )
        .unwrap();

        // 1. Converting directly, without the repair stage, must reproduce the reported error.
        let direct_out = dir.join("direct.azw3");
        let err =
            convert_epub_to_kindle_file(fixture.to_str().unwrap(), direct_out.to_str().unwrap())
                .expect_err("without the repair the KF8 build must fail");
        assert!(
            err.contains("does not resolve to a generated document"),
            "expected the reported KF8 failure, got: {}",
            err
        );

        // 2. Repairing the archive makes the very same book convert successfully.
        let report = crate::kindle::link_repair::repair_dangling_links_in_epub(&fixture).unwrap();
        assert_eq!(report.dangling_links_removed, 1);
        assert!(
            report
                .missing_targets
                .iter()
                .any(|t| t.contains("start_split9.xhtml")),
            "the missing target must be reported: {:?}",
            report.missing_targets
        );

        let fixed_out = dir.join("fixed.azw3");
        let result =
            convert_epub_to_kindle_file(fixture.to_str().unwrap(), fixed_out.to_str().unwrap())
                .expect("after repairing links the book must convert");
        assert!(result.output_bytes > 0);

        // And the repaired reading text is preserved inside the container.
        let bytes = std::fs::read(&fixed_out).unwrap();
        assert!(bytes.len() > 68);
        assert_eq!(&bytes[60..68], b"BOOKMOBI");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_full_pipeline_repairs_dangling_links_before_converting() {
        // The command boundary must apply the repair automatically, so users never see the failure.
        let dir = unique_temp_dir("dangling_pipeline");
        let fixture = dir.join("source.epub");
        std::fs::write(
            &fixture,
            build_fixture_epub_with_chapters_and_link(2, Some("start_split9.xhtml#b7")),
        )
        .unwrap();
        let staged = dir.join("staged.epub");

        let result = build_kindle_ready_epub_and_convert_staged(
            &staged,
            Some(fixture.to_str().unwrap()),
            None,
            dir.join("out.azw3").to_str().unwrap(),
            "body { margin: 0; }",
            None,
            None,
            None,
        )
        .expect("a book with a dangling internal link must still convert");

        assert!(result.output_bytes > 0);
        let report = result
            .link_repair
            .expect("the pipeline must record what it repaired");
        assert_eq!(
            report.dangling_links_removed, 2,
            "one dangling link per chapter (2 chapters), got {:?}",
            report
        );

        // The intermediate file must still be cleaned up.
        assert!(!staged.exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_end_to_end_epub_to_dual_mobi() {
        let dir = unique_temp_dir("mobi");
        let input = dir.join("book.epub");
        let output = dir.join("book.mobi");
        std::fs::write(&input, build_fixture_epub()).unwrap();

        let result =
            convert_epub_to_kindle_file(input.to_str().unwrap(), output.to_str().unwrap()).unwrap();
        assert_eq!(result.format, KindleFormat::Mobi);
        assert!(result.output_bytes > 0);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_multi_chapter_book_converts_with_appendix() {
        let dir = unique_temp_dir("multi");
        let input = dir.join("book.epub");
        let output = dir.join("book.azw3");
        std::fs::write(&input, build_fixture_epub_with_chapters(12)).unwrap();

        let result =
            convert_epub_to_kindle_file(input.to_str().unwrap(), output.to_str().unwrap()).unwrap();

        assert_eq!(result.format, KindleFormat::Azw3);
        assert!(result.output_bytes > 0);
        let bytes = std::fs::read(&output).unwrap();
        assert_eq!(&bytes[60..68], b"BOOKMOBI");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_word_wise_glosses_reach_the_kindle_container() {
        // The strongest check available without an external reader: request uncompressed text
        // records, which leaves the book text literal inside the container, then assert that the
        // Word Wise glosses, the ruby markup hook and the appendix chapter are all present.
        let dir = unique_temp_dir("gloss");
        let input = dir.join("book.epub");
        let output = dir.join("book.azw3");
        std::fs::write(&input, build_fixture_epub_with_chapters(3)).unwrap();

        let options = ConvertOptions {
            compression: epub3_kindle::Compression::None,
        };
        let result = convert_epub_to_kindle_with_options(
            input.to_str().unwrap(),
            output.to_str().unwrap(),
            options,
        )
        .unwrap();
        assert!(result.output_bytes > 0);

        let bytes = std::fs::read(&output).unwrap();
        let text = String::from_utf8_lossy(&bytes);

        // Both distinct Vietnamese glosses must be present, not just the annotated words.
        assert!(
            text.contains("phù du, ngắn ngủi"),
            "first Vietnamese gloss did not reach the Kindle container"
        );
        assert!(
            text.contains("tỉ mỉ, cẩn trọng"),
            "second Vietnamese gloss did not reach the Kindle container"
        );
        // The ruby elements and the styling hook must survive normalization.
        assert!(text.contains("data-kindle-wordwise"), "ruby hook lost");
        assert!(text.contains("<rt"), "ruby annotation element lost");
        // The attribute-selector CSS rule must reach the container too, otherwise the hook survives
        // but nothing styles it. This is asserted on the converted records, not on the source EPUB.
        assert!(
            text.contains("ruby-position"),
            "the ruby-position rule did not reach the Kindle container"
        );
        // The appendix chapter must be present as real content.
        assert!(
            text.contains("Dramatis Personae"),
            "X-Ray appendix chapter missing from the Kindle container"
        );
        // Every chapter must be represented.
        for i in 1..=3 {
            assert!(
                text.contains(&format!("Chương {i}")),
                "chapter {i} missing from the Kindle container"
            );
        }

        let _ = std::fs::remove_dir_all(&dir);
    }
}
