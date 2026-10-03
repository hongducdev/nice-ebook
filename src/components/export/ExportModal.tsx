import { useState } from "react";
import { Download, CheckCircle2, Info } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
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
    bookStyleSignature,
    modifiedChapters,
  } = useAppStore();

  const [isExporting, setIsExporting] = useState(false);
  const [exportedSize, setExportedSize] = useState<number | null>(null);
  const [exportedPath, setExportedPath] = useState<string | null>(null);

  if (!currentBook) return null;
  const safeTitle = currentBook.title.replace(/[/\\?%*:|"<>]/g, "_");

  const metadataOverrides = {
    title: currentBook.title,
    author: currentBook.author,
    language: currentBook.language,
    description: currentBook.description,
    cover_data_url: currentBook.cover_data_url,
  };

  const buildCss = () =>
    generateEpubCss({
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
      // Chế độ "theo sách hiện tại" chỉ ghi đè những token đọc được từ CSS gốc.
      signature: bookStyleSignature,
    });

  async function handleExport() {
    const outputPath = await save({
      defaultPath: `${safeTitle}_styled.epub`,
      filters: [{ name: "EPUB Ebook", extensions: ["epub"] }],
    });
    if (!outputPath) return;

    setIsExporting(true);
    setExportedSize(null);
    setExportedPath(null);

    try {
      const overrides = Object.keys(modifiedChapters).length > 0 ? modifiedChapters : null;
      const size = await invoke<number>("export_epub", {
        inputPath: currentFilePath,
        inputBytes: currentFileBytes,
        outputPath,
        customCss: buildCss(),
        chapterOverrides: overrides,
        metadataOverrides,
      });

      setExportedSize(size);
      setExportedPath(outputPath);
      toast.success("Xuất file EPUB thành công!");
    } catch (err) {
      console.error("Export EPUB error:", err);
      toast.error(`Lỗi khi xuất EPUB: ${err}`);
    } finally {
      setIsExporting(false);
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3.5 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <Download className="size-4 text-primary" />
            <DialogTitle className="text-sm font-semibold">Xuất Bản File Sách</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Đóng gói EPUB với kiểu chữ và nội dung bạn đã biên tập trong studio.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 p-5">
          <div className="flex flex-col gap-4">
            {/* Book summary */}
            <div className="p-3 rounded-lg bg-secondary/60 border border-border flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Tựa sách:</span>
                <span className="font-semibold text-foreground truncate max-w-[280px]">
                  {currentBook.title}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Số chương:</span>
                <Badge variant="outline" className="font-mono text-[11px] h-5">
                  {currentBook.chapter_count} chương
                </Badge>
              </div>
            </div>

            {/* Success banner */}
            {exportedSize !== null && exportedPath && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="size-4" />
                  <span>Đã đóng gói hoàn tất!</span>
                </div>
                <p className="text-[11px] text-foreground font-mono break-all bg-background/50 p-1.5 rounded border border-border">
                  {exportedPath}
                </p>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border">
                  <span>Dung lượng tệp:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatSize(exportedSize)}
                  </span>
                </div>
              </div>
            )}

            {/* Honest note about scope */}
            <div className="p-2.5 rounded-lg bg-secondary/40 border border-border flex items-start gap-2">
              <Info className="size-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                File xuất ra là EPUB 3 chuẩn, mở được trên mọi trình đọc (Calibre, Apple Books,
                Google Play Books, Kobo, Kindle qua Send-to-Kindle).
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="m-0 p-4 border-t border-border bg-muted/30 flex items-center justify-end gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            Đóng
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            className="h-8 text-xs gap-1.5"
          >
            <Download className={`size-3.5 ${isExporting ? "animate-bounce" : ""}`} />
            <span>{isExporting ? "Đang xuất..." : "Chọn Nơi Lưu & Xuất"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
