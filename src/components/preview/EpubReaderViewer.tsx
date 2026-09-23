import { useState, useEffect, useRef } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Smartphone, 
  Tablet, 
  Monitor, 
  Code2, 
  BookOpen,
  Sparkles,
  List
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/useAppStore";
import { generateEpubCss, injectCssIntoHtml } from "../../utils/cssGenerator";
import { CodeMirrorCss } from "./CodeMirrorCss";

export function EpubReaderViewer() {
  const {
    currentBook,
    currentFilePath,
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
  } = useAppStore();

  const [mode, setMode] = useState<"reader" | "css">("reader");
  const [deviceWidth, setDeviceWidth] = useState<"full" | "tablet" | "mobile">("full");
  const [chapterHtml, setChapterHtml] = useState<string>("");
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const activeChapter = currentBook?.chapters[activeChapterIndex];

  // Fetch raw chapter XHTML from Rust when activeChapterIndex or book changes
  useEffect(() => {
    let isCancelled = false;

    async function loadChapter() {
      if (!currentBook || !activeChapter) return;

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
        } else {
          // If loaded via drag & drop without path, construct clean HTML from preview/sample text
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
  }, [currentBook, currentFilePath, activeChapterIndex, activeChapter, sceneDivider]);

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

  return (
    <div className="flex-1 flex flex-col bg-[#0c0c0e] overflow-hidden select-none">
      {/* Top Reader Toolbar */}
      <div className="h-12 border-b border-[#27272a] px-5 flex items-center justify-between bg-[#121216] z-10">
        {/* Left: Mode toggle (Reader vs CSS Code) */}
        <div className="flex items-center gap-1 bg-[#18181f] p-1 rounded-xl border border-[#27272a]">
          <button
            onClick={() => setMode("reader")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              mode === "reader"
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/50"
                : "text-[#71717a] hover:text-zinc-200"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Đọc Sách</span>
          </button>
          <button
            onClick={() => setMode("css")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              mode === "css"
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/50"
                : "text-[#71717a] hover:text-zinc-200"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Biên Tập CSS</span>
          </button>
        </div>

        {/* Center: Chapter Navigation */}
        {currentBook && currentBook.chapters.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveChapterIndex(Math.max(0, activeChapterIndex - 1))}
              disabled={activeChapterIndex === 0}
              className="p-1.5 rounded-lg bg-[#18181f] hover:bg-[#22222a] border border-[#27272a] text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Chương trước"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div className="relative">
              <button
                onClick={() => setShowToc(!showToc)}
                className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#18181f] hover:bg-[#22222a] border border-[#27272a] text-xs font-medium text-zinc-200"
              >
                <List className="w-3.5 h-3.5 text-indigo-400" />
                <span className="max-w-[180px] truncate">{activeChapter?.title || "Chương"}</span>
                <span className="text-[10px] text-[#71717a] font-mono">
                  {activeChapterIndex + 1}/{currentBook.chapters.length}
                </span>
              </button>

              {/* TOC Dropdown */}
              {showToc && (
                <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 w-64 max-h-72 overflow-y-auto bg-[#181820] border border-[#2e2e38] rounded-xl shadow-2xl p-1.5 z-50">
                  {currentBook.chapters.map((ch, idx) => (
                    <button
                      key={ch.id}
                      onClick={() => {
                        setActiveChapterIndex(idx);
                        setShowToc(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs truncate transition-colors ${
                        activeChapterIndex === idx
                          ? "bg-indigo-600 text-white font-medium"
                          : "text-zinc-300 hover:bg-[#22222c]"
                      }`}
                    >
                      <span className="font-mono text-[10px] opacity-70 mr-1.5">#{idx + 1}</span>
                      {ch.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() =>
                setActiveChapterIndex(Math.min(currentBook.chapters.length - 1, activeChapterIndex + 1))
              }
              disabled={activeChapterIndex >= currentBook.chapters.length - 1}
              className="p-1.5 rounded-lg bg-[#18181f] hover:bg-[#22222a] border border-[#27272a] text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Chương kế tiếp"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Right: Device size viewport selector (when in reader mode) */}
        {mode === "reader" ? (
          <div className="flex items-center gap-1 bg-[#18181f] p-1 rounded-xl border border-[#27272a]">
            <button
              onClick={() => setDeviceWidth("mobile")}
              className={`p-1.5 rounded-lg transition-colors ${
                deviceWidth === "mobile" ? "bg-indigo-600 text-white" : "text-[#71717a] hover:text-zinc-200"
              }`}
              title="Kích thước điện thoại (390px)"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDeviceWidth("tablet")}
              className={`p-1.5 rounded-lg transition-colors ${
                deviceWidth === "tablet" ? "bg-indigo-600 text-white" : "text-[#71717a] hover:text-zinc-200"
              }`}
              title="Kích thước máy đọc sách / iPad (680px)"
            >
              <Tablet className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDeviceWidth("full")}
              className={`p-1.5 rounded-lg transition-colors ${
                deviceWidth === "full" ? "bg-indigo-600 text-white" : "text-[#71717a] hover:text-zinc-200"
              }`}
              title="Toàn màn hình"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span>Tự động cập nhật vào sách</span>
          </div>
        )}
      </div>

      {/* Main Display Area */}
      <div className="flex-1 overflow-hidden p-4 flex items-center justify-center bg-[#09090b]">
        {mode === "reader" ? (
          <div
            className={`h-full ${deviceWidthClass} transition-all duration-300 rounded-2xl overflow-hidden shadow-2xl border border-[#27272a] bg-[#121216] relative flex flex-col`}
          >
            {isLoadingChapter && (
              <div className="absolute inset-0 bg-[#121216]/80 backdrop-blur-sm z-20 flex items-center justify-center">
                <span className="text-xs text-indigo-400 font-mono animate-pulse">Đang nạp chương...</span>
              </div>
            )}
            <iframe
              ref={iframeRef}
              title="Epub Live Preview"
              className="w-full h-full border-none"
              sandbox="allow-same-origin"
            />
          </div>
        ) : (
          <div className="w-full h-full max-w-5xl mx-auto flex">
            <CodeMirrorCss />
          </div>
        )}
      </div>
    </div>
  );
}
