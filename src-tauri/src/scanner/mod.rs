use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedGateway {
    pub name: String,
    pub base_url: String,
    pub port: u16,
    pub is_online: bool,
    pub models: Vec<String>,
    pub gateway_type: String,
    pub latency_ms: u64,
}

#[derive(Deserialize)]
struct OpenAiModelsResponse {
    data: Option<Vec<OpenAiModelItem>>,
}

#[derive(Deserialize)]
struct OpenAiModelItem {
    id: String,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Option<Vec<OllamaModelItem>>,
}

#[derive(Deserialize)]
struct OllamaModelItem {
    name: String,
}

pub struct GatewayScanner;

impl GatewayScanner {
    pub async fn scan_all() -> Vec<DetectedGateway> {
        let targets = vec![
            (
                20128,
                "9Router (Chính)",
                "9router",
                "http://127.0.0.1:20128/v1",
            ),
            (
                8000,
                "9Router / AI Proxy",
                "9router",
                "http://127.0.0.1:8000/v1",
            ),
            (
                3000,
                "9Router Web Gateway",
                "9router",
                "http://127.0.0.1:3000/v1",
            ),
            (5000, "Cockpit Tools", "cockpit", "http://127.0.0.1:5000/v1"),
            (
                8080,
                "Cockpit / One-API",
                "cockpit",
                "http://127.0.0.1:8080/v1",
            ),
            (11434, "Ollama Local", "ollama", "http://127.0.0.1:11434"),
            (
                1234,
                "LM Studio Local",
                "lmstudio",
                "http://127.0.0.1:1234/v1",
            ),
        ];

        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(350))
            .build()
            .unwrap_or_default();

        let mut tasks = Vec::new();
        for (port, name, gw_type, base_url) in targets {
            let cl = client.clone();
            tasks.push(tokio::spawn(async move {
                Self::probe_target(&cl, port, name, gw_type, base_url).await
            }));
        }

        let mut results = Vec::new();
        for task in tasks {
            if let Ok(Some(gw)) = task.await {
                results.push(gw);
            }
        }

        // Also probe OpenCode CLI free models if opencode is installed
        if let Some(opencode_gw) = Self::probe_opencode().await {
            results.push(opencode_gw);
        }

        // Sort so online gateways with models appear first
        results.sort_by(|a, b| {
            b.is_online
                .cmp(&a.is_online)
                .then(a.latency_ms.cmp(&b.latency_ms))
        });
        results
    }

    async fn probe_opencode() -> Option<DetectedGateway> {
        let start = Instant::now();

        tokio::task::spawn_blocking(move || {
            let mut cmd = std::process::Command::new("opencode");
            cmd.args(["models", "opencode"]);

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }

            if let Ok(output) = cmd.output() {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let mut models: Vec<String> = stdout
                        .lines()
                        .map(|l| l.trim().to_string())
                        .filter(|l| l.starts_with("opencode/"))
                        .collect();

                    if models.is_empty() {
                        models = vec![
                            "opencode/mimo-v2.6-flash-free".to_string(),
                            "opencode/ling-3.0-flash-fin-free".to_string(),
                            "opencode/nemotron-3.5-lightning-free".to_string(),
                            "opencode/nemotron-3-ultra-free".to_string(),
                            "opencode/muse-spark-1.3-contributor-free".to_string(),
                            "opencode/big-pickle".to_string(),
                        ];
                    }

                    let latency = start.elapsed().as_millis() as u64;
                    return Some(DetectedGateway {
                        name: "OpenCode Engine (Free)".to_string(),
                        base_url: "opencode://cli".to_string(),
                        port: 0,
                        is_online: true,
                        models,
                        gateway_type: "opencode".to_string(),
                        latency_ms: latency,
                    });
                }
            }
            None
        })
        .await
        .ok()?
    }

    async fn probe_target(
        client: &reqwest::Client,
        port: u16,
        name: &str,
        gw_type: &str,
        base_url: &str,
    ) -> Option<DetectedGateway> {
        let start = Instant::now();

        if gw_type == "ollama" {
            let check_url = format!("{}/api/tags", base_url);
            if let Ok(resp) = client.get(&check_url).send().await {
                if resp.status().is_success() {
                    let latency = start.elapsed().as_millis() as u64;
                    let mut models = Vec::new();
                    if let Ok(parsed) = resp.json::<OllamaTagsResponse>().await {
                        if let Some(list) = parsed.models {
                            models = list.into_iter().map(|m| m.name).collect();
                        }
                    }
                    return Some(DetectedGateway {
                        name: name.to_string(),
                        base_url: format!("{}/v1", base_url),
                        port,
                        is_online: true,
                        models,
                        gateway_type: gw_type.to_string(),
                        latency_ms: latency,
                    });
                }
            }
        } else {
            let check_url = format!("{}/models", base_url);
            if let Ok(resp) = client.get(&check_url).send().await {
                if resp.status().is_success() {
                    let latency = start.elapsed().as_millis() as u64;
                    let mut models = Vec::new();
                    if let Ok(parsed) = resp.json::<OpenAiModelsResponse>().await {
                        if let Some(list) = parsed.data {
                            models = list.into_iter().map(|m| m.id).collect();
                        }
                    }
                    return Some(DetectedGateway {
                        name: name.to_string(),
                        base_url: base_url.to_string(),
                        port,
                        is_online: true,
                        models,
                        gateway_type: gw_type.to_string(),
                        latency_ms: latency,
                    });
                }
            }
        }

        None
    }
}
