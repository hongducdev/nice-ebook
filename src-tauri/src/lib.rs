pub mod epub;
pub mod jev;
pub mod scanner;

use epub::{EpubMetadata, EpubParser};
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
            classify_text_jev,
            scan_ai_gateways
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
