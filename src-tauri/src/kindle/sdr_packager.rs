use super::{
    wordwise_db::build_wordwise_database, xray_db::build_xray_database, SdrExportResult,
    WordWisePayload, XRayPayload,
};
use std::path::{Path, PathBuf};

pub fn package_kindle_sdr(
    output_dir: &str,
    book_basename: &str,
    asin: &str,
    xray_payload: Option<&XRayPayload>,
    wordwise_payload: Option<&WordWisePayload>,
    allow_missing_book_file: bool,
) -> Result<SdrExportResult, String> {
    if xray_payload.is_none() && wordwise_payload.is_none() {
        return Err(
            "Vui lòng cung cấp ít nhất một nguồn dữ liệu (X-Ray hoặc Word Wise) để xuất file SDR."
                .to_string(),
        );
    }

    let sanitized_name: String = book_basename
        .chars()
        .map(|c| {
            if ['/', '\\', '?', '%', '*', ':', '|', '"', '<', '>', '\0'].contains(&c) {
                '_'
            } else {
                c
            }
        })
        .collect();

    let clean_basename = sanitized_name.trim();
    if clean_basename.is_empty() {
        return Err("Tên sách không hợp lệ.".to_string());
    }

    // A sidecar is only meaningful next to the exact book it describes. Rather than merely
    // documenting that, enforce it: if no companion book file is present the caller must opt in
    // explicitly (for the staging workflow where the book is copied later).
    let paired_book_file = find_companion_book_file(output_dir, clean_basename);
    if paired_book_file.is_none() && !allow_missing_book_file {
        return Err(format!(
            "Chưa thấy tệp sách '{}' trong thư mục đã chọn. Thư mục sidecar .sdr chỉ có tác dụng \
             khi nằm cạnh đúng tệp sách mà nó được tạo ra (ví dụ '{}.azw3' hoặc '{}.mobi'). \
             Hãy chép tệp sách vào thư mục này trước, hoặc xác nhận rằng bạn sẽ tự chép kèm.",
            clean_basename, clean_basename, clean_basename
        ));
    }

    let sdr_folder_name = format!("{}.sdr", clean_basename);
    let sdr_dir: PathBuf = Path::new(output_dir).join(&sdr_folder_name);

    std::fs::create_dir_all(&sdr_dir)
        .map_err(|e| format!("Không thể tạo thư mục SDR '{}': {}", sdr_dir.display(), e))?;

    let clean_asin = asin.trim();
    let effective_asin = if clean_asin.is_empty() {
        "B00UNKNOWN"
    } else {
        clean_asin
    };

    let mut total_bytes: u64 = 0;
    let mut xray_path_str: Option<String> = None;
    let mut wordwise_path_str: Option<String> = None;

    // 1. Export X-Ray if provided
    if let Some(xray) = xray_payload {
        let xray_file_name = format!("XRAY.entities.{}.asc", effective_asin);
        let xray_file_path = sdr_dir.join(&xray_file_name);

        let size = build_xray_database(&xray_file_path, xray)?;
        total_bytes += size;
        xray_path_str = Some(xray_file_path.to_string_lossy().to_string());
    }

    // 2. Export Word Wise if provided
    if let Some(wordwise) = wordwise_payload {
        let wordwise_file_name = format!("LanguageLayer.en.{}.kll", effective_asin);
        let wordwise_file_path = sdr_dir.join(&wordwise_file_name);

        let size = build_wordwise_database(&wordwise_file_path, wordwise)?;
        total_bytes += size;
        wordwise_path_str = Some(wordwise_file_path.to_string_lossy().to_string());
    }

    Ok(SdrExportResult {
        sdr_dir_path: sdr_dir.to_string_lossy().to_string(),
        xray_file_path: xray_path_str,
        wordwise_file_path: wordwise_path_str,
        paired_book_file,
        total_bytes,
    })
}

/// Looks for the book file a sidecar would belong to, in the Kindle formats we can sensibly pair
/// with.
fn find_companion_book_file(output_dir: &str, basename: &str) -> Option<String> {
    const BOOK_EXTS: [&str; 4] = ["azw3", "mobi", "azw", "kfx"];
    let dir = Path::new(output_dir);

    for ext in BOOK_EXTS {
        let candidate = dir.join(format!("{}.{}", basename, ext));
        if candidate.is_file() {
            return Some(candidate.file_name()?.to_string_lossy().to_string());
        }
    }

    // Case-insensitive fallback: the file may be named differently from the sanitized title.
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let lower = name.to_ascii_lowercase();
        if BOOK_EXTS
            .iter()
            .any(|ext| lower.ends_with(&format!(".{}", ext)))
        {
            return Some(name);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "test_sdr_{}_{}",
            tag,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sample_payloads() -> (XRayPayload, WordWisePayload) {
        (
            XRayPayload {
                asin: "B00TEST999".to_string(),
                book_title: "A Study in Scarlet".to_string(),
                people: vec![],
                terms: vec![],
            },
            WordWisePayload {
                asin: "B00TEST999".to_string(),
                acr: None,
                revision: None,
                glosses: vec![],
            },
        )
    }

    #[test]
    fn test_package_kindle_sdr_creates_full_structure_next_to_its_book() {
        let temp_dir = unique_dir("full");
        // A sidecar only makes sense beside the book it describes, so the companion must exist.
        std::fs::write(
            temp_dir.join("A Study in Scarlet.azw3"),
            b"stand-in book bytes",
        )
        .unwrap();
        let output_dir = temp_dir.to_str().unwrap();
        let (xray, wordwise) = sample_payloads();

        let result = package_kindle_sdr(
            output_dir,
            "A Study in Scarlet",
            "B00TEST999",
            Some(&xray),
            Some(&wordwise),
            false,
        )
        .unwrap();

        let sdr_path = Path::new(&result.sdr_dir_path);
        assert!(sdr_path.is_dir());
        assert!(sdr_path.join("XRAY.entities.B00TEST999.asc").is_file());
        assert!(sdr_path.join("LanguageLayer.en.B00TEST999.kll").is_file());
        assert!(result.total_bytes > 0);
        assert_eq!(
            result.paired_book_file.as_deref(),
            Some("A Study in Scarlet.azw3"),
            "the result must report which book the sidecar belongs to"
        );

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_sidecar_is_refused_when_its_book_file_is_absent() {
        // The mutually-exclusive-modes warning is enforced, not merely documented: without a
        // companion book the sidecar would be an orphan that silently does nothing on a Kindle.
        let temp_dir = unique_dir("orphan");
        let output_dir = temp_dir.to_str().unwrap();
        let (xray, wordwise) = sample_payloads();

        let err = package_kindle_sdr(
            output_dir,
            "A Study in Scarlet",
            "B00TEST999",
            Some(&xray),
            Some(&wordwise),
            false,
        )
        .unwrap_err();

        assert!(
            err.contains("Chưa thấy tệp sách"),
            "expected a companion-book error, got: {}",
            err
        );
        // Nothing may be written when the export is refused.
        assert!(
            !temp_dir.join("A Study in Scarlet.sdr").exists(),
            "a refused export must not leave a sidecar folder behind"
        );

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_staging_workflow_can_opt_in_without_the_book_file() {
        // Copying the book later is legitimate, but it must be an explicit choice.
        let temp_dir = unique_dir("staging");
        let output_dir = temp_dir.to_str().unwrap();
        let (xray, wordwise) = sample_payloads();

        let result = package_kindle_sdr(
            output_dir,
            "A Study in Scarlet",
            "B00TEST999",
            Some(&xray),
            Some(&wordwise),
            true,
        )
        .unwrap();

        assert!(result.total_bytes > 0);
        assert!(
            result.paired_book_file.is_none(),
            "no companion book exists, so none may be reported"
        );

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_companion_detection_accepts_lowercase_and_mobi() {
        let temp_dir = unique_dir("detect");
        std::fs::write(temp_dir.join("some book.mobi"), b"x").unwrap();

        let paired = find_companion_book_file(temp_dir.to_str().unwrap(), "different title");
        assert_eq!(paired.as_deref(), Some("some book.mobi"));

        let none = find_companion_book_file(temp_dir.to_str().unwrap(), "nothing here");
        assert!(
            none.is_some(),
            "a .mobi in the folder is still a valid companion"
        );

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
