import { useState, useRef, useMemo } from "react";
import { 
  BookOpen, 
  Sparkles, 
  Wand2, 
  BookOpenCheck, 
  Trash2, 
  FolderOpen,
  ArrowRight,
  ArrowLeft,
  Search,
  Clock,
  Play,
  Plus,
  Upload
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";

function formatLastOpened(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "Vừa xong";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  return new Date(timestamp).toLocaleDateString("vi-VN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BookView() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { 
    currentBook, 
    loadBookFromPath,
    loadBookFromBytes,
    isVietnameseBook,
    jevDecision, 
    isAnalyzingJev, 
    runJevClassification, 
    runAiDeepStyling,
    isAiGenerating,
    activeGateway,
    setActiveTab,
    activeChapterIndex,
    setActiveChapterIndex,
    activePreset,
    projects,
    openProject,
    deleteProject,
    closeActiveProject,
    modifiedChapters,
  } = useAppStore();

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase().trim();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.filePath && p.filePath.toLowerCase().includes(q))
    );
  }, [projects, searchQuery]);

  async function handleOpenFileDialog() {
    const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
    if (isTauri) {
      try {
        const selected = await open({
          multiple: false,
          filters: [{ name: "Ebook", extensions: ["epub"] }],
        });

        if (selected && typeof selected === "string") {
          toast.loading("Đang đọc file EPUB...", { id: "load-epub" });
          const ok = await loadBookFromPath(selected);
          if (ok) {
            toast.success("Đã nạp sách thành công!", { id: "load-epub" });
          } else {
            toast.error("Không thể đọc file EPUB này", { id: "load-epub" });
          }
          return;
        } else if (selected === null) {
          return;
        }
      } catch (err) {
        console.warn("Tauri open dialog error, falling back to file input:", err);
      }
    }

    fileInputRef.current?.click();
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".epub")) {
      toast.error("Vui lòng chọn file có đuôi .epub");
      e.target.value = "";
      return;
    }

    toast.loading(`Đang đọc file: ${file.name}...`, { id: "load-bytes" });
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));
      const ok = await loadBookFromBytes(bytes);
      if (ok) {
        toast.success(`Đã nạp sách "${file.name}" thành công!`, { id: "load-bytes" });
      } else {
        toast.error("Không thể giải nén file EPUB này", { id: "load-bytes" });
      }
    } catch (err) {
      console.error("Read file error:", err);
      toast.error("Lỗi khi đọc file");
    } finally {
      e.target.value = "";
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (!file.name.toLowerCase().endsWith(".epub")) {
        toast.error("Vui lòng kéo thả file có đuôi .epub");
        return;
      }

      toast.loading(`Đang đọc file: ${file.name}...`, { id: "load-bytes" });
      try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(arrayBuffer));
        const ok = await loadBookFromBytes(bytes);
        if (ok) {
          toast.success(`Đã nạp sách "${file.name}" thành công!`, { id: "load-bytes" });
        } else {
          toast.error("Không thể giải nén file EPUB này", { id: "load-bytes" });
        }
      } catch (err) {
        console.error("Drop file error:", err);
        toast.error("Lỗi khi đọc file kéo thả");
      }
    }
  }

  // View Mode 1: No active book opened, but user has saved projects
  if (!currentBook && projects.length > 0) {
    return (
      <div className="flex-1 flex flex-col overflow-y-auto p-6 max-w-7xl mx-auto w-full gap-6 select-none">
        <input
          ref={fileInputRef}
          type="file"
          accept=".epub,application/epub+zip"
          className="hidden"
          onChange={handleFileInputChange}
        />

        {/* Library Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-[var(--foreground)]">Thư Viện Dự Án (Projects)</h1>
              <span className="app-badge app-badge--brand text-xs font-mono">{projects.length} dự án</span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Chọn mở một dự án bên dưới để tiếp tục chỉnh sửa, hoặc kéo thả file .epub mới vào để tạo dự án mới.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <input
                type="text"
                placeholder="Tìm kiếm dự án..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-hidden focus:border-[var(--primary)]"
              />
            </div>

            <button
              type="button"
              onClick={handleOpenFileDialog}
              className="lg-button lg-button--primary text-xs h-8 px-3 gap-1.5 font-medium shadow-xs"
            >
              <Plus size={14} />
              <span>Nạp Sách Mới</span>
            </button>
          </div>
        </div>

        {/* Grid of Projects */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((p) => {
            const modChCount = Object.keys(p.modifiedChapters || {}).length;
            return (
              <div
                key={p.id}
                className="card-surface p-4 rounded-xl border border-[var(--border)] hover:border-[var(--primary)]/60 bg-[var(--card)] flex flex-col justify-between gap-3 transition-all shadow-xs hover:shadow-md group"
              >
                <div className="flex items-start gap-3">
                  {/* Book Cover Thumbnail */}
                  <div className="w-14 h-20 rounded-md bg-[var(--secondary)] border border-[var(--border)] flex-shrink-0 overflow-hidden flex items-center justify-center shadow-xs">
                    {p.coverDataUrl ? (
                      <img src={p.coverDataUrl} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <BookOpen size={24} className="text-[var(--muted-foreground)] opacity-60" />
                    )}
                  </div>

                  <div className="flex flex-col min-w-0 flex-1">
                    <h3 className="font-semibold text-xs text-[var(--foreground)] truncate group-hover:text-[var(--primary)] transition-colors" title={p.name}>
                      {p.name}
                    </h3>
                    <span className="text-[11px] text-[var(--muted-foreground)] truncate mt-0.5">
                      {p.filePath ? p.filePath.split(/[\\/]/).pop() : "Dự án lưu trên bộ nhớ"}
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="app-badge app-badge--neutral text-[10px] px-1.5 h-4">
                        {p.chapterCount} chương
                      </span>
                      {modChCount > 0 && (
                        <span className="app-badge app-badge--success text-[10px] px-1.5 h-4 font-medium">
                          ✨ {modChCount} ch. đã sửa AI
                        </span>
                      )}
                      <span className="app-badge app-badge--brand text-[10px] px-1.5 h-4">
                        {p.activePresetId || "classic"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Last opened + Action buttons */}
                <div className="pt-2 border-t border-[var(--border)]/70 flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                  <div className="flex items-center gap-1">
                    <Clock size={11} />
                    <span>{formatLastOpened(p.lastOpenedAt)}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProject(p.id);
                        toast.info(`Đã xóa dự án: ${p.name}`);
                      }}
                      title="Xóa dự án khỏi thư viện"
                      className="p-1 rounded text-[var(--muted-foreground)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await openProject(p.id);
                        if (!ok) {
                          toast.error("Không thể mở dự án. File EPUB gốc có thể đã bị di chuyển hoặc đổi tên.");
                        } else {
                          toast.success(`Đã mở dự án: ${p.name}`);
                        }
                      }}
                      className="lg-button lg-button--primary text-xs h-7 px-2.5 gap-1 font-medium shadow-xs"
                      title="Mở dự án để tiếp tục chỉnh sửa"
                    >
                      <Play size={11} className="fill-current" />
                      <span>Mở Dự Án</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Drop Zone to add new book */}
        <div
          className="file-drop-zone p-6 border-2 border-dashed border-[var(--border)] rounded-xl flex flex-col items-center justify-center text-center cursor-pointer hover:border-[var(--primary)] hover:bg-[var(--accent)]/10 transition-all select-none"
          data-drop-active={isDragOver ? "true" : undefined}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={handleOpenFileDialog}
        >
          <div className="w-10 h-10 rounded-full bg-[var(--secondary)] flex items-center justify-center text-[var(--primary)] mb-2 shadow-xs">
            <Upload size={18} />
          </div>
          <p className="text-xs font-semibold text-[var(--foreground)]">
            Kéo thả file sách điện tử <span className="font-mono text-[var(--primary)]">.epub</span> vào đây
          </p>
          <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
            Tự động tạo dự án mới và mở trong không gian làm việc
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="workbench-page">
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,application/epub+zip"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Top Project Navigator Bar when book is active */}
      {currentBook && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--card)]/40 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeActiveProject}
              className="lg-button lg-button--secondary text-xs h-7 px-2.5 gap-1.5"
              title="Đóng sách hiện tại và quay lại Thư viện dự án"
            >
              <ArrowLeft size={13} />
              <span>Thư viện dự án</span>
            </button>
            <span className="text-xs text-[var(--muted-foreground)]">/</span>
            <span className="text-xs font-semibold text-[var(--foreground)] truncate max-w-sm">
              {currentBook.title}
            </span>
            {Object.keys(modifiedChapters).length > 0 && (
              <span className="app-badge app-badge--success text-[10px] h-[18px]">
                ✨ {Object.keys(modifiedChapters).length} chương đã sửa AI
              </span>
            )}
          </div>
        </div>
      )}

      {/* Top 4 Stat Cards in LinguaGacha Grid */}
      <section className="workbench-page__stats-grid">
        <div className="card-surface workbench-page__stat-card">
          <p className="workbench-page__stat-card-title">Tổng số chương</p>
          <p className="workbench-page__stat-card-value">
            {currentBook ? currentBook.chapter_count : "—"}
          </p>
          <span className="workbench-page__stat-card-unit">
            {currentBook ? `${currentBook.title}` : "chưa nạp sách"}
          </span>
        </div>

        <div className="card-surface workbench-page__stat-card">
          <p className="workbench-page__stat-card-title">Dung lượng sách</p>
          <p className="workbench-page__stat-card-value">
            {currentBook ? formatFileSize(currentBook.file_size_bytes) : "—"}
          </p>
          <span className="workbench-page__stat-card-unit">
            {currentBook 
              ? isVietnameseBook 
                ? "Ngôn ngữ: VI (🇻🇳 Font dấu chuẩn)" 
                : `Ngôn ngữ: ${currentBook.language.toUpperCase()}`
              : "định dạng EPUB"}
          </span>
        </div>

        <div className="card-surface workbench-page__stat-card">
          <p className="workbench-page__stat-card-title">Phân loại Jev Core</p>
          <p className="workbench-page__stat-card-value workbench-page__stat-card-value--text workbench-page__stat-card-value--success">
            {jevDecision ? jevDecision.genre_label : (currentBook ? "Heuristic" : "—")}
          </p>
          <span className="workbench-page__stat-card-unit truncate">
            {jevDecision 
              ? `${(jevDecision.confidence * 100).toFixed(0)}% độ tin cậy` 
              : "System-1 Decision Plane"}
          </span>
        </div>

        <div className="card-surface workbench-page__stat-card">
          <p className="workbench-page__stat-card-title">AI Gateway</p>
          <p 
            className={`workbench-page__stat-card-value workbench-page__stat-card-value--text ${
              activeGateway ? "workbench-page__stat-card-value--skipped" : ""
            }`}
            title={activeGateway ? activeGateway.name : "Jev Offline"}
          >
            {activeGateway ? activeGateway.name : "Jev Offline"}
          </p>
          <span className="workbench-page__stat-card-unit truncate">
            {activeGateway ? `Port ${activeGateway.port} (${activeGateway.latency_ms}ms)` : "Zero-Key Local Engine"}
          </span>
        </div>
      </section>

      {/* Middle: FileDropZone wrapping Chapter Table */}
      <div 
        className="file-drop-zone"
        data-drop-active={isDragOver ? "true" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="file-drop-zone__content">
          <div className="app-table">
            {/* Table Header */}
            <div className="app-table__head">
              <div className="w-14 text-center">STT</div>
              <div className="w-56 px-2">Tên chương</div>
              <div className="flex-1 px-2">Trích đoạn xem trước</div>
              <div className="w-28 text-right pr-2">Thao tác</div>
            </div>

            {/* Table Body */}
            <div className="app-table__body">
              {!currentBook ? (
                <div 
                  onClick={handleOpenFileDialog}
                  className="h-full flex flex-col items-center justify-center p-8 text-center cursor-pointer hover:bg-[var(--accent)]/30 transition-colors"
                >
                  <div className="w-12 h-12 rounded-lg bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-center mb-3 text-[var(--primary)] shadow-sm">
                    <BookOpen size={24} />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">
                    Chưa có sách nào được nạp vào Studio
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)] max-w-sm mb-4">
                    Kéo và thả file sách điện tử <span className="font-mono text-[var(--primary)]">.epub</span> vào đây, hoặc nhấn nút bên dưới để chọn file từ máy tính.
                  </p>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenFileDialog();
                    }}
                    className="lg-button lg-button--primary text-xs h-7 px-3"
                  >
                    <FolderOpen size={13} />
                    <span>Chọn file .epub</span>
                  </button>
                </div>
              ) : (
                currentBook.chapters.map((chapter, idx) => {
                  const isSelected = activeChapterIndex === idx;
                  return (
                    <div
                      key={chapter.id || idx}
                      data-selected={isSelected ? "true" : undefined}
                      onClick={() => setActiveChapterIndex(idx)}
                      className="app-table__row"
                    >
                      <div className="w-14 text-center font-mono text-xs text-[var(--muted-foreground)]">
                        #{idx + 1}
                      </div>

                      <div className="w-56 px-2 font-medium truncate">
                        {chapter.title}
                      </div>

                      <div className="flex-1 px-2 text-xs text-[var(--muted-foreground)] truncate font-serif">
                        {chapter.preview_text}
                      </div>

                      <div className="w-28 text-right pr-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveChapterIndex(idx);
                            setActiveTab("reader");
                          }}
                          className="lg-button lg-button--ghost h-6 text-xs px-2 gap-1 text-[var(--primary)]"
                          title="Đọc thử chương này"
                        >
                          <span>Đọc thử</span>
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Drop Zone Overlay */}
        <div className="file-drop-zone__overlay">
          <p className="file-drop-zone__label">
            Thả file sách điện tử .epub vào đây để xử lý
          </p>
        </div>
      </div>

      {/* Bottom: LinguaGacha CommandBar */}
      <div className="command-bar">
        <div className="command-bar__actions">
          <button
            type="button"
            onClick={handleOpenFileDialog}
            className="lg-button lg-button--toolbar"
          >
            <FolderOpen size={14} />
            <span>Nạp sách</span>
          </button>

          {currentBook && (
            <>
              <div className="command-bar__separator" />

              <button
                type="button"
                onClick={() => {
                  toast.loading("Jev Core đang phân tích thể loại...", { id: "jev-scan" });
                  runJevClassification().then(() => {
                    toast.success("Jev Core đã tối ưu cấu trúc sách!", { id: "jev-scan" });
                  });
                }}
                disabled={isAnalyzingJev}
                className="lg-button lg-button--toolbar text-[var(--primary)]"
              >
                <Sparkles size={14} className={isAnalyzingJev ? "animate-spin" : ""} />
                <span>Jev Heuristic</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  toast.loading("AI đang tạo kiểu sách độc bản...", { id: "ai-deep" });
                  const ok = await runAiDeepStyling();
                  if (ok) {
                    toast.success("Đã hoàn tất định kiểu độc bản!", { id: "ai-deep" });
                  } else {
                    toast.info("Đã áp dụng định kiểu từ Jev Core", { id: "ai-deep" });
                  }
                  setActiveTab("reader");
                }}
                disabled={isAiGenerating}
                className="lg-button lg-button--toolbar"
              >
                <Wand2 size={14} className={isAiGenerating ? "animate-spin text-[var(--primary)]" : ""} />
                <span>AI Tạo Kiểu Sâu</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("ai-editor")}
                className="lg-button lg-button--toolbar text-[var(--primary)] font-medium"
                title="Chuẩn hóa H1, heading H2/H3 và sửa lỗi chính tả bằng AI"
              >
                <Wand2 size={14} />
                <span>Biên Tập AI</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("reader")}
                className="lg-button lg-button--toolbar"
              >
                <BookOpenCheck size={14} />
                <span>Mở Trình Đọc Thử</span>
              </button>

              <div className="command-bar__separator" />

              <button
                type="button"
                onClick={() => {
                  useAppStore.setState({ currentBook: null, currentFilePath: null, currentFileBytes: null });
                  toast.info("Đã đóng sách hiện tại");
                }}
                className="lg-button lg-button--toolbar text-[var(--ui-failure)]"
              >
                <Trash2 size={14} />
                <span>Đóng Sách</span>
              </button>
            </>
          )}
        </div>

        <div className="command-bar__hint">
          {currentBook ? (
            <span>Preset đang chọn: <strong className="text-[var(--foreground)]">{activePreset.name}</strong></span>
          ) : (
            <span>Kéo thả file .epub hoặc nhấn Nạp sách để bắt đầu</span>
          )}
        </div>
      </div>
    </div>
  );
}
