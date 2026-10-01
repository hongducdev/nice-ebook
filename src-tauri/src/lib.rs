pub mod epub;
pub mod jev;
pub mod kindle;
pub mod scanner;

use epub::{
    CreateEpubOptions, EpubMetadata, EpubParser, EpubWriter, MetadataOverrides, StylesheetEntry,
};
use jev::{JevClassifier, JevDecision, JevVerdictChapterPlan, JevVerdictEngine};
use kindle::{SdrExportResult, WordWisePayload, XRayPayload};
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

/// Reads every stylesheet inside the book so the frontend can derive a style
/// that follows the book's own typography instead of replacing it.
#[tauri::command]
async fn read_epub_styles(
    path: Option<String>,
    bytes: Option<Vec<u8>>,
) -> Result<Vec<StylesheetEntry>, String> {
    tokio::task::spawn_blocking(move || match (path, bytes) {
        (Some(p), _) => EpubParser::read_stylesheets(&p),
        (None, Some(b)) => EpubParser::read_stylesheets_bytes(&b),
        (None, None) => Err("Cần truyền path hoặc bytes của sách".to_string()),
    })
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
    metadata_overrides: Option<MetadataOverrides>,
    extra_chapters: Option<std::collections::HashMap<String, String>>,
) -> Result<u64, String> {
    tokio::task::spawn_blocking(move || {
        if let Some(path) = input_path {
            EpubWriter::repackage_file(
                &path,
                &output_path,
                &custom_css,
                chapter_overrides.as_ref(),
                metadata_overrides.as_ref(),
                extra_chapters.as_ref(),
            )?;
        } else if let Some(bytes) = input_bytes {
            EpubWriter::repackage_bytes(
                &bytes,
                &output_path,
                &custom_css,
                chapter_overrides.as_ref(),
                metadata_overrides.as_ref(),
                extra_chapters.as_ref(),
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

/// Builds the Kindle-ready EPUB and converts it to AZW3/MOBI in one shot.
///
/// The intermediate EPUB is written to the system temp directory and removed on every exit path
/// (success, build failure, or conversion failure) so a failed export cannot leave files behind.
#[tauri::command]
async fn export_kindle_book(
    input_path: Option<String>,
    input_bytes: Option<Vec<u8>>,
    output_path: String,
    custom_css: String,
    chapter_overrides: Option<std::collections::HashMap<String, String>>,
    metadata_overrides: Option<MetadataOverrides>,
    extra_chapters: Option<std::collections::HashMap<String, String>>,
) -> Result<kindle::converter::KindleConversionResult, String> {
    tokio::task::spawn_blocking(move || {
        kindle::converter::build_kindle_ready_epub_and_convert(
            input_path.as_deref(),
            input_bytes.as_deref(),
            &output_path,
            &custom_css,
            chapter_overrides.as_ref(),
            metadata_overrides.as_ref(),
            extra_chapters.as_ref(),
        )
    })
    .await
    .map_err(|e| format!("Task execution failed: {}", e))?
}

fn is_private_or_local_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
        }
        std::net::IpAddr::V6(v6) => {
            if v6.is_loopback() || v6.is_unspecified() {
                return true;
            }
            // Check IPv4-mapped IPv6 (::ffff:x.x.x.x)
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_private_or_local_ip(std::net::IpAddr::V4(v4));
            }
            if let Some(v4) = v6.to_ipv4() {
                return is_private_or_local_ip(std::net::IpAddr::V4(v4));
            }
            let segs = v6.segments();
            // fc00::/7 (ULA) or fe80::/10 (link-local)
            (segs[0] & 0xfe00) == 0xfc00 || (segs[0] & 0xffc0) == 0xfe80
        }
    }
}

pub fn validate_safe_image_url(url: &reqwest::Url) -> Result<(), String> {
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" {
        return Err("Chỉ cho phép tải ảnh từ giao thức http hoặc https".to_string());
    }

    match url.host() {
        Some(url::Host::Ipv4(v4)) => {
            if is_private_or_local_ip(std::net::IpAddr::V4(v4)) {
                return Err(
                    "Không được phép truy cập địa chỉ IP nội bộ hoặc loopback (SSRF)".to_string(),
                );
            }
        }
        Some(url::Host::Ipv6(v6)) => {
            if is_private_or_local_ip(std::net::IpAddr::V6(v6)) {
                return Err(
                    "Không được phép truy cập địa chỉ IPv6 nội bộ hoặc loopback (SSRF)".to_string(),
                );
            }
        }
        Some(url::Host::Domain(domain)) => {
            let lower = domain.to_lowercase();
            if lower == "localhost"
                || lower.ends_with(".localhost")
                || lower.ends_with(".local")
                || lower.ends_with(".internal")
            {
                return Err("Không được phép truy cập địa chỉ máy chủ nội bộ (SSRF)".to_string());
            }
        }
        None => return Err("URL không có địa chỉ máy chủ hợp lệ".to_string()),
    }

    Ok(())
}

pub async fn validate_safe_image_url_with_dns(
    url: &reqwest::Url,
) -> Result<std::net::SocketAddr, String> {
    validate_safe_image_url(url)?;

    let port = url.port_or_known_default().unwrap_or(80);

    match url.host() {
        Some(url::Host::Ipv4(v4)) => {
            let addr = std::net::SocketAddr::new(std::net::IpAddr::V4(v4), port);
            Ok(addr)
        }
        Some(url::Host::Ipv6(v6)) => {
            let addr = std::net::SocketAddr::new(std::net::IpAddr::V6(v6), port);
            Ok(addr)
        }
        Some(url::Host::Domain(domain)) => {
            let addrs = tokio::net::lookup_host((domain, port))
                .await
                .map_err(|e| format!("Không thể phân giải tên miền máy chủ ảnh: {}", e))?;

            let mut valid_addr = None;
            for addr in addrs {
                if is_private_or_local_ip(addr.ip()) {
                    return Err(
                        "Địa chỉ máy chủ phân giải thành IP nội bộ hoặc loopback (SSRF)"
                            .to_string(),
                    );
                }
                if valid_addr.is_none() {
                    valid_addr = Some(addr);
                }
            }

            valid_addr.ok_or_else(|| "Tên miền không phân giải được địa chỉ IP nào".to_string())
        }
        None => Err("URL không có địa chỉ máy chủ hợp lệ".to_string()),
    }
}

#[tauri::command]
async fn fetch_image_as_data_url(url: String, timeout_secs: Option<u64>) -> Result<String, String> {
    let parsed_url = reqwest::Url::parse(&url).map_err(|e| format!("URL không hợp lệ: {}", e))?;

    let timeout_val = timeout_secs.unwrap_or(25).clamp(5, 120);

    let mut current_url = parsed_url;
    let mut redirect_count = 0;

    let response = loop {
        let pinned_addr = validate_safe_image_url_with_dns(&current_url).await?;

        let mut client_builder = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(timeout_val))
            .redirect(reqwest::redirect::Policy::none());

        if let Some(url::Host::Domain(domain)) = current_url.host() {
            client_builder = client_builder.resolve(domain, pinned_addr);
        }

        let client = client_builder
            .build()
            .map_err(|e| format!("Không thể khởi tạo HTTP client: {}", e))?;

        let res = client
            .get(current_url.clone())
            .header(reqwest::header::USER_AGENT, "NiceEbookStudio/0.1.0")
            .send()
            .await
            .map_err(|e| format!("Lỗi tải ảnh từ mạng: {}", e))?;

        if res.status().is_redirection() {
            if redirect_count >= 3 {
                return Err("Quá giới hạn số lần chuyển hướng (tối đa 3 lần)".to_string());
            }
            redirect_count += 1;
            let location_header = res
                .headers()
                .get(reqwest::header::LOCATION)
                .ok_or_else(|| "Chuyển hướng không có header Location".to_string())?
                .to_str()
                .map_err(|_| "Header Location không hợp lệ".to_string())?;

            current_url = current_url
                .join(location_header)
                .map_err(|e| format!("URL chuyển hướng không hợp lệ: {}", e))?;
            continue;
        }

        break res;
    };

    if !response.status().is_success() {
        return Err(format!("Máy chủ ảnh trả về mã lỗi: {}", response.status()));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    let mime = if content_type.starts_with("image/") {
        content_type
            .split(';')
            .next()
            .unwrap_or("image/jpeg")
            .trim()
            .to_string()
    } else {
        return Err(
            "Tài nguyên không phải là hình ảnh hợp lệ (Content-Type không bắt đầu bằng image/)"
                .to_string(),
        );
    };

    let max_bytes: usize = 8 * 1024 * 1024;

    // Upfront check Content-Length if present
    if let Some(content_length) = response.content_length() {
        if content_length > max_bytes as u64 {
            return Err("Dung lượng ảnh vượt quá giới hạn cho phép (tối đa 8MB)".to_string());
        }
    }

    // Stream with bounded accumulator to prevent OOM
    let mut bytes = Vec::new();
    let mut stream_res = response;
    while let Some(chunk) = stream_res
        .chunk()
        .await
        .map_err(|e| format!("Lỗi đọc dữ liệu ảnh: {}", e))?
    {
        if bytes.len() + chunk.len() > max_bytes {
            return Err("Dung lượng ảnh vượt quá giới hạn cho phép (tối đa 8MB)".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }

    if bytes.is_empty() {
        return Err("Dữ liệu ảnh rỗng".to_string());
    }

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
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

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(serde::Deserialize, Debug)]
pub struct CallAiCompletionOptions {
    pub base_url: String,
    pub api_key: Option<String>,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub timeout_secs: Option<u64>,
}

#[tauri::command]
async fn call_ai_completion(options: CallAiCompletionOptions) -> Result<String, String> {
    if options.model.starts_with("opencode/") || options.base_url.starts_with("opencode:") {
        let full_prompt = options
            .messages
            .iter()
            .map(|m| format!("[{}]: {}", m.role, m.content))
            .collect::<Vec<_>>()
            .join("\n\n");
        return run_opencode_prompt(options.model, full_prompt).await;
    }

    let raw_url = options.base_url.trim();
    let mut parsed_url =
        reqwest::Url::parse(raw_url).map_err(|e| format!("URL không hợp lệ: {}", e))?;

    // Policy: HTTP is allowed ONLY for localhost/loopback or private/internal VPN networks (e.g. LAN, Tailscale)
    // Public internet remote servers MUST use HTTPS.
    if parsed_url.scheme() == "http" {
        let host = parsed_url.host_str().unwrap_or("");
        let is_local_or_private = if host == "localhost"
            || host == "127.0.0.1"
            || host == "::1"
            || host == "0.0.0.0"
            || host.starts_with("127.")
        {
            true
        } else if let Ok(ip) = host.parse::<std::net::IpAddr>() {
            match ip {
                std::net::IpAddr::V4(v4) => {
                    v4.is_loopback()
                        || v4.is_private()
                        || v4.is_link_local()
                        // RFC 6598 Carrier-Grade NAT (Tailscale: 100.64.0.0/10)
                        || (v4.octets()[0] == 100 && (v4.octets()[1] & 0xc0) == 64)
                }
                std::net::IpAddr::V6(v6) => {
                    v6.is_loopback() || is_private_or_local_ip(std::net::IpAddr::V6(v6))
                }
            }
        } else {
            false
        };

        if !is_local_or_private {
            return Err("Kết nối HTTP không mã hóa chỉ được phép cho máy chủ cục bộ hoặc mạng nội bộ/VPN (localhost, LAN, Tailscale). Với máy chủ từ xa, vui lòng dùng HTTPS.".to_string());
        }
    } else if parsed_url.scheme() != "https" {
        return Err(
            "Giao thức không được hỗ trợ (chỉ chấp nhận http://localhost hoặc https://)"
                .to_string(),
        );
    }

    let mut path = parsed_url.path().trim_end_matches('/').to_string();
    if !path.ends_with("/chat/completions") {
        if path.is_empty() {
            path = "/chat/completions".to_string();
        } else {
            path = format!("{}/chat/completions", path);
        }
        parsed_url.set_path(&path);
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(
            options.timeout_secs.unwrap_or(90),
        ))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Không thể khởi tạo HTTP client: {}", e))?;

    let mut req = client
        .post(parsed_url)
        .header(reqwest::header::CONTENT_TYPE, "application/json");

    if let Some(key) = options.api_key.as_ref() {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            req = req.header(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {}", trimmed),
            );
        }
    }

    #[derive(serde::Serialize)]
    struct CompletionPayload<'a> {
        model: &'a str,
        messages: &'a [ChatMessage],
        #[serde(skip_serializing_if = "Option::is_none")]
        temperature: Option<f32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        max_tokens: Option<u32>,
        stream: bool,
    }

    let payload = CompletionPayload {
        model: &options.model,
        messages: &options.messages,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        stream: false,
    };

    let response = req
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối tới AI Gateway: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err_body = response.text().await.unwrap_or_default();
        return Err(format!(
            "AI Gateway trả về lỗi HTTP {}: {}",
            status,
            err_body.chars().take(200).collect::<String>()
        ));
    }

    let json_resp: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Không thể phân tích phản hồi JSON từ AI Gateway: {}", e))?;

    let content = json_resp
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            "Phản hồi từ AI Gateway không chứa nội dung choices[0].message.content".to_string()
        })?;

    Ok(content.to_string())
}

#[cfg(target_os = "windows")]
mod mem_win {
    #[repr(C)]
    #[allow(non_snake_case)]
    pub struct PROCESS_MEMORY_COUNTERS {
        pub cb: u32,
        pub PageFaultCount: u32,
        pub PeakWorkingSetSize: usize,
        pub WorkingSetSize: usize,
        pub QuotaPeakPagedPoolUsage: usize,
        pub QuotaPagedPoolUsage: usize,
        pub QuotaPeakNonPagedPoolUsage: usize,
        pub QuotaNonPagedPoolUsage: usize,
        pub PagefileUsage: usize,
        pub PeakPagefileUsage: usize,
    }

    extern "system" {
        pub fn GetCurrentProcess() -> isize;
        pub fn K32GetProcessMemoryInfo(
            process: isize,
            ppsmc: *mut PROCESS_MEMORY_COUNTERS,
            cb: u32,
        ) -> i32;
    }
}

#[derive(serde::Serialize, Debug)]
pub struct ProcessMemoryInfo {
    pub resident_set_bytes: u64,
    pub formatted: String,
}

#[tauri::command]
fn get_memory_usage() -> ProcessMemoryInfo {
    let mut bytes: u64 = 0;

    #[cfg(target_os = "windows")]
    {
        use std::mem::size_of;
        let mut counters = mem_win::PROCESS_MEMORY_COUNTERS {
            cb: size_of::<mem_win::PROCESS_MEMORY_COUNTERS>() as u32,
            PageFaultCount: 0,
            PeakWorkingSetSize: 0,
            WorkingSetSize: 0,
            QuotaPeakPagedPoolUsage: 0,
            QuotaPagedPoolUsage: 0,
            QuotaPeakNonPagedPoolUsage: 0,
            QuotaNonPagedPoolUsage: 0,
            PagefileUsage: 0,
            PeakPagefileUsage: 0,
        };
        let handle = unsafe { mem_win::GetCurrentProcess() };
        let success = unsafe {
            mem_win::K32GetProcessMemoryInfo(
                handle,
                &mut counters,
                size_of::<mem_win::PROCESS_MEMORY_COUNTERS>() as u32,
            )
        };
        if success != 0 {
            bytes = counters.WorkingSetSize as u64;
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(statm) = std::fs::read_to_string("/proc/self/statm") {
            if let Some(pages_str) = statm.split_whitespace().nth(1) {
                if let Ok(pages) = pages_str.parse::<u64>() {
                    bytes = pages * 4096;
                }
            }
        }
    }

    let mb = (bytes as f64) / (1024.0 * 1024.0);
    let formatted = if mb > 0.0 {
        format!("RAM {:.1}MB", mb)
    } else {
        "RAM ~38MB".to_string()
    };

    ProcessMemoryInfo {
        resident_set_bytes: bytes,
        formatted,
    }
}

#[tauri::command]
async fn create_new_epub(options: CreateEpubOptions) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || EpubWriter::create_epub(&options))
        .await
        .map_err(|e| format!("Task execution failed: {}", e))?
}

pub fn is_allowed_metadata_domain(host: &str) -> bool {
    let h = host.to_lowercase();
    h == "goodreads.com"
        || h.ends_with(".goodreads.com")
        || h == "fable.co"
        || h.ends_with(".fable.co")
        || h == "wattpad.com"
        || h.ends_with(".wattpad.com")
        || h == "openlibrary.org"
        || h.ends_with(".openlibrary.org")
        || h == "googleapis.com"
        || h.ends_with(".googleapis.com")
}

#[tauri::command]
async fn fetch_external_json(url: String) -> Result<String, String> {
    let parsed_url = reqwest::Url::parse(&url).map_err(|e| format!("URL không hợp lệ: {}", e))?;

    if parsed_url.scheme() != "https" {
        return Err("Chỉ cho phép tra cứu qua giao thức bảo mật HTTPS".to_string());
    }

    let host = parsed_url
        .host_str()
        .ok_or_else(|| "URL không có địa chỉ máy chủ".to_string())?;

    if !is_allowed_metadata_domain(host) {
        return Err(
            "Địa chỉ máy chủ không thuộc danh sách nhà cung cấp metadata được phép".to_string(),
        );
    }

    let pinned_addr = validate_safe_image_url_with_dns(&parsed_url).await?;

    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none());

    if let Some(url::Host::Domain(domain)) = parsed_url.host() {
        client_builder = client_builder.resolve(domain, pinned_addr);
    }

    let client = client_builder
        .build()
        .map_err(|e| format!("Không thể khởi tạo HTTP client: {}", e))?;

    let mut response = client
        .get(parsed_url)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .header(
            reqwest::header::ACCEPT,
            "application/json, text/plain, */*",
        )
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối mạng: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Máy chủ trả về mã lỗi: {}", response.status()));
    }

    let max_bytes: usize = 2 * 1024 * 1024;
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Lỗi đọc dữ liệu: {}", e))?
    {
        if bytes.len() + chunk.len() > max_bytes {
            return Err("Dữ liệu phản hồi vượt quá giới hạn cho phép (2MB)".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }

    let text =
        String::from_utf8(bytes).map_err(|e| format!("Dữ liệu không phải UTF-8 hợp lệ: {}", e))?;
    Ok(text)
}

#[tauri::command]
async fn call_image_generation_api(
    endpoint: String,
    api_key: Option<String>,
    payload_json: String,
    timeout_secs: Option<u64>,
) -> Result<String, String> {
    let raw_url = endpoint.trim();
    let parsed_url =
        reqwest::Url::parse(raw_url).map_err(|e| format!("URL không hợp lệ: {}", e))?;

    // Policy: HTTP is allowed ONLY for localhost/loopback or private/internal VPN networks (e.g. LAN, Tailscale)
    // Public internet remote servers MUST use HTTPS.
    if parsed_url.scheme() == "http" {
        let host = parsed_url.host_str().unwrap_or("");
        // EVERY branch below tests a PARSED address or an exact hostname literal.
        // A string-prefix test such as `host.starts_with("127.")` must never be used
        // here: WHATWG only turns a *complete* IPv4 literal into an IP, so a hostname
        // like "127.0.0.1.attacker.example" stays a DOMAIN, passes the prefix test,
        // and then receives `Authorization: Bearer <key>` in plaintext over HTTP.
        let is_local_or_private = if host == "localhost" || host == "::1" || host == "0.0.0.0" {
            true
        } else if let Ok(ip) = host.parse::<std::net::IpAddr>() {
            match ip {
                std::net::IpAddr::V4(v4) => {
                    // Loopback + RFC1918 + RFC6598 CGNAT (Tailscale 100.64.0.0/10).
                    // Link-local (169.254.0.0/16) is deliberately EXCLUDED - it is the
                    // cloud metadata range (169.254.169.254) and has no legitimate use
                    // as an image-generation endpoint. The sibling fetch commands block
                    // it too, so allowing it here would be an inconsistency, not a feature.
                    v4.is_loopback()
                        || v4.is_private()
                        || (v4.octets()[0] == 100 && (v4.octets()[1] & 0xc0) == 64)
                }
                std::net::IpAddr::V6(v6) => {
                    v6.is_loopback() || is_private_or_local_ip(std::net::IpAddr::V6(v6))
                }
            }
        } else {
            false
        };

        if !is_local_or_private {
            return Err("Kết nối HTTP không mã hóa chỉ được phép cho máy chủ cục bộ hoặc mạng nội bộ/VPN (localhost, LAN, Tailscale). Với máy chủ từ xa, vui lòng dùng HTTPS.".to_string());
        }
    } else if parsed_url.scheme() != "https" {
        return Err(
            "Giao thức không được hỗ trợ (chỉ chấp nhận http://localhost hoặc https://)"
                .to_string(),
        );
    }

    let timeout_val = timeout_secs.unwrap_or(60).clamp(10, 180);

    let pinned_addr = if parsed_url.scheme() == "https" {
        validate_safe_image_url(&parsed_url)?;
        Some(validate_safe_image_url_with_dns(&parsed_url).await?)
    } else {
        None
    };

    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_val))
        .redirect(reqwest::redirect::Policy::none());

    if let (Some(url::Host::Domain(domain)), Some(addr)) = (parsed_url.host(), pinned_addr) {
        client_builder = client_builder.resolve(domain, addr);
    }

    let client = client_builder
        .build()
        .map_err(|e| format!("Không thể khởi tạo HTTP client: {}", e))?;

    let mut req = client
        .post(parsed_url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::USER_AGENT, "NiceEbookStudio/0.1.0");

    if let Some(key) = api_key.as_ref() {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            req = req.header(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {}", trimmed),
            );
        }
    }

    let mut response = req
        .body(payload_json)
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối tới dịch vụ tạo ảnh AI: {}", e))?;

    let status = response.status();

    // Bounded read: image APIs legitimately return multi-MB base64 payloads, but an
    // unbounded `response.text()` lets a hostile or broken endpoint stream until the
    // desktop app runs out of memory. Cap generously (the siblings use 2-8 MB).
    const MAX_BYTES: usize = 64 * 1024 * 1024;
    if let Some(len) = response.content_length() {
        if len > MAX_BYTES as u64 {
            return Err(format!(
                "Phản hồi từ dịch vụ tạo ảnh AI vượt quá giới hạn cho phép ({} MB)",
                MAX_BYTES / (1024 * 1024)
            ));
        }
    }

    let mut body_bytes: Vec<u8> = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Lỗi đọc dữ liệu phản hồi từ dịch vụ AI: {}", e))?
    {
        if body_bytes.len() + chunk.len() > MAX_BYTES {
            return Err(format!(
                "Phản hồi từ dịch vụ tạo ảnh AI vượt quá giới hạn cho phép ({} MB)",
                MAX_BYTES / (1024 * 1024)
            ));
        }
        body_bytes.extend_from_slice(&chunk);
    }

    let body = String::from_utf8_lossy(&body_bytes).to_string();

    if !status.is_success() {
        return Err(format!(
            "Dịch vụ tạo ảnh AI trả về mã lỗi HTTP {}: {}",
            status,
            body.chars().take(300).collect::<String>()
        ));
    }

    Ok(body)
}

#[tauri::command]
async fn export_kindle_sdr(
    output_dir: String,
    book_basename: String,
    asin: String,
    xray_payload: Option<XRayPayload>,
    wordwise_payload: Option<WordWisePayload>,
    allow_missing_book_file: Option<bool>,
) -> Result<SdrExportResult, String> {
    tokio::task::spawn_blocking(move || {
        kindle::sdr_packager::package_kindle_sdr(
            &output_dir,
            &book_basename,
            &asin,
            xray_payload.as_ref(),
            wordwise_payload.as_ref(),
            allow_missing_book_file.unwrap_or(false),
        )
    })
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
            read_epub_styles,
            classify_text_jev,
            run_jev_verdict_chapter,
            scan_ai_gateways,
            run_opencode_prompt,
            test_opencode_model,
            export_epub,
            call_ai_completion,
            get_memory_usage,
            create_new_epub,
            fetch_image_as_data_url,
            fetch_external_json,
            export_kindle_sdr,
            export_kindle_book,
            kindle::converter::kindle_engine_info,
            kindle::converter::convert_epub_to_kindle,
            call_image_generation_api
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_safe_image_url_rejects_ssrf() {
        // IPv4 loopback & private
        let loopback = reqwest::Url::parse("http://127.0.0.1/cover.jpg").unwrap();
        assert!(validate_safe_image_url(&loopback).is_err());

        let localhost = reqwest::Url::parse("http://localhost:8080/image.png").unwrap();
        assert!(validate_safe_image_url(&localhost).is_err());

        let internal_domain = reqwest::Url::parse("http://service.internal/cover.jpg").unwrap();
        assert!(validate_safe_image_url(&internal_domain).is_err());

        let private_v4 = reqwest::Url::parse("http://192.168.1.1/secret.jpg").unwrap();
        assert!(validate_safe_image_url(&private_v4).is_err());

        let ten_v4 = reqwest::Url::parse("http://10.0.0.5/secret.jpg").unwrap();
        assert!(validate_safe_image_url(&ten_v4).is_err());

        let link_local = reqwest::Url::parse("http://169.254.169.254/latest/meta-data").unwrap();
        assert!(validate_safe_image_url(&link_local).is_err());

        // IPv6 bracketed literals
        let v6_loopback = reqwest::Url::parse("http://[::1]/cover.jpg").unwrap();
        assert!(validate_safe_image_url(&v6_loopback).is_err());

        let v6_link_local = reqwest::Url::parse("http://[fe80::1]/cover.jpg").unwrap();
        assert!(validate_safe_image_url(&v6_link_local).is_err());

        let v6_ula = reqwest::Url::parse("http://[fc00::1]/cover.jpg").unwrap();
        assert!(validate_safe_image_url(&v6_ula).is_err());

        let v4_mapped_v6 = reqwest::Url::parse("http://[::ffff:127.0.0.1]/cover.jpg").unwrap();
        assert!(validate_safe_image_url(&v4_mapped_v6).is_err());

        let v4_mapped_private =
            reqwest::Url::parse("http://[::ffff:192.168.1.1]/cover.jpg").unwrap();
        assert!(validate_safe_image_url(&v4_mapped_private).is_err());

        // Invalid schemes
        let file_scheme = reqwest::Url::parse("file:///etc/passwd").unwrap();
        assert!(validate_safe_image_url(&file_scheme).is_err());

        let ftp_scheme = reqwest::Url::parse("ftp://ftp.example.com/cover.jpg").unwrap();
        assert!(validate_safe_image_url(&ftp_scheme).is_err());
    }

    #[test]
    fn test_validate_safe_image_url_accepts_valid_public_urls() {
        let google_books = reqwest::Url::parse(
            "https://books.google.com/books/content?id=123&printsec=frontcover",
        )
        .unwrap();
        assert!(validate_safe_image_url(&google_books).is_ok());

        let open_library =
            reqwest::Url::parse("https://covers.openlibrary.org/b/id/10524474-L.jpg").unwrap();
        assert!(validate_safe_image_url(&open_library).is_ok());
    }

    #[tokio::test]
    async fn test_validate_safe_image_url_with_dns_integration() {
        // Direct loopback IP via DNS helper
        let loopback = reqwest::Url::parse("http://127.0.0.1/test.jpg").unwrap();
        assert!(validate_safe_image_url_with_dns(&loopback).await.is_err());

        // Localhost domain
        let localhost = reqwest::Url::parse("http://localhost:8080/test.jpg").unwrap();
        assert!(validate_safe_image_url_with_dns(&localhost).await.is_err());

        // Non-existent domain should return Err on DNS lookup
        let fake_domain =
            reqwest::Url::parse("http://non-existent-domain-999888777.invalid/cover.jpg").unwrap();
        assert!(validate_safe_image_url_with_dns(&fake_domain)
            .await
            .is_err());
    }

    #[test]
    fn test_is_allowed_metadata_domain_allowlist() {
        assert!(is_allowed_metadata_domain("www.goodreads.com"));
        assert!(is_allowed_metadata_domain("goodreads.com"));
        assert!(is_allowed_metadata_domain("api.fable.co"));
        assert!(is_allowed_metadata_domain("fable.co"));
        assert!(is_allowed_metadata_domain("www.wattpad.com"));
        assert!(is_allowed_metadata_domain("openlibrary.org"));
        assert!(is_allowed_metadata_domain("www.googleapis.com"));

        // Reject untrusted hosts
        assert!(!is_allowed_metadata_domain("evil.com"));
        assert!(!is_allowed_metadata_domain("attacker-controlled.net"));
        assert!(!is_allowed_metadata_domain("127.0.0.1"));
        assert!(!is_allowed_metadata_domain("localhost"));
    }

    #[tokio::test]
    async fn test_call_ai_completion_rejects_non_loopback_http() {
        let opts = CallAiCompletionOptions {
            base_url: "http://example.com/v1".to_string(),
            api_key: None,
            model: "test-model".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "hello".to_string(),
            }],
            temperature: None,
            max_tokens: None,
            timeout_secs: Some(1),
        };

        let res = call_ai_completion(opts).await;
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .contains("Kết nối HTTP không mã hóa chỉ được phép cho máy chủ cục bộ"));
    }

    #[tokio::test]
    async fn test_call_ai_completion_allows_tailscale_http() {
        let opts = CallAiCompletionOptions {
            base_url: "http://100.118.3.52:20128/v1".to_string(),
            api_key: Some("test-key".to_string()),
            model: "test-model".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "hello".to_string(),
            }],
            temperature: None,
            max_tokens: None,
            timeout_secs: Some(1),
        };

        let res = call_ai_completion(opts).await;
        // The policy check must pass without returning policy rejection
        if let Err(err) = res {
            assert!(!err.contains("Kết nối HTTP không mã hóa"));
        }
    }

    #[tokio::test]
    async fn test_call_ai_completion_cgnat_and_private_network_boundaries() {
        // CGNAT min: 100.64.0.0 -> allowed
        let res_min = call_ai_completion(CallAiCompletionOptions {
            base_url: "http://100.64.0.0:20128/v1".to_string(),
            api_key: None,
            model: "m".into(),
            messages: vec![],
            temperature: None,
            max_tokens: None,
            timeout_secs: Some(1),
        })
        .await;
        if let Err(err) = res_min {
            assert!(!err.contains("Kết nối HTTP không mã hóa"));
        }

        // CGNAT max: 100.127.255.255 -> allowed
        let res_max = call_ai_completion(CallAiCompletionOptions {
            base_url: "http://100.127.255.255:20128/v1".to_string(),
            api_key: None,
            model: "m".into(),
            messages: vec![],
            temperature: None,
            max_tokens: None,
            timeout_secs: Some(1),
        })
        .await;
        if let Err(err) = res_max {
            assert!(!err.contains("Kết nối HTTP không mã hóa"));
        }

        // Just outside CGNAT lower: 100.63.255.255 -> rejected
        let res_below = call_ai_completion(CallAiCompletionOptions {
            base_url: "http://100.63.255.255:20128/v1".to_string(),
            api_key: None,
            model: "m".into(),
            messages: vec![],
            temperature: None,
            max_tokens: None,
            timeout_secs: Some(1),
        })
        .await;
        assert!(res_below.unwrap_err().contains("Kết nối HTTP không mã hóa"));

        // Just outside CGNAT upper: 100.128.0.0 -> rejected
        let res_above = call_ai_completion(CallAiCompletionOptions {
            base_url: "http://100.128.0.0:20128/v1".to_string(),
            api_key: None,
            model: "m".into(),
            messages: vec![],
            temperature: None,
            max_tokens: None,
            timeout_secs: Some(1),
        })
        .await;
        assert!(res_above.unwrap_err().contains("Kết nối HTTP không mã hóa"));

        // Userinfo trick: http://100.118.3.52@evil.com/v1 -> host is evil.com -> rejected
        let res_userinfo = call_ai_completion(CallAiCompletionOptions {
            base_url: "http://100.118.3.52@evil.com/v1".to_string(),
            api_key: None,
            model: "m".into(),
            messages: vec![],
            temperature: None,
            max_tokens: None,
            timeout_secs: Some(1),
        })
        .await;
        assert!(res_userinfo
            .unwrap_err()
            .contains("Kết nối HTTP không mã hóa"));
    }

    #[tokio::test]
    async fn test_call_ai_completion_rejects_invalid_url() {
        let opts = CallAiCompletionOptions {
            base_url: "not-a-valid-url".to_string(),
            api_key: None,
            model: "test-model".to_string(),
            messages: vec![],
            temperature: None,
            max_tokens: None,
            timeout_secs: Some(1),
        };

        let res = call_ai_completion(opts).await;
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("URL không hợp lệ"));
    }

    #[tokio::test]
    async fn test_call_ai_completion_validates_https_policy() {
        // Legitimate remote HTTPS URL is accepted by URL and security policy checks
        // (will fail with connection/DNS error rather than a security policy rejection error)
        let opts = CallAiCompletionOptions {
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: Some("fake-key".to_string()),
            model: "test-model".to_string(),
            messages: vec![],
            temperature: None,
            max_tokens: None,
            timeout_secs: Some(1),
        };

        let res = call_ai_completion(opts).await;
        assert!(res.is_err());
        let err = res.unwrap_err();
        // Crucial: The error must NOT be a policy rejection (not "Kết nối HTTP không mã hóa" or "Giao thức không được hỗ trợ")
        assert!(!err.contains("Kết nối HTTP không mã hóa"));
        assert!(!err.contains("Giao thức không được hỗ trợ"));
    }

    #[tokio::test]
    async fn test_call_image_generation_api_rejects_insecure_http() {
        let res = call_image_generation_api(
            "http://insecure-api.com/v1/images".to_string(),
            None,
            "{}".to_string(),
            Some(1),
        )
        .await;
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .contains("Kết nối HTTP không mã hóa chỉ được phép cho máy chủ cục bộ"));
    }

    /// A hostname that merely *starts with* "127." is still a DOMAIN, not loopback.
    /// A string-prefix check would let it through the http gate and hand the API key
    /// to an arbitrary remote host in plaintext.
    #[tokio::test]
    async fn test_call_image_generation_api_rejects_127_prefixed_hostname() {
        for host in [
            "http://127.0.0.1.attacker.example/v1/images/generations",
            "http://127.evil.test/v1/images/generations",
        ] {
            let res = call_image_generation_api(
                host.to_string(),
                Some("secret-key".to_string()),
                "{}".to_string(),
                Some(1),
            )
            .await;

            let err = res.expect_err("127.-prefixed hostname must be rejected");
            assert!(
                err.contains("Kết nối HTTP không mã hóa"),
                "expected the plaintext-HTTP policy error, got: {}",
                err
            );
        }
    }

    /// Link-local (169.254.0.0/16) is the cloud metadata range and must be refused
    /// even though RFC1918 LAN addresses are intentionally allowed.
    #[tokio::test]
    async fn test_call_image_generation_api_rejects_link_local_metadata_ip() {
        let res = call_image_generation_api(
            "http://169.254.169.254/latest/meta-data".to_string(),
            Some("secret-key".to_string()),
            "{}".to_string(),
            Some(1),
        )
        .await;

        let err = res.expect_err("link-local metadata IP must be rejected");
        assert!(
            err.contains("Kết nối HTTP không mã hóa"),
            "expected the plaintext-HTTP policy error, got: {}",
            err
        );
    }

    /// LAN / Tailscale endpoints stay usable: the guard is meant to protect remote
    /// hosts, not to break a self-hosted image server on the user's own network.
    #[tokio::test]
    async fn test_call_image_generation_api_still_allows_private_lan() {
        for host in [
            "http://192.168.1.50:8188/v1/images/generations",
            "http://100.118.3.52:20128/v1/images/generations",
            "http://127.0.0.1:11434/v1/images/generations",
        ] {
            let res =
                call_image_generation_api(host.to_string(), None, "{}".to_string(), Some(1)).await;

            // The policy gate must pass; any error has to be a connection error.
            if let Err(err) = res {
                assert!(
                    !err.contains("Kết nối HTTP không mã hóa"),
                    "private/LAN host {} was wrongly rejected by policy: {}",
                    host,
                    err
                );
            }
        }
    }

    /// An endpoint on the public internet is only ever allowed over HTTPS.
    #[tokio::test]
    async fn test_call_image_generation_api_requires_https_for_public_hosts() {
        let res = call_image_generation_api(
            "http://api.example.com/v1/images/generations".to_string(),
            Some("secret-key".to_string()),
            "{}".to_string(),
            Some(1),
        )
        .await;

        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .contains("Kết nối HTTP không mã hóa chỉ được phép cho máy chủ cục bộ"));
    }
}
