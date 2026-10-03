import { useRef } from "react";
import { 
  PanelLeftClose, 
  PanelLeftOpen, 
  BookOpen, 
  FolderOpen, 
  Sparkles, 
  Download,
  Loader2,
  Bot
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
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
    isAnalyzingJev,
    isAgentDrawerOpen,
    toggleAgentDrawer,
    agentMessages,
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

      <div className="topbar__left flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={toggleSidebar}
          title={isSidebarCollapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
          aria-label="Toggle Sidebar"
        >
          <SidebarToggleIcon size={16} />
        </Button>

        <div className="topbar__brand flex items-center gap-2">
          <img src="/app-icon.png" alt="NiceEbook Studio" className="size-5 rounded-md object-contain shadow-2xs" />
          <strong className="tracking-tight text-foreground font-semibold text-xs">NiceEbook Studio</strong>
          <Badge variant="outline" className="text-xs px-2 h-5 font-mono border-primary/40 text-primary">
            v0.1.0
          </Badge>
        </div>

        {currentBook && (
          <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-md bg-secondary/60 border border-border text-xs text-foreground">
            <BookOpen size={13} className="text-primary" />
            <span className="max-w-[220px] truncate font-medium">{currentBook.title}</span>
            <span className="text-xs text-muted-foreground font-mono">
              ({currentBook.chapter_count} chương)
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenFileDialog}
          className="h-7 text-xs px-2.5 gap-1.5"
          title="Chọn file EPUB từ máy tính"
        >
          <FolderOpen size={13} />
          <span>Nạp sách</span>
        </Button>

        {currentBook && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast.loading("Đang phân tích cấu trúc sách...", { id: "book-scan" });
                runJevClassification().then(() => {
                  toast.success("Đã phân tích và đề xuất phong cách tối ưu!", { id: "book-scan" });
                });
              }}
              disabled={isAnalyzingJev}
              className="h-7 text-xs px-2.5 gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
              title="Phân tích cấu trúc sách và thể loại tự động"
            >
              {isAnalyzingJev ? (
                <Loader2 size={13} className="animate-spin text-primary" />
              ) : (
                <Sparkles size={13} />
              )}
              <span>{isAnalyzingJev ? "Đang phân tích..." : "Tự động phân tích"}</span>
            </Button>

            {onOpenExport && (
              <Button
                size="sm"
                onClick={onOpenExport}
                className="h-7 text-xs px-2.5 gap-1.5 font-medium"
                title="Đóng gói và xuất file EPUB hoàn chỉnh"
              >
                <Download size={13} />
                <span>Xuất bản EPUB</span>
              </Button>
            )}
          </>
        )}

        <Button
          variant={isAgentDrawerOpen ? "default" : "outline"}
          size="sm"
          onClick={toggleAgentDrawer}
          className={`h-7 text-xs px-2.5 gap-1.5 font-medium transition-all ${
            isAgentDrawerOpen ? "shadow-xs" : "text-foreground hover:text-primary"
          }`}
          title="Mở Trợ lý Chat AI tương tác và tự động hóa tác vụ trên dự án sách"
        >
          <Bot size={14} className={isAgentDrawerOpen ? "text-primary-foreground" : "text-amber-500"} />
          <span>Trợ Lý AI</span>
          {agentMessages.length > 0 && (
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </Button>
      </div>
    </header>
  );
}
