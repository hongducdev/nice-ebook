import { useState, useEffect, useRef } from "react";
import {
  Wand2,
  Sparkles,
  Loader2,
  Check,
  Download,
  RefreshCw,
  Type,
  Palette,
  Ban,
  Image as ImageIcon,
  Key,
  Globe,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import {
  AiCoverService,
  COVER_STYLE_PRESETS,
  COVER_ENGINES,
  CoverArtStyleId,
  CoverEngineId,
  CoverFontFamily,
  CoverTypographyOptions,
  GeneratedCoverItem,
  buildCoverPrompt,
  enhancePromptWithAi,
} from "../../services/ai/aiCoverService";
import { DetectedGateway } from "../../stores/useAppStore";
import { cleanSearchQuery } from "../../services/metadata/bookMetadataService";

export interface AiCoverTabProps {
  bookTitle: string;
  author?: string;
  genre?: string;
  description?: string;
  activeGateway: DetectedGateway | null;
  selectedModel: string | null;
  onApplyCover: (dataUrl: string) => void;
}

export function AiCoverTab({
  bookTitle,
  author,
  genre,
  description,
  activeGateway,
  selectedModel,
  onApplyCover,
}: AiCoverTabProps) {
  // Engine & Style
  const [coverEngine, setCoverEngine] = useState<CoverEngineId>("pollinations");
  const [coverStyleId, setCoverStyleId] = useState<CoverArtStyleId>("oil-painting");

  // Prompt states
  const [prompt, setPrompt] = useState("");
  const [customIdea, setCustomIdea] = useState("");
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);

  // Engine credentials
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  // Generation status
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Variations gallery
  const [generatedCovers, setGeneratedCovers] = useState<GeneratedCoverItem[]>([]);
  const [selectedCover, setSelectedCover] = useState<GeneratedCoverItem | null>(null);

  // Typography Options
  const currentPreset =
    COVER_STYLE_PRESETS.find((p) => p.id === coverStyleId) || COVER_STYLE_PRESETS[0];

  const [typography, setTypography] = useState<CoverTypographyOptions>({
    enabled: true,
    title: bookTitle || "",
    author: author || "",
    subtitle: genre || "",
    fontFamily: currentPreset.suggestedFont,
    position: "classic-top",
    textColor: currentPreset.defaultTextColor,
    hasBackdropGradient: true,
    hasDropShadow: true,
    scale: 1.0,
  });

  const [isCompositingTypography, setIsCompositingTypography] = useState(false);

  // Auto-fill typography text from book metadata if empty
  useEffect(() => {
    setTypography((prev) => ({
      ...prev,
      title: prev.title || bookTitle || "",
      author: prev.author || author || "",
      subtitle: prev.subtitle || genre || "",
    }));
  }, [bookTitle, author, genre]);

  // Sync activeGateway credentials if available
  useEffect(() => {
    if (activeGateway?.api_key && !apiKey) {
      setApiKey(activeGateway.api_key);
    }
    if (activeGateway?.base_url && !baseUrl) {
      setBaseUrl(activeGateway.base_url);
    }
  }, [activeGateway]);

  // Initial prompt generation when opened or style changes
  useEffect(() => {
    if (!prompt) {
      const generated = buildCoverPrompt({
        title: bookTitle || "Tác Phẩm",
        author,
        genre,
        description,
        styleId: coverStyleId,
        customIdea,
      });
      setPrompt(generated);
    }
  }, [coverStyleId, bookTitle]);

  // When changing style preset, update typography suggested font and color
  function handleSelectStyle(styleId: CoverArtStyleId) {
    setCoverStyleId(styleId);
    const preset = COVER_STYLE_PRESETS.find((p) => p.id === styleId);
    if (preset) {
      setTypography((prev) => ({
        ...prev,
        fontFamily: preset.suggestedFont,
        textColor: preset.defaultTextColor,
      }));

      // Regenerate prompt with new style
      const newPrompt = buildCoverPrompt({
        title: bookTitle || "Tác Phẩm",
        author,
        genre,
        description,
        styleId,
        customIdea,
      });
      setPrompt(newPrompt);
    }
  }

  // Auto-generate prompt from book metadata
  function handleAutoSuggestPrompt() {
    const newPrompt = buildCoverPrompt({
      title: bookTitle || "Tác Phẩm",
      author,
      genre,
      description,
      styleId: coverStyleId,
      customIdea,
    });
    setPrompt(newPrompt);
    toast.success("Đã tạo prompt tự động từ thông tin sách!");
  }

  // Enhance prompt with AI LLM
  async function handleEnhancePrompt() {
    setIsEnhancingPrompt(true);
    toast.loading("AI Art Director đang tinh chỉnh prompt tiếng Anh...", { id: "enhance-prompt" });

    try {
      const enhanced = await enhancePromptWithAi({
        baseUrl: baseUrl || activeGateway?.base_url || "https://api.deepseek.com/v1",
        apiKey: apiKey || activeGateway?.api_key,
        model: model || selectedModel || "deepseek-chat",
        bookTitle: bookTitle || "Tác phẩm",
        author,
        genre,
        description,
        styleName: currentPreset.name,
        currentPrompt: prompt || buildCoverPrompt({
          title: bookTitle || "Tác phẩm",
          author,
          genre,
          description,
          styleId: coverStyleId,
          customIdea,
        }),
      });

      setPrompt(enhanced);
      toast.success("Đã tối ưu hóa prompt bằng AI!", { id: "enhance-prompt" });
    } catch (err) {
      console.error(err);
      toast.error("Không thể tối ưu hóa prompt", { id: "enhance-prompt" });
    } finally {
      setIsEnhancingPrompt(false);
    }
  }

  // Generate cover action
  async function handleGenerateCover() {
    const promptToUse = prompt.trim() || buildCoverPrompt({
      title: bookTitle || "Tác phẩm",
      author,
      genre,
      description,
      styleId: coverStyleId,
      customIdea,
    });

    if (!promptToUse) {
      toast.error("Vui lòng nhập hoặc tạo prompt cho ảnh bìa");
      return;
    }

    const currentEngineInfo = COVER_ENGINES.find((e) => e.id === coverEngine);
    if (currentEngineInfo?.requiresKey && !apiKey.trim() && !activeGateway?.api_key) {
      setShowConfigPanel(true);
      toast.error(`Vui lòng nhập API Key cho ${currentEngineInfo.name}`);
      return;
    }

    setIsGenerating(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const toastId = toast.loading(`Đang vẽ ảnh bìa bằng ${currentEngineInfo?.name || coverEngine}...`, {
      description: "Quá trình thường mất 10 - 25 giây",
    });

    try {
      const res = await AiCoverService.generateCoverImage({
        engine: coverEngine,
        prompt: promptToUse,
        styleId: coverStyleId,
        apiKey: apiKey || activeGateway?.api_key,
        baseUrl: baseUrl || activeGateway?.base_url,
        model: model || currentEngineInfo?.defaultModel,
        signal: controller.signal,
      });

      // Composite typography onto raw cover
      const finalUrl = await AiCoverService.renderTypographyOnCover(
        res.rawDataUrl,
        typography
      );

      const newItem: GeneratedCoverItem = {
        id: `cover-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        engine: coverEngine,
        styleId: coverStyleId,
        rawImageUrl: res.rawImageUrl,
        rawDataUrl: res.rawDataUrl,
        finalDataUrl: finalUrl,
        prompt: promptToUse,
        createdAt: Date.now(),
        typography: { ...typography },
      };

      setGeneratedCovers((prev) => [newItem, ...prev]);
      setSelectedCover(newItem);
      toast.success("Đã tạo ảnh bìa AI thành công!", { id: toastId });
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        toast.info("Đã hủy quá trình tạo ảnh", { id: toastId });
      } else {
        console.error(err);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Lỗi tạo ảnh bìa: ${msg}`, { id: toastId });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }

  // Cancel ongoing generation
  function handleCancelGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  }

  // Update typography in real time on selected cover
  async function updateTypography(newOptions: Partial<CoverTypographyOptions>) {
    const updated = { ...typography, ...newOptions };
    setTypography(updated);

    if (!selectedCover) return;

    setIsCompositingTypography(true);
    try {
      const newFinal = await AiCoverService.renderTypographyOnCover(
        selectedCover.rawDataUrl,
        updated
      );

      const updatedItem: GeneratedCoverItem = {
        ...selectedCover,
        finalDataUrl: newFinal,
        typography: updated,
      };

      setSelectedCover(updatedItem);
      setGeneratedCovers((prev) =>
        prev.map((c) => (c.id === updatedItem.id ? updatedItem : c))
      );
    } catch (err) {
      console.error("Error compositing typography:", err);
    } finally {
      setIsCompositingTypography(false);
    }
  }

  // Download cover image
  function handleDownloadCover(item: GeneratedCoverItem) {
    const a = document.createElement("a");
    a.href = item.finalDataUrl;
    const safeTitle = cleanSearchQuery(bookTitle || "ebook-cover");
    a.download = `cover-${safeTitle || "book"}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Đã tải ảnh bìa về máy tính!");
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5 h-full min-h-0 min-w-0">
      {/* Left Column: Generator Controls */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-w-0">
        {/* Banner: Engine Selector */}
        <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--card)]/60 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-500" />
              <span>Động cơ AI tạo ảnh:</span>
            </span>

            {/* Quick config toggle for custom / API keys */}
            <button
              type="button"
              onClick={() => setShowConfigPanel((prev) => !prev)}
              className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-1 transition-colors"
            >
              <SlidersHorizontal size={12} />
              <span>{showConfigPanel ? "Thu gọn cấu hình" : "Tùy chỉnh API"}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {COVER_ENGINES.map((eng) => (
              <button
                key={eng.id}
                type="button"
                onClick={() => {
                  setCoverEngine(eng.id);
                  if (eng.requiresKey) {
                    setShowConfigPanel(true);
                  }
                }}
                className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-1.5 cursor-pointer ${
                  coverEngine === eng.id
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 shadow-xs ring-1 ring-[var(--primary)]/40"
                    : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--border)]/80 hover:bg-[var(--secondary)]/40"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-[var(--foreground)]">
                    {eng.id === "pollinations" ? "Pollinations AI" : eng.name.split(" ")[0]}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold shrink-0 ${
                      eng.requiresKey
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    }`}
                  >
                    {eng.badge}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)] leading-tight">
                  {eng.id === "pollinations" ? "Miễn phí 100% • Không cần Key" : eng.description.split("•")[0]}
                </p>
              </button>
            ))}
          </div>

          {/* Collapsible API configuration panel */}
          {showConfigPanel && (
            <div className="pt-2.5 mt-2 border-t border-[var(--border)]/70 space-y-2 text-xs animate-in fade-in duration-100">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
                    <Key size={11} />
                    <span>API Key:</span>
                  </label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
                    <Globe size={11} />
                    <span>Base URL (Tùy chọn):</span>
                  </label>
                  <input
                    type="text"
                    placeholder="https://api..."
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--muted-foreground)] mb-1 flex items-center gap-1">
                    <SlidersHorizontal size={11} />
                    <span>Tên Model (Tùy chọn):</span>
                  </label>
                  <input
                    type="text"
                    placeholder={COVER_ENGINES.find((e) => e.id === coverEngine)?.defaultModel || "flux"}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section: Art Style Selector */}
        <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--card)]/60 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5">
              <Palette size={13} className="text-[var(--primary)]" />
              <span>Phong cách nghệ thuật bìa sách:</span>
            </span>
            <span className="text-[11px] text-[var(--primary)] font-medium">
              {currentPreset.name}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {COVER_STYLE_PRESETS.map((pst) => (
              <button
                key={pst.id}
                type="button"
                onClick={() => handleSelectStyle(pst.id)}
                className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                  coverStyleId === pst.id
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-xs font-semibold ring-2 ring-[var(--primary)]/30"
                    : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:border-[var(--border)]/90 hover:bg-[var(--secondary)]/60"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-base shrink-0">{pst.icon}</span>
                  <span className="text-xs font-semibold leading-tight">{pst.name}</span>
                </div>
                <span
                  className={`text-[10px] leading-tight ${
                    coverStyleId === pst.id ? "text-white/85" : "text-[var(--muted-foreground)]"
                  }`}
                >
                  {pst.category}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Section: Prompt & Idea */}
        <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--card)]/60 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-[var(--foreground)] flex items-center gap-1.5">
              <Wand2 size={13} className="text-[var(--primary)]" />
              <span>Mô tả chi tiết ảnh bìa (Prompt):</span>
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAutoSuggestPrompt}
                className="lg-button lg-button--secondary text-[11px] h-7 px-2.5 gap-1 text-[var(--primary)] font-medium"
                title="Tạo lại prompt từ thông tin sách"
              >
                <RefreshCw size={11} />
                <span>Gợi ý từ sách</span>
              </button>

              <button
                type="button"
                onClick={handleEnhancePrompt}
                disabled={isEnhancingPrompt}
                className="lg-button lg-button--secondary text-[11px] h-7 px-2.5 gap-1 font-medium bg-gradient-to-r from-amber-500/10 to-purple-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                title="Nhờ AI Art Director viết lại prompt giàu tính nghệ thuật hơn"
              >
                {isEnhancingPrompt ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Sparkles size={11} />
                )}
                <span>Tối ưu bằng AI</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <input
              type="text"
              placeholder="Ý tưởng đặc biệt bổ sung (ví dụ: 'thuyền buồm cô độc, lâu đài phát sáng, hoa đào rơi...')"
              value={customIdea}
              onChange={(e) => setCustomIdea(e.target.value)}
              className="w-full text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/60"
            />

            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Prompt tiếng Anh gửi đến AI tạo ảnh..."
              className="w-full text-xs md:text-sm p-3 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] resize-none font-mono focus:outline-hidden focus:border-[var(--primary)] leading-relaxed"
            />
          </div>
        </div>

        {/* Section: Typography Overlay Studio */}
        <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--card)]/60 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Type size={14} className="text-[var(--primary)]" />
              <span className="text-xs font-bold text-[var(--foreground)]">
                Studio gắn chữ (Tựa đề &amp; Tác giả)
              </span>
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={typography.enabled}
                onChange={(e) => updateTypography({ enabled: e.target.checked })}
                className="rounded border-[var(--border)] text-[var(--primary)]"
              />
              <span className="text-xs font-medium text-[var(--foreground)]">Bật gắn chữ</span>
            </label>
          </div>

          {typography.enabled && (
            <div className="space-y-3 pt-1 border-t border-[var(--border)]/60 animate-in fade-in duration-100">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-[var(--muted-foreground)] font-semibold uppercase block mb-1">
                    Tựa Đề Sách
                  </label>
                  <input
                    type="text"
                    value={typography.title}
                    onChange={(e) => updateTypography({ title: e.target.value })}
                    className="w-full text-xs md:text-sm px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] font-medium"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-[var(--muted-foreground)] font-semibold uppercase block mb-1">
                    Tên Tác Giả
                  </label>
                  <input
                    type="text"
                    value={typography.author}
                    onChange={(e) => updateTypography({ author: e.target.value })}
                    className="w-full text-xs md:text-sm px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] font-medium"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-[var(--muted-foreground)] font-semibold uppercase block mb-1">
                    Phụ Đề / Thể Loại
                  </label>
                  <input
                    type="text"
                    placeholder="Tiểu thuyết, Tập 1..."
                    value={typography.subtitle || ""}
                    onChange={(e) => updateTypography({ subtitle: e.target.value })}
                    className="w-full text-xs md:text-sm px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] font-medium"
                  />
                </div>
              </div>

              {/* Font, Position & Color controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                {/* Font Selector */}
                <div>
                  <label className="text-[11px] text-[var(--muted-foreground)] font-semibold uppercase block mb-1">
                    Font Chữ Nghệ Thuật
                  </label>
                  <select
                    value={typography.fontFamily}
                    onChange={(e) =>
                      updateTypography({
                        fontFamily: e.target.value as CoverFontFamily,
                      })
                    }
                    className="w-full text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] font-medium"
                  >
                    <option value="literata">Literata (Serif Văn học)</option>
                    <option value="lora">Lora (Serif Mềm mại)</option>
                    <option value="merriweather">Merriweather (Serif Đậm nét)</option>
                    <option value="inter">Inter (Sans Hiện đại)</option>
                    <option value="be-vietnam">Be Vietnam Pro (Sans Tiếng Việt)</option>
                  </select>
                </div>

                {/* Position */}
                <div>
                  <label className="text-[11px] text-[var(--muted-foreground)] font-semibold uppercase block mb-1">
                    Vị Trí Bố Cục
                  </label>
                  <select
                    value={typography.position}
                    onChange={(e) =>
                      updateTypography({
                        position: e.target.value as CoverTypographyOptions["position"],
                      })
                    }
                    className="w-full text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] font-medium"
                  >
                    <option value="classic-top">Cổ điển (Tựa trên, Tác giả dưới)</option>
                    <option value="centered">Trung tâm (Tựa ở giữa trang)</option>
                    <option value="modern-bottom">Hiện đại (Dồn phần dưới)</option>
                  </select>
                </div>

                {/* Color Palette */}
                <div>
                  <label className="text-[11px] text-[var(--muted-foreground)] font-semibold uppercase block mb-1">
                    Màu Chữ
                  </label>
                  <div className="flex items-center gap-2 pt-0.5">
                    {[
                      { label: "Vàng kim", color: "#F5D77F" },
                      { label: "Trắng", color: "#FFFFFF" },
                      { label: "Đỏ son", color: "#E63946" },
                      { label: "Xanh ngọc", color: "#00F2FE" },
                      { label: "Đen tuyền", color: "#1A1A1A" },
                    ].map((c) => (
                      <button
                        key={c.color}
                        type="button"
                        onClick={() => updateTypography({ textColor: c.color })}
                        title={c.label}
                        className={`w-7 h-7 rounded-full border-2 transition-all shadow-xs cursor-pointer ${
                          typography.textColor === c.color
                            ? "border-[var(--primary)] scale-110 ring-2 ring-[var(--primary)]/40"
                            : "border-white/40 opacity-80 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: c.color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Toggles: Backdrop Gradient & Drop Shadow */}
              <div className="flex items-center gap-4 pt-1 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typography.hasBackdropGradient}
                    onChange={(e) => updateTypography({ hasBackdropGradient: e.target.checked })}
                    className="rounded border-[var(--border)]"
                  />
                  <span className="text-[11px] text-[var(--foreground)]">
                    Dải gradient tối bảo vệ chữ (Tăng độ dễ đọc)
                  </span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={typography.hasDropShadow}
                    onChange={(e) => updateTypography({ hasDropShadow: e.target.checked })}
                    className="rounded border-[var(--border)]"
                  />
                  <span className="text-[11px] text-[var(--foreground)]">Đổ bóng chữ nổi bật</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Generate Button Action Row */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleGenerateCover}
            disabled={isGenerating}
            className="flex-1 lg-button lg-button--primary text-sm h-10 px-5 gap-2 font-bold shadow-md bg-gradient-to-r from-amber-500 via-[var(--primary)] to-purple-600 hover:from-amber-600 hover:to-purple-700 text-white border-0 cursor-pointer"
          >
            {isGenerating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Wand2 size={16} />
            )}
            <span>
              {isGenerating ? "Đang tạo tác phẩm bìa AI..." : "✨ Bắt Đầu Tạo Bìa Sách Ngay"}
            </span>
          </button>

          {isGenerating && (
            <button
              type="button"
              onClick={handleCancelGeneration}
              className="lg-button lg-button--ghost text-xs h-10 px-4 gap-1.5 text-red-500 hover:bg-red-500/10 cursor-pointer"
            >
              <Ban size={14} />
              <span>Hủy</span>
            </button>
          )}
        </div>
      </div>

      {/* Right Column: Live Cover Preview & Variations History */}
      <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3 min-w-0">
        <span className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
          Xem trước tác phẩm
        </span>

        {/* Big Preview Card */}
        <div className="relative group aspect-[2/3] w-full max-w-[280px] mx-auto rounded-2xl overflow-hidden border-2 border-[var(--border)] bg-[var(--secondary)] shadow-lg flex items-center justify-center">
          {selectedCover ? (
            <img
              src={selectedCover.finalDataUrl}
              alt="Generated AI Cover"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="p-6 text-center flex flex-col items-center justify-center text-[var(--muted-foreground)]">
              <div className="w-12 h-12 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center mb-2 shadow-2xs">
                <ImageIcon size={22} />
              </div>
              <p className="text-xs font-semibold text-[var(--foreground)]">Chưa tạo ảnh bìa AI</p>
              <p className="text-[11px] text-[var(--muted-foreground)] mt-1 max-w-[200px]">
                Chọn phong cách và bấm "Bắt Đầu Tạo Bìa Sách Ngay" để AI sinh tác phẩm độc bản.
              </p>
            </div>
          )}

          {/* Loading overlay while generating or compositing typography */}
          {(isGenerating || isCompositingTypography) && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-2xs flex flex-col items-center justify-center gap-2 text-white p-4 text-center">
              <Loader2 size={28} className="animate-spin text-amber-400" />
              <p className="text-xs font-semibold">
                {isCompositingTypography ? "Đang gắn chữ nghệ thuật..." : "AI đang sáng tác bìa sách..."}
              </p>
              <p className="text-[10px] text-white/70">Tỉ lệ 2:3 chuẩn Ebook quốc tế</p>
            </div>
          )}
        </div>

        {/* Selected Cover Action Buttons */}
        {selectedCover && (
          <div className="space-y-2 max-w-[280px] mx-auto w-full">
            <button
              type="button"
              onClick={() => onApplyCover(selectedCover.finalDataUrl)}
              className="w-full lg-button lg-button--primary text-xs h-8 px-3 gap-1.5 font-semibold shadow-xs"
            >
              <Check size={13} />
              <span>Áp Dụng Làm Ảnh Bìa Cuốn Sách</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadCover(selectedCover)}
                className="flex-1 lg-button lg-button--secondary text-xs h-7 px-2 gap-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <Download size={12} />
                <span>Tải về máy</span>
              </button>

              <button
                type="button"
                onClick={handleGenerateCover}
                disabled={isGenerating}
                className="flex-1 lg-button lg-button--ghost text-xs h-7 px-2 gap-1 text-[var(--primary)]"
              >
                <RefreshCw size={12} />
                <span>Thử vẽ lại</span>
              </button>
            </div>
          </div>
        )}

        {/* Session Variations History */}
        {generatedCovers.length > 0 && (
          <div className="pt-2 border-t border-[var(--border)] max-w-[280px] mx-auto w-full space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
              <span>Các biến thể đã tạo ({generatedCovers.length}):</span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {generatedCovers.map((cov) => (
                <div
                  key={cov.id}
                  onClick={() => setSelectedCover(cov)}
                  className={`w-14 aspect-[2/3] rounded-lg overflow-hidden border-2 cursor-pointer shrink-0 transition-all ${
                    selectedCover?.id === cov.id
                      ? "border-[var(--primary)] scale-105 shadow-sm"
                      : "border-[var(--border)] opacity-70 hover:opacity-100"
                  }`}
                >
                  <img src={cov.finalDataUrl} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
