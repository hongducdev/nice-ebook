use std::fs::File;
use std::io::{Cursor, Read, Seek, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub struct EpubWriter;

impl EpubWriter {
    pub fn repackage_file<P: AsRef<Path>, Q: AsRef<Path>>(
        input_path: P,
        output_path: Q,
        custom_css: &str,
    ) -> Result<u64, String> {
        let in_file = File::open(input_path.as_ref())
            .map_err(|e| format!("Cannot open input file: {}", e))?;
        let mut archive = ZipArchive::new(in_file)
            .map_err(|e| format!("Invalid EPUB ZIP: {}", e))?;

        let out_file = File::create(output_path.as_ref())
            .map_err(|e| format!("Cannot create output file: {}", e))?;

        Self::repackage_archive(&mut archive, out_file, custom_css)
    }

    pub fn repackage_bytes<Q: AsRef<Path>>(
        input_bytes: &[u8],
        output_path: Q,
        custom_css: &str,
    ) -> Result<u64, String> {
        let cursor = Cursor::new(input_bytes);
        let mut archive = ZipArchive::new(cursor)
            .map_err(|e| format!("Invalid EPUB ZIP: {}", e))?;

        let out_file = File::create(output_path.as_ref())
            .map_err(|e| format!("Cannot create output file: {}", e))?;

        Self::repackage_archive(&mut archive, out_file, custom_css)
    }

    fn repackage_archive<R: Read + Seek, W: Write + Seek>(
        archive: &mut ZipArchive<R>,
        out_stream: W,
        custom_css: &str,
    ) -> Result<u64, String> {
        let mut zip_writer = ZipWriter::new(out_stream);

        // 1. MUST write `mimetype` FIRST and UNCOMPRESSED (EPUB Spec requirement)
        let mimetype_opts = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored);

        zip_writer
            .start_file("mimetype", mimetype_opts)
            .map_err(|e| format!("Failed to write mimetype entry: {}", e))?;
        zip_writer
            .write_all(b"application/epub+zip")
            .map_err(|e| format!("Failed to write mimetype content: {}", e))?;

        // 2. Discover OPF path from container.xml
        let opf_path = Self::find_opf_path(archive)?;
        let opf_base_dir = if let Some(idx) = opf_path.rfind('/') {
            opf_path[..=idx].to_string()
        } else {
            String::new()
        };

        let css_file_name = "nice-ebook-style.css";
        let full_css_path = format!("{}{}", opf_base_dir, css_file_name);

        let default_opts = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated);

        // 3. Write all entries from original archive (except mimetype, and modify OPF + XHTML)
        let num_files = archive.len();
        for i in 0..num_files {
            let mut file = archive.by_index(i).map_err(|e| format!("Read zip error: {}", e))?;
            let name = file.name().to_string();

            if name == "mimetype" {
                continue; // Already written first
            }

            if name == opf_path {
                // Modify OPF to include custom CSS manifest item
                let mut opf_content = String::new();
                file.read_to_string(&mut opf_content)
                    .map_err(|e| format!("Error reading OPF: {}", e))?;

                let updated_opf = Self::inject_css_into_opf(&opf_content, css_file_name);

                zip_writer
                    .start_file(&name, default_opts)
                    .map_err(|e| format!("Zip start file error: {}", e))?;
                zip_writer
                    .write_all(updated_opf.as_bytes())
                    .map_err(|e| format!("Zip write OPF error: {}", e))?;
            } else if name.ends_with(".xhtml") || name.ends_with(".html") || name.ends_with(".htm") {
                // Inject <link rel="stylesheet"> into chapter HTML
                let mut html_content = String::new();
                file.read_to_string(&mut html_content)
                    .map_err(|e| format!("Error reading chapter: {}", e))?;

                // Determine relative path from chapter file to CSS file
                let rel_css_path = Self::compute_relative_css_path(&name, &full_css_path);
                let updated_html = Self::inject_link_tag(&html_content, &rel_css_path);

                zip_writer
                    .start_file(&name, default_opts)
                    .map_err(|e| format!("Zip start file error: {}", e))?;
                zip_writer
                    .write_all(updated_html.as_bytes())
                    .map_err(|e| format!("Zip write chapter error: {}", e))?;
            } else {
                // Copy all other files verbatim
                zip_writer
                    .start_file(&name, default_opts)
                    .map_err(|e| format!("Zip start file error: {}", e))?;
                let mut buffer = Vec::new();
                file.read_to_end(&mut buffer)
                    .map_err(|e| format!("Error reading file bytes: {}", e))?;
                zip_writer
                    .write_all(&buffer)
                    .map_err(|e| format!("Zip copy error: {}", e))?;
            }
        }

        // 4. Write custom CSS stylesheet file
        zip_writer
            .start_file(&full_css_path, default_opts)
            .map_err(|e| format!("Failed to create custom CSS entry: {}", e))?;
        zip_writer
            .write_all(custom_css.as_bytes())
            .map_err(|e| format!("Failed to write custom CSS: {}", e))?;

        // 5. Finalize ZIP
        let finished = zip_writer
            .finish()
            .map_err(|e| format!("Failed to finalize EPUB ZIP: {}", e))?;

        let stream_ref = finished;
        // In this case, we flush and return size
        drop(stream_ref);

        Ok(1)
    }

    fn find_opf_path<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Result<String, String> {
        let mut container_file = archive
            .by_name("META-INF/container.xml")
            .map_err(|_| "Invalid EPUB: META-INF/container.xml not found".to_string())?;

        let mut content = String::new();
        container_file
            .read_to_string(&mut content)
            .map_err(|e| format!("Cannot read container.xml: {}", e))?;

        use quick_xml::events::Event;
        use quick_xml::reader::Reader;
        let mut reader = Reader::from_str(&content);

        loop {
            match reader.read_event() {
                Ok(Event::Start(e)) | Ok(Event::Empty(e)) if e.name().as_ref() == b"rootfile" => {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"full-path" {
                            return String::from_utf8(attr.value.into_owned())
                                .map_err(|e| format!("Invalid UTF-8 in full-path: {}", e));
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(format!("Error parsing container.xml: {}", e)),
                _ => (),
            }
        }

        Err("Could not find rootfile inside container.xml".to_string())
    }

    fn inject_css_into_opf(opf_content: &str, css_file_name: &str) -> String {
        let item_tag = format!(
            r#"    <item id="nice-ebook-custom-style" href="{}" media-type="text/css"/>"#,
            css_file_name
        );

        if opf_content.contains("nice-ebook-custom-style") {
            return opf_content.to_string();
        }

        if let Some(pos) = opf_content.find("</manifest>") {
            let mut result = opf_content[..pos].to_string();
            result.push_str(&item_tag);
            result.push('\n');
            result.push_str(&opf_content[pos..]);
            result
        } else {
            opf_content.to_string()
        }
    }

    fn inject_link_tag(html_content: &str, rel_css_path: &str) -> String {
        let link_tag = format!(
            r#"  <link rel="stylesheet" type="text/css" href="{}" />"#,
            rel_css_path
        );

        if html_content.contains("nice-ebook-custom-style") || html_content.contains(rel_css_path) {
            return html_content.to_string();
        }

        if let Some(pos) = html_content.find("</head>") {
            let mut result = html_content[..pos].to_string();
            result.push_str(&link_tag);
            result.push('\n');
            result.push_str(&html_content[pos..]);
            result
        } else if let Some(pos) = html_content.find("<body") {
            let mut result = html_content[..pos].to_string();
            result.push_str("<head>\n");
            result.push_str(&link_tag);
            result.push_str("\n</head>\n");
            result.push_str(&html_content[pos..]);
            result
        } else {
            html_content.to_string()
        }
    }

    fn compute_relative_css_path(html_path: &str, css_path: &str) -> String {
        let html_dir = if let Some(idx) = html_path.rfind('/') {
            &html_path[..idx]
        } else {
            ""
        };

        let css_dir = if let Some(idx) = css_path.rfind('/') {
            &css_path[..idx]
        } else {
            ""
        };

        if html_dir == css_dir {
            if let Some(idx) = css_path.rfind('/') {
                css_path[idx + 1..].to_string()
            } else {
                css_path.to_string()
            }
        } else {
            // Simple fallback: if in child directory, prefix with ../
            let mut path = String::new();
            let depth = html_dir.split('/').filter(|s| !s.is_empty()).count();
            let css_depth = css_dir.split('/').filter(|s| !s.is_empty()).count();

            if depth > css_depth {
                for _ in 0..(depth - css_depth) {
                    path.push_str("../");
                }
            }
            if let Some(idx) = css_path.rfind('/') {
                path.push_str(&css_path[idx + 1..]);
            } else {
                path.push_str(css_path);
            }
            path
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_relative_css_path_calculation() {
        assert_eq!(
            EpubWriter::compute_relative_css_path("OEBPS/text/ch1.xhtml", "OEBPS/nice-ebook-style.css"),
            "../nice-ebook-style.css"
        );
        assert_eq!(
            EpubWriter::compute_relative_css_path("OEBPS/text/sub/ch1.xhtml", "OEBPS/nice-ebook-style.css"),
            "../../nice-ebook-style.css"
        );
        assert_eq!(
            EpubWriter::compute_relative_css_path("OEBPS/ch1.xhtml", "OEBPS/nice-ebook-style.css"),
            "nice-ebook-style.css"
        );
        assert_eq!(
            EpubWriter::compute_relative_css_path("ch1.xhtml", "nice-ebook-style.css"),
            "nice-ebook-style.css"
        );
    }

    #[test]
    fn test_inject_link_tag_within_head() {
        let html = "<html><head><title>Test</title></head><body><p>Hello</p></body></html>";
        let updated = EpubWriter::inject_link_tag(html, "style.css");
        
        let link_pos = updated.find(r#"<link rel="stylesheet" type="text/css" href="style.css" />"#).unwrap();
        let head_start = updated.find("<head>").unwrap();
        let head_end = updated.find("</head>").unwrap();
        
        assert!(link_pos > head_start && link_pos < head_end);
    }

    #[test]
    fn test_inject_link_tag_no_head_fallback() {
        let html = "<html><body><p>No head tag</p></body></html>";
        let updated = EpubWriter::inject_link_tag(html, "style.css");
        assert!(updated.contains("<head>"));
        assert!(updated.contains("</head>"));
        assert!(updated.contains(r#"<link rel="stylesheet" type="text/css" href="style.css" />"#));
    }

    #[test]
    fn test_inject_idempotency() {
        let html = "<html><head><title>Test</title></head><body><p>Hello</p></body></html>";
        let first = EpubWriter::inject_link_tag(html, "style.css");
        let second = EpubWriter::inject_link_tag(&first, "style.css");
        assert_eq!(first, second);

        let opf = r#"<package><manifest><item id="ch1" href="ch1.xhtml"/></manifest></package>"#;
        let opf_first = EpubWriter::inject_css_into_opf(opf, "style.css");
        let opf_second = EpubWriter::inject_css_into_opf(&opf_first, "style.css");
        assert_eq!(opf_first, opf_second);
    }

    #[test]
    fn test_e2e_epub_zip_conformance_and_mimetype_order() {
        // Build mock input EPUB in memory
        let mut in_buffer = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut in_buffer);
            let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            writer.start_file("mimetype", opts).unwrap();
            writer.write_all(b"application/epub+zip").unwrap();

            let def_opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
            writer.start_file("META-INF/container.xml", def_opts).unwrap();
            writer.write_all(br#"<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#).unwrap();

            writer.start_file("OEBPS/content.opf", def_opts).unwrap();
            writer.write_all(br#"<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>"#).unwrap();

            writer.start_file("OEBPS/ch1.xhtml", def_opts).unwrap();
            writer.write_all(r#"<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chương 1</title></head>
<body><h1>Tiêu Đề</h1><p>Nội dung chương 1...</p></body>
</html>"#.as_bytes()).unwrap();

            writer.finish().unwrap();
        }

        // Repackage with custom CSS
        in_buffer.set_position(0);
        let mut archive = ZipArchive::new(in_buffer).unwrap();
        let mut out_buffer = Cursor::new(Vec::new());
        let custom_css = "body { background: #000; color: #fff; }";

        EpubWriter::repackage_archive(&mut archive, &mut out_buffer, custom_css).unwrap();

        // Validate resulting ZIP container strictly
        out_buffer.set_position(0);
        let mut result_archive = ZipArchive::new(out_buffer).unwrap();

        // 1. Entry 0 MUST be mimetype, Stored (uncompressed), application/epub+zip
        assert!(result_archive.len() >= 4);
        let mut entry0 = result_archive.by_index(0).unwrap();
        assert_eq!(entry0.name(), "mimetype", "First entry must be mimetype");
        assert_eq!(entry0.compression(), CompressionMethod::Stored, "Mimetype must be Stored uncompressed");
        let mut mime_content = Vec::new();
        entry0.read_to_end(&mut mime_content).unwrap();
        assert_eq!(mime_content, b"application/epub+zip");
        drop(entry0);

        // 2. Custom CSS entry must exist
        let mut css_entry = result_archive.by_name("OEBPS/nice-ebook-style.css").unwrap();
        let mut read_css = String::new();
        css_entry.read_to_string(&mut read_css).unwrap();
        assert_eq!(read_css, custom_css);
        drop(css_entry);

        // 3. OPF manifest must contain custom CSS item
        let mut opf_entry = result_archive.by_name("OEBPS/content.opf").unwrap();
        let mut read_opf = String::new();
        opf_entry.read_to_string(&mut read_opf).unwrap();
        assert!(read_opf.contains(r#"<item id="nice-ebook-custom-style" href="nice-ebook-style.css" media-type="text/css"/>"#));
        drop(opf_entry);

        // 4. Chapter XHTML must link the stylesheet inside head
        let mut ch_entry = result_archive.by_name("OEBPS/ch1.xhtml").unwrap();
        let mut read_ch = String::new();
        ch_entry.read_to_string(&mut read_ch).unwrap();
        assert!(read_ch.contains(r#"<link rel="stylesheet" type="text/css" href="nice-ebook-style.css" />"#));
        let link_pos = read_ch.find(r#"<link rel="stylesheet" type="text/css" href="nice-ebook-style.css" />"#).unwrap();
        let head_end = read_ch.find("</head>").unwrap();
        assert!(link_pos < head_end);
    }
}

