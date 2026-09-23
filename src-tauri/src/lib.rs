pub mod epub;
pub mod jev;
pub mod scanner;

use epub::{EpubMetadata, EpubParser, EpubWriter};
use jev::{JevClassifier, JevDecision};
use scanner::{DetectedGateway, GatewayScanner};

#[tauri::command]
async fn read_epub(path: String) -> Result<EpubMetadata, String> {
    tokio::task::spawn_blocking(move || EpubParser::parse_file(&path))
        .await
        .map_err(|e| format!("Task execution failed: {}", e))?
}

#[tauri::command]
async fn read_epub_bytes(bytes: Vec<u8>) -> Result<EpubMetadata, String> {
    tokio::task::spawn_blocking(move || EpubParser::parse_bytes(&bytes))
        .await
        .map_err(|e| format!("Task execution failed: {}", e))?
}

#[tauri::command]
async fn read_chapter(path: String, href: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || EpubParser::read_chapter_content(&path, &href))
        .await
        .map_err(|e| format!("Task execution failed: {}", e))?
}

#[tauri::command]
async fn read_chapter_bytes(bytes: Vec<u8>, href: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || EpubParser::read_chapter_content_bytes(&bytes, &href))
        .await
        .map_err(|e| format!("Task execution failed: {}", e))?
}

#[tauri::command]
async fn export_epub(
    input_path: Option<String>,
    input_bytes: Option<Vec<u8>>,
    output_path: String,
    custom_css: String,
) -> Result<u64, String> {
    tokio::task::spawn_blocking(move || {
        if let Some(path) = input_path {
            EpubWriter::repackage_file(&path, &output_path, &custom_css)?;
        } else if let Some(bytes) = input_bytes {
            EpubWriter::repackage_bytes(&bytes, &output_path, &custom_css)?;
        } else {
            return Err("No input EPUB source provided".to_string());
        }

        let file = std::fs::File::open(&output_path)
            .map_err(|e| format!("Cannot read exported file metadata: {}", e))?;
        let size = file.metadata().map(|m| m.len()).unwrap_or(0);
        Ok(size)
    })
    .await
    .map_err(|e| format!("Task execution failed: {}", e))?
}

#[tauri::command]
fn classify_text_jev(text: String) -> JevDecision {
    JevClassifier::classify(&text)
}

#[tauri::command]
async fn scan_ai_gateways() -> Vec<DetectedGateway> {
    GatewayScanner::scan_all().await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            read_epub,
            read_epub_bytes,
            read_chapter,
            read_chapter_bytes,
            classify_text_jev,
            scan_ai_gateways,
            export_epub
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
