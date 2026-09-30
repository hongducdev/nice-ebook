import { useState, useRef, useEffect } from "react";
import {
  Wand2,
  Play,
  Square,
  RotateCcw,
  BookOpen,
  CheckCircle2,
  Heading,
  PenTool,
  Trash2,
  Copy,
  Sliders,
  Check,
  Cpu,
  Zap,
  ShieldCheck,
  Activity
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { toast } from "sonner";

export function ChapterEnhancerView() {
  const {
    currentBook,
    activeChapterIndex,
    setActiveChapterIndex,
    setActiveTab,
    activeGateway,
    selectedModel,
    aiEngineMode,
    setAiEngineMode,
    fallbackModels,
    isFallbackEnabled,
    setIsFallbackEnabled,
    modifiedChapters,
    chapterEnhanceReports,
    modelTestResults,
    validateAndFilterFallbackModels,
    isBatchEnhancing,
    enhanceProgress,
    terminalLogs,
    clearTerminalLogs,
    resetChapterOverrides,
    enhanceSingleChapter,
    batchEnhanceChapters,
    stopBatchEnhance,
    cleanWatermarksInBook,
  } = useAppStore();

  const [scope, setScope] = useState<"unprocessed" | "all" | "single">("unprocessed");
  const [skipAlreadyEnhanced, setSkipAlreadyEnhanced] = useState(true);
  const [forceReprocessSingle, setForceReprocessSingle] = useState(false);
  const [isCheckingFallback, setIsCheckingFallback] = useState(false);
  const [standardizeH1, setStandardizeH1] = useState(true);
  const [cleanTopJunk, setCleanTopJunk] = useState(true);
  const [addHeadings, setAddHeadings] = useState(true);
  const [fixVietnameseTypos, setFixVietnameseTypos] = useState(true);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [isProcessingSingle, setIsProcessingSingle] = useState(false);
  const [isCleaningWatermarks, setIsCleaningWatermarks] = useState(false);
  const [customWatermarkInput, setCustomWatermarkInput] = useState("dtv-ebook, dtv-ebook.com");

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Auto scroll terminal log to bottom on new lines without animation stutter
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [terminalLogs]);

  // Aggregate statistics across reports
  const reportsList = Object.values(chapterEnhanceReports);
  const totalHeadingsAdded = reportsList.reduce((acc, r) => acc + (r.headingsCount || 0), 0);
  const totalTyposFixed = reportsList.reduce((acc, r) => acc + (r.typosFixedCount || 0), 0);
  const totalJunkCleaned = reportsList.reduce((acc, r) => acc + (r.cleanedTopIndices?.length || 0), 0);
  const modifiedCount = Object.keys(modifiedChapters).length;
  const totalChapters = currentBook?.chapter_count || 0;
  const processedHrefs = new Set(Object.keys(modifiedChapters));
  const unprocessedCount = currentBook?.chapters.filter((ch) => !processedHrefs.has(ch.href)).length || 0;

  async function handleCheckFallbackChain() {
    setIsCheckingFallback(true);
    toast.loading("Đang kiểm tra lỗi kết nối các mô hình dự phòng...", { id: "check-fallback" });
    try {
      const verified = await validateAndFilterFallbackModels();
      const removedCount = fallbackModels.length - verified.length;
      if (removedCount > 0) {
        toast.warning(`Đã tự động loại ${removedCount} mô hình bị lỗi khỏi chuỗi dự phòng!`, { id: "check-fallback" });
      } else {
        toast.success("Tất cả các mô hình trong chuỗi dự phòng đều hoạt động tốt (không lỗi)!", { id: "check-fallback" });
      }
    } catch (err) {
      toast.error(`Lỗi khi kiểm tra chuỗi fallback: ${err}`, { id: "check-fallback" });
    } finally {
      setIsCheckingFallback(false);
    }
  }

  async function handleCleanWatermarks() {
    if (!currentBook) {
      toast.error("Vui lòng mở một cuốn sách trước khi làm sạch watermark.");
      return;
    }

    setIsCleaningWatermarks(true);
    toast.loading("Đang quét và làm sạch watermark trên toàn bộ các chương...", { id: "clean-wm" });

    try {
      const customKws = customWatermarkInput
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const result = await cleanWatermarksInBook(customKws);
      if (result.affectedChapters > 0 || result.removedCount > 0) {
        toast.success(
          `Đã xóa sạch ${result.removedCount} đoạn watermark/header rác trong ${result.affectedChapters} chương!`,
          { id: "clean-wm" }
        );
      } else {
        toast.info("Không phát hiện thêm watermark nào trong sách.", { id: "clean-wm" });
      }
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi làm sạch watermark", { id: "clean-wm" });
    } finally {
      setIsCleaningWatermarks(false);
    }
  }

  async function handleStartEnhance() {
    if (!currentBook) {
      toast.error("Vui lòng mở một cuốn sách trước khi thực hiện biên tập AI");
      return;
    }

    const features = {
      standardizeH1,
      cleanTopJunk,
      addHeadings,
      fixVietnameseTypos,
    };

    if (scope === "single") {
      const activeCh = currentBook.chapters[activeChapterIndex];
      const isAlreadyDone = activeCh && Boolean(modifiedChapters[activeCh.href]);

      if (isAlreadyDone && !forceReprocessSingle) {
        toast.info(`Chương ${activeChapterIndex + 1} đã được xử lý trước đó trong dự án. Bật "Biên tập lại từ đầu" nếu muốn làm lại.`, { id: "enhance-ch" });
        return;
      }

      setIsProcessingSingle(true);
      toast.loading(`Đang xử lý chương ${activeChapterIndex + 1}...`, { id: "enhance-ch" });
      try {
        const ok = await enhanceSingleChapter(activeChapterIndex, features, {
          forceReprocess: forceReprocessSingle,
        });
        if (ok) {
          toast.success(`Đã chuẩn hóa chương ${activeChapterIndex + 1}!`, { id: "enhance-ch" });
        } else {
          toast.error(`Xử lý chương thất bại. Vui lòng kiểm tra log bên dưới.`, { id: "enhance-ch" });
        }
      } finally {
        setIsProcessingSingle(false);
      }
    } else {
      let targetIndices: number[] | undefined = undefined;

      if (scope === "unprocessed") {
        targetIndices = currentBook.chapters
          .map((ch, idx) => (!processedHrefs.has(ch.href) ? idx : -1))
          .filter((idx) => idx !== -1);

        if (targetIndices.length === 0) {
          toast.success("Tất cả các chương đều đã được xử lý xong trong dự án! Không cần làm lại.");
          return;
        }

        toast.info(`Bắt đầu xử lý ${targetIndices.length} chương còn dang dở trong dự án...`);
      } else {
        toast.info(`Bắt đầu xử lý ${currentBook.chapter_count} chương...`);
      }

      const completed = await batchEnhanceChapters(targetIndices, features, {
        skipAlreadyEnhanced: scope === "all" ? skipAlreadyEnhanced : false,
      });

      if (completed) {
        toast.success("Hoàn tất tiến trình biên tập AI!");
      }
    }
  }

  function handleCopyLogs() {
    if (terminalLogs.length === 0) return;
    const text = terminalLogs.map((l) => l.text).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedLogs(false), 2000);
    toast.success("Đã sao chép log vào clipboard");
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--background)]">
      {/* Top Header */}
      <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--card)]/40 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[color-mix(in_srgb,var(--primary)_15%,var(--card))] border border-[var(--primary)] flex items-center justify-center text-[var(--primary)] shadow-xs">
            <Wand2 size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-[var(--foreground)]">
                Bước 3: Biên Tập &amp; Soát Lỗi AI
              </h1>
              <span className="app-badge app-badge--brand text-[10px] font-mono h-[18px]">
                {selectedModel || "gemini-3.6-flash"}
              </span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              Chuẩn hóa H1, dọn dẹp thẻ top rác, chèn heading H2/H3 phân cấp và sửa lỗi chính tả tiếng Việt.
            </p>
          </div>
        </div>

        {/* Top actions */}
        <div className="flex items-center gap-2">
          {modifiedCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("reader")}
              className="h-8 px-3 rounded-[var(--ui-radius-button)] bg-[var(--secondary)] hover:bg-[color-mix(in_srgb,var(--secondary)_80%,var(--foreground)_20%)] active:scale-[0.98] border border-[var(--border)] text-xs font-medium text-[var(--foreground)] flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              title="Xem trực tiếp các chương đã biên tập"
            >
              <BookOpen size={13} className="text-[var(--primary)]" />
              <span>Xem Trình Đọc</span>
            </button>
          )}

          {modifiedCount > 0 && (
            <button
              type="button"
              onClick={resetChapterOverrides}
              className="h-8 px-2.5 rounded-[var(--ui-radius-button)] bg-red-500/10 hover:bg-red-500/20 active:scale-[0.98] border border-red-500/30 text-xs font-medium text-red-400 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Hoàn tác tất cả các thay đổi nội dung"
            >
              <RotateCcw size={13} />
              <span>Hoàn Tác</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Split into Controls & Terminal Output */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Control Panel */}
        <div className="w-full lg:w-[380px] border-r border-[var(--border)] flex flex-col p-4 gap-4 overflow-y-auto flex-shrink-0 bg-[var(--background)]">
          {/* Book / Target Scope */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider">
              Phạm Vi Xử Lý
            </label>
            <div className="segmented-toggle w-full">
              <button
                type="button"
                data-active={scope === "unprocessed" ? "true" : undefined}
                onClick={() => setScope("unprocessed")}
                className="segmented-toggle__item flex-1 py-1.5 text-xs font-medium"
                title="Chỉ biên tập các chương chưa được xử lý trong dự án"
              >
                Chưa làm ({unprocessedCount})
              </button>
              <button
                type="button"
                data-active={scope === "all" ? "true" : undefined}
                onClick={() => setScope("all")}
                className="segmented-toggle__item flex-1 py-1.5 text-xs font-medium"
                title="Duyệt qua tất cả các chương trong sách"
              >
                Tất cả ({totalChapters})
              </button>
              <button
                type="button"
                data-active={scope === "single" ? "true" : undefined}
                onClick={() => setScope("single")}
                className="segmented-toggle__item flex-1 py-1.5 text-xs font-medium"
              >
                Đơn lẻ
              </button>
            </div>

            {scope === "all" && modifiedCount > 0 && (
              <label className="flex items-center gap-2 mt-1 px-1 text-[11px] text-[var(--muted-foreground)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={skipAlreadyEnhanced}
                  onChange={(e) => setSkipAlreadyEnhanced(e.target.checked)}
                  className="rounded border-[var(--border)] text-[var(--primary)] focus:ring-0"
                />
                <span>Kiểm tra &amp; bỏ qua các chương đã làm ({modifiedCount} chương)</span>
              </label>
            )}

            {scope === "single" && currentBook && (
              <div className="mt-1 flex flex-col gap-1.5">
                <label className="text-[11px] text-[var(--muted-foreground)] block">
                  Chọn chương cần biên tập:
                </label>
                <select
                  value={activeChapterIndex}
                  onChange={(e) => {
                    setActiveChapterIndex(Number(e.target.value));
                    setForceReprocessSingle(false);
                  }}
                  className="w-full text-xs p-2 rounded border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)] font-mono"
                >
                  {currentBook.chapters.map((ch, idx) => {
                    const isDone = Boolean(modifiedChapters[ch.href]);
                    return (
                      <option key={ch.href} value={idx}>
                        [{idx + 1}] {ch.title} {isDone ? "✓ (Đã làm)" : ""}
                      </option>
                    );
                  })}
                </select>

                {currentBook.chapters[activeChapterIndex] &&
                  modifiedChapters[currentBook.chapters[activeChapterIndex].href] && (
                    <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 flex flex-col gap-1 text-[11px]">
                      <div className="text-emerald-400 font-medium flex items-center gap-1">
                        <Check size={12} />
                        <span>Chương này đã hoàn thành và lưu trong dự án.</span>
                      </div>
                      <label className="flex items-center gap-1.5 text-[var(--muted-foreground)] cursor-pointer select-none mt-0.5">
                        <input
                          type="checkbox"
                          checked={forceReprocessSingle}
                          onChange={(e) => setForceReprocessSingle(e.target.checked)}
                          className="rounded border-[var(--border)] text-[var(--primary)] focus:ring-0"
                        />
                        <span>Biên tập lại từ đầu (Ghi đè nội dung gốc)</span>
                      </label>
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* AI Acceleration Engine (Jev Verdict 2.0 vs Hybrid vs Cloud) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider flex items-center gap-1.5">
                <Zap size={13} className="text-[var(--primary)]" />
                <span>Động Cơ AI (Engine)</span>
              </label>
              <span className="app-badge app-badge--brand text-[9px] px-1 font-mono">Offline Core</span>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setAiEngineMode("hybrid")}
                className={`p-2 rounded border text-left transition-all cursor-pointer ${
                  aiEngineMode === "hybrid"
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 shadow-xs"
                    : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--accent)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                    ⚡🌐 Hybrid (Khuyên dùng)
                  </span>
                  {aiEngineMode === "hybrid" && <Check size={12} className="text-[var(--primary)]" />}
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5 leading-snug">
                  Lõi cục bộ lọc rác &amp; sửa lỗi nhanh; chỉ chuyển tiếp câu từ phức tạp lên Cloud LLM (tiết kiệm ~80% token).
                </p>
              </button>

              <button
                type="button"
                onClick={() => setAiEngineMode("jev-verdict")}
                className={`p-2 rounded border text-left transition-all cursor-pointer ${
                  aiEngineMode === "jev-verdict"
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 shadow-xs"
                    : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--accent)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                    ⚡ Tự động Offline (~15ms)
                  </span>
                  {aiEngineMode === "jev-verdict" && <Check size={12} className="text-[var(--primary)]" />}
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5 leading-snug">
                  100% Offline trên Rust, không cần API key, không bị Rate Limit, xử lý toàn bộ sách trong vài giây.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setAiEngineMode("gateway")}
                className={`p-2 rounded border text-left transition-all cursor-pointer ${
                  aiEngineMode === "gateway"
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 shadow-xs"
                    : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--accent)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                    🌐 Cloud AI Gateway Thuần
                  </span>
                  {aiEngineMode === "gateway" && <Check size={12} className="text-[var(--primary)]" />}
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5 leading-snug">
                  Gửi toàn bộ văn bản chương lên mô hình đám mây (Gemini, Claude, 9router).
                </p>
              </button>
            </div>
          </div>

          {/* Model & Gateway Selection */}
          <div className="p-3 rounded border border-[var(--border)] bg-[var(--card)] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                <Cpu size={14} className="text-[var(--primary)]" />
                <span>AI Gateway & Model</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("ai")}
                className="text-[10px] text-[var(--primary)] hover:underline"
              >
                Đổi Model
              </button>
            </div>
            <div className="text-xs text-[var(--muted-foreground)] flex items-center justify-between">
              <span>Cổng kết nối:</span>
              <span className="font-mono text-[var(--foreground)] font-medium">
                {activeGateway ? activeGateway.name : "9router (Local)"}
              </span>
            </div>
            <div className="text-xs text-[var(--muted-foreground)] flex items-center justify-between">
              <span>Mô hình chỉ định:</span>
              <span className="font-mono text-[var(--primary)] font-semibold truncate max-w-[180px]">
                {selectedModel || "gemini-3.6-flash"}
              </span>
            </div>
          </div>

          {/* Model Fallback Configuration */}
          <div className="p-3 rounded border border-[var(--border)] bg-[var(--card)] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isFallbackEnabled}
                  onChange={(e) => setIsFallbackEnabled(e.target.checked)}
                  className="rounded border-[var(--border)] text-[var(--primary)] focus:ring-0"
                />
                <span className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  <span>Cơ Chế Dự Phòng (Fallback)</span>
                </span>
              </label>
              <span className="app-badge app-badge--success text-[9px] px-1 font-mono">Zero-Fail</span>
            </div>

            {isFallbackEnabled && (
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--muted-foreground)]">
                    Chuỗi mô hình dự phòng (theo Gateway):
                  </span>
                  <button
                    type="button"
                    onClick={handleCheckFallbackChain}
                    disabled={isCheckingFallback}
                    className="text-[10px] font-medium text-[var(--primary)] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title="Kiểm tra kết nối và loại bỏ các mô hình lỗi khỏi chuỗi dự phòng"
                  >
                    <Activity size={10} className={isCheckingFallback ? "animate-spin" : ""} />
                    <span>{isCheckingFallback ? "Đang kiểm tra..." : "Kiểm tra lỗi"}</span>
                  </button>
                </div>

                <div className="flex flex-col gap-1 font-mono text-[10px] bg-[var(--background)] p-2 rounded border border-[var(--border)]">
                  <div className="flex items-center justify-between gap-1.5 text-[var(--primary)] font-semibold">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-3 text-center">1.</span>
                      <span className="truncate">{selectedModel || "gemini-3.6-flash"}</span>
                      <span className="text-[9px] opacity-75 font-sans font-normal">(Chính)</span>
                    </div>
                    {modelTestResults[selectedModel || ""] && (
                      <span
                        className={`text-[8px] font-mono px-1 py-0.2 rounded ${
                          modelTestResults[selectedModel || ""].success
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                        title={modelTestResults[selectedModel || ""].message}
                      >
                        {modelTestResults[selectedModel || ""].success
                          ? `${modelTestResults[selectedModel || ""].latencyMs}ms`
                          : "Lỗi"}
                      </span>
                    )}
                  </div>
                  {fallbackModels.map((m, idx) => {
                    const test = modelTestResults[m];
                    return (
                      <div key={m} className="flex items-center justify-between gap-1.5 text-[var(--muted-foreground)]">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="w-3 text-center">{idx + 2}.</span>
                          <span className="truncate">{m}</span>
                          <span className="text-[9px] opacity-60 font-sans">
                            {m === "jev-verdict-2.0" ? "(Rust Offline)" : "(Dự phòng)"}
                          </span>
                        </div>
                        {test && (
                          <span
                            className={`text-[8px] font-mono px-1 py-0.2 rounded ${
                              test.success
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-red-500/20 text-red-400"
                            }`}
                            title={test.message}
                          >
                            {test.success ? `${test.latencyMs}ms` : "Lỗi"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Feature Toggles */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider flex items-center gap-1.5">
              <Sliders size={13} />
              <span>Chức Năng Kích Hoạt</span>
            </label>

            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-2.5 p-2 rounded hover:bg-[var(--card)] cursor-pointer select-none border border-transparent hover:border-[var(--border)] transition-colors">
                <input
                  type="checkbox"
                  checked={standardizeH1}
                  onChange={(e) => setStandardizeH1(e.target.checked)}
                  className="mt-0.5 rounded border-[var(--border)] text-[var(--primary)] focus:ring-0"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-[var(--foreground)] flex items-center gap-1">
                    ✅ Chuẩn Hóa H1 Tiêu Đề
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    Tự động nhận diện và đặt lại H1 chuẩn trang trọng cho từng chương.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2 rounded hover:bg-[var(--card)] cursor-pointer select-none border border-transparent hover:border-[var(--border)] transition-colors">
                <input
                  type="checkbox"
                  checked={cleanTopJunk}
                  onChange={(e) => setCleanTopJunk(e.target.checked)}
                  className="mt-0.5 rounded border-[var(--border)] text-[var(--primary)] focus:ring-0"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-[var(--foreground)] flex items-center gap-1">
                    🗑️ Dọn Dẹp Các Thẻ Top Rác
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    Xóa bỏ các dòng thừa, tiêu đề sách lặp lại ở đầu chương (index 0, 1, 2...).
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2 rounded hover:bg-[var(--card)] cursor-pointer select-none border border-transparent hover:border-[var(--border)] transition-colors">
                <input
                  type="checkbox"
                  checked={addHeadings}
                  onChange={(e) => setAddHeadings(e.target.checked)}
                  className="mt-0.5 rounded border-[var(--border)] text-[var(--primary)] focus:ring-0"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-[var(--foreground)] flex items-center gap-1">
                    📌 Bổ Sung Heading Phân Cấp (H2/H3)
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    Chia nhỏ văn bản dài thành các mục lớn (H2) và tiểu mục phương pháp (H3).
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2 rounded hover:bg-[var(--card)] cursor-pointer select-none border border-transparent hover:border-[var(--border)] transition-colors">
                <input
                  type="checkbox"
                  checked={fixVietnameseTypos}
                  onChange={(e) => setFixVietnameseTypos(e.target.checked)}
                  className="mt-0.5 rounded border-[var(--border)] text-[var(--primary)] focus:ring-0"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-[var(--foreground)] flex items-center gap-1">
                    ✍️ Sửa Lỗi Chính Tả Tiếng Việt
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    Sửa lỗi gõ dấu, dấu hỏi/ngã (tiêu sử -&gt; tiểu sử), nhầm lẫn ký tự, sai phụ âm.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Watermark & Header/Footer Cleaner Card */}
          <div className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--card)] flex flex-col gap-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                <Trash2 size={14} className="text-amber-500" />
                <span>Làm Sạch Watermark &amp; Header/Footer</span>
              </div>
              <span className="app-badge app-badge--brand text-[9px] px-1 font-mono">DTV &bull; TVE-4U</span>
            </div>

            <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
              Tự động loại bỏ các đoạn watermark, dấu bản quyền web (dtv-ebook, tve-4u, truyenfull...) và số trang thừa ở đầu/cuối chương.
            </p>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--muted-foreground)]">Từ khóa / Tên miền watermark bổ sung:</label>
              <input
                type="text"
                value={customWatermarkInput}
                onChange={(e) => setCustomWatermarkInput(e.target.value)}
                placeholder="vd: dtv-ebook, dtv-ebook.com"
                className="w-full text-xs px-2.5 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] focus:outline-hidden focus:border-[var(--primary)]"
              />
            </div>

            <button
              type="button"
              disabled={isCleaningWatermarks || !currentBook}
              onClick={handleCleanWatermarks}
              className="app-button app-button--secondary text-xs flex items-center justify-center gap-1.5 mt-1"
            >
              <Trash2 size={13} className="text-amber-500" />
              <span>{isCleaningWatermarks ? "Đang quét..." : "Quét & Xóa Sạch Watermark (Toàn Sách)"}</span>
            </button>
          </div>

          {/* Action Trigger Button */}
          <div className="mt-auto pt-4 border-t border-[var(--border)] flex flex-col gap-2">
            {isBatchEnhancing ? (
              <button
                type="button"
                onClick={stopBatchEnhance}
                className="w-full h-11 px-4 py-2.5 rounded-[var(--ui-radius-button)] bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-red-950/40 border-2 border-red-400 transition-all cursor-pointer ring-2 ring-red-500/50 animate-pulse"
              >
                <Square size={16} className="fill-white" />
                <span>Dừng Tiến Trình</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartEnhance}
                disabled={!currentBook || isProcessingSingle}
                className="w-full h-11 px-4 py-2.5 rounded-[var(--ui-radius-button)] bg-[var(--primary)] hover:brightness-110 active:scale-[0.99] text-[var(--primary-foreground)] font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-[var(--primary)]/25 border border-[var(--primary)] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play size={16} className="fill-current" />
                <span>{isProcessingSingle ? "Đang Xử Lý..." : "Bắt Đầu Xử Lý AI"}</span>
              </button>
            )}

            {enhanceProgress && (
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex justify-between text-[11px] text-[var(--muted-foreground)]">
                  <span>Tiến trình xử lý:</span>
                  <span className="font-mono font-medium text-[var(--foreground)]">
                    {enhanceProgress.current} / {enhanceProgress.total}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[var(--secondary)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--primary)] transition-all duration-300"
                    style={{
                      width: `${(enhanceProgress.current / enhanceProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Terminal Console Viewer */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117] text-[#c9d1d9] overflow-hidden">
          {/* Quick Metrics & Controls Header */}
          <div className="px-4 py-2 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between gap-4 text-xs font-mono select-none flex-shrink-0">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1 text-[#58a6ff]">
                <CheckCircle2 size={13} />
                <span>Chương đã sửa: {modifiedCount}/{currentBook?.chapter_count || 0}</span>
              </div>
              <div className="flex items-center gap-1 text-[#7ee787]">
                <Heading size={13} />
                <span>Heading bổ sung: +{totalHeadingsAdded}</span>
              </div>
              <div className="flex items-center gap-1 text-[#f2cc60]">
                <PenTool size={13} />
                <span>Lỗi chính tả sửa: {totalTyposFixed}</span>
              </div>
              <div className="flex items-center gap-1 text-[#8b949e]">
                <span>Top rác đã dọn: {totalJunkCleaned}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLogs}
                title="Sao chép toàn bộ log"
                className="p-1.5 rounded text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] transition-colors cursor-pointer"
              >
                {copiedLogs ? <Check size={13} className="text-[#3fb950]" /> : <Copy size={13} />}
              </button>
              <button
                type="button"
                onClick={clearTerminalLogs}
                title="Xóa màn hình console"
                className="p-1.5 rounded text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Console Log Area */}
          <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1.5 leading-relaxed selection:bg-[#264f78]">
            {terminalLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#8b949e] text-center p-6 gap-2">
                <Wand2 size={28} className="opacity-40" />
                <p className="text-xs">
                  Chưa có tiến trình biên tập nào được ghi lại.
                </p>
                <p className="text-[11px] opacity-75 max-w-sm">
                  Chọn các tùy chọn bên trái rồi nhấn <span className="text-[#58a6ff]">"Bắt Đầu Xử Lý AI"</span> để chuẩn hóa H1, thêm heading H2/H3 và sửa lỗi chính tả.
                </p>
              </div>
            ) : (
              terminalLogs.map((log) => {
                let colorClass = "text-[#c9d1d9]";
                if (log.type === "warning") colorClass = "text-[#d29922]"; // Amber / Yellow
                else if (log.type === "success") colorClass = "text-[#3fb950]"; // Green
                else if (log.type === "info") {
                  if (log.text.includes("⌛")) colorClass = "text-[#f0f6fc] font-semibold";
                  else if (log.text.includes("📌")) colorClass = "text-[#79c0ff] font-semibold";
                  else if (log.text.includes("✍️")) colorClass = "text-[#e3b341] font-semibold";
                } else if (log.type === "detail") {
                  if (log.text.includes("+ [H")) colorClass = "text-[#a5d6ff]";
                  else if (log.text.includes("* [p_")) colorClass = "text-[#e6edf3]";
                  else colorClass = "text-[#8b949e]";
                }

                return (
                  <div key={log.id} className={`${colorClass} whitespace-pre-wrap break-all`}>
                    {log.text}
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
