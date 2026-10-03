import { 
  AlignJustify, 
  AlignLeft, 
  RotateCcw, 
  SlidersHorizontal, 
  Languages, 
  Check, 
  Wand2, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  RefreshCw, 
  Copy, 
  Code2, 
  FileCode, 
  BookOpen, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  ShieldCheck,
  Type,
  Layers
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Slider } from "../ui/slider";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "../ui/empty";
import { useAppStore } from "../../stores/useAppStore";
import { VIETNAMESE_FONTS } from "../../utils/vietnameseHelper";
import { generateEpubCss, injectCssIntoHtml } from "../../utils/cssGenerator";
import { combinePreviewCss, isVietnameseSafeFont } from "../../utils/bookStyleAnalyzer";
import { sanitizeEpubHtml } from "../../utils/htmlSanitizer";
import { autoPaginateAndStructureChapterHtml } from "../../utils/chapterPaginator";
import { toast } from "sonner";

export function TypographyControls() {
  const {
    activePreset,
    fontSize,
    lineHeight,
    firstLineIndent,
    dropCaps,
    sceneDivider,
    textAlign,
    fontFamily,
    customCss,
    isVietnameseBook,
    updateTypography,
    currentBook,
    currentFilePath,
    currentFileBytes,
    activeChapterIndex,
    setActiveChapterIndex,
    modifiedChapters,
    bookStyleSignature,
    bookStyleCss,
    styleAuditReport,
    isAuditingStyle,
    auditAndFixBookStyle,
    applyAiStyleFixes,
    clearStyleAuditReport,
    revertToOriginalStyle,
    analyzeBookStyle,
    setActiveTab: setAppActiveTab,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<"style" | "ai" | "css">("style");
  const [cssViewMode, setCssViewMode] = useState<"overrides" | "original">("overrides");
  const [previewTheme, setPreviewTheme] = useState<"paper" | "sepia" | "night">("paper");
  const [previewScale, setPreviewScale] = useState(1);
  const [autoPaginate, setAutoPaginate] = useState(true);
  const [copied, setCopied] = useState(false);

  const [chapterHtml, setChapterHtml] = useState<string>("");
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Auto-analyze book style on mount if missing
  useEffect(() => {
    if (currentBook && (!bookStyleSignature || bookStyleSignature.confidence === 0)) {
      void analyzeBookStyle({ apply: true });
    }
  }, [currentBook, bookStyleSignature, analyzeBookStyle]);

  const activeChapter = currentBook?.chapters[activeChapterIndex];

  // Fetch real chapter XHTML from Tauri when activeChapterIndex or book changes
  useEffect(() => {
    let isCancelled = false;

    async function loadChapter() {
      if (!currentBook || !activeChapter) return;

      if (modifiedChapters[activeChapter.href]) {
        setChapterHtml(modifiedChapters[activeChapter.href]);
        setIsLoadingChapter(false);
        return;
      }

      setIsLoadingChapter(true);
      try {
        if (currentFilePath) {
          const raw = await invoke<string>("read_chapter", {
            path: currentFilePath,
            href: activeChapter.href,
          });
          if (!isCancelled) {
            setChapterHtml(raw);
            setIsLoadingChapter(false);
          }
        } else if (currentFileBytes) {
          const raw = await invoke<string>("read_chapter_bytes", {
            bytes: currentFileBytes,
            href: activeChapter.href,
          });
          if (!isCancelled) {
            setChapterHtml(raw);
            setIsLoadingChapter(false);
          }
        } else {
          const fallback = `
            <div class="chapter-body">
              <h1>${activeChapter.title}</h1>
              <p>${activeChapter.preview_text || "Nội dung chương sách đang được nạp..."}</p>
            </div>
          `;
          if (!isCancelled) {
            setChapterHtml(fallback);
            setIsLoadingChapter(false);
          }
        }
      } catch (err) {
        console.error("Error loading chapter HTML for style preview:", err);
        if (!isCancelled) {
          setChapterHtml(`<div class="chapter-body"><h1>${activeChapter.title}</h1><p>${activeChapter.preview_text || ""}</p></div>`);
          setIsLoadingChapter(false);
        }
      }
    }

    loadChapter();

    return () => {
      isCancelled = true;
    };
  }, [currentBook, currentFilePath, currentFileBytes, activeChapterIndex, activeChapter, modifiedChapters]);

  // Compute adaptive live CSS layer
  const generatedCss = useMemo(() => {
    return generateEpubCss({
      preset: activePreset,
      fontSize,
      lineHeight,
      firstLineIndent,
      dropCaps,
      textAlign,
      sceneDivider,
      customOverrides: customCss,
      isVietnamese: isVietnameseBook,
      fontFamily: fontFamily || activePreset.fontFamily,
      signature: bookStyleSignature,
    });
  }, [
    activePreset,
    fontSize,
    lineHeight,
    firstLineIndent,
    dropCaps,
    textAlign,
    sceneDivider,
    customCss,
    isVietnameseBook,
    fontFamily,
    bookStyleSignature,
  ]);

  // Combine original publisher CSS + adaptive override + theme contrast protection
  const previewCss = useMemo(() => {
    const themeBg = previewTheme === "night" ? "#141619" : previewTheme === "sepia" ? "#f7f1e3" : "#ffffff";
    const themeText = previewTheme === "night" ? "#f0f2f5" : previewTheme === "sepia" ? "#2c2416" : "#1a1a1a";
    const contrastSafetyCss = `
/* Theme Contrast Override - Đảm bảo độ tương phản cao, chống chữ đen trên nền đen */
html, body {
  background-color: ${themeBg} !important;
  color: ${themeText} !important;
}
p, div, span, li, blockquote, article, section {
  color: ${themeText} !important;
}
h1, h2, h3, h4, h5, h6 {
  color: ${themeText} !important;
  opacity: 0.95;
}
`;
    return combinePreviewCss(bookStyleCss, `${generatedCss}\n${contrastSafetyCss}`);
  }, [bookStyleCss, generatedCss, previewTheme]);

  // Write content to iframe whenever chapterHtml, previewCss, or autoPaginate changes
  useEffect(() => {
    if (!iframeRef.current) return;
    const contentToRender = autoPaginate
      ? autoPaginateAndStructureChapterHtml(chapterHtml).paginatedHtml
      : chapterHtml;
    const safeHtml = sanitizeEpubHtml(contentToRender);
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(injectCssIntoHtml(safeHtml, previewCss));
    doc.close();
  }, [chapterHtml, previewCss, autoPaginate]);

  function handleApplyAutoPagination() {
    if (!currentBook || !activeChapter) return;
    const result = autoPaginateAndStructureChapterHtml(chapterHtml);
    useAppStore.setState({
      modifiedChapters: {
        ...modifiedChapters,
        [activeChapter.href]: result.paginatedHtml,
      },
    });
    setChapterHtml(result.paginatedHtml);
    toast.success("Đã tự động nhận biết nội dung và phân tách thành các trang riêng biệt!");
  }

  async function handleRunAiAudit() {
    toast.loading("AI đang kiểm tra và phân tích style gốc...", { id: "ai-audit" });
    const result = await auditAndFixBookStyle();
    if (result) {
      toast.success(`Đã hoàn tất kiểm tra! Điểm đánh giá: ${result.overallScore}/100`, { id: "ai-audit" });
    } else {
      toast.error("Không thể kết nối dịch vụ AI hoặc phân tích sách", { id: "ai-audit" });
    }
  }

  function handleOneClickOptimize() {
    const rule = `/* Gỡ bỏ màu nền & màu chữ cố định để tránh lỗi chữ đen trên nền đen khi đọc trên Kindle/Kobo */\nhtml, body {\n  background-color: transparent !important;\n  color: inherit !important;\n}\n\n`;
    const newCustomCss = customCss?.includes("background-color: transparent")
      ? customCss
      : rule + (customCss || "");

    updateTypography({
      fontSize: 18,
      lineHeight: 1.75,
      firstLineIndent: "1.5em",
      textAlign: "justify",
      fontFamily: VIETNAMESE_FONTS[0].fontFamily,
      customCss: newCustomCss,
    });
    setPreviewTheme("paper");
    toast.success("✨ Đã tối ưu giao diện: Cỡ chữ 18px thoáng đãng, nền giấy sáng chữ đen nét căng và hàn gắn dấu tiếng Việt!");
  }

  const isNeutralizingColors = Boolean(customCss && customCss.includes("background-color: transparent"));

  function handleToggleNeutralizeColors() {
    if (isNeutralizingColors) {
      const cleaned = (customCss || "")
        .replace(/\/\* Gỡ bỏ màu nền[\s\S]*?html,\s*body\s*\{[\s\S]*?\}\n*/g, "")
        .replace(/html,\s*body\s*\{\s*background-color:\s*transparent\s*!important;\s*color:\s*inherit\s*!important;\s*\}\n*/g, "")
        .trim();
      updateTypography({ customCss: cleaned });
      toast.info("Đã khôi phục màu sắc gốc của sách");
    } else {
      const rule = `/* Gỡ bỏ màu nền & màu chữ cố định để tránh lỗi chữ đen trên nền đen khi đọc trên Kindle/Kobo */\nhtml, body {\n  background-color: transparent !important;\n  color: inherit !important;\n}\n\n`;
      updateTypography({ customCss: rule + (customCss || "") });
      toast.success("Đã bật chế độ chống chữ đen nền đen cho máy đọc sách!");
    }
  }

  function handleApplyAiFixes() {
    if (!styleAuditReport) return;
    applyAiStyleFixes(styleAuditReport);
    toast.success("Đã áp dụng toàn bộ sửa đổi & khắc phục lỗi thành công!");
  }

  function handleRevert() {
    revertToOriginalStyle();
    toast.info("Đã khôi phục về định dạng gốc của sách");
  }

  function handleCopyCss(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Đã sao chép mã CSS vào clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  if (!currentBook) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 h-full bg-background select-none">
        <Empty className="max-w-md border border-dashed border-border/80 p-8 rounded-2xl bg-card shadow-xs">
          <EmptyMedia variant="icon" className="size-16 rounded-2xl bg-primary/10 text-primary mb-3">
            <BookOpen className="size-8" />
          </EmptyMedia>
          <EmptyTitle className="font-heading font-semibold text-lg text-foreground">
            Chưa Có Sách Để Định Kiểu
          </EmptyTitle>
          <EmptyDescription className="text-xs text-muted-foreground leading-relaxed">
            Vui lòng mở hoặc nạp một cuốn sách (EPUB, PDF, TXT) từ Thư viện sách để hệ thống tự động phân tích và định kiểu theo style gốc của nhà xuất bản.
          </EmptyDescription>
          <Button
            onClick={() => setAppActiveTab("books")}
            className="mt-4 gap-2 font-medium text-xs h-9 px-4 rounded-lg shadow-xs"
          >
            <BookOpen className="size-4" />
            <span>Mở Thư Viện Sách</span>
          </Button>
        </Empty>
      </div>
    );
  }

  const detectedFont = bookStyleSignature?.fontFamily
    ? bookStyleSignature.fontFamily.split(",")[0].replace(/['"]/g, "").trim()
    : null;
  const isSafeForVi = isVietnameseSafeFont(bookStyleSignature?.fontFamily);
  const isUsingOriginalFont = !fontFamily || fontFamily === bookStyleSignature?.fontFamily;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background select-none">
      {/* Top Header Bar */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 bg-transparent border-b border-border/40 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-8 rounded-lg flex items-center justify-center bg-primary/15 text-primary border border-primary/30 shrink-0">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading font-medium text-sm text-foreground leading-none">
                Bước 4: Định Kiểu &amp; Kiểu Chữ
              </h1>
              <Badge variant="secondary" className="bg-primary/10 text-primary text-xs px-2 h-4.5 rounded-full border border-primary/20 flex items-center gap-1">
                <ShieldCheck size={11} />
                <span>Tự động theo style gốc</span>
              </Badge>
              {isVietnameseBook && (
                <Badge variant="outline" className="text-xs px-2 h-4.5 rounded-full border-primary/30 text-primary flex items-center gap-1">
                  <Languages size={10} />
                  <span>Tiếng Việt</span>
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              Tự động kế thừa định dạng nhà xuất bản — chỉ bổ trợ phông tiếng Việt và tinh chỉnh nhẹ nhàng
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleRevert}
            className="h-7 text-xs px-2.5 gap-1.5 text-muted-foreground hover:text-foreground rounded-lg shadow-xs"
            title="Khôi phục CSS gốc của sách và xóa mọi tinh chỉnh"
          >
            <RotateCcw size={12} />
            <span>Khôi phục gốc</span>
          </Button>
        </div>
      </header>

      {/* Main Workspace (Layout A: flex-1 Preview + 22rem Control Panel) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-3 gap-3">
        {/* Left Column: Real Book Live Preview (Primary Surface) */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-card rounded-xl border border-border shadow-xs">
          {/* Preview Navigation Toolbar */}
          <div className="flex-shrink-0 flex items-center justify-between px-3.5 py-2 border-b border-border bg-card/60 backdrop-blur-xs gap-3">
            {/* Left: Chapter selector & navigation */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Button
                variant="outline"
                size="sm"
                disabled={activeChapterIndex <= 0 || isLoadingChapter}
                onClick={() => setActiveChapterIndex(Math.max(0, activeChapterIndex - 1))}
                className="h-7 w-7 p-0 rounded-lg"
                title="Chương trước"
              >
                <ChevronLeft className="size-3.5" />
              </Button>

              <div className="w-52 sm:w-64">
                <Select
                  value={String(activeChapterIndex)}
                  onValueChange={(val) => setActiveChapterIndex(Number(val))}
                >
                  <SelectTrigger className="h-7 text-xs font-medium rounded-lg">
                    <SelectValue placeholder="Chọn chương xem trước" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {currentBook.chapters.map((ch, idx) => (
                        <SelectItem key={ch.href || idx} value={String(idx)} className="text-xs">
                          {idx + 1}. {ch.title || `Chương ${idx + 1}`}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={activeChapterIndex >= currentBook.chapters.length - 1 || isLoadingChapter}
                onClick={() => setActiveChapterIndex(Math.min(currentBook.chapters.length - 1, activeChapterIndex + 1))}
                className="h-7 w-7 p-0 rounded-lg"
                title="Chương kế tiếp"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>

            {/* Center: Quick Typography Controls (One-Click Optimize, A-/A+, Line Height) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                size="sm"
                variant="default"
                onClick={handleOneClickOptimize}
                className="h-7 text-xs px-2.5 gap-1.5 rounded-lg shadow-xs bg-primary text-primary-foreground hover:bg-primary/90 font-medium shrink-0"
                title="Tự động chỉnh cỡ chữ 18px, nền giấy sáng chữ đen nét căng và hàn gắn dấu tiếng Việt"
              >
                <Sparkles size={13} />
                <span className="hidden sm:inline">Tối ưu đọc dễ</span>
              </Button>

              <Button
                size="sm"
                variant={autoPaginate ? "default" : "outline"}
                onClick={() => {
                  setAutoPaginate(!autoPaginate);
                  toast.info(!autoPaginate ? "Đã bật tự động phân trang" : "Đã tắt chế độ phân trang");
                }}
                className={`h-7 text-xs px-2.5 gap-1.5 rounded-lg shadow-xs font-medium shrink-0 ${
                  autoPaginate ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                }`}
                title="Tự động nhận diện Tên sách, Tác giả, Lời miễn trừ và Chương để đẩy thành các trang riêng"
              >
                <Layers size={13} />
                <span className="hidden md:inline">{autoPaginate ? "Đã phân trang" : "Đẩy thành trang"}</span>
              </Button>

              {/* Font Size A- / A+ */}
              <div className="flex items-center border border-border rounded-lg p-0.5 bg-secondary/50 shrink-0">
                <button
                  type="button"
                  onClick={() => updateTypography({ fontSize: Math.max(12, fontSize - 1) })}
                  className="h-6 px-1.5 flex items-center justify-center rounded text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                  title="Giảm cỡ chữ (A-)"
                >
                  A-
                </button>
                <span className="text-xs font-mono px-1 font-semibold text-foreground min-w-[32px] text-center">
                  {fontSize}px
                </span>
                <button
                  type="button"
                  onClick={() => updateTypography({ fontSize: Math.min(28, fontSize + 1) })}
                  className="h-6 px-1.5 flex items-center justify-center rounded text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                  title="Tăng cỡ chữ (A+)"
                >
                  A+
                </button>
              </div>

              {/* Quick Line Height */}
              <div className="hidden lg:flex items-center border border-border rounded-lg p-0.5 bg-secondary/50 shrink-0">
                {[1.6, 1.75, 2.0].map((lh) => (
                  <button
                    key={lh}
                    type="button"
                    onClick={() => updateTypography({ lineHeight: lh })}
                    className={`h-6 px-1.5 text-xs rounded transition-colors ${
                      Math.abs(lineHeight - lh) < 0.05 
                        ? "bg-background font-bold text-foreground shadow-xs" 
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={`Giãn dòng ${lh}x`}
                  >
                    {lh}x
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Reading Theme & Zoom controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center border border-border rounded-lg p-0.5 bg-secondary/50">
                <button
                  type="button"
                  onClick={() => setPreviewTheme("paper")}
                  className={`h-6 px-2 text-xs rounded transition-colors ${
                    previewTheme === "paper" 
                      ? "bg-background font-medium text-foreground shadow-xs" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Nền giấy chuẩn"
                >
                  Sáng
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTheme("sepia")}
                  className={`h-6 px-2 text-xs rounded transition-colors ${
                    previewTheme === "sepia" 
                      ? "bg-[#f4ecd8] text-[#5b4636] font-medium shadow-xs" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Nền vàng dịu mắt"
                >
                  Sepia
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTheme("night")}
                  className={`h-6 px-2 text-xs rounded transition-colors ${
                    previewTheme === "night" 
                      ? "bg-[#18191a] text-[#e4e6eb] font-medium shadow-xs" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Nền tối"
                >
                  Tối
                </button>
              </div>

              <div className="flex items-center border border-border rounded-lg p-0.5 bg-secondary/50">
                <button
                  type="button"
                  onClick={() => setPreviewScale((s) => Math.max(0.8, Number((s - 0.1).toFixed(1))))}
                  className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  title="Thu nhỏ tỷ lệ"
                >
                  <ZoomOut className="size-3" />
                </button>
                <span className="text-xs font-mono px-1 min-w-[36px] text-center text-muted-foreground">
                  {Math.round(previewScale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewScale((s) => Math.min(1.5, Number((s + 0.1).toFixed(1))))}
                  className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  title="Phóng to tỷ lệ"
                >
                  <ZoomIn className="size-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Real Chapter Iframe Viewport */}
          <div className={`flex-1 relative overflow-hidden transition-colors ${
            previewTheme === "sepia" ? "bg-[#f7f1e3]" : previewTheme === "night" ? "bg-[#121314]" : "bg-card"
          }`}>
            {isLoadingChapter && (
              <div className="absolute inset-0 z-10 bg-background/50 backdrop-blur-xs flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>Đang nạp nội dung chương...</span>
              </div>
            )}
            <div 
              className="w-full h-full flex justify-center overflow-auto p-4 sm:p-6"
              style={{
                transform: previewScale !== 1 ? `scale(${previewScale})` : undefined,
                transformOrigin: "top center",
              }}
            >
              <iframe
                ref={iframeRef}
                title="Book Style Live Preview"
                className="w-full max-w-3xl h-full min-h-[600px] border border-border/40 rounded-lg shadow-sm select-text bg-white dark:bg-[#1e1e1e]"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Style Controls & Diagnostics Drawer (22rem / 380px) */}
        <div className="w-full lg:w-[380px] flex-shrink-0 flex flex-col h-full overflow-hidden bg-card border border-border rounded-xl shadow-xs">
          {/* Tabs Header */}
          <div className="p-3 border-b border-border bg-secondary/30">
            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
              <TabsList className="w-full grid grid-cols-3 h-8 bg-muted/60 p-0.5 rounded-lg">
                <TabsTrigger value="style" className="text-xs gap-1.5 py-1 rounded-md font-medium data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs">
                  <SlidersHorizontal size={13} />
                  <span>Style Gốc</span>
                </TabsTrigger>
                <TabsTrigger value="ai" className="text-xs gap-1.5 py-1 rounded-md font-medium data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs">
                  <Wand2 size={13} />
                  <span>AI Soát Lỗi</span>
                </TabsTrigger>
                <TabsTrigger value="css" className="text-xs gap-1.5 py-1 rounded-md font-medium data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs">
                  <Code2 size={13} />
                  <span>Mã CSS</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Drawer Body Scroll Area */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
            {/* TAB 1: ORIGINAL STYLE & ADAPTIVE TUNING */}
            {activeTab === "style" && (
              <div className="space-y-3.5">
                {/* Book Style Signature Card */}
                <Card className="p-3.5 bg-muted/20 border-border rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <FileCode size={14} className="text-primary" />
                      <span>Hồ Sơ CSS Gốc Của Sách</span>
                    </span>
                    <Badge variant="secondary" className="text-xs font-mono px-2 py-0 h-5 bg-background border border-border">
                      {bookStyleSignature?.stylesheetCount || 0} file CSS
                    </Badge>
                  </div>

                  {bookStyleSignature && bookStyleSignature.stylesheetCount === 0 && (
                    <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 flex items-start gap-1.5">
                      <Info size={13} className="shrink-0 mt-0.5" />
                      <span>Sách không chứa file CSS ngoài. Đang áp dụng kiểu hiển thị tiêu chuẩn dễ đọc, không ghi đè cấu trúc.</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-background border border-border">
                      <span className="text-muted-foreground block text-xs font-medium">Font gốc:</span>
                      <strong className="text-foreground truncate block font-serif text-xs mt-0.5">
                        {detectedFont || "Mặc định (Serif)"}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border">
                      <span className="text-muted-foreground block text-xs font-medium">Cỡ chữ / Dòng:</span>
                      <strong className="text-foreground block font-mono text-xs mt-0.5">
                        {fontSize}px · {lineHeight.toFixed(2)}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border">
                      <span className="text-muted-foreground block text-xs font-medium">Thụt lề đầu dòng:</span>
                      <strong className="text-foreground block font-mono text-xs mt-0.5">
                        {firstLineIndent || "0em"}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border">
                      <span className="text-muted-foreground block text-xs font-medium">Canh lề:</span>
                      <strong className="text-foreground block text-xs capitalize mt-0.5">
                        {textAlign === "justify" ? "Căn đều hai bên" : "Lề trái"}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <ShieldCheck size={13} className="text-emerald-500" />
                      <span>Bảo tồn nguyên bản NXB:</span>
                    </span>
                    <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                      Khớp {Math.round((bookStyleSignature?.confidence || 0.8) * 100)}%
                    </Badge>
                  </div>
                </Card>

                {/* Card Chống chữ đen nền đen cho máy đọc sách */}
                <div className="p-3 bg-card border border-border rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-primary" />
                      <span className="text-xs font-semibold text-foreground">
                        Chống Lỗi Chữ Đen Nền Đen (E-Reader)
                      </span>
                    </div>
                    <Badge
                      variant={isNeutralizingColors ? "secondary" : "outline"}
                      className={`text-xs px-2 py-0 ${isNeutralizingColors ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : ""}`}
                    >
                      {isNeutralizingColors ? "Đã bật an toàn" : "Chưa bật"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Gỡ bỏ màu nền tối và màu chữ cố định khỏi CSS của sách, giúp máy đọc sách (Kindle, Kobo, Boox) tự do hiển thị đúng chế độ Sáng/Tối/Sepia mà không bị lỗi chữ đen trên nền đen.
                  </p>
                  <Button
                    variant={isNeutralizingColors ? "outline" : "default"}
                    size="sm"
                    type="button"
                    onClick={handleToggleNeutralizeColors}
                    className="w-full text-xs h-8 gap-1.5 rounded-lg"
                  >
                    <Check size={13} />
                    <span>{isNeutralizingColors ? "Hủy bỏ gỡ màu (Khôi phục màu gốc)" : "Gỡ bỏ màu nền & chữ cố định ngay"}</span>
                  </Button>
                </div>

                {/* Card Tự Động Đẩy Thành Trang Riêng */}
                <div className="p-3 bg-card border border-border rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Layers size={14} className="text-primary" />
                      <span className="text-xs font-semibold text-foreground">
                        Tự Động Đẩy Thành Trang Riêng
                      </span>
                    </div>
                    <Badge
                      variant={autoPaginate ? "secondary" : "outline"}
                      className={`text-xs px-2 py-0 ${autoPaginate ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : ""}`}
                    >
                      {autoPaginate ? "Đang bật" : "Tắt"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Tự động nhận biết các khối: <strong>Tên sách &amp; Tác giả</strong>, <strong>Tuyên bố miễn trừ</strong> và <strong>Tiêu đề chương</strong> để ngắt thành từng trang riêng biệt trên máy đọc sách thay vì dồn chung một chỗ.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAutoPaginate(!autoPaginate)}
                      className="flex-1 text-xs h-8 rounded-lg"
                    >
                      {autoPaginate ? "Tắt phân trang" : "Bật phân trang"}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleApplyAutoPagination}
                      className="flex-1 text-xs h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      title="Lưu các trang đã phân tách vào chương này"
                    >
                      <Check size={13} />
                      <span>Lưu vào sách</span>
                    </Button>
                  </div>
                </div>

                {/* Vietnamese Font Compatibility Layer */}
                <div className="p-3 bg-card border border-border rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Type size={14} className="text-primary" />
                        <span>Phông Chữ Tiếng Việt</span>
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Ưu tiên font hỗ trợ đầy đủ thanh dấu tiếng Việt
                      </p>
                    </div>
                  </div>

                  {/* Quick option: Keep Original Book Font */}
                  <button
                    type="button"
                    onClick={() => {
                      updateTypography({ fontFamily: bookStyleSignature?.fontFamily || "" });
                      toast.success("Đã chọn dùng phông chữ gốc của sách");
                    }}
                    className={`w-full p-2.5 rounded-lg text-left border transition-all text-xs flex items-center justify-between ${
                      isUsingOriginalFont
                        ? "border-primary bg-primary/10 text-foreground font-semibold shadow-xs"
                        : "border-border hover:border-primary/50 bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div>
                      <span className="font-medium block text-foreground">
                        ✦ Giữ nguyên font gốc của sách
                      </span>
                      <span className="text-xs text-muted-foreground opacity-85">
                        {detectedFont || "Serif mặc định của nhà xuất bản"}
                        {isSafeForVi ? " (Tương thích tốt dấu)" : ""}
                      </span>
                    </div>
                    {isUsingOriginalFont && <Check size={14} className="text-primary shrink-0" />}
                  </button>

                  {/* Vietnamese Font Grid */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {VIETNAMESE_FONTS.map((f) => {
                      const isSelected = !isUsingOriginalFont && (
                        (fontFamily || "").includes(f.id) ||
                        (fontFamily || "") === f.fontFamily
                      );
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            updateTypography({ fontFamily: f.fontFamily });
                            toast.success(`Đã đổi sang font ${f.name}`);
                          }}
                          className={`p-2 rounded-lg text-left border transition-all text-xs flex flex-col justify-between ${
                            isSelected
                              ? "border-primary bg-primary/10 text-foreground font-semibold shadow-xs"
                              : "border-border hover:border-primary/50 bg-background text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-0.5">
                            <span className="truncate text-xs" style={{ fontFamily: f.fontFamily }}>
                              {f.name}
                            </span>
                            {isSelected && <Check size={12} className="text-primary shrink-0" />}
                          </div>
                          <span className="text-xs opacity-75 line-clamp-1 leading-tight font-normal">
                            {f.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Adaptive Sliders & Fine-Tuning */}
                <div className="p-3 bg-card border border-border rounded-xl space-y-3">
                  <h3 className="text-xs font-semibold text-foreground">
                    Tinh Chỉnh Đoạn Văn &amp; Thước Đo
                  </h3>

                  {/* Font Size */}
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-medium text-foreground block">Cỡ chữ hiển thị</span>
                      <span className="text-muted-foreground">Kích thước chuẩn đoạn văn</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Slider
                        min={12}
                        max={26}
                        step={1}
                        value={[fontSize]}
                        onValueChange={(vals) => updateTypography({ fontSize: vals[0] })}
                        className="w-24"
                      />
                      <Badge variant="outline" className="text-xs font-mono min-w-10 justify-center border-primary/40 text-primary">
                        {fontSize}px
                      </Badge>
                    </div>
                  </div>

                  {/* Line Height */}
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-medium text-foreground block">Khoảng cách dòng</span>
                      <span className="text-muted-foreground">Độ thoáng giữa các dòng</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Slider
                        min={1.3}
                        max={2.3}
                        step={0.05}
                        value={[lineHeight]}
                        onValueChange={(vals) => updateTypography({ lineHeight: Number(vals[0].toFixed(2)) })}
                        className="w-24"
                      />
                      <Badge variant="secondary" className="text-xs font-mono min-w-10 justify-center">
                        {lineHeight.toFixed(2)}
                      </Badge>
                    </div>
                  </div>

                  {/* Text Alignment */}
                  <div className="flex items-center justify-between gap-3 text-xs pt-1 border-t border-border/50">
                    <div>
                      <span className="font-medium text-foreground block">Canh lề văn bản</span>
                      <span className="text-muted-foreground">Căn đều hoặc lề trái</span>
                    </div>
                    <ToggleGroup
                      type="single"
                      value={textAlign}
                      onValueChange={(val) => {
                        if (val) updateTypography({ textAlign: val as "justify" | "left" });
                      }}
                      className="border border-border rounded-lg p-0.5 bg-secondary/50"
                    >
                      <ToggleGroupItem value="justify" size="sm" className="h-7 text-xs px-2.5 gap-1 rounded-md data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-xs">
                        <AlignJustify size={12} />
                        <span>Căn đều</span>
                      </ToggleGroupItem>
                      <ToggleGroupItem value="left" size="sm" className="h-7 text-xs px-2.5 gap-1 rounded-md data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-xs">
                        <AlignLeft size={12} />
                        <span>Lề trái</span>
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  {/* First Line Indent */}
                  <div className="flex items-center justify-between gap-3 text-xs pt-1 border-t border-border/50">
                    <div>
                      <span className="font-medium text-foreground block">Thụt lề đầu dòng</span>
                      <span className="text-muted-foreground">Khoảng cách thụt đầu đoạn</span>
                    </div>
                    <ToggleGroup
                      type="single"
                      value={firstLineIndent}
                      onValueChange={(val) => {
                        if (val) updateTypography({ firstLineIndent: val });
                      }}
                      className="border border-border rounded-lg p-0.5 bg-secondary/50"
                    >
                      {["0em", "1em", "1.5em", "2em"].map((val) => (
                        <ToggleGroupItem
                          key={val}
                          value={val}
                          size="sm"
                          className="h-7 font-mono text-xs px-2 rounded-md data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-xs"
                        >
                          {val}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>

                  {/* Drop Caps */}
                  <div className="flex items-center justify-between gap-3 text-xs pt-1 border-t border-border/50">
                    <div>
                      <span className="font-medium text-foreground block">Chữ hoa đầu đoạn (Drop Cap)</span>
                      <span className="text-muted-foreground">Phóng to chữ cái đầu chương</span>
                    </div>
                    <ToggleGroup
                      type="single"
                      value={dropCaps ? "on" : "off"}
                      onValueChange={(val) => {
                        if (val) updateTypography({ dropCaps: val === "on" });
                      }}
                      className="border border-border rounded-lg p-0.5 bg-secondary/50"
                    >
                      <ToggleGroupItem value="on" size="sm" className="h-7 text-xs px-2.5 rounded-md data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-xs">
                        Bật
                      </ToggleGroupItem>
                      <ToggleGroupItem value="off" size="sm" className="h-7 text-xs px-2.5 rounded-md data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-xs">
                        Tắt
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  {/* Scene Divider */}
                  <div className="flex items-center justify-between gap-3 text-xs pt-1 border-t border-border/50">
                    <div>
                      <span className="font-medium text-foreground block">Ký hiệu ngắt cảnh</span>
                      <span className="text-muted-foreground">Dấu phân cách giữa các phân đoạn</span>
                    </div>
                    <ToggleGroup
                      type="single"
                      value={sceneDivider}
                      onValueChange={(val) => {
                        if (val) updateTypography({ sceneDivider: val });
                      }}
                      className="border border-border rounded-lg p-0.5 bg-secondary/50"
                    >
                      {["* * *", "♦ ♦ ♦", "———", "✦ ✦ ✦"].map((val) => (
                        <ToggleGroupItem
                          key={val}
                          value={val}
                          size="sm"
                          className="h-7 font-mono text-xs px-2 rounded-md data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-xs"
                        >
                          {val}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: AI STYLE AUDIT & FIX */}
            {activeTab === "ai" && (
              <div className="space-y-3.5">
                {!styleAuditReport && !isAuditingStyle && (
                  <Card className="p-5 bg-primary/5 border-primary/20 text-center space-y-3 rounded-xl">
                    <div className="size-11 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                      <Wand2 size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        AI Soát &amp; Tối Ưu Style Sách
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        AI sẽ quét toàn bộ stylesheet gốc của sách, phát hiện xung đột font tiếng Việt, độ tương phản e-reader và sinh các quy tắc CSS bổ trợ mà vẫn giữ 100% bản sắc của nhà xuất bản.
                      </p>
                    </div>
                    <Button
                      onClick={handleRunAiAudit}
                      className="w-full gap-2 text-xs font-medium h-9 rounded-lg shadow-xs"
                      size="sm"
                    >
                      <Sparkles size={14} />
                      <span>Bắt Đầu Kiểm Tra Bằng AI</span>
                    </Button>
                  </Card>
                )}

                {isAuditingStyle && (
                  <Card className="p-6 text-center space-y-3 bg-muted/20 border-border rounded-xl">
                    <Loader2 size={26} className="animate-spin text-primary mx-auto" />
                    <div className="space-y-1">
                      <h3 className="text-xs font-semibold text-foreground">
                        AI Đang Phân Tích CSS Gốc...
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Đang rà soát font chữ, độ tương phản và quy chuẩn e-reader
                      </p>
                    </div>
                  </Card>
                )}

                {styleAuditReport && !isAuditingStyle && (
                  <div className="space-y-3">
                    {/* Score & Summary Card */}
                    <Card className="p-3.5 bg-card border-border rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={`size-9 rounded-full flex items-center justify-center font-bold text-xs ${
                            styleAuditReport.overallScore >= 80 
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : styleAuditReport.overallScore >= 70
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                              : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30"
                          }`}>
                            {styleAuditReport.overallScore}
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-foreground block">
                              Điểm Đánh Giá Style Gốc
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {styleAuditReport.auditItems.length} hạng mục được kiểm tra
                            </span>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRunAiAudit}
                          className="h-7 text-xs px-2.5 gap-1 rounded-lg"
                          title="Chạy lại kiểm tra AI"
                        >
                          <RefreshCw size={12} />
                          <span>Kiểm tra lại</span>
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 p-2.5 rounded-lg border border-border">
                        {styleAuditReport.summary}
                      </p>

                      {styleAuditReport.preservationNotes && (
                        <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5 font-medium">
                          <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                          <span>{styleAuditReport.preservationNotes}</span>
                        </div>
                      )}
                    </Card>

                    {/* Audit Checklist Items */}
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-foreground block px-0.5">
                        Kết Quả Rà Soát Chi Tiết
                      </span>
                      {styleAuditReport.auditItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg border border-border bg-card space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                              {item.status === "pass" && <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />}
                              {item.status === "warning" && <AlertTriangle size={13} className="text-amber-500 shrink-0" />}
                              {item.status === "issue" && <AlertTriangle size={13} className="text-red-500 shrink-0" />}
                              <span className="truncate">{item.title}</span>
                            </span>
                            <Badge
                              variant={item.status === "pass" ? "secondary" : "outline"}
                              className={`text-xs px-2 py-0.5 h-5 uppercase tracking-wider shrink-0 ${
                                item.status === "pass"
                                  ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  : item.status === "warning"
                                  ? "text-amber-600 dark:text-amber-400 border-amber-500/30"
                                  : "text-red-600 dark:text-red-400 border-red-500/30"
                              }`}
                            >
                              {item.status === "pass" ? "Đạt" : item.status === "warning" ? "Lưu ý" : "Cần sửa"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {item.detail}
                          </p>
                          {item.fixRecommendation && (
                            <div className="text-xs text-primary bg-primary/5 p-2 rounded-md border border-primary/20 flex items-start gap-1.5">
                              <Info size={13} className="shrink-0 mt-0.5" />
                              <span>{item.fixRecommendation}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Apply AI Fixes CTA / Clear Actions */}
                    <div className="pt-1 flex flex-col gap-2">
                      {styleAuditReport.auditItems.some((item) => item.status === "issue" || item.status === "warning") ? (
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={handleApplyAiFixes}
                            className="flex-1 gap-2 text-xs font-semibold h-9 rounded-lg shadow-xs"
                          >
                            <Check size={14} />
                            <span>Áp Dụng Toàn Bộ Sửa Đổi AI</span>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              clearStyleAuditReport();
                              toast.info("Đã xóa danh sách cảnh báo kiểm tra");
                            }}
                            className="text-xs h-9 px-3 text-muted-foreground hover:text-foreground rounded-lg"
                            title="Xóa danh sách cảnh báo này"
                          >
                            Xóa cảnh báo
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            disabled
                            variant="secondary"
                            className="flex-1 gap-2 text-xs font-semibold h-9 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                          >
                            <CheckCircle2 size={14} className="text-emerald-500" />
                            <span>✓ Đã Sửa Xong Toàn Bộ Lỗi</span>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              clearStyleAuditReport();
                              toast.info("Đã xóa danh sách kết quả");
                            }}
                            className="text-xs h-9 px-3 text-muted-foreground hover:text-foreground rounded-lg"
                            title="Xóa danh sách kết quả này"
                          >
                            Xóa danh sách
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: CSS INSPECTOR & EDITOR */}
            {activeTab === "css" && (
              <div className="space-y-3 h-full flex flex-col">
                <div className="flex items-center justify-between pb-1">
                  <ToggleGroup
                    type="single"
                    value={cssViewMode}
                    onValueChange={(v) => {
                      if (v) setCssViewMode(v as any);
                    }}
                    className="border border-border rounded-lg p-0.5 bg-secondary/50"
                  >
                    <ToggleGroupItem value="overrides" size="sm" className="h-7 text-xs px-2.5 rounded-md data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-xs">
                      CSS Bổ Trợ
                    </ToggleGroupItem>
                    <ToggleGroupItem value="original" size="sm" className="h-7 text-xs px-2.5 rounded-md data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-xs">
                      CSS Gốc Của Sách
                    </ToggleGroupItem>
                  </ToggleGroup>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopyCss(cssViewMode === "overrides" ? (customCss || generatedCss) : (bookStyleCss || "/* Không có CSS gốc */"))}
                    className="h-7 text-xs px-2.5 gap-1.5 rounded-lg"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    <span>Sao chép</span>
                  </Button>
                </div>

                {cssViewMode === "overrides" ? (
                  <div className="flex-1 min-h-[340px] border border-border rounded-xl overflow-hidden flex flex-col bg-background">
                    <div className="bg-muted/40 px-3 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono">custom-fixes.css (Có thể chỉnh sửa)</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateTypography({ customCss: "" })}
                        className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground"
                      >
                        Xóa trắng
                      </Button>
                    </div>
                    <div className="flex-1 overflow-auto text-xs font-mono">
                      <CodeMirror
                        value={customCss}
                        height="100%"
                        extensions={[css()]}
                        theme="dark"
                        onChange={(val) => updateTypography({ customCss: val })}
                        className="h-full"
                        placeholder="/* Nhập các quy tắc CSS bổ trợ hoặc áp dụng từ AI... */"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-h-[340px] border border-border rounded-xl overflow-hidden flex flex-col bg-background">
                    <div className="bg-muted/40 px-3 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono">original-book-style.css (Chỉ đọc)</span>
                      <Badge variant="outline" className="text-xs px-2 py-0">
                        Từ EPUB
                      </Badge>
                    </div>
                    <div className="flex-1 overflow-auto text-xs font-mono">
                      <CodeMirror
                        value={bookStyleCss || "/* Cuốn sách này không chứa stylesheet CSS bên ngoài */"}
                        height="100%"
                        extensions={[css()]}
                        theme="dark"
                        editable={false}
                        className="h-full opacity-80"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
