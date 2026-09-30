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
  Eye,
  Wand2,
  FileText,
  AlertTriangle,
  Loader2,
  X,
  Search,
  CheckSquare
} from "lucide-react";
import { useAppStore, AutoTranslationConfigResult } from "../../stores/useAppStore";
import {
  TranslationLogPanel,
  filterLogs,
  type LogFilterKey,
} from "./TranslationLogPanel";
import { TONE_DESCRIPTIONS, TranslationTone } from "../../services/prompts/bookTranslator";
import { generateEpubCss, injectCssIntoHtml } from "../../utils/cssGenerator";
import { LanguageDetectionResult } from "../../utils/languageDetector";
import { WorkflowBanner } from "../workflow/WorkflowBanner";
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
    bookStyleSignature,
    autoDetectSourceLanguage,
    isExtractingEntities,
    extractedCandidates,
    extractBookEntities,
    applyApprovedEntitiesToGlossary,
    isGeneratingResearchBrief,
    generateBookResearchBrief,
    isAutoConfiguringAll,
    autoConfigureAllTranslationSettings,
    bookProfile,
    translatedChapters,
    getTranslationCoverage,
  } = useAppStore();

  const [scope, setScope] = useState<"single" | "unprocessed" | "all">("single");
  const [rightTab, setRightTab] = useState<"preview" | "terminal">("preview");
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Auto-detect & Research state
  const [autoConfigResult, setAutoConfigResult] = useState<AutoTranslationConfigResult | null>(null);
  const [logFilter, setLogFilter] = useState<LogFilterKey>("all");
  const [logSearch, setLogSearch] = useState("");
  const [logAutoScroll, setLogAutoScroll] = useState(true);
  const [detectedLangInfo, setDetectedLangInfo] = useState<LanguageDetectionResult | null>(null);
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [selectedEntityNames, setSelectedEntityNames] = useState<Record<string, boolean>>({});
  const [editedTranslations, setEditedTranslations] = useState<Record<string, string>>({});
  const [showResearchBrief, setShowResearchBrief] = useState(false);

  // Glossary input state
  const [newTermKey, setNewTermKey] = useState("");
  const [newTermVal, setNewTermVal] = useState("");
  const [showGlossary, setShowGlossary] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Detailed log view: filter/search so a long translation run stays readable
  // instead of one endless wall of text.
  const filteredLogs = useMemo(
    () => filterLogs(terminalLogs, logFilter, logSearch),
    [terminalLogs, logFilter, logSearch]
  );
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
      signature: bookStyleSignature,
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
  }, [activePreset, customCss, fontFamily, bookStyleSignature]);

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
    if (rightTab === "terminal" && logAutoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [terminalLogs, rightTab, logAutoScroll, filteredLogs]);

  const activeChapter = currentBook?.chapters[activeChapterIndex];
  const isCurrentChapterTranslated = Boolean(
    activeChapter && (modifiedChapters[activeChapter.href] || translatedChapters[activeChapter.href])
  );

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

  // Aggregate statistics — single source of truth (see the store's
  // getTranslationCoverage) so the badge, the stepper and this panel cannot
  // disagree about what "translated" means.
  const translationCoverage = getTranslationCoverage();
  const totalChapters = translationCoverage.total;
  const translatedCount = translationCoverage.translated;

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
    if (filteredLogs.length === 0) return;
    const text = filteredLogs
      .map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.type.toUpperCase()}] ${l.text}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    toast.success(
      filteredLogs.length === terminalLogs.length
        ? "Đã sao chép toàn bộ nhật ký log"
        : `Đã sao chép ${filteredLogs.length}/${terminalLogs.length} dòng log đang hiển thị`
    );
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

  // Handle auto-configure all settings at once
  async function handleAutoConfigureAll() {
    toast.loading("Đang tự động phân tích ngôn ngữ, thể loại, bối cảnh và thuật ngữ sách...", {
      id: "auto-config",
    });
    const res = await autoConfigureAllTranslationSettings();
    if (res) {
      setAutoConfigResult(res);
      if (res.detectedLanguage) {
        setDetectedLangInfo(res.detectedLanguage);
      }
      // Reveal the two panels the run just filled in, so the result is visible.
      if (res.properNamesCount + res.termsCount > 0) setShowGlossary(true);
      if (res.researchBriefGenerated) setShowResearchBrief(true);
      setRightTab("terminal");
      toast.success(
        `Đã tự động cấu hình: ${res.detectedLanguage?.languageName || "Ngôn ngữ"} ➔ ${res.toneLabel} • ${res.properNamesCount} tên riêng • ${res.termsCount} thuật ngữ!`,
        { id: "auto-config" }
      );
    } else {
      toast.error("Không thể tự động cấu hình cài đặt cho sách này.", { id: "auto-config" });
    }
  }

  // Handle auto-detect source language
  function handleAutoDetect() {
    const res = autoDetectSourceLanguage();
    if (res) {
      setDetectedLangInfo(res);
      toast.success(`Đã nhận diện: ${res.languageName} (${Math.round(res.confidence * 100)}%)`);
    } else {
      toast.warning("Không thể nhận diện ngôn ngữ của sách này.");
    }
  }

  // Handle auto-extract entities and terminology
  async function handleScanEntities() {
    toast.loading("Đang quét tự động thực thể và đề xuất bản dịch...", { id: "scan-ent" });
    const candidates = await extractBookEntities();
    if (candidates.length > 0) {
      toast.success(`Đã tìm thấy ${candidates.length} thuật ngữ & tên riêng!`, { id: "scan-ent" });
      const initialSelected: Record<string, boolean> = {};
      const initialEdits: Record<string, string> = {};
      for (const c of candidates) {
        initialSelected[c.name] = !c.isExistingInGlossary;
        initialEdits[c.name] = c.suggestedTranslation;
      }
      setSelectedEntityNames(initialSelected);
      setEditedTranslations(initialEdits);
      setShowEntityModal(true);
    } else {
      toast.info("Không tìm thấy thuật ngữ mới nào.", { id: "scan-ent" });
    }
  }

  // Handle apply approved entities into glossary
  function handleApplyApprovedEntities() {
    const approved: Array<{ name: string; translation: string }> = [];
    for (const [name, isSelected] of Object.entries(selectedEntityNames)) {
      if (isSelected) {
        const trans = editedTranslations[name] || name;
        approved.push({ name, translation: trans });
      }
    }
    if (approved.length === 0) {
      toast.warning("Chưa có thuật ngữ nào được chọn!");
      return;
    }
    applyApprovedEntitiesToGlossary(approved);
    setShowEntityModal(false);
  }

  // Handle generate research brief
  async function handleGenerateBrief() {
    toast.loading("Đang nghiên cứu bối cảnh tác phẩm bằng AI...", { id: "gen-brief" });
    const brief = await generateBookResearchBrief();
    if (brief) {
      toast.success("Đã hoàn tất nghiên cứu bối cảnh tác phẩm!", { id: "gen-brief" });
    } else {
      toast.error("Không thể lập hồ sơ nghiên cứu.", { id: "gen-brief" });
    }
  }

  const isSameLangWarning = Boolean(
    detectedLangInfo &&
      detectedLangInfo.languageName.toLowerCase().includes("việt") &&
      translationConfig.targetLang.toLowerCase().includes("việt")
  );

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

      <div className="px-4 pt-3 flex-shrink-0">
        <WorkflowBanner />
      </div>

      {/* Main Body Split: Left Settings & Controls (360px), Right Preview / Logs (flex-1) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Control Panel */}
        <div className="w-[360px] flex-shrink-0 border-r border-[var(--border)] bg-[var(--card)]/30 flex flex-col overflow-y-auto p-4 gap-4">
          {/* Workflow context: what the ingest router detected for this book */}
          {bookProfile && (
            <div className="workflow-context">
              <span aria-hidden="true">{bookProfile.languageFlag}</span>
              <span>
                Nhận diện: <strong>{bookProfile.languageName}</strong>
              </span>
              <span>·</span>
              <span>{Math.round(bookProfile.languageConfidence * 100)}% tin cậy</span>
              <span>·</span>
              <span>
                nguồn{" "}
                <strong>
                  {bookProfile.detectionSource === "combined"
                    ? "metadata + văn bản"
                    : bookProfile.detectionSource === "metadata"
                    ? "metadata"
                    : bookProfile.detectionSource === "heuristic"
                    ? "văn bản"
                    : "không rõ"}
                </strong>
              </span>
            </div>
          )}

          {/* One-Click Auto-Configure All Settings Button & Banner */}
          <div className="p-3 rounded-xl border border-[var(--primary)]/40 bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))] flex flex-col gap-2 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                <Sparkles size={14} className="text-[var(--primary)]" />
                <span>Tự Động Cấu Hình Toàn Diện</span>
              </div>
              <span className="app-badge app-badge--brand text-[9px] px-1.5 h-3.5">
                AI + Jev 1-Click
              </span>
            </div>

            <p className="text-[10px] text-[var(--muted-foreground)] leading-relaxed">
              Tự động nhận diện ngôn ngữ, phân tích thể loại đề xuất văn phong, trích xuất thuật ngữ &amp; nghiên cứu bối cảnh sách trong 1 lượt.
            </p>

            <button
              type="button"
              disabled={isAutoConfiguringAll}
              onClick={handleAutoConfigureAll}
              className="lg-button lg-button--primary text-xs h-8 px-3 gap-1.5 font-medium shadow-xs w-full"
              title="Phân tích và tự động cấu hình toàn bộ cài đặt dịch thuật"
            >
              {isAutoConfiguringAll ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
              <span>{isAutoConfiguringAll ? "Đang tự động thiết lập toàn bộ..." : "Tự Động Thiết Lập Toàn Bộ"}</span>
            </button>

            {autoConfigResult && (
              <div className="mt-1 p-2 rounded bg-[var(--card)]/90 border border-[var(--border)] text-[10px] flex flex-col gap-1 text-[var(--foreground)] animate-in fade-in duration-200">
                <div className="flex items-center justify-between font-semibold text-[var(--primary)]">
                  <span>✓ Đã cấu hình xong</span>
                  <span className="text-[var(--muted-foreground)] font-mono">{autoConfigResult.toneLabel}</span>
                </div>
                <div className="text-[var(--muted-foreground)] leading-tight">
                  Ngôn ngữ: <strong>{autoConfigResult.detectedLanguage?.languageName || "Tự động"}</strong> ➔ <strong>{translationConfig.targetLang}</strong>
                </div>
                <div className="text-[var(--muted-foreground)] leading-tight">
                  Bộ thuật ngữ &amp; tên riêng: <strong className="text-[var(--primary)]">{autoConfigResult.properNamesCount} tên riêng</strong> + <strong className="text-[var(--primary)]">{autoConfigResult.termsCount} thuật ngữ</strong> = <strong>{Object.keys(translationConfig.glossary || {}).length} mục</strong>
                </div>
                <div className="text-[var(--muted-foreground)] leading-tight">
                  Bộ dịch thuật: <strong className="font-mono text-[var(--foreground)]">{autoConfigResult.activeEngineLabel}</strong>
                </div>
                <div className="text-[var(--muted-foreground)] leading-tight">
                  Bối cảnh: <strong>{autoConfigResult.researchBriefGenerated ? "Đã lập" : "Bỏ qua"}</strong> • Đã quét <strong>{autoConfigResult.entitiesExtractedCount} thực thể</strong>
                </div>
              </div>
            )}
          </div>

          {/* Section 1: Language Pairs */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                1. Cặp ngôn ngữ
              </span>
              <button
                type="button"
                onClick={handleAutoDetect}
                className="lg-button lg-button--secondary text-[10px] h-6 px-2 gap-1 text-[var(--primary)] font-medium shadow-xs"
                title="Tự động phân tích bảng mã và tần suất từ vựng để nhận diện ngôn ngữ gốc"
              >
                <Wand2 size={11} />
                <span>Nhận diện tự động</span>
              </button>
            </div>

            {detectedLangInfo && (
              <div className="flex items-center gap-1.5 text-[10px] bg-[var(--secondary)]/60 px-2 py-1 rounded border border-[var(--border)]">
                <span className="text-[var(--primary)] font-semibold">● Nhận diện:</span>
                <span className="text-[var(--foreground)]">{detectedLangInfo.languageName}</span>
                <span className="text-[var(--muted-foreground)] ml-auto font-mono">
                  {Math.round(detectedLangInfo.confidence * 100)}% ({detectedLangInfo.source})
                </span>
              </div>
            )}

            {isSameLangWarning && (
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-500 flex items-start gap-1.5 animate-in fade-in duration-200">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>Sách gốc đã là Tiếng Việt. Bạn có muốn đổi ngôn ngữ đích sang tiếng khác hoặc dịch sang Tiếng Anh?</span>
              </div>
            )}

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

            <label className="flex items-center gap-1.5 text-[11px] text-[var(--foreground)] cursor-pointer select-none mt-1">
              <input
                type="checkbox"
                checked={translationConfig.translateTitles !== false}
                onChange={(e) => setTranslationConfig({ translateTitles: e.target.checked })}
                className="accent-[var(--primary)] rounded cursor-pointer"
              />
              <span>Dịch cả tên truyện &amp; tiêu đề các chương</span>
            </label>
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

          {/* Section 4: Contextual Research Brief */}
          <div className="flex flex-col gap-2 border border-[var(--border)] rounded-lg p-2.5 bg-[var(--secondary)]/20">
            <div
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setShowResearchBrief(!showResearchBrief)}
            >
              <div className="flex items-center gap-1.5">
                <FileText size={13} className="text-[var(--primary)]" />
                <span className="text-xs font-semibold text-[var(--foreground)]">
                  Nghiên cứu bối cảnh (Research Brief)
                </span>
              </div>
              <span className={`app-badge text-[10px] px-1.5 h-4 ${
                translationConfig.useResearchBrief ? "app-badge--brand" : "app-badge--neutral"
              }`}>
                {translationConfig.useResearchBrief ? "Đang bật" : "Tắt"}
              </span>
            </div>

            {showResearchBrief && (
              <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-[var(--border)] animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--foreground)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(translationConfig.useResearchBrief)}
                      onChange={(e) => setTranslationConfig({ useResearchBrief: e.target.checked })}
                      className="accent-[var(--primary)] rounded"
                    />
                    <span>Áp dụng vào bản dịch</span>
                  </label>

                  <button
                    type="button"
                    disabled={isGeneratingResearchBrief}
                    onClick={handleGenerateBrief}
                    className="lg-button lg-button--secondary text-[10px] h-6 px-2 gap-1 text-[var(--primary)] font-medium shadow-xs"
                    title="Nghiên cứu thời đại, văn hóa và quy tắc xưng hô nhân vật bằng AI"
                  >
                    {isGeneratingResearchBrief ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Sparkles size={11} />
                    )}
                    <span>{isGeneratingResearchBrief ? "Đang nghiên cứu..." : "AI Nghiên Cứu"}</span>
                  </button>
                </div>

                <textarea
                  rows={4}
                  value={translationConfig.researchBrief || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.length <= 1500) {
                      setTranslationConfig({ researchBrief: val });
                    }
                  }}
                  placeholder="Bấm 'AI Nghiên Cứu' hoặc tự viết quy tắc xưng hô, bối cảnh thời đại, danh xưng nhân vật tại đây..."
                  className="w-full text-[11px] bg-[var(--card)] border border-[var(--border)] rounded p-2 text-[var(--foreground)] font-mono resize-none outline-none focus:border-[var(--primary)] leading-relaxed"
                />

                <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
                  <span>Tự động đưa vào prompt để định hình văn phong chuẩn.</span>
                  <span className="font-mono">{(translationConfig.researchBrief || "").length}/1200 ký tự</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Glossary / Terminology Accordion */}
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
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isExtractingEntities}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleScanEntities();
                  }}
                  className="lg-button lg-button--secondary text-[10px] h-5 px-1.5 gap-1 text-[var(--primary)] font-medium shadow-xs"
                  title="Tự động trích xuất các nhân vật, địa danh và thuật ngữ quan trọng"
                >
                  {isExtractingEntities ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Search size={10} />
                  )}
                  <span>{isExtractingEntities ? "Đang quét..." : "Quét AI"}</span>
                </button>

                <span className="app-badge app-badge--neutral text-[10px] px-1.5 h-4">
                  {Object.keys(translationConfig.glossary || {}).length} từ
                </span>
              </div>
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

          {/* Section 6: Scope & Chapter Selector */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              5. Phạm vi dịch
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
            {/* Course complete: whole book translated */}
            {!isTranslating && totalChapters > 0 && translatedCount >= totalChapters && (
              <div
                className="p-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 flex flex-col gap-2 animate-in fade-in duration-200"
                role="status"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                  <Check size={14} className="text-emerald-500" />
                  <span>Đã dịch xong toàn bộ {totalChapters} chương</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("reader")}
                    className="lg-button lg-button--primary flex-1 h-7 text-[11px] gap-1"
                  >
                    <BookOpenCheck size={12} />
                    <span>Đọc bản dịch</span>
                  </button>
                </div>
              </div>
            )}

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
              /* Terminal Log Window — chi tiết hoá nhật ký dịch */
              <TranslationLogPanel
                logs={terminalLogs}
                filter={logFilter}
                search={logSearch}
                autoScroll={logAutoScroll}
                onFilterChange={setLogFilter}
                onSearchChange={setLogSearch}
                onToggleAutoScroll={() => setLogAutoScroll((v) => !v)}
                endRef={terminalEndRef}
              />
            )}
          </div>
        </div>
      </div>

      {/* Entity & Terminology Review Modal */}
      {showEntityModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--secondary)]/40">
              <div className="flex items-center gap-2">
                <Search size={16} className="text-[var(--primary)]" />
                <h3 className="text-xs font-semibold text-[var(--foreground)]">
                  Kết Quả Trích Xuất Thuật Ngữ &amp; Tên Riêng
                </h3>
                <span className="app-badge app-badge--brand text-[10px] px-1.5 h-4">
                  {extractedCandidates.length} thực thể
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowEntityModal(false)}
                className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-3">
              <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                Các tên nhân vật, địa danh và thuật ngữ quan trọng được phát hiện từ các chương sách. Bạn có thể chỉnh sửa bản dịch đề xuất trước khi thêm vào bộ từ điển Glossary:
              </p>

              <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-[var(--secondary)]/60 text-[10px] uppercase font-semibold text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="p-2 w-10 text-center">Chọn</th>
                      <th className="p-2">Tên / Thuật ngữ gốc</th>
                      <th className="p-2 w-20">Loại</th>
                      <th className="p-2 w-16 text-center">Tần suất</th>
                      <th className="p-2">Bản dịch đề xuất (Có thể sửa)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]/60">
                    {extractedCandidates.map((c) => {
                      const isChecked = Boolean(selectedEntityNames[c.name]);
                      const currentVal = editedTranslations[c.name] ?? c.suggestedTranslation;

                      return (
                        <tr key={c.id} className="hover:bg-[var(--secondary)]/30 transition-colors">
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) =>
                                setSelectedEntityNames({
                                  ...selectedEntityNames,
                                  [c.name]: e.target.checked,
                                })
                              }
                              className="accent-[var(--primary)] rounded cursor-pointer"
                            />
                          </td>
                          <td className="p-2 font-mono text-[11px] text-[var(--foreground)] font-medium">
                            {c.name}
                          </td>
                          <td className="p-2">
                            <span className="app-badge app-badge--neutral text-[9px] px-1 h-3.5">
                              {c.category === "person" ? "Nhân vật" : c.category === "place" ? "Địa danh" : "Thuật ngữ"}
                            </span>
                          </td>
                          <td className="p-2 text-center text-[10px] font-mono text-[var(--muted-foreground)]">
                            {c.count}x
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={currentVal}
                              onChange={(e) =>
                                setEditedTranslations({
                                  ...editedTranslations,
                                  [c.name]: e.target.value,
                                })
                              }
                              className="w-full text-xs bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--secondary)]/40">
              <span className="text-[11px] text-[var(--muted-foreground)]">
                Đã chọn: <strong className="text-[var(--foreground)]">{Object.values(selectedEntityNames).filter(Boolean).length}</strong> mục
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowEntityModal(false)}
                  className="lg-button lg-button--secondary text-xs h-8 px-3"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleApplyApprovedEntities}
                  className="lg-button lg-button--primary text-xs h-8 px-3 gap-1.5 font-medium shadow-xs"
                >
                  <CheckSquare size={13} />
                  <span>Áp Dụng Vào Glossary</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
