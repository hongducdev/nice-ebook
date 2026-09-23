use quick_xml::events::Event;
use quick_xml::reader::Reader;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Cursor, Read};
use std::path::Path;
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterItem {
    pub id: String,
    pub href: String,
    pub title: String,
    pub preview_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpubMetadata {
    pub title: String,
    pub author: String,
    pub language: String,
    pub description: Option<String>,
    pub cover_data_url: Option<String>,
    pub chapter_count: usize,
    pub file_size_bytes: u64,
    pub chapters: Vec<ChapterItem>,
    pub sample_text: String,
}

pub struct EpubParser;

impl EpubParser {
    pub fn parse_file<P: AsRef<Path>>(file_path: P) -> Result<EpubMetadata, String> {
        let path = file_path.as_ref();
        let file = File::open(path).map_err(|e| format!("Cannot open file: {}", e))?;
        let file_size = file.metadata().map(|m| m.len()).unwrap_or(0);
        let mut archive = ZipArchive::new(file).map_err(|e| format!("Not a valid EPUB ZIP: {}", e))?;

        Self::parse_archive(&mut archive, file_size)
    }

    pub fn parse_bytes(bytes: &[u8]) -> Result<EpubMetadata, String> {
        let cursor = Cursor::new(bytes);
        let mut archive = ZipArchive::new(cursor).map_err(|e| format!("Not a valid EPUB ZIP: {}", e))?;
        Self::parse_archive(&mut archive, bytes.len() as u64)
    }

    pub fn read_chapter_content<P: AsRef<Path>>(
        file_path: P,
        chapter_href: &str,
    ) -> Result<String, String> {
        let file = File::open(file_path.as_ref()).map_err(|e| format!("Cannot open file: {}", e))?;
        let mut archive = ZipArchive::new(file).map_err(|e| format!("Invalid EPUB ZIP: {}", e))?;
        let mut ch_file = archive
            .by_name(chapter_href)
            .map_err(|e| format!("Cannot find chapter file '{}': {}", chapter_href, e))?;
        let mut content = String::new();
        ch_file
            .read_to_string(&mut content)
            .map_err(|e| format!("Failed to read chapter content: {}", e))?;
        Ok(content)
    }

    pub fn read_chapter_content_bytes(
        bytes: &[u8],
        chapter_href: &str,
    ) -> Result<String, String> {
        let cursor = Cursor::new(bytes);
        let mut archive = ZipArchive::new(cursor).map_err(|e| format!("Invalid EPUB ZIP: {}", e))?;
        let mut ch_file = archive
            .by_name(chapter_href)
            .map_err(|e| format!("Cannot find chapter file '{}': {}", chapter_href, e))?;
        let mut content = String::new();
        ch_file
            .read_to_string(&mut content)
            .map_err(|e| format!("Failed to read chapter content: {}", e))?;
        Ok(content)
    }

    fn parse_archive<R: Read + std::io::Seek>(
        archive: &mut ZipArchive<R>,
        file_size: u64,
    ) -> Result<EpubMetadata, String> {
        // 1. Locate rootfile from META-INF/container.xml
        let opf_path = Self::find_opf_path(archive)?;

        // Determine base directory of the OPF file
        let opf_base_dir = if let Some(idx) = opf_path.rfind('/') {
            opf_path[..=idx].to_string()
        } else {
            String::new()
        };

        // 2. Read OPF content
        let mut opf_file = archive
            .by_name(&opf_path)
            .map_err(|e| format!("Missing OPF file at '{}': {}", opf_path, e))?;
        let mut opf_content = String::new();
        opf_file
            .read_to_string(&mut opf_content)
            .map_err(|e| format!("Failed to read OPF file: {}", e))?;
        drop(opf_file);

        // 3. Parse OPF metadata, manifest, and spine
        let (mut meta, manifest, spine_ids, cover_id) = Self::parse_opf(&opf_content)?;
        meta.file_size_bytes = file_size;

        // 4. Resolve cover image
        if let Some(c_id) = cover_id {
            if let Some(href) = manifest.get(&c_id) {
                let full_cover_path = format!("{}{}", opf_base_dir, href);
                if let Ok(mut c_file) = archive.by_name(&full_cover_path) {
                    let mut img_bytes = Vec::new();
                    if c_file.read_to_end(&mut img_bytes).is_ok() {
                        let mime = if href.ends_with(".png") {
                            "image/png"
                        } else if href.ends_with(".webp") {
                            "image/webp"
                        } else {
                            "image/jpeg"
                        };
                        let b64 = Self::base64_encode(&img_bytes);
                        meta.cover_data_url = Some(format!("data:{};base64,{}", mime, b64));
                    }
                }
            }
        }

        // 5. Read first few chapters for preview and text extraction
        let mut chapters = Vec::new();
        let mut sample_text_collector = Vec::new();

        for id in &spine_ids {
            if let Some(href) = manifest.get(id) {
                let full_href = format!("{}{}", opf_base_dir, href);
                if let Ok(mut ch_file) = archive.by_name(&full_href) {
                    let mut ch_content = String::new();
                    if ch_file.read_to_string(&mut ch_content).is_ok() {
                        let plain = Self::strip_html_tags(&ch_content);
                        let title = Self::extract_title_from_html(&ch_content)
                            .unwrap_or_else(|| format!("Chương {}", chapters.len() + 1));
                        
                        let preview: String = plain.chars().take(200).collect();
                        
                        // Collect text for Jev classification (first 5 chapters or 50,000 chars)
                        if sample_text_collector.len() < 50_000 {
                            sample_text_collector.push(plain.clone());
                        }

                        chapters.push(ChapterItem {
                            id: id.clone(),
                            href: full_href,
                            title,
                            preview_text: preview,
                        });
                    }
                }
            }
        }

        meta.chapter_count = chapters.len();
        meta.chapters = chapters;
        meta.sample_text = sample_text_collector.join("\n\n");

        Ok(meta)
    }

    fn find_opf_path<R: Read + std::io::Seek>(archive: &mut ZipArchive<R>) -> Result<String, String> {
        let mut container_file = archive
            .by_name("META-INF/container.xml")
            .map_err(|_| "Invalid EPUB: META-INF/container.xml not found".to_string())?;

        let mut content = String::new();
        container_file
            .read_to_string(&mut content)
            .map_err(|e| format!("Cannot read container.xml: {}", e))?;

        let mut reader = Reader::from_str(&content);
        reader.config_mut().trim_text(true);

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

    fn parse_opf(
        opf_content: &str,
    ) -> Result<
        (
            EpubMetadata,
            HashMap<String, String>,
            Vec<String>,
            Option<String>,
        ),
        String,
    > {
        let mut reader = Reader::from_str(opf_content);
        reader.config_mut().trim_text(true);

        let mut title = "Không có tiêu đề".to_string();
        let mut author = "Khuyết danh".to_string();
        let mut language = "vi".to_string();
        let mut description = None;
        let mut manifest: HashMap<String, String> = HashMap::new();
        let mut spine_ids: Vec<String> = Vec::new();
        let mut cover_id = None;

        let mut current_tag = Vec::new();

        loop {
            match reader.read_event() {
                Ok(Event::Start(e)) => {
                    current_tag = e.name().as_ref().to_vec();
                }
                Ok(Event::Empty(e)) => {
                    let name = e.name().as_ref().to_vec();
                    if name == b"item" {
                        let mut item_id = String::new();
                        let mut item_href = String::new();
                        let mut is_cover = false;

                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"id" {
                                item_id = String::from_utf8_lossy(&attr.value).to_string();
                            } else if attr.key.as_ref() == b"href" {
                                item_href = String::from_utf8_lossy(&attr.value).to_string();
                            } else if attr.key.as_ref() == b"properties"
                                && String::from_utf8_lossy(&attr.value).contains("cover-image")
                            {
                                is_cover = true;
                            }
                        }

                        if is_cover {
                            cover_id = Some(item_id.clone());
                        }
                        if !item_id.is_empty() && !item_href.is_empty() {
                            manifest.insert(item_id, item_href);
                        }
                    } else if name == b"itemref" {
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"idref" {
                                spine_ids.push(String::from_utf8_lossy(&attr.value).to_string());
                            }
                        }
                    } else if name == b"meta" {
                        let mut meta_name = String::new();
                        let mut meta_content = String::new();
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"name" {
                                meta_name = String::from_utf8_lossy(&attr.value).to_string();
                            } else if attr.key.as_ref() == b"content" {
                                meta_content = String::from_utf8_lossy(&attr.value).to_string();
                            }
                        }
                        if meta_name == "cover" && cover_id.is_none() {
                            cover_id = Some(meta_content);
                        }
                    }
                }
                Ok(Event::Text(e)) => {
                    let text = e.unescape().unwrap_or_default().to_string();
                    if current_tag.ends_with(b"title") {
                        if !text.is_empty() {
                            title = text;
                        }
                    } else if current_tag.ends_with(b"creator") {
                        if !text.is_empty() {
                            author = text;
                        }
                    } else if current_tag.ends_with(b"language") {
                        if !text.is_empty() {
                            language = text;
                        }
                    } else if current_tag.ends_with(b"description") {
                        if !text.is_empty() {
                            description = Some(text);
                        }
                    }
                }
                Ok(Event::End(_)) => {
                    current_tag.clear();
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(format!("Error parsing OPF: {}", e)),
                _ => (),
            }
        }

        let meta = EpubMetadata {
            title,
            author,
            language,
            description,
            cover_data_url: None,
            chapter_count: 0,
            file_size_bytes: 0,
            chapters: Vec::new(),
            sample_text: String::new(),
        };

        Ok((meta, manifest, spine_ids, cover_id))
    }

    fn strip_html_tags(html: &str) -> String {
        let mut in_tag = false;
        let mut result = String::with_capacity(html.len() / 2);
        for c in html.chars() {
            if c == '<' {
                in_tag = true;
            } else if c == '>' {
                in_tag = false;
            } else if !in_tag {
                result.push(c);
            }
        }
        result
            .replace("&nbsp;", " ")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&amp;", "&")
            .replace("&quot;", "\"")
    }

    fn extract_title_from_html(html: &str) -> Option<String> {
        let lower = html.to_lowercase();
        // Look for <h1>, <h2>, or <title>
        for tag in &["<h1", "<h2", "<title"] {
            if let Some(start_idx) = lower.find(tag) {
                if let Some(close_tag_idx) = lower[start_idx..].find('>') {
                    let text_start = start_idx + close_tag_idx + 1;
                    let end_tag = format!("</{}", &tag[1..]);
                    if let Some(end_idx) = lower[text_start..].find(&end_tag) {
                        let raw = &html[text_start..text_start + end_idx];
                        let clean = Self::strip_html_tags(raw).trim().to_string();
                        if !clean.is_empty() {
                            return Some(clean);
                        }
                    }
                }
            }
        }
        None
    }

    fn base64_encode(bytes: &[u8]) -> String {
        const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut result = String::with_capacity((bytes.len() + 2) / 3 * 4);
        for chunk in bytes.chunks(3) {
            let b0 = chunk[0];
            let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
            let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };

            result.push(CHARS[(b0 >> 2) as usize] as char);
            result.push(CHARS[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);

            if chunk.len() > 1 {
                result.push(CHARS[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
            } else {
                result.push('=');
            }

            if chunk.len() > 2 {
                result.push(CHARS[(b2 & 0x3f) as usize] as char);
            } else {
                result.push('=');
            }
        }
        result
    }
}
