import { useState, useRef } from "react";
import { Sparkles, ChevronRight, BookOpen, Upload } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../stores/useAppStore";
import { toast } from "sonner";

export function BookDropzone() {
  const { loadBookFromPath, loadBookFromBytes, isLoadingBook, isDraggingFile } = useAppStore();
  const [isHtmlDragOver, setIsHtmlDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDragOver = isDraggingFile || isHtmlDragOver;

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

    // Fallback if not Tauri or if open dialog errored
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
    setIsHtmlDragOver(false);

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

  return (
    <div className="max-w-xl w-full flex flex-col items-center text-center">
      {/* Hidden file input for web fallback / file selector */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,application/epub+zip"
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
            ? "border-indigo-500 bg-indigo-500/10 scale-[1.01]"
            : "border-[#27272a] hover:border-indigo-500/50 bg-[#121216]/50 hover:bg-[#16161b]"
        }`}
      >
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-5 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all shadow-inner">
          {isLoadingBook ? (
            <Upload className="w-8 h-8 animate-bounce text-indigo-400" />
          ) : (
            <Sparkles className="w-8 h-8" />
          )}
        </div>

        <h3 className="text-base font-semibold text-zinc-100 mb-1">
          {isLoadingBook ? "Đang xử lý sách..." : "Kéo thả file sách (.epub) vào đây"}
        </h3>
        <p className="text-xs text-[#71717a] max-w-sm mb-4">
          Lõi Jev Core sẽ tự động phân tích cấu trúc chương, văn phong và đề xuất bộ CSS phù hợp nhất mà không cần API key.
        </p>
        <div className="flex items-center gap-2 text-xs text-indigo-400 font-medium group-hover:underline">
          <span>Hoặc bấm để duyệt file trên máy tính</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Feature cards below dropzone */}
      <div className="grid grid-cols-3 gap-3 w-full mt-6 text-left select-none">
        <div className="p-3.5 rounded-xl bg-[#141418] border border-[#27272a]/70">
          <div className="flex items-center gap-1.5 mb-1">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[11px] font-semibold text-indigo-400">Jev Core (Offline)</span>
          </div>
          <p className="text-[11px] text-[#71717a] leading-relaxed">
            Nhận diện thể loại và gợi ý phong cách 100% offline không cần API key.
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-[#141418] border border-[#27272a]/70">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-semibold text-emerald-400">9Router Auto-Discovery</span>
          </div>
          <p className="text-[11px] text-[#71717a] leading-relaxed">
            Tự động tìm kiếm các cổng AI 9router, Cockpit, Ollama trên localhost.
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-[#141418] border border-[#27272a]/70">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[11px] font-semibold text-purple-400">Live CSS Hot-Reload</span>
          </div>
          <p className="text-[11px] text-[#71717a] leading-relaxed">
            Xem trước giao diện sách trực tiếp với tốc độ phản hồi dưới 50ms.
          </p>
        </div>
      </div>
    </div>
  );
}
