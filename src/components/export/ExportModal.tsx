import { useState } from "react";
import { Download, X, CheckCircle2 } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/useAppStore";
import { generateEpubCss } from "../../utils/cssGenerator";
import { toast } from "sonner";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const {
    currentBook,
    currentFilePath,
    currentFileBytes,
    isVietnameseBook,
    fontFamily,
    activePreset,
    fontSize,
    lineHeight,
    firstLineIndent,
    dropCaps,
    textAlign,
    sceneDivider,
    customCss,
    modifiedChapters,
  } = useAppStore();

  const [isExporting, setIsExporting] = useState(false);
  const [exportedSize, setExportedSize] = useState<number | null>(null);
  const [exportedPath, setExportedPath] = useState<string | null>(null);

  if (!isOpen || !currentBook) return null;

  const defaultFileName = `${currentBook.title.replace(/[/\\?%*:|"<>]/g, "_")}_styled.epub`;

  async function handleExport() {
    try {
      const outputPath = await save({
        defaultPath: defaultFileName,
        filters: [{ name: "EPUB Ebook", extensions: ["epub"] }],
      });

      if (!outputPath) return;

      setIsExporting(true);
      setExportedSize(null);
      setExportedPath(null);

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

      const overrides = Object.keys(modifiedChapters).length > 0 ? modifiedChapters : null;

      const size = await invoke<number>("export_epub", {
        inputPath: currentFilePath,
        inputBytes: currentFileBytes,
        outputPath,
        customCss: fullCss,
        chapterOverrides: overrides,
      });

      setExportedSize(size);
      setExportedPath(outputPath);
      setIsExporting(false);
      toast.success("Xuất file EPUB thành công!");
    } catch (err) {
      console.error("Export EPUB error:", err);
      setIsExporting(false);
      toast.error(`Lỗi khi xuất EPUB: ${err}`);
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="card-surface rounded-[var(--ui-radius-card)] w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="h-11 px-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--ui-titlebar-surface)]">
          <div className="flex items-center gap-2">
            <Download size={15} className="text-[var(--primary)]" />
            <span className="font-semibold text-xs text-[var(--foreground)]">Xuất Bản File Sách (EPUB 3)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <div className="p-3 rounded bg-[var(--secondary)] border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted-foreground)]">Tựa sách:</span>
              <span className="font-semibold text-[var(--foreground)] truncate max-w-[220px]">{currentBook.title}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted-foreground)]">Phong cách:</span>
              <span className="text-[var(--primary)] font-medium">{activePreset.name}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted-foreground)]">Số chương:</span>
              <span className="font-mono text-[var(--foreground)]">{currentBook.chapter_count} chương</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted-foreground)]">Typography:</span>
              <span className="text-[var(--foreground)] font-mono text-[11px]">
                {fontSize}px · {lineHeight.toFixed(2)} · {dropCaps ? "DropCap" : "No DropCap"}
              </span>
            </div>
          </div>

          {/* Success Banner */}
          {exportedSize !== null && exportedPath && (
            <div className="p-3 rounded bg-[color-mix(in_srgb,var(--ui-success)_12%,var(--card))] border border-[color-mix(in_srgb,var(--ui-success)_30%,var(--border))] text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-[var(--ui-success)] font-semibold">
                <CheckCircle2 size={14} />
                <span>Đã đóng gói hoàn tất!</span>
              </div>
              <p className="text-[11px] text-[var(--foreground)] font-mono truncate">
                {exportedPath}
              </p>
              <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] pt-1 border-t border-[var(--border)]">
                <span>Dung lượng file mới:</span>
                <span className="font-mono font-semibold text-[var(--foreground)]">{formatSize(exportedSize)}</span>
              </div>
            </div>
          )}

          <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
            Hệ thống sẽ giữ nguyên cấu trúc tệp, hình ảnh bìa và phân đoạn của EPUB gốc, đồng thời tích hợp toàn bộ bảng CSS tùy biến vào từng chương sách.
          </p>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--ui-titlebar-surface)] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="lg-button lg-button--secondary h-7 text-xs px-3"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="lg-button lg-button--primary h-7 text-xs px-3"
          >
            <Download size={13} className={isExporting ? "animate-bounce" : ""} />
            <span>{isExporting ? "Đang xuất..." : "Chọn Nơi Lưu & Xuất"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
