pub mod epub;
pub mod jev;
pub mod scanner;

use epub::{CreateEpubOptions, EpubMetadata, EpubParser, EpubWriter};
use jev::{JevClassifier, JevDecision, JevVerdictChapterPlan, JevVerdictEngine};
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
    chapter_overrides: Option<std::collections::HashMap<String, String>>,
) -> Result<u64, String> {
    tokio::task::spawn_blocking(move || {
        if let Some(path) = input_path {
            EpubWriter::repackage_file(
                &path,
                &output_path,
                &custom_css,
                chapter_overrides.as_ref(),
            )?;
        } else if let Some(bytes) = input_bytes {
            EpubWriter::repackage_bytes(
                &bytes,
                &output_path,
                &custom_css,
                chapter_overrides.as_ref(),
            )?;
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
fn run_jev_verdict_chapter(
    chapter_title: String,
    chapter_html: String,
    book_title: String,
    author: String,
) -> JevVerdictChapterPlan {
    JevVerdictEngine::enhance_chapter_fast(&chapter_title, &chapter_html, &book_title, &author)
}

#[tauri::command]
async fn scan_ai_gateways() -> Vec<DetectedGateway> {
    GatewayScanner::scan_all().await
}

#[tauri::command]
async fn run_opencode_prompt(model: String, prompt: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let mut cmd = std::process::Command::new("opencode");
        cmd.args(["run", &model, &prompt]);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| {
            format!(
                "Không thể khởi động OpenCode CLI: {}. Vui lòng đảm bảo đã cài đặt OpenCode.",
                e
            )
        })?;

        let timeout = std::time::Duration::from_secs(45);
        let start = std::time::Instant::now();

        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    if !status.success() {
                        let mut stderr_buf = Vec::new();
                        if let Some(mut stderr) = child.stderr.take() {
                            use std::io::Read;
                            let _ = stderr.read_to_end(&mut stderr_buf);
                        }
                        let stderr_str = String::from_utf8_lossy(&stderr_buf);
                        return Err(format!("Lỗi OpenCode: {}", stderr_str.trim()));
                    }

                    let mut stdout_buf = Vec::new();
                    if let Some(stdout) = child.stdout.take() {
                        use std::io::Read;
                        let _ = stdout.take(2 * 1024 * 1024).read_to_end(&mut stdout_buf);
                    }

                    let raw = String::from_utf8_lossy(&stdout_buf);
                    let mut clean_lines = Vec::new();
                    for line in raw.lines() {
                        let trimmed = line.trim();
                        if trimmed.starts_with('>') || trimmed.starts_with("build ·") {
                            continue;
                        }
                        clean_lines.push(line);
                    }
                    return Ok(clean_lines.join("\n").trim().to_string());
                }
                Ok(None) => {
                    if start.elapsed() > timeout {
                        let _ = child.kill();
                        return Err("OpenCode CLI timeout (quá 45 giây không phản hồi)".to_string());
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                Err(e) => {
                    let _ = child.kill();
                    return Err(format!("Lỗi kiểm tra tiến trình OpenCode: {}", e));
                }
            }
        }
    })
    .await
    .map_err(|e| format!("Task execution failed: {}", e))?
}

#[tauri::command]
async fn test_opencode_model(model: String) -> Result<u64, String> {
    let start = std::time::Instant::now();
    run_opencode_prompt(model, "Reply with 'OK'".to_string()).await?;
    Ok(start.elapsed().as_millis() as u64)
}

#[tauri::command]
async fn create_new_epub(options: CreateEpubOptions) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || EpubWriter::create_epub(&options))
        .await
        .map_err(|e| format!("Task execution failed: {}", e))?
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
            run_jev_verdict_chapter,
            scan_ai_gateways,
            run_opencode_prompt,
            test_opencode_model,
            export_epub,
            create_new_epub
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
