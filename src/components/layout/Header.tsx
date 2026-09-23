import { useState } from "react";
import { FolderOpen, RefreshCw, Sparkles, BookOpen, Download } from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { open } from "@tauri-apps/plugin-dialog";
import { ExportModal } from "../export/ExportModal";
import { toast } from "sonner";

export function Header() {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const { 
    currentBook, 
    loadBookFromPath, 
    scanGateways, 
    isScanningGateways,
    runJevClassification,
    isAnalyzingJev,
    activeGateway
  } = useAppStore();

  async function handleOpenFileDialog() {
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
      }
    } catch (err) {
      console.error("Open file error:", err);
      toast.error("Lỗi khi mở hộp thoại chọn file");
    }
  }

  return (
    <header className="h-14 border-b border-[#27272a] px-6 flex items-center justify-between bg-[#101014]/70 backdrop-blur-md z-10 select-none">
      {/* Left: App title & Current book indicator */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tracking-wide bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
          NiceEbook Studio
        </span>

        {currentBook ? (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#18181c] border border-[#27272a] text-xs text-zinc-300">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span className="max-w-[200px] truncate font-medium">{currentBook.title}</span>
            <span className="text-[10px] text-[#71717a] font-mono">({currentBook.chapter_count} chương)</span>
          </div>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/50 font-mono">
            Chưa nạp sách
          </span>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2.5">
        {currentBook && (
          <button
            onClick={() => {
              toast.loading("Jev Core đang phân tích cấu trúc sách...", { id: "jev-scan" });
              runJevClassification().then(() => {
                toast.success("Jev Core đã tối ưu style thành công!", { id: "jev-scan" });
              });
            }}
            disabled={isAnalyzingJev}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/30 text-purple-300 transition-all disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isAnalyzingJev ? "animate-spin text-purple-400" : "text-purple-400"}`} />
            <span>{isAnalyzingJev ? "Đang phân tích..." : "Nhận diện bằng Jev"}</span>
          </button>
        )}

        <button
          onClick={() => {
            toast.loading("Đang quét 9Router / Cockpit trên localhost...", { id: "scan-gw" });
            scanGateways().then(() => {
              toast.success("Đã hoàn tất quét AI Gateway!", { id: "scan-gw" });
            });
          }}
          disabled={isScanningGateways}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            activeGateway
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
              : "bg-[#18181b] hover:bg-[#222226] border-[#27272a] text-[#d4d4d8]"
          }`}
          title="Tự động kiểm tra cổng 20128, 8000, 3000, 5000, 11434"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanningGateways ? "animate-spin text-indigo-400" : ""}`} />
          <span>{isScanningGateways ? "Đang quét..." : activeGateway ? activeGateway.name : "Quét AI Gateway"}</span>
        </button>

        <button
          onClick={handleOpenFileDialog}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-all hover:shadow-indigo-600/50"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Mở sách EPUB</span>
        </button>

        {currentBook && (
          <button
            onClick={() => setIsExportOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/30 transition-all hover:shadow-emerald-600/50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất EPUB</span>
          </button>
        )}
      </div>

      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
    </header>
  );
}
