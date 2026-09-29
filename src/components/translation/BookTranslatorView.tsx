import { useState, useRef, useEffect, useMemo } from "react";
import {
  Languages,
  Play,
  Square,
  RotateCcw,
  BookOpenCheck,
  Trash2,
  Copy,
  Check,
  BookOpen,
  ArrowRightLeft,
  Sliders,
  Sparkles,
  Layers,
  Plus,
  Terminal,
  Eye
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { TONE_DESCRIPTIONS, TranslationTone } from "../../services/prompts/bookTranslator";
import { generateEpubCss, injectCssIntoHtml } from "../../utils/cssGenerator";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";

const SOURCE_LANGUAGES = [
  "Tiếng Anh (English)",
  "Tiếng Trung (Chinese)",
  "Tiếng Nhật (Japanese)",
  "Tiếng Pháp (French)",
  "Tiếng Hàn (Korean)",
  "Tiếng Đức (German)",
  "Tiếng Nga (Russian)",
  "Tiếng Tây Ban Nha (Spanish)",
];

const TARGET_LANGUAGES = [
  "Tiếng Việt (Vietnamese)",
  "Tiếng Anh (English)",
  "Tiếng Trung (Chinese)",
  "Tiếng Pháp (French)",
];

export function BookTranslatorView() {
  const {
    currentBook,
    currentFilePath,
    currentFileBytes,
    activeChapterIndex,
    setActiveChapterIndex,
    setActiveTab,
    activeGateway,
    selectedModel,
    modifiedChapters,
    translationConfig,
    setTranslationConfig,
    translationProgress,
    isTranslating,
    translateSingleChapter,
    batchTranslateChapters,
    stopTranslation,
    resetChapterTranslation,
    terminalLogs,
    clearTerminalLogs,
    activePreset,
    customCss,
    fontFamily,
  } = useAppStore();

  const [scope, setScope] = useState<"single" | "unprocessed" | "all">("single");
  const [rightTab, setRightTab] = useState<"preview" | "terminal">("preview");
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Glossary input state
  const [newTermKey, setNewTermKey] = useState("");
  const [newTermVal, setNewTermVal] = useState("");
  const [showGlossary, setShowGlossary] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fullCss = useMemo(() => {
    const base = generateEpubCss({
      preset: activePreset,
      fontSize: 16,
      lineHeight: 1.7,
      firstLineIndent: "2em",
      dropCaps: false,
      textAlign: "justify",
      sceneDivider: "* * *",
      customOverrides: customCss,
      isVietnamese: true,
      fontFamily,
    });
    const bilingualRules = `
      .bilingual-original {
        color: #71717a !important;
        font-size: 0.95em !important;
        margin-bottom: 0.25em !important;
        opacity: 0.85;
      }
      .bilingual-translated {
        color: inherit !important;
        font-weight: 500 !important;
        margin-bottom: 1.2em !important;
      }
    `;
    return base + bilingualRules;
  }, [activePreset, customCss, fontFamily]);

  useEffect(() => {
    if (!iframeRef.current || rightTab !== "preview") return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    const fullDoc = injectCssIntoHtml(previewHtml, fullCss);
    doc.open();
    doc.write(fullDoc);
    doc.close();
  }, [previewHtml, fullCss, rightTab]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Auto-scroll terminal log
  useEffect(() => {
    if (rightTab === "terminal" && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [terminalLogs, rightTab]);

  const activeChapter = currentBook?.chapters[activeChapterIndex];
  const isCurrentChapterTranslated = Boolean(activeChapter && modifiedChapters[activeChapter.href]);

  // Load preview HTML whenever activeChapterIndex or modifiedChapters changes
  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      if (!currentBook || !activeChapter) {
        setPreviewHtml("");
        return;
      }

      if (modifiedChapters[activeChapter.href]) {
        setPreviewHtml(modifiedChapters[activeChapter.href]);
        return;
      }

      setIsLoadingPreview(true);
      try {
        let raw = "";
        if (currentFilePath) {
          raw = await invoke<string>("read_chapter", {
            path: currentFilePath,
            href: activeChapter.href,
          });
        } else if (currentFileBytes) {
          raw = await invoke<string>("read_chapter_bytes", {
            bytes: currentFileBytes,
            href: activeChapter.href,
          });
        }
        if (!cancelled) {
          setPreviewHtml(raw);
        }
      } catch (err) {
        console.error("Preview load error:", err);
      } finally {
        if (!cancelled) {
          setIsLoadingPreview(false);
        }
      }
    }

    loadPreview();

    return () => {
      cancelled = true;
    };
  }, [activeChapterIndex, currentBook, currentFilePath, currentFileBytes, modifiedChapters]);

  // Aggregate statistics
  const totalChapters = currentBook?.chapter_count || 0;
  const translatedCount = useMemo(() => {
    if (!currentBook) return 0;
    return currentBook.chapters.filter((ch) => Boolean(modifiedChapters[ch.href])).length;
  }, [currentBook, modifiedChapters]);

  const unprocessedCount = totalChapters - translatedCount;

  // Handle start translation
  async function handleStartTranslation() {
    if (!currentBook) {
      toast.error("Vui lòng mở một cuốn sách để bắt đầu dịch!");
      return;
    }

    if (scope === "single") {
      toast.loading(`Đang dịch chương ${activeChapterIndex + 1}: "${activeChapter?.title}"...`, {
        id: "trans-run",
      });
      const ok = await translateSingleChapter(activeChapterIndex);
      if (ok) {
        toast.success(`Đã dịch xong chương ${activeChapterIndex + 1}!`, { id: "trans-run" });
      } else {
        toast.error("Quá trình dịch bị lỗi hoặc đã dừng.", { id: "trans-run" });
      }
    } else if (scope === "unprocessed") {
      toast.loading(`Đang chuẩn bị dịch ${unprocessedCount} chương chưa xử lý...`, { id: "trans-run" });
      const ok = await batchTranslateChapters(undefined, true);
      if (ok) {
        toast.success("Đã hoàn thành lượt dịch hàng loạt!", { id: "trans-run" });
      }
    } else {
      toast.loading(`Đang chuẩn bị dịch toàn bộ ${totalChapters} chương...`, { id: "trans-run" });
      const ok = await batchTranslateChapters(undefined, false);
      if (ok) {
        toast.success("Đã hoàn thành dịch toàn bộ cuốn sách!", { id: "trans-run" });
      }
    }
  }

  // Handle copy terminal logs
  function handleCopyLogs() {
    if (terminalLogs.length === 0) return;
    const text = terminalLogs
      .map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.text}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    toast.success("Đã sao chép toàn bộ nhật ký log");
    copyTimerRef.current = setTimeout(() => setCopiedLogs(false), 2000);
  }

  // Handle add term to glossary
  function handleAddGlossaryTerm() {
    const k = newTermKey.trim();
    const v = newTermVal.trim();
    if (!k || !v) {
      toast.warning("Vui lòng điền cả thuật ngữ gốc và bản dịch!");
      return;
    }
    const currentGlossary = translationConfig.glossary || {};
    setTranslationConfig({
      glossary: { ...currentGlossary, [k]: v },
    });
    setNewTermKey("");
    setNewTermVal("");
    toast.success(`Đã thêm thuật ngữ: "${k}" ➔ "${v}"`);
  }

  // Handle remove term from glossary
  function handleRemoveGlossaryTerm(key: string) {
    const updated = { ...(translationConfig.glossary || {}) };
    delete updated[key];
    setTranslationConfig({ glossary: updated });
    toast.info(`Đã xóa thuật ngữ: "${key}"`);
  }

  // Handle swap languages
  function handleSwapLanguages() {
    const src = translationConfig.sourceLang;
    const tgt = translationConfig.targetLang;
    setTranslationConfig({
      sourceLang: tgt,
      targetLang: src,
    });
  }

  if (!currentBook) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none animate-in fade-in duration-200">
        <div className="w-16 h-16 rounded-2xl bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)] mb-4 shadow-sm">
          <Languages size={32} />
        </div>
        <h2 className="text-base font-semibold text-[var(--foreground)] mb-1">
          Chưa Có Cuốn Sách Nào Được Mở
        </h2>
        <p className="text-xs text-[var(--muted-foreground)] max-w-md mb-5 leading-relaxed">
          Vui lòng mở một file sách EPUB hoặc nạp từ Trình Chuyển Đổi Ebook để sử dụng chức năng Dịch Thuật AI.
        </p>
        <button
          type="button"
          onClick={() => setActiveTab("books")}
          className="lg-button lg-button--primary text-xs h-9 px-4 gap-2 font-medium shadow-sm"
        >
          <BookOpen size={14} />
          <span>Đến Thư Viện Quản Lý Sách</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--background)]">
      {/* Top Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card)]/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_15%,var(--card))] text-[var(--primary)] border border-[var(--primary)]/30">
            <Languages size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-semibold text-[var(--foreground)] leading-none">
                Dịch Thuật Sách AI
              </h1>
              <span className="app-badge app-badge--brand text-[9px] px-1.5 h-4">
                Surgical XHTML Preserved
              </span>
              {isCurrentChapterTranslated && (
                <span className="app-badge app-badge--success text-[9px] px-1.5 h-4">
                  Chương này đã dịch
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
              Tác phẩm: <strong className="text-[var(--foreground)] font-medium">{currentBook.title}</strong>
            </p>
          </div>
        </div>

        {/* Header Stats & Gateway indicator */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-[var(--secondary)]/60 px-2.5 py-1 rounded-md border border-[var(--border)] text-[11px]">
            <Layers size={13} className="text-[var(--primary)]" />
            <span className="text-[var(--muted-foreground)]">Đã dịch:</span>
            <strong className="text-[var(--foreground)]">{translatedCount}/{totalChapters} ch.</strong>
          </div>

          <div className="flex items-center gap-1.5 bg-[var(--secondary)]/60 px-2.5 py-1 rounded-md border border-[var(--border)] text-[11px]">
            <Sparkles size={13} className="text-[var(--primary)]" />
            <span className="text-[var(--muted-foreground)]">Model:</span>
            <strong className="text-[var(--foreground)] font-mono text-[10px]">
              {selectedModel || (activeGateway ? activeGateway.models[0] : "Ollama/Local")}
            </strong>
          </div>
        </div>
      </header>

      {/* Main Body Split: Left Settings & Controls (360px), Right Preview / Logs (flex-1) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Control Panel */}
        <div className="w-[360px] flex-shrink-0 border-r border-[var(--border)] bg-[var(--card)]/30 flex flex-col overflow-y-auto p-4 gap-4">
          {/* Section 1: Language Pairs */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              1. Cặp ngôn ngữ
            </span>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-[10px] text-[var(--muted-foreground)] font-medium">Ngôn ngữ nguồn</label>
                <select
                  value={translationConfig.sourceLang}
                  onChange={(e) => setTranslationConfig({ sourceLang: e.target.value })}
                  className="w-full text-xs bg-[var(--secondary)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[var(--foreground)] outline-none focus:border-[var(--primary)] transition-colors cursor-pointer"
                >
                  {SOURCE_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleSwapLanguages}
                className="mt-4 p-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--accent)] hover:text-[var(--primary)] text-[var(--muted-foreground)] transition-colors cursor-pointer"
                title="Đảo ngược cặp ngôn ngữ"
              >
                <ArrowRightLeft size={13} />
              </button>

              <div className="flex-1 flex flex-col gap-1">
                <label className="text-[10px] text-[var(--muted-foreground)] font-medium">Ngôn ngữ đích</label>
                <select
                  value={translationConfig.targetLang}
                  onChange={(e) => setTranslationConfig({ targetLang: e.target.value })}
                  className="w-full text-xs bg-[var(--secondary)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[var(--foreground)] outline-none focus:border-[var(--primary)] transition-colors cursor-pointer"
                >
                  {TARGET_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Layout Presentation Mode */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              2. Chế độ hiển thị
            </span>
            <div className="segmented-toggle w-full">
              <button
                type="button"
                data-active={translationConfig.mode === "replace" ? "true" : undefined}
                onClick={() => setTranslationConfig({ mode: "replace" })}
                className="segmented-toggle__item flex-1 text-center py-1.5 text-xs"
              >
                Chỉ bản dịch (Thay thế)
              </button>
              <button
                type="button"
                data-active={translationConfig.mode === "bilingual" ? "true" : undefined}
                onClick={() => setTranslationConfig({ mode: "bilingual" })}
                className="segmented-toggle__item flex-1 text-center py-1.5 text-xs"
              >
                Song ngữ đối chiếu
              </button>
            </div>
            <p className="text-[10px] text-[var(--muted-foreground)] leading-relaxed">
              {translationConfig.mode === "replace"
                ? "Thay thế chữ gốc bằng bản dịch tiếng Việt mượt mà để đọc trọn vẹn tác phẩm."
                : "Chèn bản dịch ngay dưới mỗi đoạn gốc với định dạng song ngữ, lý tưởng để học ngoại ngữ."}
            </p>
          </div>

          {/* Section 3: Tone Presets */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              3. Văn phong dịch thuật
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(TONE_DESCRIPTIONS) as TranslationTone[]).map((tKey) => {
                const info = TONE_DESCRIPTIONS[tKey];
                const isSelected = translationConfig.tone === tKey;
                return (
                  <button
                    key={tKey}
                    type="button"
                    onClick={() => setTranslationConfig({ tone: tKey })}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))] border-[var(--primary)] text-[var(--foreground)] shadow-xs"
                        : "bg-[var(--secondary)]/40 border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <span className="text-xs font-semibold">{info.name}</span>
                    <span className="text-[10px] opacity-80 line-clamp-2 leading-tight">
                      {info.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: Glossary / Terminology Accordion */}
          <div className="flex flex-col gap-2 border border-[var(--border)] rounded-lg p-2.5 bg-[var(--secondary)]/20">
            <div
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setShowGlossary(!showGlossary)}
            >
              <div className="flex items-center gap-1.5">
                <Sliders size={13} className="text-[var(--primary)]" />
                <span className="text-xs font-semibold text-[var(--foreground)]">
                  Bộ thuật ngữ &amp; Tên riêng (Glossary)
                </span>
              </div>
              <span className="app-badge app-badge--neutral text-[10px] px-1.5 h-4">
                {Object.keys(translationConfig.glossary || {}).length} từ
              </span>
            </div>

            {showGlossary && (
              <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-[var(--border)] animate-in fade-in duration-150">
                <p className="text-[10px] text-[var(--muted-foreground)]">
                  Cố định tên nhân vật hoặc thuật ngữ để bản dịch luôn đồng nhất qua mọi chương:
                </p>

                {/* Term List */}
                <div className="max-h-28 overflow-y-auto flex flex-col gap-1 pr-1">
                  {Object.entries(translationConfig.glossary || {}).length === 0 ? (
                    <span className="text-[10px] text-[var(--muted-foreground)] italic">
                      Chưa có thuật ngữ nào được tạo.
                    </span>
                  ) : (
                    Object.entries(translationConfig.glossary || {}).map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-center justify-between bg-[var(--card)] px-2 py-1 rounded border border-[var(--border)] text-xs"
                      >
                        <span className="font-mono text-[11px] text-[var(--foreground)] truncate max-w-[120px]">
                          {k}
                        </span>
                        <span className="text-[10px] text-[var(--muted-foreground)]">➔</span>
                        <span className="text-[11px] text-[var(--primary)] truncate max-w-[120px]">
                          {v}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveGlossaryTerm(k)}
                          className="text-[var(--muted-foreground)] hover:text-red-400 p-0.5 cursor-pointer ml-1"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Term Input */}
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="text"
                    placeholder="Gốc (VD: Harry)"
                    value={newTermKey}
                    onChange={(e) => setNewTermKey(e.target.value)}
                    className="flex-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                  />
                  <input
                    type="text"
                    placeholder="Dịch (VD: Harry)"
                    value={newTermVal}
                    onChange={(e) => setNewTermVal(e.target.value)}
                    className="flex-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={handleAddGlossaryTerm}
                    className="p-1 rounded bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 cursor-pointer"
                    title="Thêm thuật ngữ"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Scope & Chapter Selector */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              4. Phạm vi dịch
            </span>
            <div className="segmented-toggle w-full">
              <button
                type="button"
                data-active={scope === "single" ? "true" : undefined}
                onClick={() => setScope("single")}
                className="segmented-toggle__item flex-1 text-center py-1 text-xs"
              >
                Chương chọn
              </button>
              <button
                type="button"
                data-active={scope === "unprocessed" ? "true" : undefined}
                onClick={() => setScope("unprocessed")}
                className="segmented-toggle__item flex-1 text-center py-1 text-xs"
              >
                Chưa dịch ({unprocessedCount})
              </button>
              <button
                type="button"
                data-active={scope === "all" ? "true" : undefined}
                onClick={() => setScope("all")}
                className="segmented-toggle__item flex-1 text-center py-1 text-xs"
              >
                Toàn bộ ({totalChapters})
              </button>
            </div>

            {scope === "single" && (
              <div className="flex flex-col gap-1 mt-1">
                <label className="text-[10px] text-[var(--muted-foreground)] font-medium">Chọn chương cần dịch:</label>
                <select
                  value={activeChapterIndex}
                  onChange={(e) => setActiveChapterIndex(Number(e.target.value))}
                  className="w-full text-xs bg-[var(--secondary)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[var(--foreground)] outline-none focus:border-[var(--primary)] cursor-pointer truncate"
                >
                  {currentBook.chapters.map((ch, idx) => {
                    const isDone = Boolean(modifiedChapters[ch.href]);
                    return (
                      <option key={ch.href} value={idx}>
                        {isDone ? "✓ " : ""}{idx + 1}. {ch.title}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Section 6: Action Execution */}
          <div className="mt-auto pt-4 border-t border-[var(--border)] flex flex-col gap-2.5">
            {/* Progress Bar when translating */}
            {isTranslating && translationProgress && (
              <div className="p-2.5 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/5 flex flex-col gap-1.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--foreground)] truncate max-w-[200px]">
                    Đang dịch: {translationProgress.currentChapterTitle}
                  </span>
                  <span className="font-mono text-[var(--primary)] font-bold text-xs">
                    {translationProgress.percent}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[var(--secondary)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--primary)] transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(5, translationProgress.percent)}%` }}
                  />
                </div>
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  Chương {translationProgress.currentChapterIndex}/{translationProgress.totalChapters}
                  {translationProgress.totalBlocks > 0 &&
                    ` • ${translationProgress.currentBlock}/${translationProgress.totalBlocks} đoạn`}
                </span>
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-2">
              {!isTranslating ? (
                <button
                  type="button"
                  onClick={handleStartTranslation}
                  className="lg-button lg-button--primary flex-1 h-9 text-xs font-semibold gap-1.5 shadow-sm"
                >
                  <Play size={14} className="fill-current" />
                  <span>
                    {scope === "single"
                      ? "Bắt Đầu Dịch Chương Này"
                      : scope === "unprocessed"
                      ? `Dịch ${unprocessedCount} Chương Chưa Dịch`
                      : `Dịch Toàn Bộ ${totalChapters} Chương`}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopTranslation}
                  className="lg-button bg-red-600 hover:bg-red-700 text-white flex-1 h-9 text-xs font-semibold gap-1.5 shadow-sm cursor-pointer"
                >
                  <Square size={14} className="fill-current" />
                  <span>Dừng / Hủy Bỏ</span>
                </button>
              )}

              {isCurrentChapterTranslated && !isTranslating && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeChapter) {
                      resetChapterTranslation(activeChapter.href);
                      toast.info(`Đã khôi phục chương "${activeChapter.title}" về bản gốc`);
                    }
                  }}
                  className="lg-button lg-button--secondary h-9 px-2.5 text-[var(--muted-foreground)] hover:text-red-400"
                  title="Khôi phục chương này về nguyên tác ban đầu"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("reader")}
              className="lg-button lg-button--secondary text-xs h-8 gap-1.5 text-[var(--foreground)]"
            >
              <BookOpenCheck size={13} />
              <span>Xem Thử Trên Trình Đọc Sách</span>
            </button>
          </div>
        </div>

        {/* Right Panel: Preview & Terminal Logs */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--background)]">
          {/* Right Sub-Header Tabs */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--card)]/40 flex-shrink-0">
            <div className="segmented-toggle">
              <button
                type="button"
                data-active={rightTab === "preview" ? "true" : undefined}
                onClick={() => setRightTab("preview")}
                className="segmented-toggle__item px-3 py-1 text-xs gap-1.5 flex items-center"
              >
                <Eye size={12} />
                <span>Xem Trước Chương</span>
              </button>
              <button
                type="button"
                data-active={rightTab === "terminal" ? "true" : undefined}
                onClick={() => setRightTab("terminal")}
                className="segmented-toggle__item px-3 py-1 text-xs gap-1.5 flex items-center"
              >
                <Terminal size={12} />
                <span>Nhật Ký Terminal Log</span>
                {terminalLogs.length > 0 && (
                  <span className="app-badge app-badge--brand text-[9px] px-1 h-3.5 ml-1">
                    {terminalLogs.length}
                  </span>
                )}
              </button>
            </div>

            {rightTab === "terminal" ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="lg-button lg-button--secondary text-xs h-7 px-2 gap-1"
                  title="Sao chép toàn bộ nhật ký"
                >
                  {copiedLogs ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedLogs ? "Đã sao chép" : "Sao chép"}</span>
                </button>
                <button
                  type="button"
                  onClick={clearTerminalLogs}
                  className="lg-button lg-button--secondary text-xs h-7 px-2 text-[var(--muted-foreground)] hover:text-red-400"
                  title="Xóa nhật ký"
                >
                  <Trash2 size={12} />
                  <span>Xóa</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                {activeChapter && (
                  <span>
                    Chương {activeChapterIndex + 1}: <strong className="text-[var(--foreground)]">{activeChapter.title}</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden relative">
            {rightTab === "preview" ? (
              <div className="w-full h-full p-4 overflow-hidden flex flex-col items-center justify-center">
                <div className="max-w-3xl w-full h-full bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-sm overflow-hidden flex flex-col">
                  {isLoadingPreview ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-[var(--muted-foreground)]">
                      Đang đọc nội dung chương...
                    </div>
                  ) : previewHtml ? (
                    <iframe
                      ref={iframeRef}
                      title="Chapter Translation Preview"
                      className="w-full h-full border-none select-text bg-white dark:bg-[#18181f]"
                      sandbox="allow-same-origin"
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs text-[var(--muted-foreground)]">
                      Không có nội dung để hiển thị.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Terminal Log Window */
              <div className="w-full h-full bg-[#0d0d11] p-3 overflow-y-auto font-mono text-[11px] leading-relaxed flex flex-col select-text">
                {terminalLogs.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-[#555] gap-2 select-none">
                    <Terminal size={24} className="opacity-40" />
                    <span>Nhật ký hoạt động dịch AI sẽ xuất hiện tại đây...</span>
                  </div>
                ) : (
                  <>
                    {terminalLogs.map((log) => {
                      const time = new Date(log.timestamp).toLocaleTimeString();
                      let colorClass = "text-[#aaa]";
                      if (log.type === "success") colorClass = "text-emerald-400";
                      if (log.type === "warning") colorClass = "text-amber-400";
                      if (log.type === "info") colorClass = "text-sky-300";
                      if (log.type === "detail") colorClass = "text-[#777]";

                      return (
                        <div key={log.id} className="flex items-start gap-2 py-0.5 border-b border-[#1a1a24]/50">
                          <span className="text-[#444] select-none shrink-0">[{time}]</span>
                          <span className={`${colorClass} break-words whitespace-pre-wrap flex-1`}>
                            {log.text}
                          </span>
                        </div>
                      );
                    })}
                    <div ref={terminalEndRef} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
