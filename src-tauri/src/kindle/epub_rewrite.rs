//! Shared EPUB archive rewriting.
//!
//! Both the link repair and the navigation repair need to rewrite an EPUB in place while preserving
//! every unrelated entry. Keeping that in one place means the `mimetype`-first/Stored invariant is
//! implemented and tested once, rather than re-derived per repair.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

/// Rewrites `epub_path` in place, replacing the given entries and appending new ones.
///
/// `replacements` and `additions` are keyed by archive-relative path. All other entries are copied
/// verbatim. The `mimetype` entry is always written first and uncompressed, as EPUB requires.
pub(crate) fn rewrite_epub_entries(
    epub_path: &Path,
    replacements: &HashMap<String, String>,
    additions: &HashMap<String, String>,
) -> Result<(), String> {
    let file = std::fs::File::open(epub_path)
        .map_err(|e| format!("Không mở được EPUB để ghi lại: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("EPUB không phải ZIP hợp lệ: {}", e))?;

    let mut entry_names: Vec<String> = Vec::new();
    for i in 0..archive.len() {
        let entry = archive
            .by_index_raw(i)
            .map_err(|e| format!("Lỗi đọc entry trong EPUB: {}", e))?;
        entry_names.push(entry.name().to_string());
    }

    let temp_path = epub_path.with_extension("repair.tmp");
    {
        let out_file = std::fs::File::create(&temp_path)
            .map_err(|e| format!("Không tạo được tệp tạm: {}", e))?;
        let mut writer = ZipWriter::new(out_file);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        // 1. `mimetype` first and uncompressed, always.
        writer
            .start_file("mimetype", stored)
            .map_err(|e| format!("Lỗi ghi mimetype: {}", e))?;
        writer
            .write_all(b"application/epub+zip")
            .map_err(|e| format!("Lỗi ghi mimetype: {}", e))?;

        // 2. Every original entry except mimetype, with replacements applied.
        for name in &entry_names {
            if name == "mimetype" {
                continue;
            }
            writer
                .start_file(name, deflated)
                .map_err(|e| format!("Lỗi tạo entry '{}': {}", name, e))?;

            match replacements.get(name) {
                Some(content) => writer
                    .write_all(content.as_bytes())
                    .map_err(|e| format!("Lỗi ghi entry '{}': {}", name, e))?,
                None => {
                    let mut entry = archive
                        .by_name(name)
                        .map_err(|e| format!("Không đọc lại được entry '{}': {}", name, e))?;
                    let mut buffer = Vec::new();
                    entry
                        .read_to_end(&mut buffer)
                        .map_err(|e| format!("Lỗi đọc entry '{}': {}", name, e))?;
                    writer
                        .write_all(&buffer)
                        .map_err(|e| format!("Lỗi ghi entry '{}': {}", name, e))?;
                }
            }
        }

        // 3. Newly generated entries (a synthesized NCX or nav document).
        let mut new_names: Vec<&String> = additions.keys().collect();
        new_names.sort();
        for name in new_names {
            if entry_names.iter().any(|existing| existing == name) {
                continue;
            }
            writer
                .start_file(name, deflated)
                .map_err(|e| format!("Lỗi tạo entry mới '{}': {}", name, e))?;
            writer
                .write_all(additions[name].as_bytes())
                .map_err(|e| format!("Lỗi ghi entry mới '{}': {}", name, e))?;
        }

        writer
            .finish()
            .map_err(|e| format!("Lỗi hoàn tất EPUB: {}", e))?;
    }

    std::fs::rename(&temp_path, epub_path)
        .map_err(|e| format!("Không thay thế được EPUB gốc: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn unique_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "epubrw_{}_{}",
            tag,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn build_epub(path: &Path, entries: &[(&str, &str)]) {
        let file = std::fs::File::create(path).unwrap();
        let mut writer = ZipWriter::new(file);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        writer.start_file("mimetype", stored).unwrap();
        writer.write_all(b"application/epub+zip").unwrap();
        for (name, content) in entries {
            writer.start_file(*name, deflated).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap();
    }

    #[test]
    fn test_rewrite_replaces_adds_and_preserves_entries() {
        let dir = unique_dir("basic");
        let epub = dir.join("book.epub");
        build_epub(
            &epub,
            &[
                ("META-INF/container.xml", "<container/>"),
                ("OEBPS/content.opf", "<package>old</package>"),
                ("OEBPS/ch1.xhtml", "<html>keep me</html>"),
            ],
        );

        let mut replacements = HashMap::new();
        replacements.insert(
            "OEBPS/content.opf".to_string(),
            "<package>new</package>".to_string(),
        );
        let mut additions = HashMap::new();
        additions.insert("OEBPS/toc.ncx".to_string(), "<ncx/>".to_string());

        rewrite_epub_entries(&epub, &replacements, &additions).unwrap();

        let file = std::fs::File::open(&epub).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();

        // mimetype must still be first and uncompressed.
        let mut first = archive.by_index(0).unwrap();
        assert_eq!(first.name(), "mimetype");
        assert_eq!(first.compression(), CompressionMethod::Stored);
        let mut mime = String::new();
        first.read_to_string(&mut mime).unwrap();
        assert_eq!(mime, "application/epub+zip");
        drop(first);

        let read = |archive: &mut ZipArchive<std::fs::File>, name: &str| {
            let mut s = String::new();
            archive
                .by_name(name)
                .unwrap()
                .read_to_string(&mut s)
                .unwrap();
            s
        };

        assert_eq!(
            read(&mut archive, "OEBPS/content.opf"),
            "<package>new</package>"
        );
        assert_eq!(
            read(&mut archive, "OEBPS/ch1.xhtml"),
            "<html>keep me</html>"
        );
        assert_eq!(read(&mut archive, "OEBPS/toc.ncx"), "<ncx/>");
        assert_eq!(read(&mut archive, "META-INF/container.xml"), "<container/>");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rewrite_does_not_duplicate_an_existing_entry_name() {
        let dir = unique_dir("nodup");
        let epub = dir.join("book.epub");
        build_epub(&epub, &[("OEBPS/toc.ncx", "original")]);

        let mut additions = HashMap::new();
        additions.insert("OEBPS/toc.ncx".to_string(), "SHOULD NOT WIN".to_string());

        rewrite_epub_entries(&epub, &HashMap::new(), &additions).unwrap();

        let file = std::fs::File::open(&epub).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        assert_eq!(archive.len(), 2, "entry count must not grow");

        let mut content = String::new();
        archive
            .by_name("OEBPS/toc.ncx")
            .unwrap()
            .read_to_string(&mut content)
            .unwrap();
        assert_eq!(content, "original");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
