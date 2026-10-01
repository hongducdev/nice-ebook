import { useState, useEffect, useRef, lazy, Suspense, useMemo } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Smartphone, 
  Tablet, 
  Monitor, 
  Code2, 
  BookOpen,
  BookOpenCheck,
  Sparkles,
  List,
  Check,
  Search,
  UserCheck,
  X,
  Loader2,
  Languages,
  Image as ImageIcon
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { ScrollArea } from "../ui/scroll-area";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "../ui/empty";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Input } from "../ui/input";
import { useAppStore } from "../../stores/useAppStore";
import { generateEpubCss, injectCssIntoHtml } from "../../utils/cssGenerator";
import { combinePreviewCss } from "../../utils/bookStyleAnalyzer";
import { sanitizeEpubHtml } from "../../utils/htmlSanitizer";
const CodeMirrorCss = lazy(() =>
  import("./CodeMirrorCss").then((m) => ({ default: m.CodeMirrorCss }))
);
export function EpubReaderViewer() {
  const {
    currentBook,
    currentFilePath,
    currentFileBytes,
    isVietnameseBook,
    fontFamily,
    activeChapterIndex,
    setActiveChapterIndex,
    activePreset,
    fontSize,
    lineHeight,
    firstLineIndent,
    dropCaps,
    textAlign,
    sceneDivider,
    customCss,
    bookStyleSignature,
    bookStyleCss,
    modifiedChapters,
    translatedChapters,
    translationConfig,
    xrayData,
    runXRayExtraction,
    isAnalyzingXRay,
    setActiveTab,
  } = useAppStore();

  const [mode, setMode] = useState<"reader" | "css">("reader");
  const [deviceWidth, setDeviceWidth] = useState<"full" | "tablet" | "mobile">("full");
  const [chapterHtml, setChapterHtml] = useState<string>("");
  const [isViewingCover, setIsViewingCover] = useState(false);
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [tocSearch, setTocSearch] = useState("");
  const [showXRayDrawer, setShowXRayDrawer] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tocDropdownRef = useRef<HTMLDivElement>(null);

  const activeChapter = currentBook?.chapters[activeChapterIndex];

  // Filter X-Ray entities for active chapter
  const currentChapterEntities = useMemo(() => {
    if (!xrayData || !activeChapter) return [];
    const all = [...xrayData.people, ...xrayData.terms];
    return all.filter((e) =>
      e.excerpts.some((ex) => ex.chapterHref === activeChapter.href)
    );
  }, [xrayData, activeChapter]);

  // Close TOC when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tocDropdownRef.current && !tocDropdownRef.current.contains(event.target as Node)) {
        setShowToc(false);
      }
    }
    if (showToc) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showToc]);

  // Filter chapters for TOC dropdown search
  const filteredChapters = useMemo(() => {
    if (!currentBook) return [];
    return currentBook.chapters
      .map((ch, idx) => ({ ch, idx }))
      .filter(({ ch }) =>
        tocSearch.trim() === ""
          ? true
          : ch.title.toLowerCase().includes(tocSearch.toLowerCase().trim())
      );
  }, [currentBook, tocSearch]);

  // Fetch raw chapter XHTML from Rust when activeChapterIndex or book changes
  useEffect(() => {
    let isCancelled = false;
    async function loadChapter() {
      if (!currentBook) return;

      if (isViewingCover) {
        if (currentBook.cover_data_url) {
          setChapterHtml(`
            <div class="chapter-body book-cover-page" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:85vh; text-align:center; padding:1.5rem 0;">
              <div style="max-width:90%; max-height:75vh; border-radius:10px; overflow:hidden; box-shadow:0 12px 30px rgba(0,0,0,0.25); border:1px solid rgba(0,0,0,0.1); margin:0 auto;">
                <img src="${currentBook.cover_data_url}" alt="${currentBook.title}" style="max-width:100%; max-height:70vh; object-fit:contain; display:block;" />
              </div>
              <h1 style="margin-top:1.5rem; font-size:1.3rem; font-weight:700; border-bottom:none; margin-bottom:0.25rem;">${currentBook.title}</h1>
              <p style="color:#666; font-size:0.9rem; margin-top:0;">${currentBook.author || ""}</p>
            </div>
          `);
        } else {
          setChapterHtml(`
            <div class="chapter-body book-cover-page" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:70vh; text-align:center;">
              <div style="width:140px; height:200px; border-radius:8px; border:2px dashed #999; display:flex; align-items:center; justify-content:center; margin-bottom:1rem; color:#888;">
                <span>Chưa có ảnh bìa</span>
              </div>
              <h1>${currentBook.title}</h1>
              <p style="color:#666;">${currentBook.author || ""}</p>
            </div>
          `);
        }
        setIsLoadingChapter(false);
        return;
      }

      if (!activeChapter) return;

      // If chapter was enhanced or modified by AI, load the override immediately
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
              <p class="has-drop-cap">${activeChapter.preview_text}</p>
              <div class="scene-divider">${sceneDivider}</div>
              <p>Văn phong tiếp tục mở ra với những tình tiết lôi cuốn, đưa người đọc chìm đắm vào thế giới kỳ ảo đầy màu sắc của tác phẩm...</p>
            </div>
          `;
          if (!isCancelled) {
            setChapterHtml(fallback);
            setIsLoadingChapter(false);
          }
        }
      } catch (err) {
        console.error("Error loading chapter HTML:", err);
        if (!isCancelled) {
          setChapterHtml(`<div class="chapter-body"><h1>${activeChapter.title}</h1><p>${activeChapter.preview_text}</p></div>`);
          setIsLoadingChapter(false);
        }
      }
    }

    loadChapter();

    return () => {
      isCancelled = true;
    };
  }, [currentBook, currentFilePath, currentFileBytes, activeChapterIndex, activeChapter, sceneDivider, modifiedChapters, isViewingCover]);

  // Compute live CSS
  const fullCss = generateEpubCss({
    preset: activePreset,
    fontSize,
    lineHeight,
    firstLineIndent,
    dropCaps,
    textAlign,
    sceneDivider,
    customOverrides: customCss,
    isVietnamese: isVietnameseBook,
    fontFamily,
    signature: bookStyleSignature,
  });

  // Ở chế độ "theo sách hiện tại", iframe phải thấy CSS gốc trước rồi mới tới lớp
  // phủ thích ứng — đúng thứ tự cascade của file EPUB đã xuất.
  const previewCss = useMemo(
    () => combinePreviewCss(bookStyleCss, fullCss),
    [bookStyleCss, fullCss]
  );

  // Inject CSS directly into iframe without reloading the iframe (instant Hot Reload)
  useEffect(() => {
    if (!iframeRef.current || mode !== "reader") return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    let styleEl = doc.getElementById("nice-ebook-dynamic-css");
    if (!styleEl) {
      styleEl = doc.createElement("style");
      styleEl.id = "nice-ebook-dynamic-css";
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = previewCss;
  }, [previewCss, chapterHtml, mode]);

  // Write content to iframe whenever chapterHtml changes
  useEffect(() => {
    if (!iframeRef.current || mode !== "reader") return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    const safeHtml = sanitizeEpubHtml(chapterHtml);
    const fullDoc = injectCssIntoHtml(safeHtml, previewCss);
    doc.open();
    doc.write(fullDoc);
    doc.close();
  }, [chapterHtml, mode]);

  const deviceWidthClass = {
    full: "w-full",
    tablet: "max-w-[680px]",
    mobile: "max-w-[390px]",
  }[deviceWidth];

  if (!currentBook) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Empty className="max-w-lg border border-border bg-card">
          <EmptyHeader>
            <EmptyMedia
              variant="icon"
              className="size-16 rounded-full bg-muted text-muted-foreground"
            >
              <BookOpen className="size-8" />
            </EmptyMedia>
            <EmptyTitle className="text-lg font-semibold text-foreground">
              Chưa có sách nào để xem trước
            </EmptyTitle>
            <EmptyDescription className="max-w-md text-sm">
              Vui lòng nạp file sách .epub trong mục Quản lý sách trước khi vào trình đọc thử.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => setActiveTab("books")}>
              Đến Thư Viện Sách
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden select-none gap-2 p-1">
      {/* Top Reader Command Bar */}
      <div className="command-bar h-10 px-3">
        {/* Step 6 indicator */}
        <div className="flex items-center gap-2 pr-3 mr-1 border-r border-border">
          <BookOpenCheck size={16} className="text-primary" />
          <h1 className="text-xs font-semibold text-foreground whitespace-nowrap">
            Bước 6: Đọc Thử &amp; Kiểm Tra
          </h1>
        </div>

        {/* Left: Mode toggle */}
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(val) => {
            if (val) setMode(val as "reader" | "css");
          }}
          className="border border-border rounded-md p-0.5 bg-muted/40"
        >
          <ToggleGroupItem value="reader" size="sm" className="h-7 text-xs px-2.5 gap-1.5 data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs">
            <BookOpen size={13} />
            <span>Trình Đọc Thử</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="css" size="sm" className="h-7 text-xs px-2.5 gap-1.5 data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs">
            <Code2 size={13} />
            <span>Mã CSS Nguồn</span>
          </ToggleGroupItem>
        </ToggleGroup>

        {/* Center: Chapter Navigation */}
        {currentBook && currentBook.chapters.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={() => {
                if (activeChapterIndex === 0 && !isViewingCover && currentBook.cover_data_url) {
                  setIsViewingCover(true);
                } else if (!isViewingCover) {
                  setActiveChapterIndex(Math.max(0, activeChapterIndex - 1));
                }
              }}
              disabled={isViewingCover || (activeChapterIndex === 0 && !currentBook.cover_data_url)}
              className="size-8 text-foreground disabled:opacity-30"
              title={activeChapterIndex === 0 && !isViewingCover ? "Xem Trang Bìa Sách" : "Chương trước"}
            >
              <ChevronLeft size={15} />
            </Button>

            <div className="relative" ref={tocDropdownRef}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowToc(!showToc)}
                className="h-8 px-3 text-xs font-medium gap-2 shadow-xs"
                title="Mở danh sách chương (Table of Contents)"
              >
                <List className="size-3.5 text-primary shrink-0" />
                <span className="max-w-[200px] truncate font-medium">
                  {isViewingCover ? "Trang Bìa Sách (Cover)" : (activeChapter?.title || "Chương")}
                </span>
                <Badge variant="secondary" className="text-[10px] h-4.5 px-1.5 font-mono">
                  {isViewingCover ? "Bìa" : `${activeChapterIndex + 1}/${currentBook.chapters.length}`}
                </Badge>
                <ChevronDown className={`size-3.5 text-muted-foreground transition-transform duration-200 ${showToc ? "rotate-180" : ""}`} />
              </Button>

              {/* TOC Dropdown */}
              {showToc && (
                <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 w-80 max-h-96 rounded-lg bg-card border border-border shadow-2xl z-[100] flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-3 py-2 border-b border-border bg-muted/40 flex items-center justify-between text-xs font-semibold text-foreground shrink-0">
                    <div className="flex items-center gap-1.5">
                      <List className="size-3.5 text-primary" />
                      <span>Danh Mục Chương</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] h-4.5 px-1.5 font-mono">
                      {currentBook.chapters.length} chương
                    </Badge>
                  </div>

                  {currentBook.chapters.length > 8 && (
                    <div className="p-2 border-b border-border shrink-0 bg-background">
                      <div className="relative">
                        <Search className="size-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Tìm kiếm chương..."
                          value={tocSearch}
                          onChange={(e) => setTocSearch(e.target.value)}
                          className="w-full h-7 text-xs pl-7 pr-2.5"
                        />
                      </div>
                    </div>
                  )}

                  <div className="overflow-y-auto max-h-72 p-1.5 flex flex-col gap-0.5">
                    {/* Cover Page Entry in TOC */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsViewingCover(true);
                        setShowToc(false);
                      }}
                      className={`w-full min-h-[34px] shrink-0 flex items-center justify-between px-3 py-1.5 rounded text-xs transition-colors cursor-pointer select-none text-left mb-0.5 border border-dashed ${
                        isViewingCover
                          ? "bg-primary text-primary-foreground font-semibold border-primary shadow-xs"
                          : "border-border text-foreground hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0 ${
                          isViewingCover ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-primary"
                        }`}>
                          <ImageIcon size={10} />
                          <span>Bìa</span>
                        </span>
                        <span className="truncate font-medium">Trang Bìa Tác Phẩm (Cover)</span>
                      </div>
                      {isViewingCover && <Check size={14} className="shrink-0" />}
                    </button>
                    {filteredChapters.map(({ ch, idx }) => (
                      <button
                        key={ch.id || idx}
                        type="button"
                        onClick={() => {
                          setIsViewingCover(false);
                          setActiveChapterIndex(idx);
                          setShowToc(false);
                        }}
                        className={`w-full min-h-[34px] shrink-0 flex items-center justify-between px-3 py-1.5 rounded text-xs transition-colors cursor-pointer select-none text-left ${
                          !isViewingCover && activeChapterIndex === idx
                            ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                            : "text-foreground hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                            activeChapterIndex === idx 
                              ? "bg-primary-foreground/20 text-primary-foreground" 
                              : "bg-secondary text-muted-foreground"
                          }`}>
                            #{idx + 1}
                          </span>
                          <span className="truncate">{ch.title}</span>
                        </div>
                        {!isViewingCover && activeChapterIndex === idx && (
                          <Check size={14} className="flex-shrink-0" />
                        )}
                      </button>
                    ))}
                    {filteredChapters.length === 0 && (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        Không tìm thấy chương nào
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={() => {
                if (isViewingCover) {
                  setIsViewingCover(false);
                  setActiveChapterIndex(0);
                } else {
                  setActiveChapterIndex(Math.min(currentBook.chapters.length - 1, activeChapterIndex + 1));
                }
              }}
              disabled={!isViewingCover && activeChapterIndex >= currentBook.chapters.length - 1}
              className="size-8 text-foreground disabled:opacity-30"
              title={isViewingCover ? "Bắt đầu đọc Chương 1" : "Chương kế tiếp"}
            >
              <ChevronRight size={15} />
            </Button>
          </div>
        )}

        {/* Right: Device simulation & Hot Reload status */}
        <div className="flex items-center gap-2">
          {mode === "reader" && (
            <ToggleGroup
              type="single"
              value={deviceWidth}
              onValueChange={(val) => {
                if (val) setDeviceWidth(val as "full" | "tablet" | "mobile");
              }}
              className="border border-border rounded-md p-0.5 bg-muted/40"
            >
              <ToggleGroupItem value="full" size="sm" className="size-7 p-0 data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs" title="Toàn màn hình máy tính">
                <Monitor size={13} />
              </ToggleGroupItem>
              <ToggleGroupItem value="tablet" size="sm" className="size-7 p-0 data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs" title="Khung máy tính bảng (iPad / Kobo)">
                <Tablet size={13} />
              </ToggleGroupItem>
              <ToggleGroupItem value="mobile" size="sm" className="size-7 p-0 data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs" title="Khung điện thoại (iPhone / Kindle)">
                <Smartphone size={13} />
              </ToggleGroupItem>
            </ToggleGroup>
          )}

          {/* Quick X-Ray Toggle Button */}
          <Button
            variant={showXRayDrawer ? "default" : "outline"}
            size="sm"
            type="button"
            onClick={() => setShowXRayDrawer(!showXRayDrawer)}
            className="h-7 px-2 gap-1 text-xs"
            title="Bật/Tắt Ngăn Kéo X-Ray (Nhân vật trong chương)"
          >
            <UserCheck size={12} />
            <span>X-Ray</span>
            {currentChapterEntities.length > 0 && (
              <Badge variant="secondary" className="text-[9px] h-3.5 px-1 ml-0.5 bg-background/60">
                {currentChapterEntities.length}
              </Badge>
            )}
          </Button>

          <Badge variant="outline" className="text-[10px] h-6 flex items-center gap-1 border-primary/40 text-primary">
            <Sparkles size={10} />
            <span>CSS Hot-Reload</span>
          </Badge>

          {activeChapter && modifiedChapters[activeChapter.href] && (
            <Badge variant="secondary" className="text-[10px] h-6 flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" title="Chương này đã được biên tập và chuẩn hóa bằng AI">
              <Check size={10} />
              <span>Đã Biên Tập AI</span>
            </Badge>
          )}

          {activeChapter && translatedChapters[activeChapter.href] && (
            <Badge
              variant="outline"
              className="text-[10px] h-6 flex items-center gap-1 border-primary/40 text-primary"
              title={`Chương này đã được dịch sang ${translationConfig.targetLang}`}
            >
              <Languages size={10} />
              <span>Bản Dịch AI</span>
            </Badge>
          )}
        </div>
      </div>

      {/* Main Preview / Code Container */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {mode === "reader" ? (
          <div className="flex-1 flex justify-center items-center overflow-auto p-2">
            <div
              className={`h-full ${deviceWidthClass} transition-all duration-200 rounded-xl border border-border bg-card overflow-hidden flex flex-col shadow-sm`}
            >
              {isLoadingChapter && (
                <div className="absolute inset-0 bg-background/60 backdrop-blur-xs flex items-center justify-center z-10">
                  <Badge variant="outline" className="text-xs border-primary/40 text-primary gap-1.5">
                    <Loader2 className="size-3 animate-spin" />
                    Đang tải nội dung chương...
                  </Badge>
                </div>
              )}
              <iframe
                ref={iframeRef}
                title="Epub Live Reader Preview"
                className="w-full h-full border-none select-text bg-white"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0 overflow-hidden p-2">
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                  Đang khởi tạo trình biên tập CSS...
                </div>
              }
            >
              <CodeMirrorCss />
            </Suspense>
          </div>
        )}

        {/* X-Ray Quick Drawer Panel */}
        {showXRayDrawer && (
          <div className="w-80 border-l border-border bg-card flex flex-col h-full z-20 shadow-lg animate-in slide-in-from-right duration-200">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <UserCheck className="size-4 text-primary" />
                <h3 className="text-xs font-bold text-foreground">X-Ray Trong Chương Này</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => setShowXRayDrawer(false)}
                className="size-6 text-muted-foreground"
              >
                <X size={14} />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 flex flex-col gap-2.5">
                {!xrayData ? (
                  <Empty className="p-4 gap-3">
                    <EmptyDescription className="text-xs text-muted-foreground">
                      Chưa có dữ liệu phân tích X-Ray cho cuốn sách này.
                    </EmptyDescription>
                    <EmptyContent>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => runXRayExtraction()}
                        disabled={isAnalyzingXRay}
                        className="text-xs w-full gap-1.5"
                      >
                        {isAnalyzingXRay ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                        {isAnalyzingXRay ? "Đang quét..." : "Quét X-Ray Ngay"}
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : currentChapterEntities.length === 0 ? (
                  <Empty className="p-4 gap-3">
                    <EmptyDescription className="text-xs text-muted-foreground">
                      Không ghi nhận nhân vật chính nào xuất hiện trong chương này.
                    </EmptyDescription>
                    <EmptyContent>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={() => setActiveTab("kindle")}
                        className="text-xs h-auto p-0"
                      >
                        Mở Kindle Companion Studio
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : (
                  currentChapterEntities.map((entity) => {
                    const initials = entity.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                    const excerptInThisChapter = entity.excerpts.find((ex) => ex.chapterHref === activeChapter?.href);

                    return (
                      <Card
                        key={entity.id}
                        className="p-3 bg-background border-border flex flex-col gap-1.5 shadow-2xs"
                      >
                        <div className="flex items-center gap-2">
                          <div className="size-6 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-foreground truncate">{entity.name}</h4>
                            {entity.role && (
                              <span className="text-[10px] text-muted-foreground block truncate">{entity.role}</span>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-foreground line-clamp-2 leading-relaxed">
                          {entity.description}
                        </p>
                        {excerptInThisChapter && (
                          <div className="p-1.5 rounded bg-card border border-border text-[10px] text-muted-foreground italic line-clamp-2">
                            "{excerptInThisChapter.snippet}"
                          </div>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            <div className="p-2.5 border-t border-border bg-card">
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => setActiveTab("kindle")}
                className="w-full text-center text-[11px] h-auto p-0"
              >
                Quản lý &amp; Biên tập X-Ray Toàn Cuốn Sách →
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
