import { useState, useMemo } from "react";
import { 
  RefreshCw, 
  SlidersHorizontal, 
  Boxes, 
  Check, 
  Play, 
  Activity, 
  Search 
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { GatewaySettingsModal } from "../settings/GatewaySettingsModal";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

interface ModelCategory {
  id: string;
  name: string;
  description: string;
  accent: string;
  models: string[];
}

const DEFAULT_PROVIDER_CATALOG: Record<string, { name: string; description: string; accent: string; defaults: string[] }> = {
  opencode: {
    name: "OpenCode Free",
    description: "Các mô hình AI miễn phí 100% không cần API key từ OpenCode CLI",
    accent: "#ec4899",
    defaults: [
      "opencode/mimo-v2.6-flash-free",
      "opencode/ling-3.0-flash-fin-free",
      "opencode/nemotron-3.5-lightning-free",
      "opencode/nemotron-3-ultra-free",
      "opencode/muse-spark-1.3-contributor-free",
      "opencode/muse-spark-1.2-contributor-free",
      "opencode/big-pickle",
    ],
  },
  openai: {
    name: "OpenAI / ChatGPT",
    description: "Mô hình GPT-4o, o1, o3-mini hàng đầu từ OpenAI",
    accent: "#10a37f",
    defaults: ["gpt-4o", "gpt-4o-mini", "o1-mini", "o1-preview", "gpt-4-turbo"],
  },
  anthropic: {
    name: "Anthropic Claude",
    description: "Dòng mô hình văn phong tự nhiên Claude 3.5 Sonnet & Haiku",
    accent: "#d97757",
    defaults: ["claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus"],
  },
  google: {
    name: "Google Gemini",
    description: "Mô hình thế hệ mới tốc độ cao và ngữ cảnh cực lớn từ Google",
    accent: "#1a73e8",
    defaults: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  },
  deepseek: {
    name: "DeepSeek",
    description: "Mô hình suy luận mở DeepSeek V3 và R1 Reasoning",
    accent: "#4d6bfe",
    defaults: ["deepseek-chat", "deepseek-reasoner"],
  },
  llama: {
    name: "Meta Llama",
    description: "Dòng mã nguồn mở Llama 3.3, 3.1 triển khai cục bộ hoặc qua proxy",
    accent: "#0081fb",
    defaults: ["llama-3.3-70b", "llama-3.1-8b"],
  },
  qwen: {
    name: "Qwen / Alibaba",
    description: "Dòng mô hình đa ngôn ngữ Qwen 2.5 và QwQ Reasoning",
    accent: "#615ced",
    defaults: ["qwen-2.5-72b", "qwen-2.5-coder", "qwq-32b"],
  },
  other: {
    name: "Mô hình khác / Local",
    description: "Mô hình cục bộ phát hiện từ Ollama hoặc LM Studio",
    accent: "#7a8491",
    defaults: ["mistral-7b", "gemma-2-9b", "phi-3"],
  },
};

export function GatewayView() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [testingModels, setTestingModels] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; latencyMs: number; message: string }>>({});
  
  const [isTestingJev, setIsTestingJev] = useState(false);
  const [jevTestResult, setJevTestResult] = useState<{ success: boolean; latencyMs: number } | null>(null);

  const {
    gateways,
    isScanningGateways,
    scanGateways,
    activeGateway,
    selectGateway,
    selectedModel,
    setSelectedModel,
    jevDecision,
  } = useAppStore();

  // Test a single model connection via the active gateway or OpenCode CLI
  async function handleTestModel(modelName: string) {
    // If testing an OpenCode model or running through OpenCode CLI
    if (modelName.startsWith("opencode/") || activeGateway?.gateway_type === "opencode") {
      setTestingModels((prev) => ({ ...prev, [modelName]: true }));
      toast.loading(`Đang kiểm tra mô hình ${modelName} qua OpenCode...`, { id: `test-${modelName}` });
      try {
        const latencyMs = await invoke<number>("test_opencode_model", { model: modelName });
        setTestResults((prev) => ({
          ...prev,
          [modelName]: { success: true, latencyMs, message: `Hoạt động tốt (${latencyMs}ms - Free)` },
        }));
        toast.success(`Mô hình ${modelName} phản hồi tốt (${latencyMs}ms)!`, { id: `test-${modelName}` });
      } catch (err: any) {
        setTestResults((prev) => ({
          ...prev,
          [modelName]: { success: false, latencyMs: 0, message: String(err) },
        }));
        toast.error(`Mô hình ${modelName} không phản hồi: ${err}`, { id: `test-${modelName}` });
      } finally {
        setTestingModels((prev) => ({ ...prev, [modelName]: false }));
      }
      return;
    }

    if (!activeGateway || !activeGateway.is_online) {
      toast.error("Vui lòng chọn một AI Gateway trực tuyến trước khi test mô hình");
      return;
    }

    setTestingModels((prev) => ({ ...prev, [modelName]: true }));
    toast.loading(`Đang kiểm tra mô hình ${modelName}...`, { id: `test-${modelName}` });

    const start = performance.now();
    let url = activeGateway.base_url.trim();
    if (url.endsWith("/")) url = url.slice(0, -1);
    if (!url.endsWith("/chat/completions")) {
      url = `${url}/chat/completions`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 3,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - start);

      if (res.ok) {
        setTestResults((prev) => ({
          ...prev,
          [modelName]: { success: true, latencyMs, message: `Hoạt động tốt (${latencyMs}ms)` },
        }));
        toast.success(`Mô hình ${modelName} phản hồi tốt (${latencyMs}ms)!`, { id: `test-${modelName}` });
      } else {
        const errorText = await res.text();
        setTestResults((prev) => ({
          ...prev,
          [modelName]: { success: false, latencyMs, message: `HTTP ${res.status}: ${errorText.slice(0, 60)}` },
        }));
        toast.error(`Mô hình ${modelName} lỗi HTTP ${res.status}`, { id: `test-${modelName}` });
      }
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - start);
      const msg = err.name === "AbortError" ? "Hết thời gian chờ (Timeout > 6s)" : String(err.message || err);
      setTestResults((prev) => ({
        ...prev,
        [modelName]: { success: false, latencyMs, message: msg },
      }));
      toast.error(`Mô hình ${modelName} không phản hồi: ${msg}`, { id: `test-${modelName}` });
    } finally {
      setTestingModels((prev) => ({ ...prev, [modelName]: false }));
    }
  }

  // Test Jev Core Heuristic
  async function handleTestJev() {
    setIsTestingJev(true);
    toast.loading("Đang kiểm tra Jev Core System-1...", { id: "test-jev" });
    const start = performance.now();
    try {
      await invoke("classify_text_jev", { text: "Kiểm tra phản hồi nhanh của bộ vi xử lý Jev Core" });
      const latency = Math.max(1, Math.round(performance.now() - start));
      setIsTestingJev(false);
      setJevTestResult({ success: true, latencyMs: latency });
      toast.success(`Jev Core phản hồi tức thì (~${latency}ms) không phụ thuộc mạng!`, { id: "test-jev" });
    } catch (err) {
      setIsTestingJev(false);
      setJevTestResult({ success: false, latencyMs: 0 });
      toast.error(`Lỗi Jev Core: ${err}`, { id: "test-jev" });
    }
  }

  // Group models from active gateway (or defaults) into clear provider categories
  const categorizedModels = useMemo<ModelCategory[]>(() => {
    const rawModels: string[] = 
      activeGateway && activeGateway.models.length > 0 
        ? activeGateway.models 
        : Object.values(DEFAULT_PROVIDER_CATALOG).flatMap((c) => c.defaults);

    const filtered = searchQuery.trim() 
      ? rawModels.filter((m) => m.toLowerCase().includes(searchQuery.toLowerCase()))
      : rawModels;

    const buckets: Record<string, string[]> = {
      opencode: [],
      openai: [],
      anthropic: [],
      google: [],
      deepseek: [],
      llama: [],
      qwen: [],
      other: [],
    };

    for (const m of filtered) {
      const lower = m.toLowerCase();
      if (
        lower.startsWith("opencode/") || 
        lower.includes("opencode") || 
        lower.includes("mimo") || 
        lower.includes("nemotron") || 
        lower.includes("muse-spark") || 
        lower.includes("big-pickle") || 
        lower.includes("ling-3.0")
      ) {
        buckets.opencode.push(m);
      } else if (lower.includes("gpt") || lower.startsWith("o1") || lower.startsWith("o3") || lower.includes("chatgpt")) {
        buckets.openai.push(m);
      } else if (lower.includes("claude")) {
        buckets.anthropic.push(m);
      } else if (lower.includes("gemini") || lower.includes("gemma")) {
        buckets.google.push(m);
      } else if (lower.includes("deepseek")) {
        buckets.deepseek.push(m);
      } else if (lower.includes("qwen") || lower.includes("qwq")) {
        buckets.qwen.push(m);
      } else if (lower.includes("llama")) {
        buckets.llama.push(m);
      } else {
        buckets.other.push(m);
      }
    }

    return Object.entries(buckets)
      .filter(([_, list]) => list.length > 0)
      .map(([id, list]) => ({
        id,
        name: DEFAULT_PROVIDER_CATALOG[id]?.name || id,
        description: DEFAULT_PROVIDER_CATALOG[id]?.description || "",
        accent: DEFAULT_PROVIDER_CATALOG[id]?.accent || "var(--primary)",
        models: list,
      }));
  }, [activeGateway, searchQuery]);

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto select-none max-w-5xl mx-auto w-full gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--foreground)] tracking-tight flex items-center flex-wrap gap-2">
            <Boxes size={18} className="text-[var(--primary)]" />
            <span>AI Gateway & Điều Phối Mô Hình</span>
            {activeGateway ? (
              <span className="app-badge app-badge--brand text-[10px] h-[18px]">
                {activeGateway.name} ({activeGateway.latency_ms}ms)
              </span>
            ) : (
              <span className="app-badge app-badge--neutral text-[10px] h-[18px]">
                Jev Offline Plane
              </span>
            )}
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Tự động phát hiện các cổng AI Proxy cục bộ (9Router, Cockpit, Ollama) và phân loại mô hình theo từng nhà cung cấp.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="lg-button lg-button--secondary h-7 text-xs px-2.5"
          >
            <SlidersHorizontal size={13} />
            <span>Tùy Biến Endpoint</span>
          </button>

          <button
            type="button"
            onClick={() => {
              toast.loading("Đang quét các cổng loopback...", { id: "rescan" });
              scanGateways().then(() => {
                toast.success("Đã hoàn tất quét AI Gateway!", { id: "rescan" });
              });
            }}
            disabled={isScanningGateways}
            className="lg-button lg-button--primary h-7 text-xs px-2.5"
          >
            <RefreshCw size={13} className={isScanningGateways ? "animate-spin" : ""} />
            <span>{isScanningGateways ? "Đang quét..." : "Quét lại Gateway"}</span>
          </button>
        </div>
      </div>

      {/* Jev Core Highlight Card (Offline 100%, 0 Key) with Test Feature */}
      <div className="card-surface p-4 flex-shrink-0 h-auto">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-1 h-8 rounded-full bg-[var(--primary)] flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  Jev Core (System-1 Decision Engine)
                </h3>
                <span className="app-badge app-badge--success text-[10px] h-[18px]">
                  100% Offline
                </span>
                <span className="app-badge app-badge--neutral text-[10px] h-[18px]">
                  Zero API Key
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-1.5 leading-relaxed">
                Cơ chế phân loại heuristic siêu tốc nhúng trực tiếp trong lõi Rust. Tự động nhận diện thể loại sách, đo tỷ lệ hội thoại và đề xuất phong cách typography chuẩn mực mà không cần Internet hay API key.
              </p>
              {jevDecision && (
                <div className="mt-2 text-xs text-[var(--foreground)] flex items-start gap-2 bg-[var(--secondary)]/60 p-2 rounded border border-[var(--border)]">
                  <span className="text-[var(--muted-foreground)] font-medium flex-shrink-0">Nhận định:</span>
                  <span className="font-normal text-[var(--foreground)]">{jevDecision.explanation}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between lg:justify-end gap-3 flex-shrink-0 lg:pl-4 lg:border-l border-[var(--border)] pt-2 lg:pt-0 border-t lg:border-t-0">
            <div className="text-left lg:text-right">
              {jevDecision ? (
                <>
                  <span className="text-[10px] text-[var(--muted-foreground)] block">Phân loại sách</span>
                  <span className="text-xs font-semibold text-[var(--primary)]">{jevDecision.genre_label}</span>
                  <span className="text-[10px] font-mono text-[var(--muted-foreground)] block mt-0.5">
                    {(jevDecision.confidence * 100).toFixed(0)}% độ tin cậy
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[10px] text-[var(--muted-foreground)] block">Trạng thái</span>
                  <span className="text-xs text-[var(--ui-success)] font-medium">Lõi Sẵn Sàng</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleTestJev}
              disabled={isTestingJev}
              className="lg-button lg-button--secondary h-7 text-xs px-3 gap-1.5 flex-shrink-0"
              title="Kiểm tra thời gian phản hồi của Jev Core"
            >
              <Activity size={13} className={isTestingJev ? "animate-spin text-[var(--primary)]" : "text-emerald-500"} />
              <span>{isTestingJev ? "Đang đo..." : jevTestResult ? `${jevTestResult.latencyMs}ms` : "Test Jev"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Section 1: Detected Gateways (Compact View without massive chip overflow) */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          Danh Sách AI Gateway Cục Bộ (Localhost)
        </h3>
        <span className="text-xs text-[var(--muted-foreground)] font-mono">
          {gateways.filter((g) => g.is_online).length} / {gateways.length || 7} cổng trực tuyến
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 flex-shrink-0">
        {gateways.map((gw) => {
          const isSelected = activeGateway?.name === gw.name;

          return (
            <div
              key={gw.name}
              onClick={() => {
                if (gw.is_online) {
                  selectGateway(isSelected ? null : gw);
                  toast.success(
                    isSelected ? "Đã chuyển về Jev Core Offline" : `Đã kích hoạt Gateway: ${gw.name}`
                  );
                }
              }}
              className={`card-surface p-3 transition-all ${
                gw.is_online ? "cursor-pointer" : "opacity-50 cursor-not-allowed"
              } ${isSelected ? "ring-2 ring-[var(--primary)]" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      gw.is_online
                        ? "bg-[var(--ui-success)] shadow-xs animate-pulse"
                        : "bg-[var(--muted-foreground)]"
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--foreground)] truncate max-w-[160px]">
                        {gw.name}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--muted-foreground)]">
                        :{gw.port}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--muted-foreground)] truncate block max-w-[200px]">
                      {gw.base_url}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {gw.is_online && (
                    <>
                      <span className="app-badge app-badge--neutral text-[10px] h-[18px] px-1.5 font-mono">
                        {gw.models.length} models
                      </span>
                      <span className="text-[11px] font-mono text-[var(--ui-success)]">
                        {gw.latency_ms}ms
                      </span>
                    </>
                  )}

                  {isSelected && (
                    <span className="app-badge app-badge--brand text-[10px] h-[18px] px-1.5 gap-1">
                      <Check size={11} />
                      <span>Đang chọn</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Section 2: Categorized Models by Provider with Test Feature */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
            Phân Loại Mô Hình Theo Nhà Cung Cấp
          </h3>
          <span className="app-badge app-badge--neutral text-[10px] h-[18px]">
            {categorizedModels.reduce((acc, c) => acc + c.models.length, 0)} mô hình
          </span>
        </div>

        {/* Search bar to prevent chip clutter */}
        <div className="relative w-56">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="Tìm kiếm mô hình..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-7 pl-8 pr-2.5 text-xs rounded bg-[var(--secondary)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] font-mono"
          />
        </div>
      </div>

      {/* Provider Category Cards */}
      <div className="model-page flex-shrink-0">
        {categorizedModels.map((category) => (
          <div key={category.id} className="card-surface model-page__category-card">
            {/* Category Header */}
            <div className="model-page__category-header">
              <div className="model-page__category-main">
                <div
                  className="model-page__category-accent"
                  style={{ backgroundColor: category.accent }}
                  aria-hidden="true"
                />
                <div className="model-page__category-copy">
                  <div className="flex items-center gap-2">
                    <h4 className="model-page__category-title">{category.name}</h4>
                    <span className="app-badge app-badge--neutral text-[10px] h-[18px]">
                      {category.models.length}
                    </span>
                  </div>
                  <p className="model-page__category-description">{category.description}</p>
                </div>
              </div>

              {/* Quick test the first model of this provider */}
              {category.models.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleTestModel(category.models[0])}
                  disabled={Boolean(testingModels[category.models[0]])}
                  className="lg-button lg-button--secondary h-6 text-xs px-2 gap-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  title={`Kiểm tra kết nối mô hình đầu tiên (${category.models[0]})`}
                >
                  <Activity size={12} className={testingModels[category.models[0]] ? "animate-spin text-[var(--primary)]" : ""} />
                  <span>Test nhanh</span>
                </button>
              )}
            </div>

            {/* Models Flow List (Scrollable, max 180px so it NEVER breaks the page layout) */}
            <div className="model-page__flow-list">
              {category.models.map((model) => {
                const isSelected = selectedModel === model;
                const isTesting = Boolean(testingModels[model]);
                const testResult = testResults[model];

                return (
                  <div
                    key={model}
                    onClick={() => {
                      setSelectedModel(model);
                      toast.success(`Đã kích hoạt mô hình: ${model}`);
                    }}
                    data-selected={isSelected ? "true" : undefined}
                    className="model-page__item-chip group"
                    title={`Chọn mô hình ${model}${testResult ? ` • ${testResult.message}` : ""}`}
                  >
                    <span>{model}</span>

                    {/* Test result status badge */}
                    {testResult && (
                      <span 
                        className={`text-[9px] font-mono px-1 rounded ${
                          testResult.success 
                            ? "bg-emerald-500/20 text-emerald-400" 
                            : "bg-red-500/20 text-red-400"
                        }`}
                        title={testResult.message}
                      >
                        {testResult.success ? `${testResult.latencyMs}ms` : "Lỗi"}
                      </span>
                    )}

                    {/* Test Action Button inside Chip */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTestModel(model);
                      }}
                      disabled={isTesting}
                      className="model-page__item-chip-test-btn"
                      title="Kiểm tra kết nối và độ trễ của mô hình này"
                      aria-label={`Test ${model}`}
                    >
                      {isTesting ? (
                        <Activity size={11} className="animate-spin text-[var(--primary)]" />
                      ) : (
                        <Play size={10} className="opacity-70 group-hover:opacity-100" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <GatewaySettingsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
