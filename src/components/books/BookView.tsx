import React, { useState, useRef, useMemo } from "react";
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
  Upload,
  Loader2,
  Languages,
  Eye,
  Image as ImageIcon,
  X
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { 
  useAppStore, 
  type EpubMetadata, 
  type EbookProject, 
  type JevDecision, 
  type DetectedGateway 
} from "../../stores/useAppStore";
import { type StylePreset } from "../../presets/styles";
import { type BookProfile, workflowLabel } from "../../utils/bookTypeDetector";
import { detectBookWatermarks } from "../../utils/watermarkCleaner";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { MetadataModal } from "../metadata/MetadataModal";
import { notifyIngestRoute } from "../workflow/ingestRouteToast";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatLastOpened(timestamp: number): string {
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

export interface BookViewPresentationProps {
  currentBook: EpubMetadata | null;
  projects: EbookProject[];
  isVietnameseBook: boolean;
  jevDecision: JevDecision | null;
  isAnalyzingJev: boolean;
  activeGateway: DetectedGateway | null;
  activePreset: StylePreset;
  activeChapterIndex: number;
  modifiedChapters: Record<string, string>;
  bookProfile: BookProfile | null;
  watermarkReport: ReturnType<typeof detectBookWatermarks> | null;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onOpenFileDialog: () => void;
  onSelectChapter: (idx: number) => void;
  onOpenChapterReader: (idx: number) => void;
  onOpenChapterAiEditor: () => void;
  onOpenTranslator: () => void;
  onOpenEditor: () => void;
  onOpenMetadataModal: (tab?: "metadata" | "covers" | "upload" | "ai-cover") => void;
  onRunJev: () => void;
  onCleanWatermarks: () => void;
  isCleaningWatermarks: boolean;
  onCloseActiveProject: () => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onZoomCover: () => void;
  onDeepAiStyle: () => void;
  isAiGenerating: boolean;
  onCloseBook: () => void;
  isDragOver?: boolean;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
}

/**
 * Pure presentation component for BookView (Option A 2-column Studio Layout).
 * Separated from the store wrapper so it can be cleanly tested with static markup without SSR snapshot limitations.
 */
export function BookViewPresentation(props: BookViewPresentationProps) {
  const {
    currentBook,
    projects,
    isVietnameseBook,
    jevDecision,
    isAnalyzingJev,
    activeGateway,
    activePreset,
    activeChapterIndex,
    modifiedChapters,
    bookProfile,
    watermarkReport,
    searchQuery,
    onSearchQueryChange,
    onOpenFileDialog,
    onSelectChapter,
    onOpenChapterReader,
    onOpenChapterAiEditor,
    onOpenTranslator,
    onOpenEditor,
    onOpenMetadataModal,
    onRunJev,
    onCleanWatermarks,
    isCleaningWatermarks,
    onCloseActiveProject,
    onOpenProject,
    onDeleteProject,
    onZoomCover,
    onDeepAiStyle,
    isAiGenerating,
    onCloseBook,
    isDragOver,
    onDrop,
    onDragOver,
    onDragLeave,
  } = props;

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase().trim();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.filePath && p.filePath.toLowerCase().includes(q))
    );
  }, [projects, searchQuery]);

  const filteredChapters = useMemo(() => {
    if (!currentBook) return [];
    if (!searchQuery.trim()) return currentBook.chapters;
    const q = searchQuery.toLowerCase().trim();
    return currentBook.chapters.filter((ch, idx) => 
      ch.title.toLowerCase().includes(q) || 
      ch.preview_text.toLowerCase().includes(q) ||
      String(idx + 1).includes(q)
    );
  }, [currentBook, searchQuery]);

  // Mode 1: No active book opened, but user has saved projects
  if (!currentBook && projects.length > 0) {
    return (
      <div className="flex-1 flex flex-col overflow-y-auto p-6 max-w-7xl mx-auto w-full gap-6 select-none">
        {/* Library Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-foreground">Thư Viện Dự Án (Projects)</h1>
              <Badge variant="outline" className="text-xs font-mono border-primary/40 text-primary">
                {projects.length} dự án
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Chọn mở một dự án bên dưới để tiếp tục chỉnh sửa, hoặc kéo thả file .epub mới vào để tạo dự án mới.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Tìm kiếm dự án..."
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                className="w-full text-xs pl-8 pr-3 h-8 bg-card"
              />
            </div>

            <Button
              size="sm"
              onClick={onOpenFileDialog}
              className="text-xs h-8 px-3 gap-1.5 font-medium shadow-xs"
            >
              <Plus className="size-3.5" />
              <span>Nạp Sách Mới</span>
            </Button>
          </div>
        </div>

        {/* Grid of Projects */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((p) => {
            const modChCount = Object.keys(p.modifiedChapters || {}).length;
            return (
              <Card
                key={p.id}
                className="p-4 rounded-xl border border-border hover:border-primary/60 bg-card flex flex-col justify-between gap-3 transition-all shadow-xs hover:shadow-md group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-14 h-20 rounded-md bg-secondary border border-border shrink-0 overflow-hidden flex items-center justify-center shadow-xs">
                    {p.coverDataUrl ? (
                      <img src={p.coverDataUrl} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <BookOpen className="size-6 text-muted-foreground opacity-60" />
                    )}
                  </div>

                  <div className="flex flex-col min-w-0 flex-1">
                    <h3 className="font-semibold text-xs text-foreground truncate group-hover:text-primary transition-colors" title={p.name}>
                      {p.name}
                    </h3>
                    <span className="text-xs text-muted-foreground truncate mt-0.5">
                      {p.filePath ? p.filePath.split(/[\\/]/).pop() : "Dự án lưu trên bộ nhớ"}
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge variant="secondary" className="text-xs px-2 h-5">
                        {p.chapterCount} chương
                      </Badge>
                      {modChCount > 0 && (
                        <Badge variant="secondary" className="text-xs px-2 h-5 font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          ✨ {modChCount} ch. đã sửa AI
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs px-2 h-5 border-primary/40 text-primary">
                        {p.activePresetId || "classic"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="size-3" />
                    <span>{formatLastOpened(p.lastOpenedAt)}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProject(p.id);
                      }}
                      title="Xóa dự án khỏi thư viện"
                      className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>

                    <Button
                      size="sm"
                      type="button"
                      onClick={() => onOpenProject(p.id)}
                      className="text-xs h-7 px-2.5 gap-1 font-medium shadow-xs"
                      title="Mở dự án để tiếp tục chỉnh sửa"
                    >
                      <Play className="size-3 fill-current" />
                      <span>Mở Dự Án</span>
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Drop Zone to add new book */}
        <div
          className="file-drop-zone p-6 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-center cursor-pointer hover:border-primary hover:bg-accent/10 transition-all select-none"
          data-drop-active={isDragOver ? "true" : undefined}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={onOpenFileDialog}
        >
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-primary mb-2 shadow-xs">
            <Upload size={18} />
          </div>
          <p className="text-xs font-semibold text-foreground">
            Kéo thả file sách điện tử <span className="font-mono text-primary">.epub</span> vào đây
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tự động tạo dự án mới và mở trong không gian làm việc
          </p>
        </div>
      </div>
    );
  }

  // Mode 2: Empty State Dropzone when no book and no projects
  if (!currentBook) {
    return (
      <div className="workbench-page">
        <div 
          onClick={onOpenFileDialog}
          className="flex-1 flex flex-col items-center justify-center p-12 text-center cursor-pointer hover:bg-accent/20 transition-colors select-none"
        >
          <div className="w-16 h-16 rounded-2xl bg-secondary border border-border flex items-center justify-center mb-4 text-primary shadow-xs">
            <BookOpen size={28} />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1">
            Chưa có sách nào được nạp vào Studio
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mb-5 leading-relaxed">
            Kéo và thả file sách điện tử <span className="font-mono text-primary font-medium">.epub</span> vào đây, hoặc nhấn nút bên dưới để chọn file từ máy tính.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFileDialog();
            }}
            className="text-xs h-8 px-4 gap-1.5 shadow-xs font-medium"
          >
            <FolderOpen size={14} />
            <span>Chọn file .epub</span>
          </Button>
        </div>

        <div className="command-bar">
          <div className="command-bar__actions">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={onOpenFileDialog}
              className="text-xs"
            >
              <FolderOpen size={14} />
              <span>Nạp sách</span>
            </Button>
          </div>
          <div className="command-bar__hint">
            <span>Kéo thả file .epub hoặc nhấn Nạp sách để bắt đầu</span>
          </div>
        </div>
      </div>
    );
  }

  // Mode 3: Book Loaded - 2-Column Studio Layout (Option A)
  return (
    <div className="workbench-page">
      {/* Top Project Navigator Bar when book is active */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-transparent shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onCloseActiveProject}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group cursor-pointer shrink-0"
            title="Quay lại Thư viện dự án"
          >
            <ArrowLeft className="size-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Thư viện dự án</span>
          </button>
          <span className="text-muted-foreground/40 text-xs shrink-0">/</span>
          <span className="font-heading font-medium text-sm text-foreground truncate max-w-sm sm:max-w-md" title={currentBook.title}>
            {currentBook.title}
          </span>
          {Object.keys(modifiedChapters).length > 0 && (
            <Badge
              variant="secondary"
              className="text-xs h-5 px-2 rounded-full font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0"
            >
              ✨ {Object.keys(modifiedChapters).length} chương đã sửa AI
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="xs"
            onClick={() => onOpenMetadataModal("metadata")}
            className="h-7 px-3 text-xs gap-1.5 rounded-full text-foreground hover:text-primary hover:border-primary/40 transition-colors shadow-2xs"
            title="Chỉnh sửa thông tin tác phẩm, tác giả & tìm ảnh bìa đẹp"
          >
            <Sparkles className="size-3 text-primary" />
            <span>Metadata &amp; Bìa Sách</span>
          </Button>
        </div>
      </div>

      {/* Main Studio View (Option A 2-column layout) */}
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Book Profile & Heuristics (4-5 cols) */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
            {/* Book Showcase Card */}
            <Card className="p-4 gap-4 bg-card border-border shadow-xs flex flex-col">
              <div className="flex gap-4 items-start">
                {/* Book Cover with Zoom & Edit Overlays */}
                <div className="relative group w-24 h-36 sm:w-28 sm:h-40 rounded-lg overflow-hidden border border-border bg-secondary shadow-xs shrink-0 flex items-center justify-center">
                  {currentBook.cover_data_url ? (
                    <>
                      <img
                        src={currentBook.cover_data_url}
                        alt={currentBook.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={onZoomCover}
                          className="p-1.5 rounded-full bg-black/70 hover:bg-black text-white transition-colors"
                          title="Xem ảnh bìa kích thước lớn"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenMetadataModal("covers")}
                          className="p-1.5 rounded-full bg-black/70 hover:bg-black text-white transition-colors"
                          title="Tìm đổi ảnh bìa khác"
                        >
                          <Sparkles size={13} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-2 text-muted-foreground">
                      <ImageIcon size={26} className="opacity-40 mb-1" />
                      <span className="text-xs leading-tight font-medium">Chưa có bìa</span>
                      <button
                        type="button"
                        onClick={() => onOpenMetadataModal("ai-cover")}
                        className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 mt-2"
                      >
                        <Wand2 size={11} />
                        <span>Tạo bìa AI</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Book Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {bookProfile ? (
                        <Badge variant="outline" className="text-xs px-2 h-5 font-mono border-primary/40 text-primary">
                          {bookProfile.languageFlag} {bookProfile.languageCode.toUpperCase()} · {workflowLabel(bookProfile)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs px-2 h-5 font-mono">
                          {currentBook.language ? currentBook.language.toUpperCase() : "EPUB"}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs px-2 h-5">
                        {jevDecision ? jevDecision.genre_label : activePreset.name}
                      </Badge>
                    </div>

                    <h2 className="text-sm sm:text-base font-bold text-foreground tracking-tight mt-1 line-clamp-2" title={currentBook.title}>
                      {currentBook.title}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Tác giả: <strong className="text-foreground font-medium">{currentBook.author || "Khuyết danh"}</strong>
                    </p>
                    {currentBook.publisher && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        NXB: {currentBook.publisher} {currentBook.published_year ? `(${currentBook.published_year})` : ""}
                      </p>
                    )}
                  </div>

                  {/* Quick Action Links */}
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => onOpenMetadataModal("ai-cover")}
                      className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                    >
                      <Wand2 size={11} />
                      <span>Bìa AI</span>
                    </button>
                    <span className="text-muted-foreground/40 text-xs">•</span>
                    <button
                      type="button"
                      onClick={() => onOpenMetadataModal("metadata")}
                      className="text-xs text-muted-foreground hover:text-foreground font-medium inline-flex items-center gap-1"
                    >
                      <Sparkles size={11} />
                      <span>Sửa metadata</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 3 Stats Grid */}
              <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-lg bg-secondary/50 border border-border text-center">
                <div>
                  <span className="block text-xs font-bold text-foreground">{currentBook.chapter_count}</span>
                  <span className="text-xs text-muted-foreground">Chương</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-foreground">{formatFileSize(currentBook.file_size_bytes)}</span>
                  <span className="text-xs text-muted-foreground">Dung lượng</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-foreground truncate" title={jevDecision?.genre_label || "Chuẩn"}>
                    {jevDecision?.genre_label || "Ebook"}
                  </span>
                  <span className="text-xs text-muted-foreground">Thể loại</span>
                </div>
              </div>

              {/* Primary Action Buttons */}
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (!isVietnameseBook) {
                      onOpenTranslator();
                    } else {
                      onOpenEditor();
                    }
                  }}
                  className="w-full text-xs h-8 gap-1.5 font-semibold shadow-xs"
                >
                  {!isVietnameseBook ? (
                    <>
                      <Languages size={14} />
                      <span>Tiếp tục Dịch Thuật AI</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>Định Kiểu &amp; Typography</span>
                    </>
                  )}
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenChapterReader(activeChapterIndex)}
                    className="text-xs h-7 px-2.5 gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <BookOpenCheck size={13} />
                    <span>Đọc thử sách</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenChapterAiEditor}
                    className="text-xs h-7 px-2.5 gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <Wand2 size={13} />
                    <span>Soát lỗi AI</span>
                  </Button>
                </div>
              </div>
            </Card>

            {/* Jev Heuristics Recommendation Card */}
            <Card className="p-4 bg-card border-border shadow-xs flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={14} className="text-primary" />
                  <h3 className="text-xs font-bold text-foreground">Gợi ý Jev Heuristics</h3>
                </div>
                {jevDecision ? (
                  <Badge variant="outline" className="text-xs px-2 h-5 font-mono border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                    {(jevDecision.confidence * 100).toFixed(0)}% tin cậy
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs px-2 h-5">
                    Tự động
                  </Badge>
                )}
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {jevDecision ? (
                  <>
                    Phát hiện cấu trúc truyện <strong className="text-foreground">{jevDecision.genre_label}</strong>. Khuyên dùng preset typography <strong className="text-primary">{activePreset.name}</strong> để tối ưu độ đọc.
                  </>
                ) : (
                  "Hệ thống phân loại cục bộ Rust (< 5ms) tự động nhận diện phong cách văn học phù hợp."
                )}
              </p>

              {/* AI Gateway connection status indicator */}
              <div className="flex items-center justify-between text-xs py-1 px-2 rounded-md bg-secondary/50 border border-border">
                <span className="text-muted-foreground">Cổng AI Gateway:</span>
                {activeGateway ? (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-xs">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{activeGateway.name} ({activeGateway.latency_ms}ms)</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">Lõi Offline</span>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={onRunJev}
                disabled={isAnalyzingJev}
                className="w-full text-xs h-7 text-primary border-primary/30 hover:bg-primary/10 gap-1.5 mt-1"
              >
                {isAnalyzingJev ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                <span>{isAnalyzingJev ? "Đang phân tích..." : "Phân tích lại phong cách"}</span>
              </Button>
            </Card>

            {/* Watermark Alert Card (if detected) */}
            {watermarkReport?.hasWatermarks && (
              <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 flex flex-col gap-2.5 text-amber-500 shadow-xs animate-in fade-in duration-200">
                <div className="flex items-start gap-2.5">
                  <Trash2 size={16} className="shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-semibold text-foreground block">
                      Phát hiện watermark rác!
                    </span>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Có {watermarkReport.affectedChaptersCount} chương chứa quảng cáo nguồn từ {watermarkReport.detectedDomains.join(", ") || "web truyện"}.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={isCleaningWatermarks}
                  onClick={onCleanWatermarks}
                  className="w-full text-xs h-7 shadow-xs gap-1.5"
                >
                  <Sparkles size={13} />
                  <span>{isCleaningWatermarks ? "Đang xóa..." : "Xóa Sạch Watermark"}</span>
                </Button>
              </div>
            )}
          </div>

          {/* Right Column: Chapter Table & Explorer (7-8 cols) */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3">
            <Card className="p-4 bg-card border-border shadow-xs flex flex-col">
              {/* Chapter Explorer Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                    <BookOpen size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-semibold text-sm text-foreground tracking-tight">
                        Mục Lục &amp; Danh Sách Chương
                      </h3>
                      <Badge variant="secondary" className="text-xs font-mono h-5 px-2 rounded-full font-medium">
                        {currentBook.chapter_count} chương
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tổng cộng {currentBook.chapter_count} chương trong tác phẩm
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-52 sm:w-64">
                    <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      type="text"
                      placeholder="Tìm tên hoặc số chương..."
                      value={searchQuery}
                      onChange={(e) => onSearchQueryChange(e.target.value)}
                      className="w-full text-xs pl-8.5 pr-7 h-8 rounded-full bg-input/40 border-border/80 focus:bg-background transition-colors"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => onSearchQueryChange("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 transition-colors"
                        title="Xoá tìm kiếm"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Chapter List Rows */}
              <div className="space-y-1 max-h-[580px] overflow-y-auto pr-1 mt-2">
                {filteredChapters.map((chapter, idx) => {
                  const isSelected = activeChapterIndex === idx;
                  const isModified = Boolean(modifiedChapters[idx]);
                  const cleanPreview = chapter.preview_text
                    ? chapter.preview_text.replace(new RegExp(`^${chapter.title}\\s*`, "i"), "").trim() || chapter.preview_text
                    : "";

                  return (
                    <div
                      key={chapter.id || idx}
                      onClick={() => onSelectChapter(idx)}
                      className={`group flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "border-primary/50 bg-primary/10 shadow-xs ring-1 ring-primary/20"
                          : "border-transparent hover:border-border/60 hover:bg-secondary/40 text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Chapter index bookmark pill */}
                        <div
                          className={`size-8 rounded-lg flex items-center justify-center font-mono text-xs shrink-0 transition-colors ${
                            isSelected
                              ? "bg-primary text-primary-foreground font-bold shadow-xs"
                              : "bg-secondary text-muted-foreground font-medium group-hover:bg-primary/15 group-hover:text-foreground"
                          }`}
                        >
                          #{idx + 1}
                        </div>

                        {/* Chapter title & excerpt */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs truncate transition-colors ${
                                isSelected ? "font-semibold text-foreground" : "font-medium text-foreground group-hover:text-primary"
                              }`}
                              title={chapter.title}
                            >
                              {chapter.title}
                            </span>
                            {isModified && (
                              <Badge
                                variant="secondary"
                                className="text-xs px-2 py-0.5 h-5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0"
                              >
                                ✨ Sửa AI
                              </Badge>
                            )}
                          </div>
                          {cleanPreview && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5 opacity-80 group-hover:opacity-100 transition-opacity font-serif">
                              {cleanPreview}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right-hand Action Button */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectChapter(idx);
                            onOpenChapterReader(idx);
                          }}
                          className={`h-7 px-2.5 text-xs gap-1 rounded-xl transition-all ${
                            isSelected
                              ? "shadow-xs font-semibold"
                              : "text-muted-foreground hover:text-foreground opacity-80 group-hover:opacity-100"
                          }`}
                          title="Đọc thử chương này"
                        >
                          <span>Đọc</span>
                          <ArrowRight size={11} />
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {filteredChapters.length === 0 && (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    Không tìm thấy chương nào khớp với "{searchQuery}"
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Bottom: LinguaGacha CommandBar */}
      <div className="command-bar">
        <div className="command-bar__actions">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onOpenFileDialog}
            className="text-xs"
          >
            <FolderOpen size={14} />
            <span>Nạp sách</span>
          </Button>

          <div className="command-bar__separator" />

          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onRunJev}
            disabled={isAnalyzingJev}
            className="text-xs text-primary"
          >
            {isAnalyzingJev ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            <span>Phân tích nhanh</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onDeepAiStyle}
            disabled={isAiGenerating}
            className="text-xs"
          >
            {isAiGenerating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Wand2 size={14} />
            )}
            <span>AI Sửa Style Gốc</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onOpenChapterAiEditor}
            className="text-xs text-primary font-medium"
            title="Chuẩn hóa H1, heading H2/H3 và sửa lỗi chính tả bằng AI"
          >
            <Wand2 size={14} />
            <span>Biên Tập AI</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onOpenTranslator}
            className="text-xs text-primary font-medium"
            title="Dịch sách tự động bằng AI, bảo tồn 100% định dạng và hỗ trợ song ngữ đối chiếu"
          >
            <Languages size={14} />
            <span>Dịch Sách AI</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => onOpenMetadataModal("metadata")}
            className="text-xs text-primary font-medium"
            title="Tự động bổ sung metadata và tìm kiếm ảnh bìa đẹp"
          >
            <Sparkles size={14} />
            <span>Metadata &amp; Bìa</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => onOpenChapterReader(activeChapterIndex)}
            className="text-xs"
          >
            <BookOpenCheck size={14} />
            <span>Mở Trình Đọc Thử</span>
          </Button>

          <div className="command-bar__separator" />

          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onCloseBook}
            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 size={14} />
            <span>Đóng Sách</span>
          </Button>
        </div>

        <div className="command-bar__hint">
          <span>Preset đang chọn: <strong className="text-foreground">{activePreset.name}</strong></span>
        </div>
      </div>
    </div>
  );
}

/**
 * Store-connected container component for BookView.
 */
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
    cleanWatermarksInBook,
    bookProfile,
  } = useAppStore();

  const [isCleaningWatermarks, setIsCleaningWatermarks] = useState(false);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [metadataModalTab, setMetadataModalTab] = useState<"metadata" | "covers" | "upload" | "ai-cover">("metadata");
  const [isPreviewCoverZoomed, setIsPreviewCoverZoomed] = useState(false);

  const watermarkReport = useMemo(() => {
    if (!currentBook || currentBook.chapters.length === 0) return null;
    return detectBookWatermarks(currentBook.chapters);
  }, [currentBook]);

  async function handleAutoCleanAllWatermarks() {
    if (!currentBook) return;
    setIsCleaningWatermarks(true);
    toast.loading("Đang tự động quét và làm sạch watermark trên toàn bộ sách...", { id: "clean-wm" });

    try {
      const res = await cleanWatermarksInBook();
      if (res.affectedChapters > 0 || res.removedCount > 0) {
        const saveMsg = res.savedToFile
          ? " và đã tự động lưu trực tiếp vào file sách!"
          : " và đã tự động lưu vào dự án!";
        toast.success(
          `Đã xóa sạch ${res.removedCount} đoạn watermark trong ${res.affectedChapters} chương${saveMsg}`,
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
            notifyIngestRoute();
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
        notifyIngestRoute();
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
          notifyIngestRoute();
        } else {
          toast.error("Không thể giải nén file EPUB này", { id: "load-bytes" });
        }
      } catch (err) {
        console.error("Drop file error:", err);
        toast.error("Lỗi khi đọc file kéo thả");
      }
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,application/epub+zip"
        className="hidden"
        onChange={handleFileInputChange}
      />

      <BookViewPresentation
        currentBook={currentBook}
        projects={projects}
        isVietnameseBook={isVietnameseBook}
        jevDecision={jevDecision}
        isAnalyzingJev={isAnalyzingJev}
        activeGateway={activeGateway}
        activePreset={activePreset}
        activeChapterIndex={activeChapterIndex}
        modifiedChapters={modifiedChapters}
        bookProfile={bookProfile}
        watermarkReport={watermarkReport}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onOpenFileDialog={handleOpenFileDialog}
        onSelectChapter={setActiveChapterIndex}
        onOpenChapterReader={(idx) => {
          setActiveChapterIndex(idx);
          setActiveTab("reader");
        }}
        onOpenChapterAiEditor={() => setActiveTab("ai-editor")}
        onOpenTranslator={() => setActiveTab("translator")}
        onOpenEditor={() => setActiveTab("editor")}
        onOpenMetadataModal={(tab) => {
          if (tab) setMetadataModalTab(tab);
          setIsMetadataModalOpen(true);
        }}
        onRunJev={() => {
          toast.loading("Đang phân tích cấu trúc thể loại...", { id: "genre-scan" });
          runJevClassification().then(() => {
            toast.success("Đã phân tích cấu trúc sách thành công!", { id: "genre-scan" });
          });
        }}
        onCleanWatermarks={handleAutoCleanAllWatermarks}
        isCleaningWatermarks={isCleaningWatermarks}
        onCloseActiveProject={closeActiveProject}
        onOpenProject={async (id) => {
          const ok = await openProject(id);
          if (!ok) {
            toast.error("Không thể mở dự án. File EPUB gốc có thể đã bị di chuyển hoặc đổi tên.");
          } else {
            toast.success("Đã mở dự án thành công!");
          }
        }}
        onDeleteProject={(id) => {
          deleteProject(id);
          toast.info("Đã xóa dự án khỏi thư viện.");
        }}
        onZoomCover={() => setIsPreviewCoverZoomed(true)}
        onDeepAiStyle={async () => {
          toast.loading("AI đang kiểm tra và tinh chỉnh style gốc...", { id: "ai-style" });
          const ok = await runAiDeepStyling();
          if (ok) {
            toast.success("Đã kiểm tra và tối ưu style gốc!", { id: "ai-style" });
          } else {
            toast.info("Đã áp dụng thông số style phù hợp", { id: "ai-style" });
          }
          setActiveTab("editor");
        }}
        isAiGenerating={isAiGenerating}
        onCloseBook={() => {
          useAppStore.setState({ currentBook: null, currentFilePath: null, currentFileBytes: null });
          toast.info("Đã đóng sách hiện tại");
        }}
        isDragOver={isDragOver}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
      />

      {/* Modal Zoom Book Cover */}
      {currentBook?.cover_data_url && (
        <Dialog open={isPreviewCoverZoomed} onOpenChange={setIsPreviewCoverZoomed}>
          <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden bg-card border-border">
            <DialogHeader className="p-3 border-b border-border bg-muted/30 shrink-0">
              <DialogTitle className="text-xs font-bold text-foreground truncate">{currentBook.title}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">Ảnh bìa độ phân giải cao</DialogDescription>
            </DialogHeader>
            <div className="p-4 flex items-center justify-center bg-black/40">
              <img
                src={currentBook.cover_data_url}
                alt={currentBook.title}
                className="max-w-full max-h-[70vh] object-contain rounded shadow-lg"
              />
            </div>
            <DialogFooter className="m-0 p-3 border-t border-border bg-muted/30 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPreviewCoverZoomed(false)}
                className="text-xs h-7 px-3"
              >
                Đóng
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <MetadataModal
        isOpen={isMetadataModalOpen}
        onClose={() => setIsMetadataModalOpen(false)}
        initialTab={metadataModalTab}
      />
    </>
  );
}
