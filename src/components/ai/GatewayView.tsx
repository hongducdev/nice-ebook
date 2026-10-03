import React, { useState, useMemo, useEffect, useRef } from "react";
import { 
  RefreshCw, 
  SlidersHorizontal, 
  Boxes, 
  Check, 
  Play, 
  Activity, 
  Search,
  ShieldCheck,
  Plus,
  Copy,
  Pencil,
  Trash2,
  Server,
  Zap,
  AlertTriangle
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "../ui/empty";
import { useAppStore } from "../../stores/useAppStore";
import { GatewaySettingsModal } from "../settings/GatewaySettingsModal";
import {
  ConfiguredProvider,
  loadConfiguredProviders,
  saveConfiguredProviders,
  duplicateProvider,
  buildGatewayModelList,
  shouldAutoActivateProvider,
  persistProviderActivation,
  LINGUAGACHA_PRESETS,
} from "../../services/ai/linguaGachaProviders";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { 
  categorizeGatewayModels, 
  ModelCategory 
} from "../../utils/gatewayModelCategorizer";

export function GatewayView() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ConfiguredProvider | null>(null);
  const [configuredProviders, setConfiguredProviders] = useState<ConfiguredProvider[]>([]);
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

  const autoActivatedRef = useRef(false);

  useEffect(() => {
    const list = loadConfiguredProviders();
    setConfiguredProviders(list);

    // Restore the provider the user had active, but only once the startup port scan has
    // settled and once a real activation is possible: the latch is burnt from the predicate's
    // result, never on an early/not-ready render.
    const target = shouldAutoActivateProvider({
      alreadyAttempted: autoActivatedRef.current,
      isScanningGateways,
      hasActiveGateway: Boolean(activeGateway),
      providers: list,
    });
    if (!target) return;
    autoActivatedRef.current = true;
    handleActivateProvider(target);
  }, [isModalOpen, isScanningGateways, activeGateway]);

  // Activate a configured provider
  function handleActivateProvider(prov: ConfiguredProvider) {
    // load → transform → save on the PERSISTED list: mapping over the `configuredProviders`
    // state snapshot persisted `[]` and erased every provider (and the active flag) whenever
    // this ran before that state had been committed.
    const updated = persistProviderActivation(prov);
    setConfiguredProviders(updated);

    const models = buildGatewayModelList(prov);

    selectGateway({
      name: prov.name,
      base_url: prov.baseUrl,
      port: 0,
      is_online: true,
      is_user_configured: true,
      models,
      gateway_type: prov.presetId === "ollama" ? "ollama" : "openai",
      latency_ms: 10,
      api_key: prov.apiKey || undefined,
      configured_providers: [
        {
          provider: prov.presetId,
          name: prov.name,
          is_active: true,
          test_status: "active",
        },
      ],
    });
    // Keep the model the user already picked when this provider offers it.
    setSelectedModel(
      selectedModel && models.includes(selectedModel) ? selectedModel : prov.selectedModel
    );
    toast.success(`Đã kích hoạt nhà cung cấp: ${prov.name}`);
  }

  // Duplicate provider configuration (like LinguaGacha's _副本)
  function handleDuplicate(prov: ConfiguredProvider) {
    const duplicated = duplicateProvider(prov, configuredProviders);
    const updated = [...configuredProviders, duplicated];
    setConfiguredProviders(updated);
    saveConfiguredProviders(updated);
    toast.success(`Đã tạo bản sao: ${duplicated.name}`);
  }

  // Delete provider configuration
  function handleDeleteProvider(id: string) {
    const target = configuredProviders.find((p) => p.id === id);
    const updated = configuredProviders.filter((p) => p.id !== id);
    setConfiguredProviders(updated);
    saveConfiguredProviders(updated);
    if (target?.name === activeGateway?.name) {
      selectGateway(null);
    }
    toast.info("Đã xóa cấu hình nhà cung cấp.");
  }

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
            <span>AI Gateway &amp; Quản Lý Nhà Cung Cấp (LinguaGacha)</span>
            {activeGateway ? (
              <Badge variant="outline" className="text-[10px] h-4.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{activeGateway.name} ({activeGateway.latency_ms}ms)</span>
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] h-4.5">
                Lõi Offline (Cục bộ)
              </Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cấu hình các nhà cung cấp dịch thuật AI (DeepSeek, Gemini, Claude, OpenAI, Ollama...) với hỗ trợ đa endpoint và sao chép cấu hình.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            onClick={() => {
              setEditingProvider(null);
              setIsModalOpen(true);
            }}
            className="h-7 text-xs px-2.5 gap-1.5 shadow-xs"
          >
            <Plus className="size-3.5" />
            <span>Thêm Provider Mới</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast.loading("Đang quét các cổng localhost...", { id: "rescan" });
              scanGateways().then(() => {
                toast.success("Đã hoàn tất quét dịch vụ cục bộ!", { id: "rescan" });
              });
            }}
            disabled={isScanningGateways}
            className="h-7 text-xs px-2.5 gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isScanningGateways ? "animate-spin" : ""}`} />
            <span>{isScanningGateways ? "Đang quét..." : "Quét Localhost"}</span>
          </Button>
        </div>
      </div>

      {/* Saved model has no active gateway to serve it */}
      {!activeGateway && selectedModel && selectedModel !== "jev-verdict-2.0" && (
        <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-foreground">
              Mô hình “{selectedModel}” chưa thuộc nhà cung cấp nào đang hoạt động
            </span>
            <span className="text-[11px] text-muted-foreground leading-relaxed">
              Bấm “Kích hoạt” trên nhà cung cấp tương ứng bên dưới (hoặc thêm mới) để dùng
              mô hình này cho dịch thuật, biên tập và trợ lý chat.
            </span>
          </div>
        </div>
      )}

      {/* Section 1: Configured Providers (LinguaGacha Style) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Nhà Cung Cấp Đã Cấu Hình ({configuredProviders.length})
            </h3>
          </div>
          <span className="text-[10px] text-muted-foreground">
            Bấm "Kích hoạt" để chọn nhà cung cấp làm cổng dịch chính
          </span>
        </div>

        {configuredProviders.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {configuredProviders.map((prov) => {
              const isCurrentActive = Boolean(activeGateway && activeGateway.name === prov.name);
              const presetInfo = LINGUAGACHA_PRESETS.find((p) => p.id === prov.presetId);
              const accentColor = presetInfo?.accent || "var(--primary)";

              return (
                <Card
                  key={prov.id}
                  onClick={() => !isCurrentActive && handleActivateProvider(prov)}
                  className={`p-3.5 flex flex-col justify-between gap-2.5 transition-all bg-card ${
                    isCurrentActive
                      ? "ring-2 ring-primary shadow-xs border-primary/50"
                      : "hover:border-primary/40 border-border cursor-pointer hover:shadow-xs"
                  }`}
                >
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: accentColor }}
                        />
                        <strong className="text-xs font-semibold text-foreground truncate">
                          {prov.name}
                        </strong>
                      </div>

                      {isCurrentActive ? (
                        <Badge
                          variant="outline"
                          className="text-[9px] h-4 px-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 gap-1 font-mono shrink-0"
                        >
                          <Check size={9} />
                          <span>Đang dùng</span>
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1 text-muted-foreground shrink-0">
                          {presetInfo?.name || "Custom"}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-col gap-0.5 text-[10px] font-mono text-muted-foreground">
                      <span className="truncate" title={prov.baseUrl}>
                        {prov.baseUrl}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5 text-foreground">
                        <span className="text-muted-foreground">Model:</span>
                        <strong className="text-primary truncate">{prov.selectedModel}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1 pt-2 border-t border-border/60">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant={isCurrentActive ? "secondary" : "default"}
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleActivateProvider(prov);
                        }}
                        disabled={isCurrentActive}
                        className="h-6 px-2 text-[10px] font-medium cursor-pointer"
                        title={isCurrentActive ? "Đang là provider chính" : "Kích hoạt provider này"}
                      >
                        {isCurrentActive ? "Đang dùng" : "Kích hoạt"}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate(prov);
                        }}
                        className="size-6 text-muted-foreground hover:text-foreground"
                        title="Tạo bản sao provider này (Endpoint Duplicate)"
                      >
                        <Copy size={11} />
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProvider(prov);
                          setIsModalOpen(true);
                        }}
                        className="size-6 text-muted-foreground hover:text-foreground"
                        title="Chỉnh sửa cấu hình"
                      >
                        <Pencil size={11} />
                      </Button>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProvider(prov.id);
                      }}
                      className="size-6 text-muted-foreground hover:text-destructive"
                      title="Xóa cấu hình này"
                    >
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground bg-muted/10">
            Chưa có nhà cung cấp nào được cấu hình. Nhấn "Thêm Provider Mới" để thiết lập DeepSeek, Gemini, Claude hoặc OpenAI.
          </div>
        )}
      </div>

      {/* Section 2: Detected Localhost Gateways */}
      {gateways.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server size={14} className="text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Dịch Vụ Cục Bộ Tự Động Quét (Localhost)
              </h3>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {gateways.filter((g) => g.is_online).length} trực tuyến
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {gateways.map((gw) => {
              const isSelected = activeGateway?.name === gw.name;

              return (
                <Card
                  key={gw.name}
                  onClick={() => {
                    if (gw.is_online) {
                      selectGateway(isSelected ? null : gw);
                      toast.success(
                        isSelected ? "Đã chuyển về Lõi Cục Bộ Jev Core" : `Đã kích hoạt: ${gw.name}`
                      );
                    }
                  }}
                  className={`p-2.5 transition-all bg-card ${
                    gw.is_online ? "cursor-pointer" : "opacity-50 cursor-not-allowed"
                  } ${isSelected ? "ring-2 ring-primary shadow-xs" : "hover:border-primary/50"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`size-2 rounded-full shrink-0 ${
                          gw.is_online ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                        }`}
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate block">
                          {gw.name}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground truncate block">
                          {gw.base_url}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {gw.is_online && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1 font-mono">
                          {gw.models.length} models
                        </Badge>
                      )}
                      {isSelected && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 gap-1 border-primary/40 text-primary">
                          <Check className="size-2.5" />
                          <span>Đang chọn</span>
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 3: Available Models in Active Gateway */}
      <div className="flex flex-col gap-2 pt-2 border-t border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Mô Hình Khả Dụng (Available Models)
            </h3>
            <Badge variant="secondary" className="text-[10px] h-4.5">
              {categorizedModels.reduce((acc, c) => acc + c.models.length, 0)} mô hình
            </Badge>
          </div>

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

        {categorizedModels.length > 0 ? (
          <div className="model-page flex-shrink-0">
            {categorizedModels.map((category) => (
              <Card key={category.id} className="model-page__category-card p-4 bg-card border-border">
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
                        className="model-page__item-chip group cursor-pointer"
                        title={`Chọn mô hình ${model}${testResult ? ` • ${testResult.message}` : ""}`}
                      >
                        <span>{model}</span>

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

                        {isFallback && (
                          <Badge variant="outline" className="text-[8px] h-4 px-1 font-mono border-primary/40 text-primary">
                            Fallback
                          </Badge>
                        )}

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
          <Empty className="p-6 border border-border rounded-xl bg-card">
            <EmptyMedia>
              <Boxes className="size-8 text-primary opacity-80" />
            </EmptyMedia>
            <EmptyTitle className="text-xs font-semibold text-foreground">
              {activeGateway
                ? `Chưa có danh sách mô hình từ ${activeGateway.name}`
                : "Chưa kích hoạt AI Provider"}
            </EmptyTitle>
            <EmptyDescription className="text-[11px] text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Chọn hoặc kích hoạt một nhà cung cấp ở danh sách trên hoặc nhấn "Thêm Provider Mới" để thiết lập DeepSeek, Gemini, Claude, OpenAI...
            </EmptyDescription>
            <EmptyContent className="flex items-center gap-2 mt-2">
              <Button
                size="sm"
                onClick={() => {
                  setEditingProvider(null);
                  setIsModalOpen(true);
                }}
                className="h-7 text-xs px-3"
              >
                Cấu Hình Provider
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>

      {/* Section 4: Jev Core Local */}
      <Card className="p-4 shrink-0 bg-card border-border">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-1 h-8 rounded-full bg-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Lõi Xử Lý Cục Bộ Jev Core (Tự động 100% Offline)
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

      <GatewaySettingsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialProvider={editingProvider}
        onSaved={() => setConfiguredProviders(loadConfiguredProviders())}
      />
    </div>
  );
}
