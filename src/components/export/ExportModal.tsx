import { useState } from "react";
import { Download, X, CheckCircle2, Sparkles } from "lucide-react";
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
    activePreset,
    fontSize,
    lineHeight,
    firstLineIndent,
    dropCaps,
    textAlign,
    sceneDivider,
    customCss,
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
      });

      const size = await invoke<number>("export_epub", {
        inputPath: currentFilePath,
        inputBytes: null,
        outputPath,
        customCss: fullCss,
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
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-[#141418] border border-[#27272a] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="h-14 px-6 border-b border-[#27272a] flex items-center justify-between bg-[#101013]">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-sm text-zinc-100">Xuất File Sách (EPUB 3)</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-[#1f1f26] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-[#18181f] border border-[#27272a] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#71717a]">Tựa sách:</span>
              <span className="font-semibold text-zinc-200 truncate max-w-[200px]">{currentBook.title}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#71717a]">Phong cách:</span>
              <span className="text-indigo-400 font-medium">{activePreset.name}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#71717a]">Số chương:</span>
              <span className="font-mono text-zinc-300">{currentBook.chapter_count} chương</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#71717a]">Typography:</span>
              <span className="text-zinc-300 font-mono text-[11px]">
                {fontSize}px · Line {lineHeight.toFixed(2)} · {dropCaps ? "DropCap" : "No DropCap"}
              </span>
            </div>
          </div>

          {/* Success Box */}
          {exportedSize !== null && (
            <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 flex items-start gap-3 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="font-bold block">Xuất sách thành công!</span>
                <span className="text-[11px] text-emerald-400/90 font-mono block">
                  Dung lượng: {formatSize(exportedSize)}
                </span>
                <span className="text-[10px] text-[#71717a] truncate block mt-0.5">
                  {exportedPath}
                </span>
              </div>
            </div>
          )}

          <div className="p-3 rounded-xl bg-[#181820] border border-[#27272a] text-[11px] text-[#71717a] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <span>File xuất ra tuân thủ chuẩn EPUB quốc tế, đọc mượt trên Apple Books, Kindle, Kobo, Calibre.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 px-6 border-t border-[#27272a] bg-[#101013] flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-[#a1a1aa] hover:text-zinc-200 hover:bg-[#18181f] transition-colors"
          >
            Đóng
          </button>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50"
          >
            <Download className={`w-3.5 h-3.5 ${isExporting ? "animate-bounce" : ""}`} />
            <span>{isExporting ? "Đang đóng gói..." : "Chọn Nơi Lưu & Xuất"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
