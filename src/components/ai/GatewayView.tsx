import { useState, useMemo } from "react";
import { 
  RefreshCw, 
  SlidersHorizontal, 
  Boxes, 
  Check, 
  Play, 
  Activity, 
  Search,
  ShieldCheck 
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "../ui/empty";
import { useAppStore } from "../../stores/useAppStore";
import { GatewaySettingsModal } from "../settings/GatewaySettingsModal";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { 
  categorizeGatewayModels, 
  ModelCategory 
} from "../../utils/gatewayModelCategorizer";

export function GatewayView() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [testingModels, setTestingModels] = useState<Record<string, boolean>>({});
  
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
    fallbackModels,
    setFallbackModels,
    testModel,
    modelTestResults,
    jevDecision,
  } = useAppStore();

  // Test a single model connection via the active gateway or OpenCode CLI
  async function handleTestModel(modelName: string) {
    setTestingModels((prev) => ({ ...prev, [modelName]: true }));
    toast.loading(`Đang kiểm tra mô hình ${modelName}...`, { id: `test-${modelName}` });

    try {
      const result = await testModel(modelName);
      if (result.success) {
        toast.success(`Mô hình ${modelName} phản hồi tốt (${result.latencyMs}ms)!`, { id: `test-${modelName}` });
      } else {
        toast.error(`Mô hình ${modelName} lỗi: ${result.message}`, { id: `test-${modelName}` });
        if (fallbackModels.includes(modelName)) {
          toast.warning(`Đã loại ${modelName} khỏi chuỗi fallback vì phát hiện lỗi!`);
        }
      }
    } finally {
      setTestingModels((prev) => ({ ...prev, [modelName]: false }));
    }
  }

  // Toggle or add a model to fallback models with pre-validation
  async function handleSetAsFallback(model: string, e: React.MouseEvent) {
    e.stopPropagation();

    if (fallbackModels.includes(model)) {
      const updated = fallbackModels.filter((m) => m !== model);
      if (!updated.includes("jev-verdict-2.0")) updated.push("jev-verdict-2.0");
      setFallbackModels(updated);
      toast.info(`Đã gỡ "${model}" khỏi chuỗi fallback`);
      return;
    }

    // Kiểm tra có lỗi không trước khi chọn làm model fallback
    let testResult = modelTestResults[model];
    if (!testResult) {
      toast.loading(`Đang kiểm tra lỗi của "${model}" trước khi chọn làm fallback...`, { id: `check-${model}` });
      setTestingModels((prev) => ({ ...prev, [model]: true }));
      try {
        testResult = await testModel(model);
      } finally {
        setTestingModels((prev) => ({ ...prev, [model]: false }));
      }
    }

    if (!testResult.success) {
      toast.error(`Mô hình "${model}" gặp lỗi (${testResult.message}), không thể chọn làm model fallback!`, { id: `check-${model}` });
      return;
    }

    const updated = [...fallbackModels.filter((m) => m !== "jev-verdict-2.0"), model, "jev-verdict-2.0"];
    setFallbackModels(updated);
    toast.success(`Đã kiểm tra OK (${testResult.latencyMs}ms) & đặt "${model}" làm fallback!`, { id: `check-${model}` });
  }

  // Test Jev Core Heuristic
  // Test Local Core Latency
  async function handleTestJev() {
    setIsTestingJev(true);
    toast.loading("Đang đo độ trễ lõi xử lý cục bộ...", { id: "test-engine" });
    const start = performance.now();
    try {
      await invoke("classify_text_jev", { text: "Kiểm tra phản hồi nhanh của bộ vi xử lý cục bộ" });
      const latency = Math.max(1, Math.round(performance.now() - start));
      setIsTestingJev(false);
      setJevTestResult({ success: true, latencyMs: latency });
      toast.success(`Lõi cục bộ phản hồi tức thì (~${latency}ms) không phụ thuộc mạng!`, { id: "test-engine" });
    } catch (err) {
      setIsTestingJev(false);
      setJevTestResult({ success: false, latencyMs: 0 });
      toast.error(`Lỗi kiểm tra: ${err}`, { id: "test-engine" });
    }
  }

  // Group models strictly by the providers that are actually configured / active
  const categorizedModels = useMemo<ModelCategory[]>(
    () => categorizeGatewayModels(activeGateway, searchQuery),
    [activeGateway, searchQuery]
  );

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto select-none max-w-5xl mx-auto w-full gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground tracking-tight flex items-center flex-wrap gap-2">
            <Boxes size={18} className="text-primary" />
            <span>AI Gateway & Điều Phối Mô Hình</span>
            {activeGateway ? (
              <Badge variant="outline" className="text-[10px] h-4.5 border-primary/40 text-primary">
                {activeGateway.name} ({activeGateway.latency_ms}ms)
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] h-4.5">
                Lõi Offline (Cục bộ)
              </Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tự động phát hiện các cổng AI Proxy cục bộ (9Router, Cockpit, Ollama) và phân loại mô hình theo từng nhà cung cấp.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="h-7 text-xs px-2.5 gap-1.5"
          >
            <SlidersHorizontal className="size-3.5" />
            <span>Tùy Biến Endpoint</span>
          </Button>

          <Button
            size="sm"
            onClick={() => {
              toast.loading("Đang quét các cổng loopback...", { id: "rescan" });
              scanGateways().then(() => {
                toast.success("Đã hoàn tất quét AI Gateway!", { id: "rescan" });
              });
            }}
            disabled={isScanningGateways}
            className="h-7 text-xs px-2.5 gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isScanningGateways ? "animate-spin" : ""}`} />
            <span>{isScanningGateways ? "Đang quét..." : "Quét lại Gateway"}</span>
          </Button>
        </div>
      </div>

      {/* Jev Core Highlight Card (Offline 100%, 0 Key) with Test Feature */}
      <Card className="p-4 shrink-0 bg-card border-border">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-1 h-8 rounded-full bg-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Lõi Xử Lý Cục Bộ (Tự động 100% Offline)
                </h3>
                <Badge variant="secondary" className="text-[10px] h-4.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  100% Offline
                </Badge>
                <Badge variant="outline" className="text-[10px] h-4.5">
                  Zero API Key
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Cơ chế phân loại heuristic siêu tốc nhúng trực tiếp trong lõi Rust. Tự động nhận diện thể loại sách, đo tỷ lệ hội thoại và đề xuất phong cách typography chuẩn mực mà không cần Internet hay API key.
              </p>
              {jevDecision && (
                <div className="mt-2 text-xs text-foreground flex items-start gap-2 bg-secondary/60 p-2 rounded border border-border">
                  <span className="text-muted-foreground font-medium shrink-0">Nhận định:</span>
                  <span className="font-normal text-foreground">{jevDecision.explanation}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0 lg:pl-4 lg:border-l border-border pt-2 lg:pt-0 border-t lg:border-t-0">
            <div className="text-left lg:text-right">
              {jevDecision ? (
                <>
                  <span className="text-[10px] text-muted-foreground block">Phân loại sách</span>
                  <span className="text-xs font-semibold text-primary">{jevDecision.genre_label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground block mt-0.5">
                    {(jevDecision.confidence * 100).toFixed(0)}% độ tin cậy
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[10px] text-muted-foreground block">Trạng thái</span>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Lõi Sẵn Sàng</span>
                </>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTestJev}
              disabled={isTestingJev}
              className="h-7 text-xs px-3 gap-1.5 shrink-0"
              title="Kiểm tra thời gian phản hồi của lõi cục bộ"
            >
              <Activity className={`size-3.5 ${isTestingJev ? "animate-spin text-primary" : "text-emerald-500"}`} />
              <span>{isTestingJev ? "Đang đo..." : jevTestResult ? `${jevTestResult.latencyMs}ms` : "Đo độ trễ"}</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Section 1: Detected Gateways (Compact View without massive chip overflow) */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Danh Sách AI Gateway Cục Bộ (Localhost)
        </h3>
        <span className="text-xs text-muted-foreground font-mono">
          {gateways.filter((g) => g.is_online).length} / {gateways.length || 7} cổng trực tuyến
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 flex-shrink-0">
        {gateways.map((gw) => {
          const isSelected = activeGateway?.name === gw.name;

          return (
            <Card
              key={gw.name}
              onClick={() => {
                if (gw.is_online) {
                  selectGateway(isSelected ? null : gw);
                  toast.success(
                    isSelected ? "Đã chuyển về Jev Core Offline" : `Đã kích hoạt Gateway: ${gw.name}`
                  );
                }
              }}
              className={`p-3 transition-all bg-card ${
                gw.is_online ? "cursor-pointer" : "opacity-50 cursor-not-allowed"
              } ${isSelected ? "ring-2 ring-primary shadow-xs" : "hover:border-primary/50"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`size-2 rounded-full shrink-0 ${
                      gw.is_online
                        ? "bg-emerald-500 shadow-xs animate-pulse"
                        : "bg-muted-foreground"
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground truncate max-w-[160px]">
                        {gw.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        :{gw.port}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground truncate block max-w-[200px]">
                      {gw.base_url}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {gw.is_online && (
                    <>
                      <Badge variant="secondary" className="text-[10px] h-4.5 px-1.5 font-mono">
                        {gw.models.length} models
                      </Badge>
                      <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                        {gw.latency_ms}ms
                      </span>
                    </>
                  )}

                  {isSelected && (
                    <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 gap-1 border-primary/40 text-primary">
                      <Check className="size-3" />
                      <span>Đang chọn</span>
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Section 2: Categorized Models by Provider with Test Feature */}
      <div className="flex items-center justify-between pt-2 border-t border-border shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Phân Loại Mô Hình Theo Nhà Cung Cấp
          </h3>
          <Badge variant="secondary" className="text-[10px] h-4.5">
            {categorizedModels.reduce((acc, c) => acc + c.models.length, 0)} mô hình
          </Badge>
        </div>

        {/* Search bar to prevent chip clutter */}
        <div className="relative w-56">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Tìm kiếm mô hình..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-7 pl-8 pr-2.5 text-xs font-mono bg-card"
          />
        </div>
      </div>

      {/* Provider Category Cards */}
      {categorizedModels.length > 0 ? (
        <div className="model-page flex-shrink-0">
          {categorizedModels.map((category) => (
            <Card key={category.id} className="model-page__category-card p-4 bg-card border-border">
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
                      {category.accountBadge && (
                        <Badge variant="outline" className="text-[9px] h-4.5 border-primary/40 text-primary">
                          {category.accountBadge}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] h-4.5">
                        {category.models.length} mô hình
                      </Badge>
                    </div>
                    <p className="model-page__category-description">{category.description}</p>
                  </div>
                </div>

                {/* Quick test the first model of this provider */}
                {category.models.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestModel(category.models[0])}
                    disabled={Boolean(testingModels[category.models[0]])}
                    className="h-6 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
                    title={`Kiểm tra kết nối mô hình đầu tiên (${category.models[0]})`}
                  >
                    <Activity className={`size-3 ${testingModels[category.models[0]] ? "animate-spin text-primary" : ""}`} />
                    <span>Test nhanh</span>
                  </Button>
                )}
              </div>

              {/* Models Flow List (Scrollable, max 180px so it NEVER breaks the page layout) */}
              <div className="model-page__flow-list">
                {category.models.map((model) => {
                  const isSelected = selectedModel === model;
                  const isTesting = Boolean(testingModels[model]);
                  const testResult = modelTestResults[model];
                  const isFallback = fallbackModels.includes(model);

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

                      {/* Fallback badge */}
                      {isFallback && (
                        <Badge variant="outline" className="text-[8px] h-4 px-1 font-mono border-primary/40 text-primary">
                          Fallback
                        </Badge>
                      )}

                      {/* Action buttons inside Chip */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => handleSetAsFallback(model, e)}
                          className="model-page__item-chip-test-btn"
                          title={isFallback ? "Bỏ khỏi chuỗi fallback" : "Kiểm tra lỗi & đặt làm fallback"}
                          aria-label={`Toggle fallback ${model}`}
                        >
                          <ShieldCheck size={11} className={isFallback ? "text-emerald-400" : "opacity-40 group-hover:opacity-100"} />
                        </button>

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
                            <Activity size={11} className="animate-spin text-primary" />
                          ) : (
                            <Play size={10} className="opacity-70 group-hover:opacity-100" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty className="p-8 border border-border rounded-xl bg-card">
          <EmptyMedia>
            <Boxes className="size-10 text-primary opacity-80" />
          </EmptyMedia>
          <EmptyTitle className="text-sm font-semibold text-foreground">
            {activeGateway
              ? `Chưa phát hiện mô hình hoặc Provider nào trong ${activeGateway.name}`
              : "Chưa kích hoạt AI Gateway"}
          </EmptyTitle>
          <EmptyDescription className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            {activeGateway?.gateway_type === "9router"
              ? "Chỉ các nhà cung cấp (Antigravity, Codex, Cline, Qoder...) đã được thiết lập và kết nối trong 9Router mới hiển thị tại đây. Vui lòng mở 9Router để cấu hình provider của bạn."
              : "Vui lòng chọn hoặc quét lại Gateway ở danh sách trên để tải các mô hình của nhà cung cấp đã thiết lập."}
          </EmptyDescription>
          {activeGateway?.gateway_type === "9router" && (
            <EmptyContent className="flex items-center gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                asChild
                className="h-7 text-xs px-3"
              >
                <a
                  href={`${activeGateway.base_url.replace(/\/v1\/?$/, "")}/dashboard`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở 9Router Dashboard
                </a>
              </Button>
              <Button
                size="sm"
                onClick={() => scanGateways()}
                className="h-7 text-xs px-3"
              >
                Quét lại Gateway
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}

      <GatewaySettingsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
