import { useRef } from "react";
import { 
  PanelLeftClose, 
  PanelLeftOpen, 
  BookOpen, 
  FolderOpen, 
  Sparkles, 
  Download 
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";

interface AppTitlebarProps {
  onOpenExport?: () => void;
}

export function AppTitlebar({ onOpenExport }: AppTitlebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { 
    isSidebarCollapsed, 
    toggleSidebar, 
    currentBook, 
    loadBookFromPath, 
    loadBookFromBytes, 
    runJevClassification, 
    isAnalyzingJev 
  } = useAppStore();

  const SidebarToggleIcon = isSidebarCollapsed ? PanelLeftOpen : PanelLeftClose;

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

  return (
    <header className="shell-topbar titlebar">
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,application/epub+zip"
        className="hidden"
        onChange={handleFileInputChange}
      />

      <div className="topbar__left">
        <button
          type="button"
          className="topbar__menu-button"
          onClick={toggleSidebar}
          title={isSidebarCollapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
          aria-label="Toggle Sidebar"
        >
          <SidebarToggleIcon size={18} />
        </button>

        <div className="topbar__brand flex items-center gap-2">
          <img src="/app-icon.png" alt="NiceEbook Studio" className="w-5 h-5 rounded object-contain shadow-2xs" />
          <strong className="tracking-tight text-foreground font-semibold">NiceEbook Studio</strong>
          <span className="app-badge app-badge--brand text-[10px] px-1.5 h-[18px]">v0.1.0</span>
        </div>

        {currentBook && (
          <div className="flex items-center gap-1.5 ml-3 px-2 py-0.5 rounded bg-[var(--secondary)] border border-[var(--border)] text-xs text-[var(--foreground)]">
            <BookOpen size={13} className="text-[var(--primary)]" />
            <span className="max-w-[220px] truncate font-medium">{currentBook.title}</span>
            <span className="text-[11px] text-[var(--muted-foreground)] font-mono">
              ({currentBook.chapter_count} chương)
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleOpenFileDialog}
          className="lg-button lg-button--secondary h-7 text-xs px-2.5"
          title="Chọn file EPUB từ máy tính"
        >
          <FolderOpen size={13} />
          <span>Nạp sách</span>
        </button>

        {currentBook && (
          <>
            <button
              type="button"
              onClick={() => {
                toast.loading("Jev Core đang phân tích...", { id: "jev-scan" });
                runJevClassification().then(() => {
                  toast.success("Jev Core đã đề xuất phong cách tối ưu!", { id: "jev-scan" });
                });
              }}
              disabled={isAnalyzingJev}
              className="lg-button lg-button--outline h-7 text-xs px-2.5 text-[var(--primary)]"
              title="Phân tích cấu trúc sách và thể loại bằng Jev Core"
            >
              <Sparkles size={13} className={isAnalyzingJev ? "animate-spin" : ""} />
              <span>{isAnalyzingJev ? "Đang phân tích..." : "Jev Scan"}</span>
            </button>

            {onOpenExport && (
              <button
                type="button"
                onClick={onOpenExport}
                className="lg-button lg-button--primary h-7 text-xs px-2.5"
                title="Đóng gói và xuất file EPUB hoàn chỉnh"
              >
                <Download size={13} />
                <span>Xuất bản EPUB</span>
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
