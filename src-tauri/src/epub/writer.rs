use std::collections::HashMap;
use std::fs::File;
use std::io::{Cursor, Read, Seek, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct NewEpubChapter {
    pub title: String,
    pub content_html: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct CreateEpubOptions {
    pub title: String,
    pub author: String,
    pub language: Option<String>,
    pub description: Option<String>,
    pub cover_base64: Option<String>,
    pub custom_css: Option<String>,
    pub chapters: Vec<NewEpubChapter>,
    pub output_path: Option<String>,
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub struct EpubWriter;

impl EpubWriter {
    pub fn create_epub(options: &CreateEpubOptions) -> Result<Vec<u8>, String> {
        if options.chapters.is_empty() {
            return Err("Không có chương nào để tạo EPUB".to_string());
        }

        let title = if options.title.trim().is_empty() {
            "Không Tiêu Đề".to_string()
        } else {
            options.title.trim().to_string()
        };

        let author = if options.author.trim().is_empty() {
            "Khuyết Danh".to_string()
        } else {
            options.author.trim().to_string()
        };

        let language = options.language.as_deref().unwrap_or("vi");
        let timestamp_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let book_id = format!("urn:uuid:nice-ebook-{}", timestamp_ms);

        let mut buffer = Cursor::new(Vec::new());
        {
            let mut zip_writer = ZipWriter::new(&mut buffer);

            // 1. MUST write `mimetype` FIRST and UNCOMPRESSED (EPUB Spec requirement)
            let mimetype_opts =
                SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            zip_writer
                .start_file("mimetype", mimetype_opts)
                .map_err(|e| format!("Failed to write mimetype entry: {}", e))?;
            zip_writer
                .write_all(b"application/epub+zip")
                .map_err(|e| format!("Failed to write mimetype content: {}", e))?;

            let def_opts =
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

            // 2. Write META-INF/container.xml
            zip_writer
                .start_file("META-INF/container.xml", def_opts)
                .map_err(|e| format!("Failed to write container.xml entry: {}", e))?;
            let container_xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#;
            zip_writer
                .write_all(container_xml.as_bytes())
                .map_err(|e| format!("Failed to write container.xml content: {}", e))?;

            // 3. Write CSS stylesheet
            let default_css = r#"/* NiceEbook Default Clean Stylesheet */
body {
  margin: 5% 8%;
  font-family: serif;
  line-height: 1.65;
  text-align: justify;
}
h1 {
  font-size: 1.8em;
  margin-top: 1.5em;
  margin-bottom: 1em;
  text-align: center;
  font-weight: bold;
}
h2 {
  font-size: 1.4em;
  margin-top: 1.2em;
  margin-bottom: 0.8em;
  text-align: center;
}
p {
  margin: 0.6em 0;
  text-indent: 1.5em;
}
.first-para {
  text-indent: 0;
}
"#;
            let css_content = options.custom_css.as_deref().unwrap_or(default_css);
            zip_writer
                .start_file("OEBPS/nice-ebook-style.css", def_opts)
                .map_err(|e| format!("Failed to write CSS entry: {}", e))?;
            zip_writer
                .write_all(css_content.as_bytes())
                .map_err(|e| format!("Failed to write CSS content: {}", e))?;

            // 4. Handle cover image if provided
            let mut has_cover = false;
            if let Some(ref cover_data) = options.cover_base64 {
                let base64_str = if let Some(idx) = cover_data.find(',') {
                    &cover_data[idx + 1..]
                } else {
                    cover_data.as_str()
                };
                use base64::Engine;
                if let Ok(cover_bytes) =
                    base64::engine::general_purpose::STANDARD.decode(base64_str.trim())
                {
                    if !cover_bytes.is_empty() {
                        zip_writer
                            .start_file("OEBPS/cover.jpg", def_opts)
                            .map_err(|e| format!("Failed to write cover entry: {}", e))?;
                        zip_writer
                            .write_all(&cover_bytes)
                            .map_err(|e| format!("Failed to write cover bytes: {}", e))?;
                        has_cover = true;
                    }
                }
            }

            // 5. Write each chapter XHTML
            for (i, chapter) in options.chapters.iter().enumerate() {
                let chapter_filename = format!("OEBPS/chapter_{}.xhtml", i + 1);
                zip_writer
                    .start_file(&chapter_filename, def_opts)
                    .map_err(|e| format!("Failed to start chapter entry: {}", e))?;

                let ch_title = if chapter.title.trim().is_empty() {
                    format!("Chương {}", i + 1)
                } else {
                    chapter.title.trim().to_string()
                };

                let mut body_content = chapter.content_html.trim().to_string();
                if !body_content.contains("<p>")
                    && !body_content.contains("<div>")
                    && !body_content.contains("<h")
                {
                    let wrapped = body_content
                        .split('\n')
                        .map(|line| line.trim())
                        .filter(|line| !line.is_empty())
                        .map(|line| format!("<p>{}</p>", escape_xml(line)))
                        .collect::<Vec<_>>()
                        .join("\n");
                    body_content = wrapped;
                }

                let h1_tag = if !body_content.contains("<h1") {
                    format!("<h1>{}</h1>\n", escape_xml(&ch_title))
                } else {
                    String::new()
                };

                let xhtml = format!(
                    r#"<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{}">
<head>
  <meta charset="utf-8" />
  <title>{}</title>
  <link rel="stylesheet" type="text/css" href="nice-ebook-style.css" />
</head>
<body>
  {}{}
</body>
</html>"#,
                    escape_xml(language),
                    escape_xml(&ch_title),
                    h1_tag,
                    body_content
                );

                zip_writer
                    .write_all(xhtml.as_bytes())
                    .map_err(|e| format!("Failed to write chapter content: {}", e))?;
            }

            // 6. Write OEBPS/nav.xhtml (EPUB 3 Navigation Document)
            zip_writer
                .start_file("OEBPS/nav.xhtml", def_opts)
                .map_err(|e| format!("Failed to start nav.xhtml: {}", e))?;

            let mut nav_items = String::new();
            for (i, chapter) in options.chapters.iter().enumerate() {
                let ch_title = if chapter.title.trim().is_empty() {
                    format!("Chương {}", i + 1)
                } else {
                    chapter.title.trim().to_string()
                };
                nav_items.push_str(&format!(
                    r#"      <li><a href="chapter_{}.xhtml">{}</a></li>"#,
                    i + 1,
                    escape_xml(&ch_title)
                ));
                nav_items.push('\n');
            }

            let nav_xhtml = format!(
                r#"<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{}">
<head>
  <meta charset="utf-8" />
  <title>Mục Lục</title>
  <link rel="stylesheet" type="text/css" href="nice-ebook-style.css" />
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Mục Lục</h1>
    <ol>
{}    </ol>
  </nav>
</body>
</html>"#,
                escape_xml(language),
                nav_items
            );
            zip_writer
                .write_all(nav_xhtml.as_bytes())
                .map_err(|e| format!("Failed to write nav.xhtml: {}", e))?;

            // 7. Write OEBPS/toc.ncx (EPUB 2 NCX navigation)
            zip_writer
                .start_file("OEBPS/toc.ncx", def_opts)
                .map_err(|e| format!("Failed to start toc.ncx: {}", e))?;

            let mut ncx_navmap = String::new();
            for (i, chapter) in options.chapters.iter().enumerate() {
                let ch_title = if chapter.title.trim().is_empty() {
                    format!("Chương {}", i + 1)
                } else {
                    chapter.title.trim().to_string()
                };
                ncx_navmap.push_str(&format!(
                    r#"    <navPoint id="navPoint-{}" playOrder="{}">
      <navLabel><text>{}</text></navLabel>
      <content src="chapter_{}.xhtml"/>
    </navPoint>
"#,
                    i + 1,
                    i + 1,
                    escape_xml(&ch_title),
                    i + 1
                ));
            }

            let toc_ncx = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="{}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>{}</text></docTitle>
  <docAuthor><text>{}</text></docAuthor>
  <navMap>
{}  </navMap>
</ncx>"#,
                escape_xml(&book_id),
                escape_xml(&title),
                escape_xml(&author),
                ncx_navmap
            );
            zip_writer
                .write_all(toc_ncx.as_bytes())
                .map_err(|e| format!("Failed to write toc.ncx: {}", e))?;

            // 8. Write OEBPS/content.opf (Package Document)
            zip_writer
                .start_file("OEBPS/content.opf", def_opts)
                .map_err(|e| format!("Failed to start content.opf: {}", e))?;

            let mut manifest_items = String::new();
            manifest_items.push_str(
                r#"    <item id="style" href="nice-ebook-style.css" media-type="text/css"/>"#,
            );
            manifest_items.push('\n');
            manifest_items.push_str(
                r#"    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>"#,
            );
            manifest_items.push('\n');
            manifest_items.push_str(
                r#"    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>"#,
            );
            manifest_items.push('\n');

            if has_cover {
                manifest_items.push_str(r#"    <item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>"#);
                manifest_items.push('\n');
            }

            let mut spine_items = String::new();
            for (i, _) in options.chapters.iter().enumerate() {
                manifest_items.push_str(&format!(
                    r#"    <item id="chapter_{}" href="chapter_{}.xhtml" media-type="application/xhtml+xml"/>"#,
                    i + 1,
                    i + 1
                ));
                manifest_items.push('\n');

                spine_items.push_str(&format!(r#"    <itemref idref="chapter_{}"/>"#, i + 1));
                spine_items.push('\n');
            }

            let desc_tag = if let Some(ref desc) = options.description {
                format!(
                    "\n    <dc:description>{}</dc:description>",
                    escape_xml(desc)
                )
            } else {
                String::new()
            };

            let cover_meta = if has_cover {
                "\n    <meta name=\"cover\" content=\"cover-image\"/>"
            } else {
                ""
            };

            let content_opf = format!(
                r#"<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="{}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">{}</dc:identifier>
    <dc:title>{}</dc:title>
    <dc:creator>{}</dc:creator>
    <dc:language>{}</dc:language>
    <meta property="dcterms:modified">2026-09-25T00:00:00Z</meta>{}{}
  </metadata>
  <manifest>
{}  </manifest>
  <spine toc="ncx">
{}  </spine>
</package>"#,
                escape_xml(language),
                escape_xml(&book_id),
                escape_xml(&title),
                escape_xml(&author),
                escape_xml(language),
                desc_tag,
                cover_meta,
                manifest_items,
                spine_items
            );
            zip_writer
                .write_all(content_opf.as_bytes())
                .map_err(|e| format!("Failed to write content.opf: {}", e))?;

            zip_writer
                .finish()
                .map_err(|e| format!("Failed to finalize new EPUB archive: {}", e))?;
        }

        let bytes = buffer.into_inner();

        if let Some(ref path) = options.output_path {
            std::fs::write(path, &bytes)
                .map_err(|e| format!("Failed to write EPUB to '{}': {}", path, e))?;
        }

        Ok(bytes)
    }
    pub fn repackage_file<P: AsRef<Path>, Q: AsRef<Path>>(
        input_path: P,
        output_path: Q,
        custom_css: &str,
        chapter_overrides: Option<&HashMap<String, String>>,
    ) -> Result<u64, String> {
        let in_file = File::open(input_path.as_ref())
            .map_err(|e| format!("Cannot open input file: {}", e))?;
        let mut archive =
            ZipArchive::new(in_file).map_err(|e| format!("Invalid EPUB ZIP: {}", e))?;

        let out_file = File::create(output_path.as_ref())
            .map_err(|e| format!("Cannot create output file: {}", e))?;

        Self::repackage_archive(&mut archive, out_file, custom_css, chapter_overrides)
    }

    pub fn repackage_bytes<Q: AsRef<Path>>(
        input_bytes: &[u8],
        output_path: Q,
        custom_css: &str,
        chapter_overrides: Option<&HashMap<String, String>>,
    ) -> Result<u64, String> {
        let cursor = Cursor::new(input_bytes);
        let mut archive =
            ZipArchive::new(cursor).map_err(|e| format!("Invalid EPUB ZIP: {}", e))?;

        let out_file = File::create(output_path.as_ref())
            .map_err(|e| format!("Cannot create output file: {}", e))?;

        Self::repackage_archive(&mut archive, out_file, custom_css, chapter_overrides)
    }

    fn repackage_archive<R: Read + Seek, W: Write + Seek>(
        archive: &mut ZipArchive<R>,
        out_stream: W,
        custom_css: &str,
        chapter_overrides: Option<&HashMap<String, String>>,
    ) -> Result<u64, String> {
        let mut zip_writer = ZipWriter::new(out_stream);

        // 1. MUST write `mimetype` FIRST and UNCOMPRESSED (EPUB Spec requirement)
        let mimetype_opts =
            SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

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

        let default_opts =
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        // 3. Write all entries from original archive (except mimetype, and modify OPF + XHTML)
        let num_files = archive.len();
        for i in 0..num_files {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("Read zip error: {}", e))?;
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
            } else if name.ends_with(".xhtml") || name.ends_with(".html") || name.ends_with(".htm")
            {
                // Check if chapter has an override content (e.g. from AI editing)
                let clean_name = name.trim_start_matches('/');
                let html_content = if let Some(overrides) = chapter_overrides {
                    if let Some(custom_html) =
                        overrides.get(&name).or_else(|| overrides.get(clean_name))
                    {
                        custom_html.clone()
                    } else {
                        let mut orig = String::new();
                        file.read_to_string(&mut orig)
                            .map_err(|e| format!("Error reading chapter: {}", e))?;
                        orig
                    }
                } else {
                    let mut orig = String::new();
                    file.read_to_string(&mut orig)
                        .map_err(|e| format!("Error reading chapter: {}", e))?;
                    orig
                };

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
            EpubWriter::compute_relative_css_path(
                "OEBPS/text/ch1.xhtml",
                "OEBPS/nice-ebook-style.css"
            ),
            "../nice-ebook-style.css"
        );
        assert_eq!(
            EpubWriter::compute_relative_css_path(
                "OEBPS/text/sub/ch1.xhtml",
                "OEBPS/nice-ebook-style.css"
            ),
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

        let link_pos = updated
            .find(r#"<link rel="stylesheet" type="text/css" href="style.css" />"#)
            .unwrap();
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

            let def_opts =
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
            writer
                .start_file("META-INF/container.xml", def_opts)
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

            writer.start_file("OEBPS/content.opf", def_opts).unwrap();
            writer
                .write_all(
                    br#"<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>"#,
                )
                .unwrap();

            writer.start_file("OEBPS/ch1.xhtml", def_opts).unwrap();
            writer
                .write_all(
                    r#"<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chương 1</title></head>
<body><h1>Tiêu Đề</h1><p>Nội dung chương 1...</p></body>
</html>"#
                        .as_bytes(),
                )
                .unwrap();

            writer.finish().unwrap();
        }

        // Repackage with custom CSS
        in_buffer.set_position(0);
        let mut archive = ZipArchive::new(in_buffer).unwrap();
        let mut out_buffer = Cursor::new(Vec::new());
        let custom_css = "body { background: #000; color: #fff; }";

        EpubWriter::repackage_archive(&mut archive, &mut out_buffer, custom_css, None).unwrap();

        // Validate resulting ZIP container strictly
        out_buffer.set_position(0);
        let mut result_archive = ZipArchive::new(out_buffer).unwrap();

        // 1. Entry 0 MUST be mimetype, Stored (uncompressed), application/epub+zip
        assert!(result_archive.len() >= 4);
        let mut entry0 = result_archive.by_index(0).unwrap();
        assert_eq!(entry0.name(), "mimetype", "First entry must be mimetype");
        assert_eq!(
            entry0.compression(),
            CompressionMethod::Stored,
            "Mimetype must be Stored uncompressed"
        );
        let mut mime_content = Vec::new();
        entry0.read_to_end(&mut mime_content).unwrap();
        assert_eq!(mime_content, b"application/epub+zip");
        drop(entry0);

        // 2. Custom CSS entry must exist
        let mut css_entry = result_archive
            .by_name("OEBPS/nice-ebook-style.css")
            .unwrap();
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
        assert!(read_ch
            .contains(r#"<link rel="stylesheet" type="text/css" href="nice-ebook-style.css" />"#));
        let link_pos = read_ch
            .find(r#"<link rel="stylesheet" type="text/css" href="nice-ebook-style.css" />"#)
            .unwrap();
        let head_end = read_ch.find("</head>").unwrap();
        assert!(link_pos < head_end);
    }

    #[test]
    fn test_chapter_overrides_repackaging() {
        let mut in_buffer = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut in_buffer);
            let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            writer.start_file("mimetype", opts).unwrap();
            writer.write_all(b"application/epub+zip").unwrap();

            let def_opts =
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
            writer
                .start_file("META-INF/container.xml", def_opts)
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

            writer.start_file("OEBPS/content.opf", def_opts).unwrap();
            writer
                .write_all(
                    br#"<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>"#,
                )
                .unwrap();

            writer.start_file("OEBPS/ch1.xhtml", def_opts).unwrap();
            writer
                .write_all(
                    b"<html><head><title>C1</title></head><body><p>Goc chuong 1</p></body></html>",
                )
                .unwrap();

            writer.start_file("OEBPS/ch2.xhtml", def_opts).unwrap();
            writer
                .write_all(
                    b"<html><head><title>C2</title></head><body><p>Goc chuong 2</p></body></html>",
                )
                .unwrap();

            writer.finish().unwrap();
        }

        // Repackage with an override for OEBPS/ch1.xhtml
        in_buffer.set_position(0);
        let mut archive = ZipArchive::new(in_buffer).unwrap();
        let mut out_buffer = Cursor::new(Vec::new());
        let custom_css = "body { margin: 0; }";

        let mut overrides = HashMap::new();
        let modified_ch1 = "<html><head><title>C1</title></head><body><h1>H1 Chuan</h1><h2>H2 Bo Sung</h2><p>Da sua loi chinh ta</p></body></html>";
        overrides.insert("OEBPS/ch1.xhtml".to_string(), modified_ch1.to_string());

        EpubWriter::repackage_archive(&mut archive, &mut out_buffer, custom_css, Some(&overrides))
            .unwrap();

        // Inspect output archive
        out_buffer.set_position(0);
        let mut result_archive = ZipArchive::new(out_buffer).unwrap();

        // 1. First entry MUST be mimetype, Stored
        let mut entry0 = result_archive.by_index(0).unwrap();
        assert_eq!(entry0.name(), "mimetype");
        assert_eq!(entry0.compression(), CompressionMethod::Stored);
        let mut mime_content = Vec::new();
        entry0.read_to_end(&mut mime_content).unwrap();
        assert_eq!(mime_content, b"application/epub+zip");
        drop(entry0);

        // 2. ch1.xhtml MUST contain modified content and exactly one CSS link
        let mut ch1_entry = result_archive.by_name("OEBPS/ch1.xhtml").unwrap();
        let mut read_ch1 = String::new();
        ch1_entry.read_to_string(&mut read_ch1).unwrap();
        assert!(read_ch1.contains("<h1>H1 Chuan</h1>"));
        assert!(read_ch1.contains("<h2>H2 Bo Sung</h2>"));
        assert!(read_ch1.contains("<p>Da sua loi chinh ta</p>"));
        assert!(read_ch1
            .contains(r#"<link rel="stylesheet" type="text/css" href="nice-ebook-style.css" />"#));
        assert_eq!(
            read_ch1.matches(r#"<link rel="stylesheet""#).count(),
            1,
            "CSS link must be idempotent and injected only once"
        );
        drop(ch1_entry);

        // 3. ch2.xhtml MUST preserve original content and have exactly one CSS link
        let mut ch2_entry = result_archive.by_name("OEBPS/ch2.xhtml").unwrap();
        let mut read_ch2 = String::new();
        ch2_entry.read_to_string(&mut read_ch2).unwrap();
        assert!(read_ch2.contains("<p>Goc chuong 2</p>"));
        assert!(read_ch2
            .contains(r#"<link rel="stylesheet" type="text/css" href="nice-ebook-style.css" />"#));
        assert_eq!(read_ch2.matches(r#"<link rel="stylesheet""#).count(), 1);
    }

    #[test]
    fn test_create_new_epub_roundtrip() {
        use crate::epub::EpubParser;

        let options = CreateEpubOptions {
            title: "Tuyệt Kỹ Chuyển Đổi".to_string(),
            author: "NiceEbook Author".to_string(),
            language: Some("vi".to_string()),
            description: Some("Ebook được convert từ PDF/TXT sang EPUB 3 chuẩn".to_string()),
            cover_base64: None,
            custom_css: Some("body { font-size: 16px; }".to_string()),
            chapters: vec![
                NewEpubChapter {
                    title: "Chương 1: Khởi Đầu Mới".to_string(),
                    content_html: "<p>Nội dung chương một đã được trích xuất hoàn hảo.</p><p>Đoạn thứ hai tiếp diễn.</p>".to_string(),
                },
                NewEpubChapter {
                    title: "Chương 2: Thần Kiếm Xuất Thế".to_string(),
                    content_html: "<p>Gió thổi mây bay trên đỉnh Tuyết Sơn.</p>".to_string(),
                },
            ],
            output_path: None,
        };

        let epub_bytes = EpubWriter::create_epub(&options).expect("Failed to create EPUB");
        assert!(!epub_bytes.is_empty());

        // Parse back with EpubParser to verify validity and structure
        let meta = EpubParser::parse_bytes(&epub_bytes).expect("Failed to parse created EPUB");
        assert_eq!(meta.title, "Tuyệt Kỹ Chuyển Đổi");
        assert_eq!(meta.author, "NiceEbook Author");
        assert_eq!(meta.language, "vi");
        assert_eq!(meta.chapter_count, 2);
        assert_eq!(meta.chapters[0].title, "Chương 1: Khởi Đầu Mới");
        assert_eq!(meta.chapters[1].title, "Chương 2: Thần Kiếm Xuất Thế");

        // Verify chapter content
        let ch1_content =
            EpubParser::read_chapter_content_bytes(&epub_bytes, &meta.chapters[0].href).unwrap();
        assert!(ch1_content.contains("Nội dung chương một đã được trích xuất hoàn hảo."));
        assert!(ch1_content.contains("nice-ebook-style.css"));
    }
}
