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
import { AgentModelSelector } from "../agent/AgentModelSelector";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Progress } from "../ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Separator } from "../ui/separator";
import { Spinner } from "../ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

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
    clearTranslationLogs,
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

  const translationLogs = useMemo(
    () =>
      terminalLogs.filter(
        (l) => l.category === "translation" || (!l.category && !l.text.includes("[Biên tập]") && !l.text.includes("[Tối ưu]"))
      ),
    [terminalLogs]
  );

  // Detailed log view: filter/search so a long translation run stays readable
  // instead of one endless wall of text.
  const filteredLogs = useMemo(
    () => filterLogs(translationLogs, logFilter, logSearch),
    [translationLogs, logFilter, logSearch]
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
      filteredLogs.length === translationLogs.length
        ? "Đã sao chép toàn bộ nhật ký dịch"
        : `Đã sao chép ${filteredLogs.length}/${translationLogs.length} dòng log đang hiển thị`
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
      // Reveal the two panels the run just filled in, so the result is immediately visible.
      setShowGlossary(true);
      if (res.researchBriefGenerated) setShowResearchBrief(true);
      setRightTab("terminal");

      // Sync candidate state so user can immediately click "Duyệt" if they want to review
      const latestCandidates = useAppStore.getState().extractedCandidates;
      if (latestCandidates && latestCandidates.length > 0) {
        const initialSelected: Record<string, boolean> = {};
        const initialEdits: Record<string, string> = {};
        for (const c of latestCandidates) {
          initialSelected[c.name] = true;
          initialEdits[c.name] = c.suggestedTranslation;
        }
        setSelectedEntityNames(initialSelected);
        setEditedTranslations(initialEdits);
      }

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
      <Empty className="flex-1 border-0 select-none animate-in fade-in duration-200">
        <EmptyMedia variant="icon" className="size-16 rounded-2xl bg-primary/10 text-primary shadow-sm">
          <Languages className="size-8" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Chưa Có Cuốn Sách Nào Được Mở</EmptyTitle>
          <EmptyDescription className="max-w-md leading-relaxed">
            Vui lòng mở một file sách EPUB hoặc nạp từ Trình Chuyển Đổi Ebook để sử dụng chức năng Dịch Thuật AI.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" size="lg" onClick={() => setActiveTab("books")}>
            <BookOpen size={14} />
            <span>Đến Thư Viện Quản Lý Sách</span>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary border border-primary/30">
            <Languages size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-semibold text-foreground leading-none">
                Bước 2: Dịch Thuật Sách AI
              </h1>
              <Badge variant="secondary" className="bg-primary/10 text-primary text-[9px] px-1.5 h-4">
                Surgical XHTML Preserved
              </Badge>
              {isCurrentChapterTranslated && (
                <Badge
                  variant="secondary"
                  className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] px-1.5 h-4"
                >
                  Chương này đã dịch
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Tác phẩm: <strong className="text-foreground font-medium">{currentBook.title}</strong>
            </p>
          </div>
        </div>

        {/* Header Stats & Gateway indicator */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="h-7 gap-1.5 px-2.5 text-[11px] font-normal">
            <Layers className="text-primary" />
            <span className="text-muted-foreground">Đã dịch:</span>
            <strong className="text-foreground">{translatedCount}/{totalChapters} ch.</strong>
          </Badge>

          <div className="flex items-center gap-1.5">
            <AgentModelSelector compact={false} className="h-7" />
          </div>
        </div>
      </header>

      <div className="px-4 pt-3 flex-shrink-0">
        <WorkflowBanner />
      </div>

      {/* Main Body Split: Left Settings & Controls (360px), Right Preview / Logs (flex-1) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Control Panel */}
        <div className="w-[360px] flex-shrink-0 border-r border-border bg-card/30 flex flex-col overflow-y-auto p-4 gap-4">
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
          <Card size="sm" className="shrink-0 ring-primary/40 bg-primary/5 shadow-xs">
            <CardHeader className="flex flex-col gap-1 p-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-1.5 text-xs font-semibold">
                  <Sparkles className="size-3.5 text-primary" />
                  <span>Tự Động Cấu Hình Toàn Diện</span>
                </CardTitle>
                <Badge variant="secondary" className="bg-primary/10 text-primary text-[9px] px-1.5 h-4">
                  Tự động 1-Click
                </Badge>
              </div>
              <CardDescription className="text-[10px] leading-relaxed mt-0.5">
                Tự động nhận diện ngôn ngữ, phân tích thể loại đề xuất văn phong, trích xuất thuật ngữ &amp; nghiên cứu bối cảnh sách trong 1 lượt.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-2">
              <Button
                type="button"
                disabled={isAutoConfiguringAll}
                onClick={handleAutoConfigureAll}
                className="w-full text-xs shadow-xs"
                title="Phân tích và tự động cấu hình toàn bộ cài đặt dịch thuật"
              >
                {isAutoConfiguringAll ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                <span>{isAutoConfiguringAll ? "Đang tự động thiết lập toàn bộ..." : "Tự Động Thiết Lập Toàn Bộ"}</span>
              </Button>

              {autoConfigResult && (
                <div className="p-2 rounded bg-card/90 border border-border text-[10px] flex flex-col gap-1 text-foreground animate-in fade-in duration-200">
                  <div className="flex items-center justify-between font-semibold text-primary">
                    <span>✓ Đã cấu hình xong</span>
                    <span className="text-muted-foreground font-mono">{autoConfigResult.toneLabel}</span>
                  </div>
                  <div className="text-muted-foreground leading-tight">
                    Ngôn ngữ: <strong>{autoConfigResult.detectedLanguage?.languageName || "Tự động"}</strong> ➔ <strong>{translationConfig.targetLang}</strong>
                  </div>
                  <div className="text-muted-foreground leading-tight">
                    Bộ thuật ngữ &amp; tên riêng: <strong className="text-primary">{autoConfigResult.properNamesCount} tên riêng</strong> + <strong className="text-primary">{autoConfigResult.termsCount} thuật ngữ</strong> = <strong>{Object.keys(translationConfig.glossary || {}).length} mục</strong>
                  </div>
                  <div className="text-muted-foreground leading-tight">
                    Bộ dịch thuật: <strong className="font-mono text-foreground">{autoConfigResult.activeEngineLabel}</strong>
                  </div>
                  <div className="text-muted-foreground leading-tight">
                    Bối cảnh: <strong>{autoConfigResult.researchBriefGenerated ? "Đã lập" : "Bỏ qua"}</strong> • Đã quét <strong>{autoConfigResult.entitiesExtractedCount} thực thể</strong>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section: AI Model & Gateway Selection */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Cổng AI &amp; Mô hình dịch
              </span>
              {activeGateway ? (
                <Badge variant="outline" className="text-[9px] h-4 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 gap-1 font-mono">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{activeGateway.name}</span>
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[9px] h-4">
                  Lõi Cục Bộ
                </Badge>
              )}
            </div>
            <AgentModelSelector className="w-full" />
          </div>

          {/* Section 1: Language Pairs */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                1. Cặp ngôn ngữ
              </span>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={handleAutoDetect}
                className="text-primary shadow-xs"
                title="Tự động phân tích bảng mã và tần suất từ vựng để nhận diện ngôn ngữ gốc"
              >
                <Wand2 />
                <span>Nhận diện tự động</span>
              </Button>
            </div>

            {detectedLangInfo && (
              <div className="flex items-center gap-1.5 text-[10px] bg-secondary/60 px-2 py-1 rounded border border-border">
                <span className="text-primary font-semibold">● Nhận diện:</span>
                <span className="text-foreground">{detectedLangInfo.languageName}</span>
                <span className="text-muted-foreground ml-auto font-mono">
                  {Math.round(detectedLangInfo.confidence * 100)}% ({detectedLangInfo.source})
                </span>
              </div>
            )}

            {isSameLangWarning && (
              <Alert className="bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 animate-in fade-in duration-200">
                <AlertTriangle className="size-3.5" />
                <AlertDescription className="text-[10px] text-amber-600 dark:text-amber-400">
                  Sách gốc đã là Tiếng Việt. Bạn có muốn đổi ngôn ngữ đích sang tiếng khác hoặc dịch sang Tiếng Anh?
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-end gap-2">
              <div className="flex-1 flex flex-col gap-1">
                <Label htmlFor="translator-source-lang" className="text-[10px] text-muted-foreground font-medium">Ngôn ngữ nguồn</Label>
                <Select
                  value={translationConfig.sourceLang}
                  onValueChange={(value) => setTranslationConfig({ sourceLang: value })}
                >
                  <SelectTrigger id="translator-source-lang" className="w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {SOURCE_LANGUAGES.map((lang) => (
                        <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={handleSwapLanguages}
                className="h-8 mb-0"
                title="Đảo ngược cặp ngôn ngữ"
              >
                <ArrowRightLeft className="size-3.5" />
              </Button>

              <div className="flex-1 flex flex-col gap-1">
                <Label htmlFor="translator-target-lang" className="text-[10px] text-muted-foreground font-medium">Ngôn ngữ đích</Label>
                <Select
                  value={translationConfig.targetLang}
                  onValueChange={(value) => setTranslationConfig({ targetLang: value })}
                >
                  <SelectTrigger id="translator-target-lang" className="w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {TARGET_LANGUAGES.map((lang) => (
                        <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Section 2: Layout Presentation Mode */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              2. Chế độ hiển thị
            </span>
            <ToggleGroup
              type="single"
              value={translationConfig.mode}
              onValueChange={(val) => {
                if (val === "replace" || val === "bilingual") {
                  setTranslationConfig({ mode: val });
                }
              }}
              className="grid grid-cols-2 w-full border border-border rounded-md p-0.5 bg-muted/40"
            >
              <ToggleGroupItem
                value="replace"
                size="sm"
                className="h-7 text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-primary"
              >
                Chỉ bản dịch (Thay thế)
              </ToggleGroupItem>
              <ToggleGroupItem
                value="bilingual"
                size="sm"
                className="h-7 text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-primary"
              >
                Song ngữ đối chiếu
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {translationConfig.mode === "replace"
                ? "Thay thế chữ gốc bằng bản dịch tiếng Việt mượt mà để đọc trọn vẹn tác phẩm."
                : "Chèn bản dịch ngay dưới mỗi đoạn gốc với định dạng song ngữ, lý tưởng để học ngoại ngữ."}
            </p>

            <Label
              htmlFor="toggle-translate-titles"
              className="flex items-center gap-1.5 text-[11px] font-normal text-foreground cursor-pointer select-none mt-1"
            >
              <Checkbox
                id="toggle-translate-titles"
                checked={translationConfig.translateTitles !== false}
                onCheckedChange={(checked) =>
                  setTranslationConfig({ translateTitles: Boolean(checked) })
                }
              />
              <span>Dịch cả tên truyện &amp; tiêu đề các chương</span>
            </Label>
          </div>

          {/* Section 3: Tone Presets */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              3. Văn phong dịch thuật
            </span>
            <ToggleGroup
              type="single"
              value={translationConfig.tone}
              onValueChange={(val) => {
                if (val) setTranslationConfig({ tone: val as TranslationTone });
              }}
              variant="outline"
              className="grid grid-cols-2 gap-1.5 w-full"
            >
              {(Object.keys(TONE_DESCRIPTIONS) as TranslationTone[]).map((tKey) => {
                const info = TONE_DESCRIPTIONS[tKey];
                return (
                  <ToggleGroupItem
                    key={tKey}
                    value={tKey}
                    className="w-full h-auto flex-col items-start justify-start gap-1 p-2 text-left whitespace-normal data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
                  >
                    <span className="text-xs font-semibold">{info.name}</span>
                    <span className="text-[10px] opacity-80 line-clamp-2 leading-tight">
                      {info.description}
                    </span>
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>

          {/* Section 4: Contextual Research Brief */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              4. Nghiên cứu bối cảnh
            </span>
            <Card size="sm" className="shrink-0 bg-secondary/20">
              <CardHeader
                className="cursor-pointer select-none py-2.5 px-3 flex flex-row items-center justify-between"
                onClick={() => setShowResearchBrief(!showResearchBrief)}
              >
                <CardTitle className="flex items-center gap-1.5 text-xs">
                  <FileText className="size-3.5 text-primary" />
                  <span>Research Brief (Bối cảnh tác phẩm)</span>
                </CardTitle>
                <Badge
                  variant={translationConfig.useResearchBrief ? "secondary" : "outline"}
                  className={`text-[10px] px-1.5 h-4 ${
                    translationConfig.useResearchBrief ? "bg-primary/10 text-primary" : ""
                  }`}
                >
                  {translationConfig.useResearchBrief ? "Đang bật" : "Tắt"}
                </Badge>
              </CardHeader>

            {showResearchBrief && (
              <>
                <Separator />
                <CardContent className="flex flex-col gap-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="toggle-research-brief"
                      className="flex items-center gap-1.5 text-[11px] font-normal text-foreground cursor-pointer select-none"
                    >
                      <Checkbox
                        id="toggle-research-brief"
                        checked={Boolean(translationConfig.useResearchBrief)}
                        onCheckedChange={(checked) =>
                          setTranslationConfig({ useResearchBrief: Boolean(checked) })
                        }
                      />
                      <span>Áp dụng vào bản dịch</span>
                    </Label>

                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      disabled={isGeneratingResearchBrief}
                      onClick={handleGenerateBrief}
                      className="text-primary shadow-xs"
                      title="Nghiên cứu thời đại, văn hóa và quy tắc xưng hô nhân vật bằng AI"
                    >
                      {isGeneratingResearchBrief ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Sparkles />
                      )}
                      <span>{isGeneratingResearchBrief ? "Đang nghiên cứu..." : "AI Nghiên Cứu"}</span>
                    </Button>
                  </div>

                  <Textarea
                    rows={4}
                    value={translationConfig.researchBrief || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.length <= 1500) {
                        setTranslationConfig({ researchBrief: val });
                      }
                    }}
                    placeholder="Bấm 'AI Nghiên Cứu' hoặc tự viết quy tắc xưng hô, bối cảnh thời đại, danh xưng nhân vật tại đây..."
                    className="text-[11px] font-mono resize-none leading-relaxed"
                  />

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Tự động đưa vào prompt để định hình văn phong chuẩn.</span>
                    <span className="font-mono">{(translationConfig.researchBrief || "").length}/1200 ký tự</span>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
          </div>

          {/* Section 5: Glossary / Terminology Accordion */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              5. Thuật ngữ &amp; Tên riêng (Glossary)
            </span>
            <Card size="sm" className="shrink-0 bg-secondary/20">
              <CardHeader
                className="cursor-pointer select-none py-2.5 px-3 flex flex-row items-center justify-between"
                onClick={() => setShowGlossary(!showGlossary)}
              >
                <CardTitle className="flex items-center gap-1.5 text-xs">
                  <Sliders className="size-3.5 text-primary" />
                  <span>Danh mục thuật ngữ</span>
                </CardTitle>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {extractedCandidates.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setShowEntityModal(true)}
                      className="text-xs shadow-xs gap-1"
                      title="Xem lại hoặc chỉnh sửa danh sách các thực thể đã trích xuất"
                    >
                      <Eye className="size-3" />
                      <span>Duyệt ({extractedCandidates.length})</span>
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    disabled={isExtractingEntities}
                    onClick={handleScanEntities}
                    className="text-primary shadow-xs"
                    title="Tự động trích xuất các nhân vật, địa danh và thuật ngữ quan trọng"
                  >
                    {isExtractingEntities ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Search />
                    )}
                    <span>{isExtractingEntities ? "Đang quét..." : "Quét AI"}</span>
                  </Button>

                  <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                    {Object.keys(translationConfig.glossary || {}).length} từ
                  </Badge>
                </div>
              </CardHeader>

            {showGlossary && (
              <>
                <Separator />
                <CardContent className="flex flex-col gap-2 animate-in fade-in duration-150">
                  <p className="text-[10px] text-muted-foreground">
                    Cố định tên nhân vật hoặc thuật ngữ để bản dịch luôn đồng nhất qua mọi chương:
                  </p>

                  {/* Term List */}
                  <div className="max-h-28 overflow-y-auto flex flex-col gap-1 pr-1">
                    {Object.entries(translationConfig.glossary || {}).length === 0 ? (
                      <span className="text-[10px] text-muted-foreground italic">
                        Chưa có thuật ngữ nào được tạo.
                      </span>
                    ) : (
                      Object.entries(translationConfig.glossary || {}).map(([k, v]) => (
                        <div
                          key={k}
                          className="flex items-center justify-between bg-card px-2 py-1 rounded border border-border text-xs"
                        >
                          <span className="font-mono text-[11px] text-foreground truncate max-w-[120px]">
                            {k}
                          </span>
                          <span className="text-[10px] text-muted-foreground">➔</span>
                          <span className="text-[11px] text-primary truncate max-w-[120px]">
                            {v}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleRemoveGlossaryTerm(k)}
                            className="text-muted-foreground hover:text-red-400 ml-1"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Term Input */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <Input
                      type="text"
                      placeholder="Gốc (VD: Harry)"
                      value={newTermKey}
                      onChange={(e) => setNewTermKey(e.target.value)}
                      className="flex-1 text-xs"
                    />
                    <Input
                      type="text"
                      placeholder="Dịch (VD: Harry)"
                      value={newTermVal}
                      onChange={(e) => setNewTermVal(e.target.value)}
                      className="flex-1 text-xs"
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      onClick={handleAddGlossaryTerm}
                      title="Thêm thuật ngữ"
                    >
                      <Plus />
                    </Button>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
          </div>

          {/* Section 6: Scope & Chapter Selector */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              6. Phạm vi dịch
            </span>
            <ToggleGroup
              type="single"
              value={scope}
              onValueChange={(val) => {
                if (val === "single" || val === "unprocessed" || val === "all") {
                  setScope(val);
                }
              }}
              className="grid grid-cols-3 w-full border border-border rounded-md p-0.5 bg-muted/40"
            >
              <ToggleGroupItem
                value="single"
                size="sm"
                className="h-7 text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-primary"
              >
                Chương chọn
              </ToggleGroupItem>
              <ToggleGroupItem
                value="unprocessed"
                size="sm"
                className="h-7 text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-primary"
              >
                Chưa dịch ({unprocessedCount})
              </ToggleGroupItem>
              <ToggleGroupItem
                value="all"
                size="sm"
                className="h-7 text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-primary"
              >
                Toàn bộ ({totalChapters})
              </ToggleGroupItem>
            </ToggleGroup>

            {scope === "single" && (
              <div className="flex flex-col gap-1 mt-1">
                <Label htmlFor="translator-chapter" className="text-[10px] text-muted-foreground font-medium">Chọn chương cần dịch:</Label>
                <Select
                  value={String(activeChapterIndex)}
                  onValueChange={(value) => setActiveChapterIndex(Number(value))}
                >
                  <SelectTrigger id="translator-chapter" className="w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {currentBook.chapters.map((ch, idx) => {
                        const isDone = Boolean(modifiedChapters[ch.href]);
                        return (
                          <SelectItem key={ch.href} value={String(idx)}>
                            {isDone ? "✓ " : ""}{idx + 1}. {ch.title}
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Section 6: Action Execution */}
          <Separator className="mt-auto" />
          <div className="flex flex-col gap-2.5">
            {/* Course complete: whole book translated */}
            {!isTranslating && totalChapters > 0 && translatedCount >= totalChapters && (
              <Alert
                role="status"
                className="border-emerald-500/40 bg-emerald-500/10 animate-in fade-in duration-200"
              >
                <Check className="size-3.5 text-emerald-500" />
                <AlertTitle className="text-xs">
                  Đã dịch xong toàn bộ {totalChapters} chương
                </AlertTitle>
                <AlertDescription className="flex items-center gap-2">
                  <Button type="button" size="sm" className="flex-1 text-[11px]" onClick={() => setActiveTab("reader")}>
                    <BookOpenCheck />
                    <span>Đọc bản dịch</span>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Progress Bar when translating */}
            {isTranslating && translationProgress && (
              <div className="p-2.5 rounded-lg border border-primary/30 bg-primary/5 flex flex-col gap-1.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground truncate max-w-[200px]">
                    Đang dịch: {translationProgress.currentChapterTitle}
                  </span>
                  <span className="font-mono text-primary font-bold text-xs">
                    {translationProgress.percent}%
                  </span>
                </div>
                <Progress value={translationProgress.percent} className="h-1.5" />
                <span className="text-[10px] text-muted-foreground">
                  Chương {translationProgress.currentChapterIndex}/{translationProgress.totalChapters}
                  {translationProgress.totalBlocks > 0 &&
                    ` • ${translationProgress.currentBlock}/${translationProgress.totalBlocks} đoạn`}
                </span>
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-2">
              {!isTranslating ? (
                <Button
                  type="button"
                  size="lg"
                  onClick={handleStartTranslation}
                  className="flex-1 text-xs font-semibold shadow-sm"
                >
                  <Play className="fill-current" />
                  <span>
                    {scope === "single"
                      ? "Bắt Đầu Dịch Chương Này"
                      : scope === "unprocessed"
                      ? `Dịch ${unprocessedCount} Chương Chưa Dịch`
                      : `Dịch Toàn Bộ ${totalChapters} Chương`}
                  </span>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  variant="destructive"
                  onClick={stopTranslation}
                  className="flex-1 text-xs font-semibold shadow-sm"
                >
                  <Square className="fill-current" />
                  <span>Dừng / Hủy Bỏ</span>
                </Button>
              )}

              {isCurrentChapterTranslated && !isTranslating && (
                <Button
                  type="button"
                  size="lg"
                  variant="secondary"
                  onClick={() => {
                    if (activeChapter) {
                      resetChapterTranslation(activeChapter.href);
                      toast.info(`Đã khôi phục chương "${activeChapter.title}" về bản gốc`);
                    }
                  }}
                  className="text-muted-foreground hover:text-red-400"
                  title="Khôi phục chương này về nguyên tác ban đầu"
                >
                  <RotateCcw />
                </Button>
              )}
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={() => setActiveTab("reader")}
              className="text-xs text-foreground"
            >
              <BookOpenCheck />
              <span>Xem Thử Trên Trình Đọc Sách</span>
            </Button>
          </div>
        </div>

        {/* Right Panel: Preview & Terminal Logs */}
        <Tabs
          value={rightTab}
          onValueChange={(value) => {
            if (value === "preview" || value === "terminal") setRightTab(value);
          }}
          className="flex-1 flex flex-col gap-0 h-full overflow-hidden bg-background"
        >
          {/* Right Sub-Header Tabs */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/40 flex-shrink-0">
            <TabsList>
              <TabsTrigger value="preview" className="px-3 text-xs">
                <Eye />
                <span>Xem Trước Chương</span>
              </TabsTrigger>
              <TabsTrigger value="terminal" className="px-3 text-xs">
                <Terminal />
                <span>Nhật Ký Terminal Log</span>
                {translationLogs.length > 0 && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary text-[9px] px-1 h-3.5 ml-1">
                    {translationLogs.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {rightTab === "terminal" ? (
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyLogs}
                  className="text-xs"
                  title="Sao chép toàn bộ nhật ký"
                >
                  {copiedLogs ? <Check /> : <Copy />}
                  <span>{copiedLogs ? "Đã sao chép" : "Sao chép"}</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={clearTranslationLogs}
                  className="text-xs text-muted-foreground hover:text-red-400 cursor-pointer"
                  title="Xóa nhật ký dịch"
                >
                  <Trash2 />
                  <span>Xóa</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {activeChapter && (
                  <span>
                    Chương {activeChapterIndex + 1}: <strong className="text-foreground">{activeChapter.title}</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Content Area */}
          <TabsContent value="preview" className="flex-1 overflow-hidden relative">
            <div className="w-full h-full p-4 overflow-hidden flex flex-col items-center justify-center">
              <div className="max-w-3xl w-full h-full bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
                {isLoadingPreview ? (
                  <div className="flex-1 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Spinner className="size-3.5" />
                    <span>Đang đọc nội dung chương...</span>
                  </div>
                ) : previewHtml ? (
                  <iframe
                    ref={iframeRef}
                    title="Chapter Translation Preview"
                    className="w-full h-full border-none select-text bg-white dark:bg-background"
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <Empty className="border-0">
                    <EmptyMedia variant="icon">
                      <FileText />
                    </EmptyMedia>
                    <EmptyDescription className="text-xs">
                      Không có nội dung để hiển thị.
                    </EmptyDescription>
                  </Empty>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Terminal Log Window — chi tiết hoá nhật ký dịch */}
          <TabsContent value="terminal" className="flex-1 overflow-hidden relative">
            <TranslationLogPanel
              logs={translationLogs}
              filter={logFilter}
              search={logSearch}
              autoScroll={logAutoScroll}
              onFilterChange={setLogFilter}
              onSearchChange={setLogSearch}
              onToggleAutoScroll={() => setLogAutoScroll((v) => !v)}
              onClearLogs={clearTranslationLogs}
              onCopyLogs={handleCopyLogs}
              isCopied={copiedLogs}
              endRef={terminalEndRef}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Entity & Terminology Review Modal */}
      <Dialog open={showEntityModal} onOpenChange={setShowEntityModal}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="-mx-4 -mt-4 rounded-t-xl border-b border-border bg-secondary/40 p-4">
            <DialogTitle className="flex items-center gap-2 text-xs">
              <Search className="size-4 text-primary" />
              <span>Kết Quả Trích Xuất Thuật Ngữ &amp; Tên Riêng</span>
              <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] px-1.5 h-4">
                {extractedCandidates.length} thực thể
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-[11px] leading-relaxed">
              Các tên nhân vật, địa danh và thuật ngữ quan trọng được phát hiện từ các chương sách. Bạn có thể chỉnh sửa bản dịch đề xuất trước khi thêm vào bộ từ điển Glossary:
            </DialogDescription>
          </DialogHeader>

          {/* Modal Body */}
          <div className="min-h-0 flex-1 overflow-y-auto flex flex-col gap-3">
            <div className="border border-border rounded-lg overflow-hidden">
              <Table className="text-xs">
                <TableHeader className="bg-secondary/60 text-[10px] uppercase font-semibold text-muted-foreground">
                  <TableRow>
                    <TableHead className="p-2 w-10 text-center">Chọn</TableHead>
                    <TableHead className="p-2">Tên / Thuật ngữ gốc</TableHead>
                    <TableHead className="p-2 w-20">Loại</TableHead>
                    <TableHead className="p-2 w-16 text-center">Tần suất</TableHead>
                    <TableHead className="p-2">Bản dịch đề xuất (Có thể sửa)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {extractedCandidates.map((c) => {
                    const isChecked = Boolean(selectedEntityNames[c.name]);
                    const currentVal = editedTranslations[c.name] ?? c.suggestedTranslation;

                    return (
                      <TableRow key={c.id} className="hover:bg-secondary/30 transition-colors">
                        <TableCell className="p-2 text-center">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) =>
                              setSelectedEntityNames({
                                ...selectedEntityNames,
                                [c.name]: Boolean(checked),
                              })
                            }
                            className="cursor-pointer"
                          />
                        </TableCell>
                        <TableCell className="p-2 font-mono text-[11px] text-foreground font-medium">
                          {c.name}
                        </TableCell>
                        <TableCell className="p-2">
                          <Badge variant="secondary" className="text-[9px] px-1 h-3.5">
                            {c.category === "person" ? "Nhân vật" : c.category === "place" ? "Địa danh" : "Thuật ngữ"}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-2 text-center text-[10px] font-mono text-muted-foreground">
                          {c.count}x
                        </TableCell>
                        <TableCell className="p-2">
                          <Input
                            type="text"
                            value={currentVal}
                            onChange={(e) =>
                              setEditedTranslations({
                                ...editedTranslations,
                                [c.name]: e.target.value,
                              })
                            }
                            className="w-full text-xs"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Modal Footer */}
          <DialogFooter className="sm:justify-between">
            <span className="text-[11px] text-muted-foreground">
              Đã chọn: <strong className="text-foreground">{Object.values(selectedEntityNames).filter(Boolean).length}</strong> mục
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowEntityModal(false)}
                className="text-xs"
              >
                Hủy
              </Button>
              <Button
                type="button"
                onClick={handleApplyApprovedEntities}
                className="text-xs font-medium shadow-xs"
              >
                <CheckSquare />
                <span>Áp Dụng Vào Glossary</span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
