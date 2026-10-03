use super::parser::EpubParser;
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

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, Default)]
pub struct MetadataOverrides {
    pub title: Option<String>,
    pub author: Option<String>,
    pub language: Option<String>,
    pub description: Option<String>,
    pub cover_data_url: Option<String>,
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
        metadata_overrides: Option<&MetadataOverrides>,
        extra_chapters: Option<&HashMap<String, String>>,
    ) -> Result<u64, String> {
        let in_path = input_path.as_ref();
        let out_path = output_path.as_ref();

        let is_same_file = in_path == out_path;
        let actual_out_path = if is_same_file {
            let pid = std::process::id();
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();
            let ext = out_path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("epub");
            out_path.with_extension(format!("tmp_{}_{}.{}", pid, timestamp, ext))
        } else {
            out_path.to_path_buf()
        };

        let in_file = File::open(in_path).map_err(|e| format!("Cannot open input file: {}", e))?;
        let mut archive =
            ZipArchive::new(in_file).map_err(|e| format!("Invalid EPUB ZIP: {}", e))?;

        let out_file = File::create(&actual_out_path)
            .map_err(|e| format!("Cannot create output file: {}", e))?;

        let result = Self::repackage_archive(
            &mut archive,
            out_file,
            custom_css,
            chapter_overrides,
            metadata_overrides,
            extra_chapters,
        );

        drop(archive);

        match result {
            Ok(size) => {
                if is_same_file && std::fs::rename(&actual_out_path, out_path).is_err() {
                    std::fs::copy(&actual_out_path, out_path)
                        .map_err(|ce| format!("Failed to replace original file: {}", ce))?;
                    let _ = std::fs::remove_file(&actual_out_path);
                }
                Ok(size)
            }
            Err(e) => {
                if is_same_file {
                    let _ = std::fs::remove_file(&actual_out_path);
                }
                Err(e)
            }
        }
    }

    pub fn repackage_bytes<Q: AsRef<Path>>(
        input_bytes: &[u8],
        output_path: Q,
        custom_css: &str,
        chapter_overrides: Option<&HashMap<String, String>>,
        metadata_overrides: Option<&MetadataOverrides>,
        extra_chapters: Option<&HashMap<String, String>>,
    ) -> Result<u64, String> {
        let cursor = Cursor::new(input_bytes);
        let mut archive =
            ZipArchive::new(cursor).map_err(|e| format!("Invalid EPUB ZIP: {}", e))?;

        let out_file = File::create(output_path.as_ref())
            .map_err(|e| format!("Cannot create output file: {}", e))?;

        Self::repackage_archive(
            &mut archive,
            out_file,
            custom_css,
            chapter_overrides,
            metadata_overrides,
            extra_chapters,
        )
    }

    fn repackage_archive<R: Read + Seek, W: Write + Seek>(
        archive: &mut ZipArchive<R>,
        out_stream: W,
        custom_css: &str,
        chapter_overrides: Option<&HashMap<String, String>>,
        metadata_overrides: Option<&MetadataOverrides>,
        extra_chapters: Option<&HashMap<String, String>>,
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

        // Read and pre-parse OPF to discover existing cover
        let orig_opf_content = {
            let mut file = archive
                .by_name(&opf_path)
                .map_err(|e| format!("Missing OPF file at '{}': {}", opf_path, e))?;
            let mut s = String::new();
            file.read_to_string(&mut s)
                .map_err(|e| format!("Failed to read OPF file: {}", e))?;
            s
        };

        let (_parsed_meta, manifest, _spine_ids, cover_id) =
            EpubParser::parse_opf(&orig_opf_content).unwrap_or_else(|_| {
                (
                    super::parser::EpubMetadata {
                        title: String::new(),
                        author: String::new(),
                        language: "vi".to_string(),
                        description: None,
                        cover_data_url: None,
                        chapter_count: 0,
                        file_size_bytes: 0,
                        chapters: Vec::new(),
                        sample_text: String::new(),
                    },
                    HashMap::new(),
                    Vec::new(),
                    None,
                )
            });

        // Determine if user provided a replacement cover
        let decoded_cover: Option<(Vec<u8>, String, String)> = if let Some(meta) =
            metadata_overrides
        {
            if let Some(ref data_url) = meta.cover_data_url {
                let comma_idx = data_url.find(',');
                let b64 = if let Some(idx) = comma_idx {
                    &data_url[idx + 1..]
                } else {
                    data_url.as_str()
                };
                use base64::Engine;
                if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64.trim()) {
                    if !bytes.is_empty() {
                        let (ext, mime) = if data_url.contains("image/png") {
                            ("png", "image/png")
                        } else if data_url.contains("image/webp") {
                            ("webp", "image/webp")
                        } else {
                            ("jpg", "image/jpeg")
                        };
                        Some((bytes, ext.to_string(), mime.to_string()))
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        // Check if existing cover file exists in archive
        let existing_cover_path: Option<String> = cover_id
            .as_ref()
            .and_then(|cid| manifest.get(cid))
            .map(|href| format!("{}{}", opf_base_dir, href));

        // If new cover provided and no existing cover was in the book, create a new cover file path
        let new_cover_file_path: Option<(String, String)> =
            match (&decoded_cover, &existing_cover_path) {
                (Some((_, ext, _)), None) => {
                    let fname = format!("cover.{}", ext);
                    let full_path = format!("{}{}", opf_base_dir, fname);
                    Some((fname, full_path))
                }
                _ => None,
            };

        let new_cover_opf_info = new_cover_file_path.as_ref().map(|(fname, _)| {
            let mime = decoded_cover
                .as_ref()
                .map(|(_, _, m)| m.as_str())
                .unwrap_or("image/jpeg");
            (fname.as_str(), mime)
        });

        let default_opts =
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        // Snapshot the archive's entry names once, so existence checks do not repeatedly
        // borrow the reader while we build the new-chapter list.
        let archive_names: std::collections::HashSet<String> = {
            let mut names = std::collections::HashSet::new();
            for i in 0..archive.len() {
                if let Ok(entry) = archive.by_index_raw(i) {
                    names.insert(entry.name().to_string());
                }
            }
            names
        };

        let href_exists = |href: &str| -> bool {
            let clean = href.trim_start_matches('/');
            archive_names.contains(clean)
                || archive_names.contains(&format!("{}{}", opf_base_dir, clean))
        };

        // Build the list of NEW chapters. Each tuple is (item_id, href_relative_to_opf, title, html).
        //
        // Two sources feed this list: the explicit `extra_chapters` map, and any
        // `chapter_overrides` entry whose href is absent from the archive. The latter matters
        // because a generated chapter (e.g. an extra chapter) is produced as an override —
        // without this, it would be silently dropped instead of being written and registered.
        let mut new_chapter_sources: Vec<(String, String)> = Vec::new();

        if let Some(extras) = extra_chapters {
            let mut entries: Vec<(&String, &String)> = extras.iter().collect();
            // Deterministic ordering keeps exported EPUBs byte-stable between runs.
            entries.sort_by(|a, b| a.0.cmp(b.0));
            for (href, html) in entries {
                new_chapter_sources.push((href.clone(), html.clone()));
            }
        }

        if let Some(overrides) = chapter_overrides {
            let mut entries: Vec<(&String, &String)> = overrides.iter().collect();
            entries.sort_by(|a, b| a.0.cmp(b.0));
            for (href, html) in entries {
                if href_exists(href) {
                    continue;
                }
                // Avoid duplicating a href already queued from `extra_chapters`.
                if new_chapter_sources
                    .iter()
                    .any(|(existing, _)| existing == href)
                {
                    continue;
                }
                new_chapter_sources.push((href.clone(), html.clone()));
            }
        }

        let mut extra_items: Vec<(String, String, String, String)> = Vec::new();
        for (href, html) in &new_chapter_sources {
            let clean_href = href.trim_start_matches('/');
            if clean_href.is_empty() || href_exists(clean_href) {
                continue;
            }
            let id = format!("nice-extra-{}", extra_items.len() + 1);
            let title = Self::extract_document_title(html)
                .unwrap_or_else(|| format!("Phụ lục {}", extra_items.len() + 1));
            extra_items.push((id, clean_href.to_string(), title, html.clone()));
        }

        // 3. Write all entries from original archive (except mimetype, and modify OPF + XHTML)
        let num_files = archive.len();
        for i in 0..num_files {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("Read zip error: {}", e))?;
            let name = file.name().to_string();

            if name == "mimetype" || name == full_css_path {
                continue; // Already written first, or will be replaced with custom CSS
            }

            if name == opf_path {
                let mut updated_opf = Self::inject_css_into_opf(&orig_opf_content, css_file_name);
                if let Some(meta) = metadata_overrides {
                    updated_opf = Self::update_opf_metadata(&updated_opf, meta, new_cover_opf_info);
                }
                if !extra_items.is_empty() {
                    updated_opf = Self::inject_extra_chapters_into_opf(&updated_opf, &extra_items);
                }

                zip_writer
                    .start_file(&name, default_opts)
                    .map_err(|e| format!("Zip start file error: {}", e))?;
                zip_writer
                    .write_all(updated_opf.as_bytes())
                    .map_err(|e| format!("Zip write OPF error: {}", e))?;
            } else if Some(&name) == existing_cover_path.as_ref() && decoded_cover.is_some() {
                // Replace existing cover image with new cover bytes
                let (cover_bytes, _, _) = decoded_cover.as_ref().unwrap();
                zip_writer
                    .start_file(&name, default_opts)
                    .map_err(|e| format!("Zip start file error: {}", e))?;
                zip_writer
                    .write_all(cover_bytes)
                    .map_err(|e| format!("Zip write cover error: {}", e))?;
            } else if name.ends_with(".ncx") {
                let mut ncx_content = String::new();
                file.read_to_string(&mut ncx_content)
                    .map_err(|e| format!("Error reading NCX: {}", e))?;

                let updated_ncx = if let Some(meta) = metadata_overrides {
                    Self::update_ncx_metadata(
                        &ncx_content,
                        meta.title.as_deref(),
                        meta.author.as_deref(),
                    )
                } else {
                    ncx_content
                };

                let updated_ncx = if extra_items.is_empty() {
                    updated_ncx
                } else {
                    Self::inject_extra_chapters_into_ncx(&updated_ncx, &extra_items)
                };

                zip_writer
                    .start_file(&name, default_opts)
                    .map_err(|e| format!("Zip start file error: {}", e))?;
                zip_writer
                    .write_all(updated_ncx.as_bytes())
                    .map_err(|e| format!("Zip write NCX error: {}", e))?;
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
                let mut updated_html = Self::inject_link_tag(&html_content, &rel_css_path);

                // EPUB 3 navigation document: append the new chapters to the TOC list.
                if !extra_items.is_empty() {
                    updated_html =
                        Self::inject_extra_chapters_into_nav(&updated_html, &extra_items);
                }

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

        // 4b. Write newly generated chapter files (e.g. an extra chapter)
        for (_, href, _, html) in &extra_items {
            let full_path = format!("{}{}", opf_base_dir, href);
            zip_writer
                .start_file(&full_path, default_opts)
                .map_err(|e| format!("Failed to create extra chapter entry: {}", e))?;

            // The new file must also point at the custom stylesheet.
            let rel_css_path = Self::compute_relative_css_path(&full_path, &full_css_path);
            let styled_html = Self::inject_link_tag(html, &rel_css_path);

            zip_writer
                .write_all(styled_html.as_bytes())
                .map_err(|e| format!("Failed to write extra chapter: {}", e))?;
        }

        // 5. If new cover was created (no previous cover in book), write the new cover file
        if let (Some((cover_bytes, _, _)), Some((_, ref full_path))) =
            (&decoded_cover, &new_cover_file_path)
        {
            zip_writer
                .start_file(full_path, default_opts)
                .map_err(|e| format!("Failed to create new cover entry: {}", e))?;
            zip_writer
                .write_all(cover_bytes)
                .map_err(|e| format!("Failed to write new cover bytes: {}", e))?;
        }

        // 6. Finalize ZIP
        let finished = zip_writer
            .finish()
            .map_err(|e| format!("Failed to finalize EPUB ZIP: {}", e))?;

        let stream_ref = finished;
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

    /// Extracts a human-readable title from a generated chapter document.
    /// Prefers `<title>`, then the first `<h1>`/`<h2>` heading.
    pub(crate) fn extract_document_title(html: &str) -> Option<String> {
        fn clean(raw: &str) -> Option<String> {
            let without_tags = regex::Regex::new(r"<[^>]*>")
                .ok()?
                .replace_all(raw, " ")
                .to_string();
            let collapsed = without_tags
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            let trimmed = collapsed.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }

        for pattern in [
            r"(?is)<title[^>]*>(.*?)</title>",
            r"(?is)<h1[^>]*>(.*?)</h1>",
        ] {
            if let Ok(re) = regex::Regex::new(pattern) {
                if let Some(caps) = re.captures(html) {
                    if let Some(found) = caps.get(1).and_then(|m| clean(m.as_str())) {
                        return Some(found);
                    }
                }
            }
        }

        None
    }

    /// Registers new chapter files in the OPF: one manifest `<item>` and one spine `<itemref>` each.
    fn inject_extra_chapters_into_opf(
        opf_content: &str,
        items: &[(String, String, String, String)],
    ) -> String {
        if items.is_empty() || opf_content.contains("nice-extra-") {
            return opf_content.to_string();
        }

        let mut manifest_additions = String::new();
        let mut spine_additions = String::new();

        for (id, href, _, _) in items {
            manifest_additions.push_str(&format!(
                "    <item id=\"{}\" href=\"{}\" media-type=\"application/xhtml+xml\"/>\n",
                id,
                escape_xml(href)
            ));
            spine_additions.push_str(&format!("    <itemref idref=\"{}\"/>\n", id));
        }

        let mut result = opf_content.to_string();

        if let Some(pos) = result.find("</manifest>") {
            result.insert_str(pos, &manifest_additions);
        }
        if let Some(pos) = result.find("</spine>") {
            result.insert_str(pos, &spine_additions);
        }

        result
    }

    /// Adds `<navPoint>` entries to the NCX table of contents.
    fn inject_extra_chapters_into_ncx(
        ncx_content: &str,
        items: &[(String, String, String, String)],
    ) -> String {
        if items.is_empty() {
            return ncx_content.to_string();
        }

        let Some(pos) = ncx_content.find("</navMap>") else {
            return ncx_content.to_string();
        };

        // Continue playOrder numbering after the highest existing value.
        let mut next_play_order: u32 = 1;
        if let Ok(re) = regex::Regex::new(r#"playOrder="(\d+)""#) {
            for caps in re.captures_iter(ncx_content) {
                if let Some(n) = caps.get(1).and_then(|m| m.as_str().parse::<u32>().ok()) {
                    next_play_order = next_play_order.max(n + 1);
                }
            }
        }

        let mut additions = String::new();
        for (idx, (_, href, title, _)) in items.iter().enumerate() {
            additions.push_str(&format!(
                "    <navPoint id=\"nice-extra-np-{}\" playOrder=\"{}\">\n      <navLabel><text>{}</text></navLabel>\n      <content src=\"{}\"/>\n    </navPoint>\n",
                idx + 1,
                next_play_order + idx as u32,
                escape_xml(title),
                escape_xml(href)
            ));
        }

        let mut result = ncx_content[..pos].to_string();
        result.push_str(&additions);
        result.push_str(&ncx_content[pos..]);
        result
    }

    /// Adds `<li>` entries to the EPUB 3 navigation document's TOC list, when present.
    fn inject_extra_chapters_into_nav(
        nav_content: &str,
        items: &[(String, String, String, String)],
    ) -> String {
        if items.is_empty() {
            return nav_content.to_string();
        }

        // Only the TOC nav is extended; other nav landmarks are left untouched.
        let Some(toc_start) = nav_content.find("epub:type=\"toc\"") else {
            return nav_content.to_string();
        };

        let Some(relative_ol_end) = nav_content[toc_start..].find("</ol>") else {
            return nav_content.to_string();
        };
        let insert_at = toc_start + relative_ol_end;

        let mut additions = String::new();
        for (_, href, title, _) in items {
            additions.push_str(&format!(
                "      <li><a href=\"{}\">{}</a></li>\n",
                escape_xml(href),
                escape_xml(title)
            ));
        }

        let mut result = nav_content[..insert_at].to_string();
        result.push_str(&additions);
        result.push_str(&nav_content[insert_at..]);
        result
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

    pub fn update_opf_metadata(
        opf_content: &str,
        overrides: &MetadataOverrides,
        new_cover_info: Option<(&str, &str)>,
    ) -> String {
        let mut result = opf_content.to_string();

        if let Some(ref title) = overrides.title {
            let esc = escape_xml(title.trim());
            let re = regex::Regex::new(r"(?s)<dc:title[^>]*>.*?</dc:title>").unwrap();
            if re.is_match(&result) {
                result = re
                    .replace(&result, format!("<dc:title>{}</dc:title>", esc).as_str())
                    .to_string();
            } else if let Some(pos) = result.find("</metadata>") {
                result.insert_str(pos, &format!("  <dc:title>{}</dc:title>\n", esc));
            }
        }

        if let Some(ref author) = overrides.author {
            let esc = escape_xml(author.trim());
            let re = regex::Regex::new(r"(?s)<dc:creator[^>]*>.*?</dc:creator>").unwrap();
            if re.is_match(&result) {
                result = re
                    .replace(
                        &result,
                        format!("<dc:creator>{}</dc:creator>", esc).as_str(),
                    )
                    .to_string();
            } else if let Some(pos) = result.find("</metadata>") {
                result.insert_str(pos, &format!("  <dc:creator>{}</dc:creator>\n", esc));
            }
        }

        if let Some(ref lang) = overrides.language {
            let esc = escape_xml(lang.trim());
            let re = regex::Regex::new(r"(?s)<dc:language[^>]*>.*?</dc:language>").unwrap();
            if re.is_match(&result) {
                result = re
                    .replace(
                        &result,
                        format!("<dc:language>{}</dc:language>", esc).as_str(),
                    )
                    .to_string();
            } else if let Some(pos) = result.find("</metadata>") {
                result.insert_str(pos, &format!("  <dc:language>{}</dc:language>\n", esc));
            }
        }

        if let Some(ref desc) = overrides.description {
            let esc = escape_xml(desc.trim());
            let re = regex::Regex::new(r"(?s)<dc:description[^>]*>.*?</dc:description>").unwrap();
            if re.is_match(&result) {
                result = re
                    .replace(
                        &result,
                        format!("<dc:description>{}</dc:description>", esc).as_str(),
                    )
                    .to_string();
            } else if let Some(pos) = result.find("</metadata>") {
                result.insert_str(
                    pos,
                    &format!("  <dc:description>{}</dc:description>\n", esc),
                );
            }
        }

        if let Some((cover_filename, mime)) = new_cover_info {
            if !result.contains(cover_filename) {
                if let Some(pos) = result.find("</manifest>") {
                    let item = format!(
                        "    <item id=\"cover-image\" href=\"{}\" media-type=\"{}\" properties=\"cover-image\"/>\n",
                        cover_filename, mime
                    );
                    result.insert_str(pos, &item);
                }
                if !result.contains("name=\"cover\"") {
                    if let Some(pos) = result.find("</metadata>") {
                        let meta_tag = "    <meta name=\"cover\" content=\"cover-image\"/>\n";
                        result.insert_str(pos, meta_tag);
                    }
                }
            }
        }

        result
    }

    pub fn update_ncx_metadata(
        ncx_content: &str,
        title: Option<&str>,
        author: Option<&str>,
    ) -> String {
        let mut result = ncx_content.to_string();
        if let Some(t) = title {
            let esc = escape_xml(t.trim());
            let re = regex::Regex::new(r"(?s)<docTitle>\s*<text>.*?</text>\s*</docTitle>").unwrap();
            if re.is_match(&result) {
                result = re
                    .replace(
                        &result,
                        format!("<docTitle><text>{}</text></docTitle>", esc).as_str(),
                    )
                    .to_string();
            }
        }
        if let Some(a) = author {
            let esc = escape_xml(a.trim());
            let re =
                regex::Regex::new(r"(?s)<docAuthor>\s*<text>.*?</text>\s*</docAuthor>").unwrap();
            if re.is_match(&result) {
                result = re
                    .replace(
                        &result,
                        format!("<docAuthor><text>{}</text></docAuthor>", esc).as_str(),
                    )
                    .to_string();
            }
        }
        result
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

        EpubWriter::repackage_archive(&mut archive, &mut out_buffer, custom_css, None, None, None)
            .unwrap();

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
    fn test_repackage_preserves_publisher_css_and_appends_override_last() {
        // Hợp đồng của chế độ "theo sách hiện tại": CSS gốc của nhà xuất bản phải
        // còn nguyên trong file xuất, và lớp phủ của app chỉ được CHÈN SAU để thắng
        // theo cascade — không được xoá/thay thế CSS gốc.
        const PUBLISHER_CSS: &str = "body { font-family: 'Lora', serif; color: #2b2b2b; }";
        const OVERRIDE_CSS: &str = "p { text-indent: 1.5em; }";

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
    <item id="pub-css" href="styles/publisher.css" media-type="text/css"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>"#,
                )
                .unwrap();

            writer
                .start_file("OEBPS/styles/publisher.css", def_opts)
                .unwrap();
            writer.write_all(PUBLISHER_CSS.as_bytes()).unwrap();

            writer.start_file("OEBPS/ch1.xhtml", def_opts).unwrap();
            writer
                .write_all(
                    r#"<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chương 1</title><link rel="stylesheet" type="text/css" href="styles/publisher.css" /></head>
<body><h1>Chương 1</h1><p>Nội dung</p></body>
</html>"#
                        .as_bytes(),
                )
                .unwrap();

            writer.finish().unwrap();
        }

        in_buffer.set_position(0);
        let mut archive = ZipArchive::new(in_buffer).unwrap();
        let mut out_buffer = Cursor::new(Vec::new());
        EpubWriter::repackage_archive(
            &mut archive,
            &mut out_buffer,
            OVERRIDE_CSS,
            None,
            None,
            None,
        )
        .unwrap();

        out_buffer.set_position(0);
        let mut result_archive = ZipArchive::new(out_buffer).unwrap();

        // 1. CSS gốc vẫn còn nguyên nội dung
        let mut publisher_css = result_archive
            .by_name("OEBPS/styles/publisher.css")
            .expect("publisher stylesheet must be preserved");
        let mut read_publisher = String::new();
        publisher_css.read_to_string(&mut read_publisher).unwrap();
        assert_eq!(read_publisher, PUBLISHER_CSS);
        drop(publisher_css);

        // 2. Lớp phủ của app cũng có mặt
        let mut override_css = result_archive
            .by_name("OEBPS/nice-ebook-style.css")
            .expect("override stylesheet must be written");
        let mut read_override = String::new();
        override_css.read_to_string(&mut read_override).unwrap();
        assert_eq!(read_override, OVERRIDE_CSS);
        drop(override_css);

        // 3. Trong chương, link gốc đứng TRƯỚC link của app (thứ tự cascade)
        let mut ch_entry = result_archive.by_name("OEBPS/ch1.xhtml").unwrap();
        let mut read_ch = String::new();
        ch_entry.read_to_string(&mut read_ch).unwrap();

        let publisher_link_pos = read_ch
            .find("href=\"styles/publisher.css\"")
            .expect("original publisher link must survive");
        let override_link_pos = read_ch
            .find("href=\"nice-ebook-style.css\"")
            .expect("override link must be injected");
        assert!(
            publisher_link_pos < override_link_pos,
            "override link must come after the publisher link so it wins the cascade"
        );
        drop(ch_entry);

        // 4. OPF khai báo cả hai stylesheet
        let mut opf_entry = result_archive.by_name("OEBPS/content.opf").unwrap();
        let mut read_opf = String::new();
        opf_entry.read_to_string(&mut read_opf).unwrap();
        assert!(read_opf.contains(r#"href="styles/publisher.css""#));
        assert!(
            read_opf.contains(r#"<item id="nice-ebook-custom-style" href="nice-ebook-style.css""#)
        );
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

        EpubWriter::repackage_archive(
            &mut archive,
            &mut out_buffer,
            custom_css,
            Some(&overrides),
            None,
            None,
        )
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
    fn test_extra_chapters_injected_into_manifest_spine_ncx_and_nav() {
        // Build a minimal EPUB 3 with a NCX and a navigation document.
        let mut in_buffer = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut in_buffer);
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

            writer.start_file("OEBPS/content.opf", deflated).unwrap();
            writer
                .write_all(
                    br#"<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Book</dc:title>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
  </spine>
</package>"#,
                )
                .unwrap();

            writer.start_file("OEBPS/ch1.xhtml", deflated).unwrap();
            writer
                .write_all(b"<html><head><title>C1</title></head><body><p>Goc</p></body></html>")
                .unwrap();

            writer.start_file("OEBPS/toc.ncx", deflated).unwrap();
            writer
                .write_all(
                    br#"<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="np1" playOrder="1"><navLabel><text>C1</text></navLabel><content src="ch1.xhtml"/></navPoint>
  </navMap>
</ncx>"#,
                )
                .unwrap();

            writer.start_file("OEBPS/nav.xhtml", deflated).unwrap();
            writer
                .write_all(
                    br#"<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head><body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">C1</a></li></ol></nav></body></html>"#,
                )
                .unwrap();

            writer.finish().unwrap();
        }

        in_buffer.set_position(0);
        let mut archive = ZipArchive::new(in_buffer).unwrap();
        let mut out_buffer = Cursor::new(Vec::new());

        let appendix_html = "<html><head><title>Phu Luc Nhan Vat</title></head><body><h1>Nhan vat</h1></body></html>";
        let mut extras = HashMap::new();
        extras.insert("extra_chapter.xhtml".to_string(), appendix_html.to_string());

        EpubWriter::repackage_archive(
            &mut archive,
            &mut out_buffer,
            "body { margin: 0; }",
            None,
            None,
            Some(&extras),
        )
        .unwrap();

        out_buffer.set_position(0);
        let mut result = ZipArchive::new(out_buffer).unwrap();

        // 1. The new chapter file MUST exist next to the OPF and link the generated CSS.
        let mut appendix_entry = result
            .by_name("OEBPS/extra_chapter.xhtml")
            .expect("appendix file must be written into the archive");
        let mut appendix_read = String::new();
        appendix_entry.read_to_string(&mut appendix_read).unwrap();
        assert!(appendix_read.contains("Nhan vat"));
        assert!(appendix_read.contains("nice-ebook-style.css"));
        drop(appendix_entry);

        // 2. OPF MUST register it in the manifest and the spine.
        let mut opf_entry = result.by_name("OEBPS/content.opf").unwrap();
        let mut opf_read = String::new();
        opf_entry.read_to_string(&mut opf_read).unwrap();
        assert!(
            opf_read.contains(r#"<item id="nice-extra-1" href="extra_chapter.xhtml" media-type="application/xhtml+xml"/>"#),
            "manifest must declare the new chapter: {}",
            opf_read
        );
        assert!(
            opf_read.contains(r#"<itemref idref="nice-extra-1"/>"#),
            "spine must reference the new chapter: {}",
            opf_read
        );
        drop(opf_entry);

        // 3. NCX MUST gain a navPoint with a continued playOrder.
        let mut ncx_entry = result.by_name("OEBPS/toc.ncx").unwrap();
        let mut ncx_read = String::new();
        ncx_entry.read_to_string(&mut ncx_read).unwrap();
        assert!(ncx_read.contains(r#"playOrder="2""#), "NCX: {}", ncx_read);
        assert!(ncx_read.contains("Phu Luc Nhan Vat"), "NCX: {}", ncx_read);
        assert!(
            ncx_read.contains(r#"<content src="extra_chapter.xhtml"/>"#),
            "NCX: {}",
            ncx_read
        );
        drop(ncx_entry);

        // 4. The EPUB 3 nav document MUST gain a matching list entry.
        let mut nav_entry = result.by_name("OEBPS/nav.xhtml").unwrap();
        let mut nav_read = String::new();
        nav_entry.read_to_string(&mut nav_read).unwrap();
        assert!(
            nav_read.contains(r#"<li><a href="extra_chapter.xhtml">Phu Luc Nhan Vat</a></li>"#),
            "nav doc: {}",
            nav_read
        );
    }

    #[test]
    fn test_extra_chapter_skips_hrefs_that_already_exist() {
        let mut in_buffer = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut in_buffer);
            let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            writer.start_file("mimetype", opts).unwrap();
            writer.write_all(b"application/epub+zip").unwrap();

            let deflated =
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
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
                .write_all(b"<html><head><title>C1</title></head><body><p>Goc</p></body></html>")
                .unwrap();
            writer.finish().unwrap();
        }

        in_buffer.set_position(0);
        let mut archive = ZipArchive::new(in_buffer).unwrap();
        let mut out_buffer = Cursor::new(Vec::new());

        // Passing an href that already exists must NOT duplicate it in the manifest/spine.
        let mut extras = HashMap::new();
        extras.insert(
            "ch1.xhtml".to_string(),
            "<html><head><title>C1</title></head><body><p>Moi</p></body></html>".to_string(),
        );

        EpubWriter::repackage_archive(
            &mut archive,
            &mut out_buffer,
            "body { margin: 0; }",
            None,
            None,
            Some(&extras),
        )
        .unwrap();

        out_buffer.set_position(0);
        let mut result = ZipArchive::new(out_buffer).unwrap();
        let mut opf_entry = result.by_name("OEBPS/content.opf").unwrap();
        let mut opf_read = String::new();
        opf_entry.read_to_string(&mut opf_read).unwrap();

        assert!(
            !opf_read.contains("nice-extra-"),
            "existing hrefs must not be re-registered: {}",
            opf_read
        );
        assert_eq!(opf_read.matches(r#"<itemref "#).count(), 1);
    }

    #[test]
    fn test_chapter_override_for_missing_href_becomes_a_new_chapter() {
        // Regression guard: a generated chapter (e.g. an extra chapter) is produced as a chapter
        // override. Because its href does not exist in the source archive, it must still be written
        // and registered in the manifest/spine rather than silently dropped.
        let mut in_buffer = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut in_buffer);
            let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            writer.start_file("mimetype", opts).unwrap();
            writer.write_all(b"application/epub+zip").unwrap();

            let deflated =
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
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
                .write_all(b"<html><head><title>C1</title></head><body><p>Goc</p></body></html>")
                .unwrap();
            writer.finish().unwrap();
        }

        in_buffer.set_position(0);
        let mut archive = ZipArchive::new(in_buffer).unwrap();
        let mut out_buffer = Cursor::new(Vec::new());

        let mut overrides = HashMap::new();
        overrides.insert(
            "extra_chapter.xhtml".to_string(),
            "<html><head><title>Phu Luc Nhan Vat</title></head><body><h1>Nhan vat</h1></body></html>"
                .to_string(),
        );

        EpubWriter::repackage_archive(
            &mut archive,
            &mut out_buffer,
            "body { margin: 0; }",
            Some(&overrides),
            None,
            None, // no explicit extra_chapters: the override must be promoted on its own
        )
        .unwrap();

        out_buffer.set_position(0);
        let mut result = ZipArchive::new(out_buffer).unwrap();

        assert!(
            result.by_name("OEBPS/extra_chapter.xhtml").is_ok(),
            "an override for a missing href must be written as a new chapter file"
        );

        let mut opf_entry = result.by_name("OEBPS/content.opf").unwrap();
        let mut opf_read = String::new();
        opf_entry.read_to_string(&mut opf_read).unwrap();
        assert!(
            opf_read.contains(r#"href="extra_chapter.xhtml"#),
            "{}",
            opf_read
        );
        assert!(
            opf_read.contains(r#"<itemref idref="nice-extra-1"/>"#),
            "{}",
            opf_read
        );
    }

    #[test]
    fn test_extract_document_title_prefers_title_then_h1() {
        assert_eq!(
            EpubWriter::extract_document_title(
                "<html><head><title>Phu Luc Nhan Vat</title></head><body><h1>Other</h1></body></html>"
            ),
            Some("Phu Luc Nhan Vat".to_string())
        );
        assert_eq!(
            EpubWriter::extract_document_title(
                "<html><body><h1>Nhan Vat &amp; Boi Canh</h1></body></html>"
            ),
            Some("Nhan Vat &amp; Boi Canh".to_string())
        );
        assert_eq!(
            EpubWriter::extract_document_title("<html><body><p>none</p></body></html>"),
            None
        );
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

    #[test]
    fn test_update_opf_metadata_and_new_cover() {
        let opf = r#"<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:test</dc:identifier>
    <dc:title>Old Title</dc:title>
    <dc:creator>Old Author</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>"#;

        let overrides = MetadataOverrides {
            title: Some("Đắc Nhân Tâm".to_string()),
            author: Some("Dale Carnegie".to_string()),
            language: Some("vi".to_string()),
            description: Some("Nghệ thuật thu phục lòng người.".to_string()),
            cover_data_url: None,
        };

        let updated =
            EpubWriter::update_opf_metadata(opf, &overrides, Some(("cover.jpg", "image/jpeg")));
        assert!(updated.contains("<dc:title>Đắc Nhân Tâm</dc:title>"));
        assert!(updated.contains("<dc:creator>Dale Carnegie</dc:creator>"));
        assert!(updated.contains("<dc:language>vi</dc:language>"));
        assert!(
            updated.contains("<dc:description>Nghệ thuật thu phục lòng người.</dc:description>")
        );
        assert!(updated.contains(r#"<item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>"#));
        assert!(updated.contains(r#"<meta name="cover" content="cover-image"/>"#));
        assert!(updated.contains("<dc:identifier id=\"pub-id\">urn:uuid:test</dc:identifier>"));
    }

    #[test]
    fn test_repackage_archive_with_metadata_and_new_cover() {
        use crate::epub::EpubParser;

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
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:test-123</dc:identifier>
    <dc:title>Tua Sach Cu</dc:title>
    <dc:creator>Tac Gia Cu</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
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
                    b"<html><head><title>C1</title></head><body><p>Noi dung</p></body></html>",
                )
                .unwrap();

            writer.finish().unwrap();
        }

        // Repackage with MetadataOverrides + mock cover image
        in_buffer.set_position(0);
        let mut archive = ZipArchive::new(in_buffer).unwrap();
        let mut out_buffer = Cursor::new(Vec::new());

        // 1x1 white pixel png base64
        let dummy_cover_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

        let meta_overrides = MetadataOverrides {
            title: Some("Số Đỏ (Bản Chuẩn)".to_string()),
            author: Some("Vũ Trọng Phụng".to_string()),
            language: Some("vi".to_string()),
            description: Some("Kiệt tác trào phúng văn học Việt Nam.".to_string()),
            cover_data_url: Some(dummy_cover_b64.to_string()),
        };

        EpubWriter::repackage_archive(
            &mut archive,
            &mut out_buffer,
            "body { color: red; }",
            None,
            Some(&meta_overrides),
            None,
        )
        .unwrap();

        // Read repackaged EPUB with EpubParser
        out_buffer.set_position(0);
        let out_bytes = out_buffer.into_inner();
        let parsed = EpubParser::parse_bytes(&out_bytes).expect("Repackaged EPUB must be valid");

        assert_eq!(parsed.title, "Số Đỏ (Bản Chuẩn)");
        assert_eq!(parsed.author, "Vũ Trọng Phụng");
        assert_eq!(parsed.language, "vi");
        assert_eq!(
            parsed.description,
            Some("Kiệt tác trào phúng văn học Việt Nam.".to_string())
        );
        assert!(
            parsed.cover_data_url.is_some(),
            "Repackaged EPUB must contain cover image"
        );
    }

    #[test]
    fn test_repackage_file_in_place_overwrite() {
        use crate::epub::EpubParser;

        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join(format!("test_inplace_{}.epub", std::process::id()));

        // Create initial EPUB
        let initial_options = CreateEpubOptions {
            title: "Tua Goc".to_string(),
            author: "Tac Gia Goc".to_string(),
            language: Some("vi".to_string()),
            description: Some("Ban goc chua sua".to_string()),
            cover_base64: None,
            custom_css: None,
            chapters: vec![NewEpubChapter {
                title: "C1".to_string(),
                content_html: "<p>Chuong 1 goc</p>".to_string(),
            }],
            output_path: Some(test_file.to_str().unwrap().to_string()),
        };

        EpubWriter::create_epub(&initial_options).expect("Initial file creation");

        // Repackage in-place: input_path == output_path
        let overrides = MetadataOverrides {
            title: Some("Tua Da Sua Watermark".to_string()),
            author: Some("Tac Gia Chuan".to_string()),
            language: Some("vi".to_string()),
            description: Some("Da duoc lam sach".to_string()),
            cover_data_url: None,
        };

        let mut chapter_overrides = HashMap::new();
        chapter_overrides.insert(
            "OEBPS/chapter_1.xhtml".to_string(),
            "<p>Chuong 1 da duoc lam sach watermark!</p>".to_string(),
        );

        let size = EpubWriter::repackage_file(
            &test_file,
            &test_file,
            "body { font-size: 18px; }",
            Some(&chapter_overrides),
            Some(&overrides),
            None,
        )
        .expect("In-place repackage must succeed");

        assert!(size > 0);

        // Parse file to verify that content was updated without being truncated
        let parsed = EpubParser::parse_file(&test_file).expect("Must parse overwritten EPUB");
        assert_eq!(parsed.title, "Tua Da Sua Watermark");
        assert_eq!(parsed.author, "Tac Gia Chuan");

        let ch1 = EpubParser::read_chapter_content(&test_file, &parsed.chapters[0].href).unwrap();
        assert!(ch1.contains("Chuong 1 da duoc lam sach watermark!"));

        let _ = std::fs::remove_file(test_file);
    }
}
