import { useState, useRef } from "react";
import { Sparkles, ChevronRight, BookOpen, Upload } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../stores/useAppStore";
import { toast } from "sonner";
import { Card } from "../ui/card";

export function BookDropzone() {
  const { 
    loadBookFromPath, 
    loadBookFromBytes, 
    isLoadingBook, 
    isDraggingFile,
    setActiveTab,
    setPendingConverterFile
  } = useAppStore();
  const [isHtmlDragOver, setIsHtmlDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDragOver = isDraggingFile || isHtmlDragOver;

  async function handleOpenFileDialog() {
    const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
    if (isTauri) {
      try {
        const selected = await open({
          multiple: false,
          filters: [
            { name: "Sách & Tài liệu", extensions: ["epub", "pdf", "txt", "md"] },
            { name: "Ebook", extensions: ["epub"] },
            { name: "PDF Document", extensions: ["pdf"] },
            { name: "Text File", extensions: ["txt", "md"] },
          ],
        });

        if (selected && typeof selected === "string") {
          const lower = selected.toLowerCase();
          if (lower.endsWith(".epub")) {
            toast.loading("Đang đọc file EPUB...", { id: "load-epub" });
            const ok = await loadBookFromPath(selected);
            if (ok) {
              toast.success("Đã nạp sách thành công!", { id: "load-epub" });
            } else {
              toast.error("Không thể đọc file EPUB này", { id: "load-epub" });
            }
          } else if (
            lower.endsWith(".pdf") ||
            lower.endsWith(".txt") ||
            lower.endsWith(".md")
          ) {
            toast.loading("Đang nạp vào trình chuyển đổi...", { id: "convert-file" });
            const { readFile } = await import("@tauri-apps/plugin-fs");
            const bytes = await readFile(selected);
            const fileName = selected.split(/[\\/]/).pop() || "document";
            const ext = lower.endsWith(".pdf") ? "pdf" : lower.endsWith(".md") ? "md" : "txt";
            setPendingConverterFile({ name: fileName, bytes, type: ext });
            setActiveTab("converter");
            toast.success("Đã mở trình chuyển đổi Ebook!", { id: "convert-file" });
          }
          return;
        } else if (selected === null) {
          return;
        }
      } catch (err) {
        console.warn("Tauri open dialog error, falling back to file input:", err);
      }
    }

    // Fallback if not Tauri or if open dialog errored
    fileInputRef.current?.click();
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (lower.endsWith(".epub")) {
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
    } else if (
      lower.endsWith(".pdf") ||
      lower.endsWith(".txt") ||
      lower.endsWith(".md")
    ) {
      toast.loading(`Đang nạp file: ${file.name}...`, { id: "convert-bytes" });
      try {
        const arrayBuffer = await file.arrayBuffer();
        const ext = lower.endsWith(".pdf") ? "pdf" : lower.endsWith(".md") ? "md" : "txt";
        setPendingConverterFile({
          name: file.name,
          bytes: new Uint8Array(arrayBuffer),
          type: ext,
        });
        setActiveTab("converter");
        toast.success("Đã mở trình chuyển đổi Ebook!", { id: "convert-bytes" });
      } catch (err) {
        console.error(err);
        toast.error("Lỗi đọc file");
      } finally {
        e.target.value = "";
      }
    } else {
      toast.error("Vui lòng chọn file .epub, .pdf, .txt, hoặc .md");
      e.target.value = "";
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsHtmlDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const lower = file.name.toLowerCase();

      if (lower.endsWith(".epub")) {
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
      } else if (
        lower.endsWith(".pdf") ||
        lower.endsWith(".txt") ||
        lower.endsWith(".md")
      ) {
        toast.loading(`Đang nạp file: ${file.name}...`, { id: "convert-bytes" });
        try {
          const arrayBuffer = await file.arrayBuffer();
          const ext = lower.endsWith(".pdf") ? "pdf" : lower.endsWith(".md") ? "md" : "txt";
          setPendingConverterFile({
            name: file.name,
            bytes: new Uint8Array(arrayBuffer),
            type: ext,
          });
          setActiveTab("converter");
          toast.success("Đã mở trình chuyển đổi Ebook!", { id: "convert-bytes" });
        } catch (err) {
          console.error(err);
          toast.error("Lỗi nạp file kéo thả");
        }
      } else {
        toast.error("Vui lòng kéo thả file có đuôi .epub, .pdf, .txt, hoặc .md");
      }
    }
  }

  return (
    <div className="max-w-xl w-full flex flex-col items-center text-center">
      {/* Hidden file input for web fallback / file selector */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,.pdf,.txt,.md,application/epub+zip,application/pdf"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Drag & Drop Hero Box */}
      <div
        onClick={handleOpenFileDialog}
        onDragOver={(e) => {
          e.preventDefault();
          setIsHtmlDragOver(true);
        }}
        onDragLeave={() => setIsHtmlDragOver(false)}
        onDrop={handleDrop}
        className={`w-full p-10 rounded-2xl border-2 border-dashed transition-all cursor-pointer group flex flex-col items-center select-none ${
          isDragOver
            ? "border-primary bg-primary/10 scale-[1.01]"
            : "border-border hover:border-primary/50 bg-card/60 hover:bg-muted/40 shadow-xs"
        }`}
      >
        <div className="size-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-5 group-hover:scale-110 group-hover:bg-primary/20 transition-all shadow-inner">
          {isLoadingBook ? (
            <Upload className="size-8 animate-bounce text-primary" />
          ) : (
            <Sparkles className="size-8" />
          )}
        </div>

        <h3 className="text-base font-semibold text-foreground mb-1">
          {isLoadingBook ? "Đang xử lý sách..." : "Kéo thả file sách (.epub, .pdf, .txt, .md) vào đây"}
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-4 leading-relaxed">
          Hỗ trợ mở file EPUB trực tiếp, hoặc chuyển đổi từ PDF (kể cả PDF scan ảnh với OCR) và TXT/Markdown sang EPUB chuẩn mực.
        </p>
        <div className="flex items-center gap-1.5 text-xs text-primary font-medium group-hover:underline">
          <span>Hoặc bấm để duyệt file trên máy tính</span>
          <ChevronRight className="size-3.5" />
        </div>
      </div>

      {/* Feature cards below dropzone */}
      <div className="grid grid-cols-3 gap-3 w-full mt-6 text-left select-none">
        <Card className="p-3.5 bg-card/60 border-border shadow-2xs">
          <div className="flex items-center gap-1.5 mb-1">
            <BookOpen className="size-3.5 text-primary" />
            <span className="text-[11px] font-semibold text-primary">Xử lý cục bộ (Offline)</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Nhận diện thể loại và gợi ý phong cách 100% offline không cần API key.
          </p>
        </Card>

        <Card className="p-3.5 bg-card/60 border-border shadow-2xs">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">9Router Auto-Discovery</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Tự động tìm kiếm các cổng AI 9router, Cockpit, Ollama trên localhost.
          </p>
        </Card>

        <Card className="p-3.5 bg-card/60 border-border shadow-2xs">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="size-3.5 text-primary" />
            <span className="text-[11px] font-semibold text-primary">Live CSS Hot-Reload</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Xem trước giao diện sách trực tiếp với tốc độ phản hồi dưới 50ms.
          </p>
        </Card>
      </div>
    </div>
  );
}
