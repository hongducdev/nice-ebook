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
  Sparkles,
  List,
  Check,
  Search,
  UserCheck,
  X,
  Loader2
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/useAppStore";
import { generateEpubCss, injectCssIntoHtml } from "../../utils/cssGenerator";

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
    modifiedChapters,
    xrayData,
    runXRayExtraction,
    isAnalyzingXRay,
    setActiveTab,
  } = useAppStore();

  const [mode, setMode] = useState<"reader" | "css">("reader");
  const [deviceWidth, setDeviceWidth] = useState<"full" | "tablet" | "mobile">("full");
  const [chapterHtml, setChapterHtml] = useState<string>("");
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
      if (!currentBook || !activeChapter) return;

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
  }, [currentBook, currentFilePath, currentFileBytes, activeChapterIndex, activeChapter, sceneDivider, modifiedChapters]);

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
  });

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
    styleEl.textContent = fullCss;
  }, [fullCss, chapterHtml, mode]);

  // Write content to iframe whenever chapterHtml changes
  useEffect(() => {
    if (!iframeRef.current || mode !== "reader") return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    const fullDoc = injectCssIntoHtml(chapterHtml, fullCss);
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
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-center mb-3 text-[var(--primary)] shadow-sm">
          <BookOpen size={24} />
        </div>
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">
          Chưa có sách nào để xem trước
        </h3>
        <p className="text-xs text-[var(--muted-foreground)] max-w-sm mb-4">
          Vui lòng nạp file sách .epub trong mục Quản lý sách trước khi vào trình đọc thử.
        </p>
        <button
          type="button"
          onClick={() => useAppStore.getState().setActiveTab("books")}
          className="lg-button lg-button--primary text-xs h-7 px-3"
        >
          <span>Đến mục Quản lý sách</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden select-none gap-2 p-1">
      {/* Top Reader Command Bar */}
      <div className="command-bar h-10 px-3">
        {/* Left: Mode toggle */}
        <div className="segmented-toggle">
          <button
            type="button"
            data-active={mode === "reader" ? "true" : undefined}
            data-variant="primary"
            onClick={() => setMode("reader")}
            className="segmented-toggle__item gap-1 text-xs"
          >
            <BookOpen size={13} />
            <span>Trình Đọc Thử</span>
          </button>
          <button
            type="button"
            data-active={mode === "css" ? "true" : undefined}
            data-variant="primary"
            onClick={() => setMode("css")}
            className="segmented-toggle__item gap-1 text-xs"
          >
            <Code2 size={13} />
            <span>Mã CSS Nguồn</span>
          </button>
        </div>

        {/* Center: Chapter Navigation */}
        {currentBook && currentBook.chapters.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveChapterIndex(Math.max(0, activeChapterIndex - 1))}
              disabled={activeChapterIndex === 0}
              className="h-8 w-8 rounded-[var(--ui-radius-button)] flex items-center justify-center border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--accent)] text-[var(--foreground)] disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs active:scale-[0.97]"
              title="Chương trước"
            >
              <ChevronLeft size={15} />
            </button>

            <div className="relative" ref={tocDropdownRef}>
              <button
                type="button"
                onClick={() => setShowToc(!showToc)}
                className="h-8 px-3 text-xs bg-[var(--secondary)] hover:bg-[color-mix(in_srgb,var(--secondary)_85%,var(--foreground)_15%)] active:scale-[0.98] border border-[var(--border)] rounded-[var(--ui-radius-button)] text-[var(--foreground)] font-medium flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                title="Mở danh sách chương (Table of Contents)"
              >
                <List size={14} className="text-[var(--primary)] flex-shrink-0" />
                <span className="max-w-[200px] truncate font-medium">
                  {activeChapter?.title || "Chương"}
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)] font-mono bg-[var(--background)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                  {activeChapterIndex + 1}/{currentBook.chapters.length}
                </span>
                <ChevronDown size={13} className={`text-[var(--muted-foreground)] transition-transform duration-200 ${showToc ? "rotate-180" : ""}`} />
              </button>

              {/* TOC Dropdown */}
              {showToc && (
                <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 w-80 max-h-96 rounded-lg bg-[var(--card)] border border-[var(--border)] shadow-2xl z-[100] flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--secondary)]/60 flex items-center justify-between text-xs font-semibold text-[var(--foreground)] flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <List size={13} className="text-[var(--primary)]" />
                      <span>Danh Mục Chương</span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--muted-foreground)] bg-[var(--background)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                      {currentBook.chapters.length} chương
                    </span>
                  </div>

                  {currentBook.chapters.length > 8 && (
                    <div className="p-2 border-b border-[var(--border)] flex-shrink-0 bg-[var(--background)]">
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                        <input
                          type="text"
                          placeholder="Tìm kiếm chương..."
                          value={tocSearch}
                          onChange={(e) => setTocSearch(e.target.value)}
                          className="w-full text-xs pl-7 pr-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-hidden focus:border-[var(--primary)]"
                        />
                      </div>
                    </div>
                  )}

                  <div className="overflow-y-auto max-h-72 p-1.5 flex flex-col gap-0.5">
                    {filteredChapters.map(({ ch, idx }) => (
                      <button
                        key={ch.id || idx}
                        type="button"
                        onClick={() => {
                          setActiveChapterIndex(idx);
                          setShowToc(false);
                        }}
                        className={`w-full min-h-[34px] flex-shrink-0 flex items-center justify-between px-3 py-1.5 rounded text-xs transition-colors cursor-pointer select-none text-left ${
                          activeChapterIndex === idx
                            ? "bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold shadow-xs"
                            : "text-[var(--foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                            activeChapterIndex === idx 
                              ? "bg-[var(--primary-foreground)]/20 text-[var(--primary-foreground)]" 
                              : "bg-[var(--secondary)] text-[var(--muted-foreground)]"
                          }`}>
                            #{idx + 1}
                          </span>
                          <span className="truncate">{ch.title}</span>
                        </div>
                        {activeChapterIndex === idx && (
                          <Check size={14} className="flex-shrink-0" />
                        )}
                      </button>
                    ))}
                    {filteredChapters.length === 0 && (
                      <div className="py-4 text-center text-xs text-[var(--muted-foreground)]">
                        Không tìm thấy chương nào
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                setActiveChapterIndex(Math.min(currentBook.chapters.length - 1, activeChapterIndex + 1))
              }
              disabled={activeChapterIndex >= currentBook.chapters.length - 1}
              className="h-8 w-8 rounded-[var(--ui-radius-button)] flex items-center justify-center border border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--accent)] text-[var(--foreground)] disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs active:scale-[0.97]"
              title="Chương kế tiếp"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}

        {/* Right: Device simulation & Hot Reload status */}
        <div className="flex items-center gap-2">
          {mode === "reader" && (
            <div className="segmented-toggle">
              <button
                type="button"
                data-active={deviceWidth === "full" ? "true" : undefined}
                data-variant="primary"
                onClick={() => setDeviceWidth("full")}
                className="segmented-toggle__item p-1"
                title="Toàn màn hình máy tính"
              >
                <Monitor size={13} />
              </button>
              <button
                type="button"
                data-active={deviceWidth === "tablet" ? "true" : undefined}
                data-variant="primary"
                onClick={() => setDeviceWidth("tablet")}
                className="segmented-toggle__item p-1"
                title="Khung máy tính bảng (iPad / Kobo)"
              >
                <Tablet size={13} />
              </button>
              <button
                type="button"
                data-active={deviceWidth === "mobile" ? "true" : undefined}
                data-variant="primary"
                onClick={() => setDeviceWidth("mobile")}
                className="segmented-toggle__item p-1"
                title="Khung điện thoại (iPhone / Kindle)"
              >
                <Smartphone size={13} />
              </button>
            </div>
          )}

          {/* Quick X-Ray Toggle Button */}
          <button
            type="button"
            onClick={() => setShowXRayDrawer(!showXRayDrawer)}
            className={`h-7 px-2 rounded-[var(--ui-radius-button)] flex items-center gap-1 border text-xs cursor-pointer transition-all ${
              showXRayDrawer
                ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))] text-[var(--primary)] font-semibold shadow-xs"
                : "border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--accent)] text-[var(--foreground)]"
            }`}
            title="Bật/Tắt Ngăn Kéo X-Ray (Nhân vật trong chương)"
          >
            <UserCheck size={12} />
            <span>X-Ray</span>
            {currentChapterEntities.length > 0 && (
              <span className="app-badge app-badge--brand text-[9px] h-3.5 px-1 ml-0.5">
                {currentChapterEntities.length}
              </span>
            )}
          </button>

          <span className="app-badge app-badge--brand text-[10px] h-[18px] flex items-center gap-1">
            <Sparkles size={10} className="text-[var(--primary)]" />
            <span>CSS Hot-Reload</span>
          </span>

          {activeChapter && modifiedChapters[activeChapter.href] && (
            <span className="app-badge app-badge--success text-[10px] h-[18px] flex items-center gap-1" title="Chương này đã được biên tập và chuẩn hóa bằng AI">
              <Check size={10} />
              <span>Đã Biên Tập AI</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Preview / Code Container */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {mode === "reader" ? (
          <div className="flex-1 flex justify-center items-center overflow-auto p-2">
            <div
              className={`h-full ${deviceWidthClass} transition-all duration-200 card-surface overflow-hidden flex flex-col shadow-sm`}
            >
              {isLoadingChapter && (
                <div className="absolute inset-0 bg-[var(--background)]/60 backdrop-blur-xs flex items-center justify-center z-10">
                  <span className="app-badge app-badge--brand text-xs">Đang tải nội dung chương...</span>
                </div>
              )}
              <iframe
                ref={iframeRef}
                title="Epub Live Reader Preview"
                className="w-full h-full border-none select-text bg-white"
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0 overflow-hidden p-2">
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center text-xs text-[var(--muted-foreground)]">
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
          <div className="w-80 border-l border-[var(--border)] bg-[var(--card)] flex flex-col h-full z-20 shadow-lg animate-in slide-in-from-right duration-200">
            <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <UserCheck size={15} className="text-[var(--primary)]" />
                <h3 className="text-xs font-bold text-[var(--foreground)]">X-Ray Trong Chương Này</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowXRayDrawer(false)}
                className="w-6 h-6 rounded flex items-center justify-center text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
              {!xrayData ? (
                <div className="p-4 text-center text-xs text-[var(--muted-foreground)] flex flex-col gap-3">
                  <p>Chưa có dữ liệu phân tích X-Ray cho cuốn sách này.</p>
                  <button
                    type="button"
                    onClick={() => runXRayExtraction()}
                    disabled={isAnalyzingXRay}
                    className="app-btn app-btn--primary px-3 py-1.5 text-xs flex items-center justify-center gap-1.5 w-full"
                  >
                    {isAnalyzingXRay ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {isAnalyzingXRay ? "Đang quét..." : "Quét X-Ray Ngay"}
                  </button>
                </div>
              ) : currentChapterEntities.length === 0 ? (
                <div className="p-4 text-center text-xs text-[var(--muted-foreground)] flex flex-col gap-3">
                  <p>Không ghi nhận nhân vật chính nào xuất hiện trong chương này.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("kindle")}
                    className="text-xs text-[var(--primary)] hover:underline"
                  >
                    Mở Kindle Companion Studio
                  </button>
                </div>
              ) : (
                currentChapterEntities.map((entity) => {
                  const initials = entity.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                  const excerptInThisChapter = entity.excerpts.find((ex) => ex.chapterHref === activeChapter?.href);

                  return (
                    <div
                      key={entity.id}
                      className="p-3 rounded-[var(--ui-radius-card)] bg-[var(--background)] border border-[var(--border)] flex flex-col gap-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-[var(--foreground)] truncate">{entity.name}</h4>
                          {entity.role && (
                            <span className="text-[10px] text-[var(--muted-foreground)] block truncate">{entity.role}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-[var(--foreground)] line-clamp-2 leading-relaxed">
                        {entity.description}
                      </p>
                      {excerptInThisChapter && (
                        <div className="p-1.5 rounded bg-[var(--card)] border border-[var(--border)] text-[10px] text-[var(--muted-foreground)] italic line-clamp-2">
                          "{excerptInThisChapter.snippet}"
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-2.5 border-t border-[var(--border)] bg-[var(--card)]">
              <button
                type="button"
                onClick={() => setActiveTab("kindle")}
                className="w-full text-center text-[11px] text-[var(--primary)] hover:underline"
              >
                Quản lý &amp; Biên tập X-Ray Toàn Cuốn Sách →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
