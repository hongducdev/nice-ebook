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
  CheckSquare,
  Zap,
  ChevronDown,
  CheckCircle2,
  Image as ImageIcon,
  ArrowDown,
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import {
  TranslationLogPanel,
  filterLogs,
  type LogFilterKey,
} from "./TranslationLogPanel";
import { TONE_DESCRIPTIONS, TranslationTone } from "../../services/prompts/bookTranslator";
import { generateEpubCss, injectCssIntoHtml } from "../../utils/cssGenerator";
import { combinePreviewCss } from "../../utils/bookStyleAnalyzer";
import { sanitizeEpubHtml } from "../../utils/htmlSanitizer";
import { LanguageDetectionResult } from "../../utils/languageDetector";
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
    terminalLogs,
    clearTranslationLogs,
    activePreset,
    customCss,
    fontFamily,
    bookStyleSignature,
    bookStyleCss,
    autoDetectSourceLanguage,
    isExtractingEntities,
    extractedCandidates,
    extractBookEntities,
    applyApprovedEntitiesToGlossary,
    isGeneratingResearchBrief,
    generateBookResearchBrief,
    isAutoConfiguringAll,
    autoConfigureAllTranslationSettings,
    autoConfigResult,
    setAutoConfigResult,
    bookProfile,
    translatedChapters,
    getTranslationCoverage,
  } = useAppStore();

  const [scope, setScope] = useState<"single" | "unprocessed" | "all">("unprocessed");
  const [rightTab, setRightTab] = useState<"preview" | "terminal">("preview");
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isViewingCover, setIsViewingCover] = useState(false);

  // Auto-detect & Research state
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
  const [autoFollowPreview, setAutoFollowPreview] = useState(true);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef<boolean>(false);

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
      @keyframes liveTranslatePulse {
        0% { background-color: rgba(249, 115, 22, 0.28); outline: 2px solid rgba(249, 115, 22, 0.6); }
        50% { background-color: rgba(249, 115, 22, 0.12); outline: 1px solid rgba(249, 115, 22, 0.3); }
        100% { background-color: transparent; outline: none; }
      }
      .live-translating-block {
        animation: liveTranslatePulse 2s ease-out;
        border-radius: 4px;
        transition: background-color 0.3s;
      }
    `;

    // Guarantee that reading paper surface is never pitch-black from dark-mode shell bleed
    const readingPaperBaseRules = `
      html {
        background-color: #ffffff !important;
      }
      body {
        background-color: #ffffff !important;
        color: #1a1a1a !important;
        margin: 4% 6%;
        min-height: 100vh;
      }
      p, div, span, h1, h2, h3, h4, h5, h6, li, blockquote, dt, dd {
        color: #1a1a1a;
      }
    `;

    return readingPaperBaseRules + base + bilingualRules;
  }, [activePreset, customCss, fontFamily, bookStyleSignature]);

  const previewCss = useMemo(() => {
    return combinePreviewCss(bookStyleCss, fullCss);
  }, [bookStyleCss, fullCss]);

  const fullDoc = useMemo(() => {
    if (!previewHtml) return "";
    const safeHtml = sanitizeEpubHtml(previewHtml);
    return injectCssIntoHtml(safeHtml, previewCss);
  }, [previewHtml, previewCss]);

  const scrollPosRef = useRef<number>(0);

  const performAutoScroll = () => {
    if (!autoFollowPreview || !isTranslating) return;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);

    scrollRafRef.current = requestAnimationFrame(() => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc || !doc.body) return;

      try {
        isProgrammaticScrollRef.current = true;
        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 400);

        // 1. Bilingual mode: find newest translated element and scroll to it
        const bilingualEls = doc.querySelectorAll(".bilingual-translated");
        if (bilingualEls.length > 0) {
          const lastEl = bilingualEls[bilingualEls.length - 1] as HTMLElement;
          lastEl.classList.add("live-translating-block");
          lastEl.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }

        // 2. Specific block ID match
        const latestBlockId = translationProgress?.latestBlockId;
        if (latestBlockId) {
          const targetEl = doc.querySelector(
            `[data-block-id="${latestBlockId}"], [data-bilingual-for="${latestBlockId}"], #${latestBlockId}`
          ) as HTMLElement | null;
          if (targetEl) {
            targetEl.classList.add("live-translating-block");
            targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
          }
        }

        // 3. Proportional scroll down based on block translation progress
        if (translationProgress && translationProgress.totalBlocks > 0 && translationProgress.currentBlock > 0) {
          const ratio = translationProgress.currentBlock / translationProgress.totalBlocks;
          const maxScroll = (doc.documentElement?.scrollHeight || 0) - (doc.documentElement?.clientHeight || 0);
          if (maxScroll > 0) {
            const targetScroll = Math.min(maxScroll, maxScroll * ratio);
            doc.documentElement.scrollTo({
              top: targetScroll,
              behavior: "smooth",
            });
          }
        }
      } catch {
        // ignore scroll error
      }
    });
  };

  const handleIframeLoad = () => {
    if (iframeRef.current?.contentDocument) {
      const doc = iframeRef.current.contentDocument;
      try {
        // Add scroll listener inside iframe to detect user manual scrolling and pause auto-follow
        const onUserScroll = () => {
          if (!isTranslating || isProgrammaticScrollRef.current) return;
          const currentScroll = doc.documentElement?.scrollTop || doc.body?.scrollTop || 0;
          const maxScroll = (doc.documentElement?.scrollHeight || 0) - (doc.documentElement?.clientHeight || 0);
          // If user scrolled up significantly (> 220px away from bottom), pause auto-follow
          if (maxScroll - currentScroll > 220) {
            setAutoFollowPreview(false);
          }
        };
        doc.addEventListener("scroll", onUserScroll, { passive: true });

        if (isTranslating && autoFollowPreview) {
          performAutoScroll();
          return;
        }

        // Default: restore previous scroll position
        if (scrollPosRef.current > 0) {
          if (doc.documentElement) doc.documentElement.scrollTop = scrollPosRef.current;
          if (doc.body) doc.body.scrollTop = scrollPosRef.current;
        }
      } catch {
        // ignore iframe access errors in sandbox
      }
    }
  };

  useEffect(() => {
    if (iframeRef.current?.contentDocument) {
      const doc = iframeRef.current.contentDocument;
      scrollPosRef.current = doc.documentElement?.scrollTop || doc.body?.scrollTop || 0;
    }
  }, [fullDoc]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // When activeChapterIndex or translation chapter advances, cleanly reset scroll to top for the new chapter
  useEffect(() => {
    scrollPosRef.current = 0;
    setAutoFollowPreview(true);
    setIsViewingCover(false);
  }, [activeChapterIndex, translationProgress?.currentChapterHref]);

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

  // Load preview HTML whenever activeChapterIndex, modifiedChapters, or isViewingCover changes
  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      if (!currentBook) {
        setPreviewHtml("");
        return;
      }

      // 1. If user is explicitly viewing book cover
      if (isViewingCover) {
        if (currentBook.cover_data_url) {
          setPreviewHtml(`
            <div class="chapter-body book-cover-page" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:85vh; text-align:center; padding:1.5rem 0;">
              <div style="max-width:90%; max-height:75vh; border-radius:10px; overflow:hidden; box-shadow:0 12px 30px rgba(0,0,0,0.25); border:1px solid rgba(0,0,0,0.1); margin:0 auto;">
                <img src="${currentBook.cover_data_url}" alt="${currentBook.title}" style="max-width:100%; max-height:70vh; object-fit:contain; display:block;" />
              </div>
              <h1 style="margin-top:1.5rem; font-size:1.3rem; font-weight:700; border-bottom:none; margin-bottom:0.25rem;">${currentBook.title}</h1>
              <p style="color:#666; font-size:0.9rem; margin-top:0;">${currentBook.author || ""}</p>
            </div>
          `);
        } else {
          setPreviewHtml(`
            <div class="chapter-body book-cover-page" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:70vh; text-align:center;">
              <div style="width:140px; height:200px; border-radius:8px; border:2px dashed #999; display:flex; align-items:center; justify-content:center; margin-bottom:1rem; color:#888;">
                <span>Chưa có ảnh bìa</span>
              </div>
              <h1>${currentBook.title}</h1>
              <p style="color:#666;">${currentBook.author || ""}</p>
            </div>
          `);
        }
        setIsLoadingPreview(false);
        return;
      }

      if (!activeChapter) {
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

        // Auto-heal broken cover image path inside chapter HTML if cover_data_url is present
        if (currentBook.cover_data_url && (raw.includes("<img") || raw.includes("<image"))) {
          raw = raw.replace(/<img\b([^>]*)\bsrc=["']([^"']*)["']([^>]*)\/?>/gi, (match, before, src, after) => {
            if (/cover|bia|titlepage/i.test(src) || /cover|bia/i.test(activeChapter.href) || /cover|bia/i.test(activeChapter.title)) {
              return `<img${before}src="${currentBook.cover_data_url}"${after}/>`;
            }
            return match;
          });
          raw = raw.replace(/<image\b([^>]*)\b(?:xlink:href|href)=["']([^"']*)["']([^>]*)\/?>/gi, (match, before, href, after) => {
            if (/cover|bia|titlepage/i.test(href) || /cover|bia/i.test(activeChapter.href) || /cover|bia/i.test(activeChapter.title)) {
              return `<image${before}href="${currentBook.cover_data_url}" xlink:href="${currentBook.cover_data_url}"${after}/>`;
            }
            return match;
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
  }, [activeChapterIndex, currentBook, currentFilePath, currentFileBytes, modifiedChapters, isViewingCover]);

  // Aggregate statistics — single source of truth (see the store's
  // getTranslationCoverage) so the badge, the stepper and this panel cannot
  // disagree about what "translated" means.
  const translationCoverage = getTranslationCoverage();
  const totalChapters = translationCoverage.total;
  const translatedCount = translationCoverage.translated;

  // Untranslated chapters identification (precise list)
  const untranslatedChapterIndices = useMemo(() => {
    if (!currentBook) return [];
    return currentBook.chapters
      .map((ch, idx) => ({ ch, idx }))
      .filter(
        ({ ch }) =>
          !translatedChapters[ch.href] &&
          !(Object.keys(translatedChapters).length === 0 && modifiedChapters[ch.href])
      )
      .map(({ idx }) => idx);
  }, [currentBook, translatedChapters, modifiedChapters]);

  const unprocessedCount = untranslatedChapterIndices.length;
  const nextUntranslatedIndex =
    untranslatedChapterIndices.find((idx) => idx > activeChapterIndex) ??
    untranslatedChapterIndices[0];

  // Handle start translation
  async function handleStartTranslation() {
    if (!currentBook) {
      toast.error("Vui lòng mở một cuốn sách để bắt đầu dịch!");
      return;
    }

    // Switch to preview tab and exit cover mode so user immediately sees live translation!
    setRightTab("preview");
    setIsViewingCover(false);
    scrollPosRef.current = 0;

    if (scope === "single") {
      const ok = await translateSingleChapter(activeChapterIndex);
      if (!ok) {
        toast.error("Quá trình dịch bị lỗi hoặc đã dừng.");
      }
    } else if (scope === "unprocessed") {
      const ok = await batchTranslateChapters(untranslatedChapterIndices, true);
      if (ok) {
        toast.success("Đã hoàn thành lượt dịch hàng loạt!");
      }
    } else {
      const ok = await batchTranslateChapters(undefined, false);
      if (ok) {
        toast.success("Đã hoàn thành dịch toàn bộ cuốn sách!");
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
  }

  // Handle remove term from glossary
  function handleRemoveGlossaryTerm(key: string) {
    const updated = { ...(translationConfig.glossary || {}) };
    delete updated[key];
    setTranslationConfig({ glossary: updated });
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

  // Handle auto-configure all settings at once (run once and persisted unless forced)
  async function handleAutoConfigureAll(force = false) {
    toast.loading(
      force
        ? "Đang tự động cấu hình lại (quét mới ngôn ngữ, thể loại & thuật ngữ)..."
        : "Đang tự động phân tích ngôn ngữ, thể loại, bối cảnh và thuật ngữ sách...",
      { id: "auto-config" }
    );
    const res = await autoConfigureAllTranslationSettings({ force });
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
    } else {
      toast.warning("Không thể nhận diện ngôn ngữ của sách này.");
    }
  }

  // Handle auto-extract entities and terminology
  async function handleScanEntities() {
    const candidates = await extractBookEntities();
    if (candidates.length > 0) {
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
      toast.info("Không tìm thấy thuật ngữ mới nào.");
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
    const brief = await generateBookResearchBrief();
    if (brief) {
      toast.success("Đã hoàn tất nghiên cứu bối cảnh tác phẩm!");
    } else {
      toast.error("Không thể lập hồ sơ nghiên cứu.");
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
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 bg-transparent">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg flex items-center justify-center bg-primary/15 text-primary border border-primary/30 shrink-0">
            <Languages size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading font-medium text-sm text-foreground leading-none">
                Bước 2: Dịch Thuật Sách AI
              </h1>
              <Badge variant="secondary" className="bg-primary/10 text-primary text-xs px-2 h-4.5 rounded-full">
                Surgical XHTML Preserved
              </Badge>
              {isCurrentChapterTranslated && (
                <Badge
                  variant="secondary"
                  className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs px-2 h-4.5 rounded-full"
                >
                  Chương này đã dịch
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tác phẩm: <strong className="text-foreground font-medium">{currentBook.title}</strong>
            </p>
          </div>
        </div>

        {/* Header Stats & Gateway indicator */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="h-7 gap-1.5 px-2.5 text-xs font-normal">
            <Layers className="text-primary" />
            <span className="text-muted-foreground">Đã dịch:</span>
            <strong className="text-foreground">{translatedCount}/{totalChapters} ch.</strong>
          </Badge>

          <div className="flex items-center gap-1.5">
            <AgentModelSelector compact={false} className="h-7" />
          </div>
        </div>
      </header>

      {/* Bố cục A (ba vùng): vùng giữa là bảng/nhật ký, cột cấu hình 22rem dựng bên phải.
          DOM giữ nguyên thứ tự (panel trước, vùng chính sau) và đảo chiều bằng flex-row-reverse,
          nên không phải di chuyển khối JSX nào — xem ghi chú đổi thứ tự Tab ở journal. */}
      <div className="flex-1 flex flex-row-reverse overflow-hidden">
        {/* Left Control Panel */}
        <div className="w-[22rem] flex-shrink-0 border-l border-border bg-card/30 flex flex-col overflow-y-auto p-4 gap-4">
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
                  {autoConfigResult ? (
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                  ) : (
                    <Sparkles className="size-3.5 text-primary" />
                  )}
                  <span>{autoConfigResult ? "Cấu Hình Dịch Thuật Đã Lưu" : "Tự Động Cấu Hình Toàn Diện"}</span>
                </CardTitle>
                <Badge
                  variant="secondary"
                  className={
                    autoConfigResult
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs px-1.5 h-4 font-medium"
                      : "bg-primary/10 text-primary text-xs px-1.5 h-4"
                  }
                >
                  {autoConfigResult ? "Đã lưu 1 lần" : "Tự động 1-Click"}
                </Badge>
              </div>
              <CardDescription className="text-xs leading-relaxed mt-0.5">
                {autoConfigResult
                  ? "Sách này đã được AI tự động phân tích và lưu cấu hình. AI sẽ dùng cấu hình này cho mọi chương, trừ khi bạn ấn cấu hình lại."
                  : "Tự động nhận diện ngôn ngữ, phân tích thể loại đề xuất văn phong, trích xuất thuật ngữ &amp; nghiên cứu bối cảnh sách trong 1 lượt."}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-2">
              {autoConfigResult ? (
                <>
                  <div className="p-2.5 rounded bg-card/90 border border-border text-xs flex flex-col gap-1.5 text-foreground animate-in fade-in duration-200">
                    <div className="flex items-center justify-between font-semibold text-emerald-600 dark:text-emerald-400">
                      <span className="flex items-center gap-1">
                        <Check className="size-3" />
                        <span>Đã cấu hình tối ưu</span>
                      </span>
                      <span className="text-muted-foreground font-mono">{autoConfigResult.toneLabel}</span>
                    </div>
                    <div className="text-muted-foreground leading-tight">
                      Ngôn ngữ: <strong>{autoConfigResult.detectedLanguage?.languageName || "Tự động"}</strong> ➔ <strong>{translationConfig.targetLang}</strong>
                    </div>
                    <div className="text-muted-foreground leading-tight">
                      Bộ thuật ngữ: <strong className="text-primary">{autoConfigResult.properNamesCount} tên riêng</strong> + <strong className="text-primary">{autoConfigResult.termsCount} thuật ngữ</strong> = <strong>{Object.keys(translationConfig.glossary || {}).length} mục</strong>
                    </div>
                    <div className="text-muted-foreground leading-tight">
                      Mô hình: <strong className="font-mono text-foreground">{autoConfigResult.activeEngineLabel}</strong>
                    </div>
                    <div className="text-muted-foreground leading-tight">
                      Bối cảnh: <strong>{autoConfigResult.researchBriefGenerated ? "Đã lập hồ sơ" : "Bỏ qua"}</strong> • Đã quét <strong>{autoConfigResult.entitiesExtractedCount} thực thể</strong>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isAutoConfiguringAll}
                    onClick={() => handleAutoConfigureAll(true)}
                    className="w-full text-xs shadow-xs gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Phân tích lại từ đầu để cập nhật lại toàn bộ ngôn ngữ, văn phong và thuật ngữ mới"
                  >
                    {isAutoConfiguringAll ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RotateCcw className="size-3.5" />
                    )}
                    <span>{isAutoConfiguringAll ? "Đang phân tích lại toàn bộ..." : "Tự Động Cấu Hình Lại"}</span>
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  disabled={isAutoConfiguringAll}
                  onClick={() => handleAutoConfigureAll(false)}
                  className="w-full text-xs shadow-xs cursor-pointer"
                  title="Phân tích và tự động cấu hình toàn bộ cài đặt dịch thuật"
                >
                  {isAutoConfiguringAll ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Sparkles />
                  )}
                  <span>{isAutoConfiguringAll ? "Đang tự động thiết lập toàn bộ..." : "Tự Động Thiết Lập Toàn Bộ"}</span>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Section: AI Model & Gateway Selection */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cổng AI &amp; Mô hình dịch
              </span>
              {activeGateway ? (
                <Badge variant="outline" className="text-xs h-4 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 gap-1 font-mono">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{activeGateway.name}</span>
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs h-4">
                  Lõi Cục Bộ
                </Badge>
              )}
            </div>
            <AgentModelSelector className="w-full" />
          </div>

          {/* Section 1: Language Pairs */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
              <div className="flex items-center gap-1.5 text-xs bg-secondary/60 px-2 py-1 rounded border border-border">
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
                <AlertDescription className="text-xs text-amber-600 dark:text-amber-400">
                  Sách gốc đã là Tiếng Việt. Bạn có muốn đổi ngôn ngữ đích sang tiếng khác hoặc dịch sang Tiếng Anh?
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-end gap-2 w-full min-w-0">
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <Label htmlFor="translator-source-lang" className="text-xs text-muted-foreground font-medium truncate">Ngôn ngữ nguồn</Label>
                <Select
                  value={translationConfig.sourceLang}
                  onValueChange={(value) => setTranslationConfig({ sourceLang: value })}
                >
                  <SelectTrigger id="translator-source-lang" className="w-full min-w-0 text-xs overflow-hidden">
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
                className="h-8 mb-0 shrink-0"
                title="Đảo ngược cặp ngôn ngữ"
              >
                <ArrowRightLeft className="size-3.5" />
              </Button>

              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <Label htmlFor="translator-target-lang" className="text-xs text-muted-foreground font-medium truncate">Ngôn ngữ đích</Label>
                <Select
                  value={translationConfig.targetLang}
                  onValueChange={(value) => setTranslationConfig({ targetLang: value })}
                >
                  <SelectTrigger id="translator-target-lang" className="w-full min-w-0 text-xs overflow-hidden">
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
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
            <p className="text-xs text-muted-foreground leading-relaxed">
              {translationConfig.mode === "replace"
                ? "Thay thế chữ gốc bằng bản dịch tiếng Việt mượt mà để đọc trọn vẹn tác phẩm."
                : "Chèn bản dịch ngay dưới mỗi đoạn gốc với định dạng song ngữ, lý tưởng để học ngoại ngữ."}
            </p>

            <Label
              htmlFor="toggle-translate-titles"
              className="flex items-center gap-1.5 text-xs font-normal text-foreground cursor-pointer select-none mt-1"
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

            <Label
              htmlFor="toggle-convert-currency"
              className="flex items-center gap-1.5 text-xs font-normal text-foreground cursor-pointer select-none"
            >
              <Checkbox
                id="toggle-convert-currency"
                checked={translationConfig.convertCurrency !== false}
                onCheckedChange={(checked) =>
                  setTranslationConfig({ convertCurrency: Boolean(checked) })
                }
              />
              <span>Quy đổi tiền tệ sang VNĐ (VD: 5000 NDT ➔ 5000 NDT (19.3 triệu VND))</span>
            </Label>
          </div>

          {/* Section 3: Tone Presets */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                    <span className="text-xs opacity-80 line-clamp-2 leading-tight">
                      {info.description}
                    </span>
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>

          {/* Section 4: Contextual Research Brief */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                  className={`text-xs px-1.5 h-4 ${
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
                      className="flex items-center gap-1.5 text-xs font-normal text-foreground cursor-pointer select-none"
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
                    className="text-xs font-mono resize-none leading-relaxed"
                  />

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
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
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                5. Thuật ngữ &amp; Tên riêng (Glossary)
              </span>
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
            </div>
            <Card size="sm" className="shrink-0 bg-secondary/20">
              <CardHeader
                className="cursor-pointer select-none py-2.5 px-3 flex flex-row items-center justify-between gap-2"
                onClick={() => setShowGlossary(!showGlossary)}
              >
                <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
                  <Sliders className="size-3.5 text-primary" />
                  <span>Danh mục thuật ngữ</span>
                </CardTitle>
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {extractedCandidates.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setShowEntityModal(true)}
                      className="text-xs shadow-xs gap-1 h-6 px-2"
                      title="Xem lại hoặc chỉnh sửa danh sách các thực thể đã trích xuất"
                    >
                      <Eye className="size-3 text-primary" />
                      <span>Duyệt ({extractedCandidates.length})</span>
                    </Button>
                  )}

                  <Badge variant="secondary" className="text-xs px-1.5 h-4">
                    {Object.keys(translationConfig.glossary || {}).length} từ
                  </Badge>
                  <ChevronDown
                    className={`size-3.5 text-muted-foreground transition-transform duration-200 ${
                      showGlossary ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </CardHeader>

            {showGlossary && (
              <>
                <Separator />
                <CardContent className="flex flex-col gap-2.5 animate-in fade-in duration-150 p-3">
                  <p className="text-xs text-muted-foreground leading-tight">
                    Cố định tên nhân vật hoặc thuật ngữ để bản dịch luôn đồng nhất qua mọi chương:
                  </p>

                  {/* Term List */}
                  <div className="max-h-52 overflow-y-auto flex flex-col gap-1.5 pr-1">
                    {Object.entries(translationConfig.glossary || {}).length === 0 ? (
                      <div className="py-3 px-2 text-center text-xs text-muted-foreground italic bg-background/50 rounded border border-dashed border-border">
                        Chưa có thuật ngữ nào được tạo.
                      </div>
                    ) : (
                      Object.entries(translationConfig.glossary || {}).map(([k, v]) => (
                        <div
                          key={k}
                          className="flex items-center justify-between gap-2 bg-card/90 hover:bg-card px-2.5 py-1.5 rounded-md border border-border text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="font-mono text-xs text-foreground truncate" title={k}>
                              {k}
                            </span>
                            <span className="text-muted-foreground text-xs shrink-0">➔</span>
                            <span className="font-medium text-xs text-primary truncate" title={v}>
                              {v}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleRemoveGlossaryTerm(k)}
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 size-6 shrink-0"
                            title="Xóa thuật ngữ"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Term Input */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
                    <Input
                      type="text"
                      placeholder="Gốc (VD: Harry)"
                      value={newTermKey}
                      onChange={(e) => setNewTermKey(e.target.value)}
                      className="flex-1 text-xs h-8"
                    />
                    <Input
                      type="text"
                      placeholder="Dịch (VD: Harry)"
                      value={newTermVal}
                      onChange={(e) => setNewTermVal(e.target.value)}
                      className="flex-1 text-xs h-8"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddGlossaryTerm}
                      className="h-8 px-2.5 shrink-0 text-xs gap-1"
                      title="Thêm thuật ngữ"
                    >
                      <Plus className="size-3.5" />
                      <span>Thêm</span>
                    </Button>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
          </div>

          {/* Section 6: LinguaGacha Engine Optimizations */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Zap className="size-3 text-amber-500" />
                <span>6. Cơ chế dịch LinguaGacha</span>
              </span>
              <Badge variant="outline" className="text-xs px-1 py-0 h-3.5 border-primary/40 text-primary">
                Smart Engine
              </Badge>
            </div>

            <Card size="sm" className="shrink-0 bg-secondary/20 p-2.5 flex flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="toggle-sliding-context"
                  className="flex items-center gap-2 cursor-pointer text-xs font-normal"
                >
                  <Checkbox
                    id="toggle-sliding-context"
                    checked={translationConfig.enableSlidingContext !== false}
                    onCheckedChange={(checked) =>
                      setTranslationConfig({ enableSlidingContext: Boolean(checked) })
                    }
                  />
                  <span>Ngữ cảnh trượt (Sliding Context - giữ chuẩn ngôi xưng)</span>
                </Label>

                <Label
                  htmlFor="toggle-adaptive-downsizing"
                  className="flex items-center gap-2 cursor-pointer text-xs font-normal"
                >
                  <Checkbox
                    id="toggle-adaptive-downsizing"
                    checked={translationConfig.enableAdaptiveDownsizing !== false}
                    onCheckedChange={(checked) =>
                      setTranslationConfig({ enableAdaptiveDownsizing: Boolean(checked) })
                    }
                  />
                  <span>Tự động phân rã mẻ (Adaptive Downsizing khi lỗi)</span>
                </Label>
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Số luồng dịch song song:</span>
                  <span className="font-mono text-[11px] font-semibold text-primary">
                    {translationConfig.concurrency || 1}x ({translationConfig.concurrency === 3 ? "Tối đa" : translationConfig.concurrency === 2 ? "Nhanh" : "Tuần tự"})
                  </span>
                </div>
                <ToggleGroup
                  type="single"
                  value={String(translationConfig.concurrency || 1)}
                  onValueChange={(val) => {
                    if (val === "1" || val === "2" || val === "3") {
                      setTranslationConfig({ concurrency: Number(val) as 1 | 2 | 3 });
                    }
                  }}
                  className="grid grid-cols-3 border border-border rounded-xl p-0.5 bg-secondary/50 w-full"
                >
                  <ToggleGroupItem value="1" size="sm" className="h-7 text-xs rounded-lg font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-xs">
                    1x (Tuần tự)
                  </ToggleGroupItem>
                  <ToggleGroupItem value="2" size="sm" className="h-7 text-xs rounded-lg font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-xs">
                    2x (Nhanh)
                  </ToggleGroupItem>
                  <ToggleGroupItem value="3" size="sm" className="h-7 text-xs rounded-lg font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-xs">
                    3x (Tối đa)
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </Card>
          </div>

          {/* Section 7: Scope & Chapter Selector */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              7. Phạm vi dịch
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
                <Label htmlFor="translator-chapter" className="text-xs text-muted-foreground font-medium">Chọn chương cần dịch:</Label>
                <Select
                  value={isViewingCover ? "cover" : String(activeChapterIndex)}
                  onValueChange={(value) => {
                    if (value === "cover") {
                      setIsViewingCover(true);
                    } else {
                      setIsViewingCover(false);
                      setActiveChapterIndex(Number(value));
                    }
                  }}
                >
                  <SelectTrigger id="translator-chapter" className="w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {currentBook.cover_data_url && (
                        <SelectItem key="book-cover-item" value="cover" className="font-medium text-primary">
                          🖼️ Trang Bìa Tác Phẩm (Cover)
                        </SelectItem>
                      )}
                      {currentBook.chapters.map((ch, idx) => {
                        const isDone = Boolean(translatedChapters[ch.href] || modifiedChapters[ch.href]);
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
                  <Button type="button" size="sm" className="flex-1 text-xs" onClick={() => setActiveTab("reader")}>
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
                <span className="text-xs text-muted-foreground">
                  Chương {translationProgress.currentChapterIndex}/{translationProgress.totalChapters}
                  {translationProgress.totalBlocks > 0 &&
                    ` • ${translationProgress.currentBlock}/${translationProgress.totalBlocks} đoạn`}
                </span>
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-2">
              {!isTranslating ? (
                <>
                  {scope === "single" && isCurrentChapterTranslated && nextUntranslatedIndex !== undefined ? (
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => {
                        setRightTab("preview");
                        setIsViewingCover(false);
                        scrollPosRef.current = 0;
                        setActiveChapterIndex(nextUntranslatedIndex);
                        void translateSingleChapter(nextUntranslatedIndex);
                      }}
                      className="flex-1 text-xs font-semibold shadow-sm cursor-pointer"
                      title={`Dịch tiếp chương ${nextUntranslatedIndex + 1}: ${currentBook.chapters[nextUntranslatedIndex]?.title}`}
                    >
                      <Play className="fill-current" />
                      <span>Dịch Tiếp: Chương {nextUntranslatedIndex + 1}</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="lg"
                      onClick={handleStartTranslation}
                      disabled={scope === "unprocessed" && unprocessedCount === 0}
                      className="flex-1 text-xs font-semibold shadow-sm cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Play className="fill-current" />
                      <span>
                        {scope === "single"
                          ? isCurrentChapterTranslated ? "Dịch Lại Chương Này" : "Bắt Đầu Dịch Chương Này"
                          : scope === "unprocessed"
                          ? unprocessedCount > 0
                            ? `Dịch ${unprocessedCount} Chương Chưa Dịch`
                            : "Tất Cả Chương Đã Dịch Xong"
                          : `Dịch Toàn Bộ ${totalChapters} Chương`}
                      </span>
                    </Button>
                  )}

                  {isCurrentChapterTranslated && scope === "single" && (
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      onClick={handleStartTranslation}
                      className="text-xs px-3 text-muted-foreground hover:text-foreground cursor-pointer gap-1.5"
                      title="Dịch lại chương này từ nguyên tác ban đầu"
                    >
                      <RotateCcw className="size-3.5" />
                      <span>Dịch Lại</span>
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  variant="destructive"
                  onClick={stopTranslation}
                  className="flex-1 text-xs font-semibold shadow-sm cursor-pointer"
                >
                  <Square className="fill-current" />
                  <span>Dừng / Hủy Bỏ</span>
                </Button>
              )}
            </div>

            {/* Scope guidance hints */}
            {!isTranslating && scope === "single" && unprocessedCount > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                Còn <strong className="text-foreground">{unprocessedCount}</strong> chương chưa dịch. Chuyển phạm vi sang{" "}
                <button
                  type="button"
                  onClick={() => setScope("unprocessed")}
                  className="text-primary underline hover:opacity-80 font-medium cursor-pointer"
                >
                  "Chưa dịch ({unprocessedCount})"
                </button>{" "}
                để dịch hàng loạt.
              </p>
            )}

            {!isTranslating && scope === "unprocessed" && unprocessedCount === 0 && totalChapters > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                Tất cả các chương đã có bản dịch. Chọn{" "}
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className="text-primary underline hover:opacity-80 font-medium cursor-pointer"
                >
                  "Toàn bộ ({totalChapters})"
                </button>{" "}
                nếu bạn muốn dịch lại toàn bộ sách.
              </p>
            )}

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

        {/* Vùng chính (phương án A, ba vùng): bảng chương là bề mặt chính, nằm trên khu xem trước / nhật ký.
            Bảng chỉ đọc dữ liệu sẵn có (translatedChapters, translationProgress, activeChapterIndex) và gọi
            đúng hai handler cũ (setActiveChapterIndex, translateSingleChapter) — không thêm logic. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border bg-card/30 px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">
                Danh sách chương
                <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">
                  {translatedCount}/{currentBook.chapters.length} đã dịch
                </span>
              </h2>
              {isTranslating && translationProgress && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  Đang dịch chương {translationProgress.currentChapterIndex} · {translationProgress.percent}%
                </span>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-card shadow-xs">
              <table className="w-full table-fixed">
                <caption className="sr-only">Danh sách chương và trạng thái dịch</caption>
                <thead className="sticky top-0 z-10 bg-secondary/80 backdrop-blur-xs">
                  <tr className="h-9 border-b border-border text-xs font-medium text-muted-foreground">
                    <th className="hidden w-[52px] px-2 text-center tabular-nums sm:table-cell">#</th>
                    <th className="px-3 text-left">Chương</th>
                    <th className="w-[104px] px-2 text-center whitespace-nowrap">Trạng thái</th>
                    <th className="w-[88px] px-3 text-right"><span className="sr-only">Thao tác</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {currentBook.chapters.map((chapter, index) => {
                    const isTranslated = Boolean(translatedChapters[chapter.href]);
                    const isCurrent = index === activeChapterIndex;
                    const isRunning =
                      isTranslating && translationProgress?.currentChapterIndex === index + 1;

                    return (
                      <tr
                        key={chapter.id || chapter.href}
                        data-active={isCurrent ? "true" : undefined}
                        className={`h-10 cursor-pointer transition-colors ${
                          isCurrent ? "bg-[var(--ui-table-selected)]" : "hover:bg-[var(--ui-table-hover)]"
                        }`}
                        onClick={() => setActiveChapterIndex(index)}
                      >
                        <td className="hidden px-2 text-xs tabular-nums text-muted-foreground sm:table-cell text-center font-mono">
                          {String(index + 1).padStart(3, "0")}
                        </td>
                        <td className="min-w-0 px-3">
                          <p className={`truncate text-xs sm:text-sm ${isCurrent ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>
                            {chapter.title}
                          </p>
                        </td>
                        <td className="w-[104px] px-2 text-center">
                          {isRunning ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary/15 border border-primary/30 px-2 py-0.5 text-[11px] font-medium text-primary animate-pulse">
                              <Loader2 className="size-3 animate-spin" />
                              Đang dịch
                            </span>
                          ) : isTranslated ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              <Check className="size-3" />
                              Đã dịch
                            </span>
                          ) : (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-secondary/80 border border-border/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              Chưa dịch
                            </span>
                          )}
                        </td>
                        <td className="w-[88px] px-3 text-right">
                          <button
                            type="button"
                            className="inline-flex h-7 items-center whitespace-nowrap rounded-lg border border-border/80 bg-secondary/60 hover:bg-secondary px-2.5 text-xs font-medium text-foreground transition-colors shadow-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              void translateSingleChapter(index);
                            }}
                            disabled={isTranslating}
                            title={isTranslated ? `Dịch lại chương ${index + 1}` : `Dịch chương ${index + 1}`}
                          >
                            {isTranslated ? "Dịch lại" : "Dịch"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                  <Badge variant="secondary" className="bg-primary/10 text-primary text-xs px-1 h-3.5 ml-1">
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
                {isTranslating && (
                  <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs gap-1.5 px-2 h-5 font-medium animate-pulse">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    <span>Real-time Stream</span>
                  </Badge>
                )}
                {currentBook?.cover_data_url && (
                  <Button
                    type="button"
                    variant={isViewingCover ? "default" : "outline"}
                    size="xs"
                    onClick={() => setIsViewingCover((v) => !v)}
                    className="h-6 text-xs gap-1 shadow-2xs cursor-pointer"
                    title={isViewingCover ? "Quay lại xem chương đang dịch" : "Xem trang bìa tác phẩm"}
                  >
                    <ImageIcon className="size-3" />
                    <span>{isViewingCover ? "Xem Chương" : "Xem Bìa"}</span>
                  </Button>
                )}
                {isViewingCover ? (
                  <span className="flex items-center gap-1.5 text-primary font-medium">
                    <span>Trang Bìa Tác Phẩm (Cover)</span>
                  </span>
                ) : activeChapter ? (
                  <span className="flex items-center gap-1.5 truncate">
                    {isTranslating && (
                      <span className="relative flex size-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full size-2 bg-primary" />
                      </span>
                    )}
                    <span>
                      Chương {activeChapterIndex + 1}: <strong className="text-foreground">{activeChapter.title}</strong>
                    </span>
                    {isTranslating && translationProgress && translationProgress.percent > 0 && (
                      <Badge variant="outline" className="text-xs h-4 font-mono text-primary border-primary/30 px-1 ml-0.5">
                        {translationProgress.percent}%
                      </Badge>
                    )}
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* Content Area */}
          <TabsContent value="preview" className="flex-1 overflow-hidden relative">
            <div className="w-full h-full p-4 overflow-hidden flex flex-col items-center justify-center">
              <div className="max-w-3xl w-full h-full bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col relative">
                {isLoadingPreview && (
                  <div className="absolute inset-0 bg-background/60 backdrop-blur-xs flex items-center justify-center z-10 animate-in fade-in duration-150">
                    <Badge variant="outline" className="text-xs border-primary/40 text-primary gap-1.5 bg-card/90 shadow-sm py-1.5 px-3">
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Đang tải nội dung chương...</span>
                    </Badge>
                  </div>
                )}
                {previewHtml ? (
                  <iframe
                    ref={iframeRef}
                    title="Chapter Translation Preview"
                    srcDoc={fullDoc}
                    onLoad={handleIframeLoad}
                    className="w-full h-full border-none select-text bg-white"
                    sandbox="allow-same-origin"
                  />
                ) : !isLoadingPreview && (
                  <Empty className="border-0">
                    <EmptyMedia variant="icon">
                      <FileText />
                    </EmptyMedia>
                    <EmptyDescription className="text-xs">
                      Không có nội dung để hiển thị.
                    </EmptyDescription>
                  </Empty>
                )}

                {/* Floating button to resume auto-following translation if paused by user scroll */}
                {isTranslating && !autoFollowPreview && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setAutoFollowPreview(true);
                      performAutoScroll();
                    }}
                    className="absolute bottom-4 right-4 z-20 shadow-md border border-primary/40 text-xs gap-1.5 animate-in fade-in bg-card/95 hover:bg-card cursor-pointer"
                    title="Tiếp tục tự động cuộn theo các đoạn văn đang dịch"
                  >
                    <ArrowDown className="size-3.5 text-primary animate-bounce" />
                    <span>Cuộn theo tiến trình dịch</span>
                  </Button>
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
      </div>

      {/* Entity & Terminology Review Modal */}
      <Dialog open={showEntityModal} onOpenChange={setShowEntityModal}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="-mx-4 -mt-4 rounded-t-xl border-b border-border bg-secondary/40 p-4">
            <DialogTitle className="flex items-center gap-2 text-xs">
              <Search className="size-4 text-primary" />
              <span>Kết Quả Trích Xuất Thuật Ngữ &amp; Tên Riêng</span>
              <Badge variant="secondary" className="bg-primary/10 text-primary text-xs px-1.5 h-4">
                {extractedCandidates.length} thực thể
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Các tên nhân vật, địa danh và thuật ngữ quan trọng được phát hiện từ các chương sách. Bạn có thể chỉnh sửa bản dịch đề xuất trước khi thêm vào bộ từ điển Glossary:
            </DialogDescription>
          </DialogHeader>

          {/* Modal Body */}
          <div className="min-h-0 flex-1 overflow-y-auto flex flex-col gap-3">
            <div className="border border-border rounded-lg overflow-hidden">
              <Table className="text-xs">
                <TableHeader className="bg-secondary/60 text-xs uppercase font-semibold text-muted-foreground">
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
                        <TableCell className="p-2 font-mono text-xs text-foreground font-medium">
                          {c.name}
                        </TableCell>
                        <TableCell className="p-2">
                          <Badge variant="secondary" className="text-xs px-1 h-3.5">
                            {c.category === "person" ? "Nhân vật" : c.category === "place" ? "Địa danh" : "Thuật ngữ"}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-2 text-center text-xs font-mono text-muted-foreground">
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
            <span className="text-xs text-muted-foreground">
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
