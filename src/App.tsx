import { useState, useEffect } from "react";
import { Toaster, toast } from "sonner";
import { useAppStore } from "./stores/useAppStore";
import { Sidebar } from "./components/layout/Sidebar";
import { AppTitlebar } from "./components/layout/AppTitlebar";
import { StatusBar } from "./components/layout/StatusBar";
import { BookView } from "./components/books/BookView";
import { PresetGallery } from "./components/styles/PresetGallery";
import { TypographyControls } from "./components/styles/TypographyControls";
import { EpubReaderViewer } from "./components/preview/EpubReaderViewer";
import { GatewayView } from "./components/ai/GatewayView";
import { ChapterEnhancerView } from "./components/ai/ChapterEnhancerView";
import { ExportModal } from "./components/export/ExportModal";
import { 
  Settings as SettingsIcon, 
  Upload 
} from "lucide-react";

export default function App() {
  const [isExportOpen, setIsExportOpen] = useState(false);

  const { 
    activeTab, 
    scanGateways, 
    loadBookFromPath, 
    isDraggingFile, 
    setIsDraggingFile,
    setActiveTab,
    theme,
    setTheme
  } = useAppStore();

  // Auto scan local gateways once on startup
  useEffect(() => {
    scanGateways();
  }, [scanGateways]);

  // Setup Tauri native window drag & drop listener
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function setupTauriDragDrop() {
      if (typeof window === "undefined" || !(window as any).__TAURI_INTERNALS__) {
        return;
      }

      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        unlisten = await getCurrentWebview().onDragDropEvent(async (event) => {
          if (event.payload.type === "over" || event.payload.type === "enter") {
            setIsDraggingFile(true);
          } else if (event.payload.type === "leave") {
            setIsDraggingFile(false);
          } else if (event.payload.type === "drop") {
            setIsDraggingFile(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              const filePath = paths[0];
              if (!filePath.toLowerCase().endsWith(".epub")) {
                toast.error("Vui lòng kéo thả file có đuôi .epub");
                return;
              }

              toast.loading("Đang đọc file EPUB...", { id: "load-epub" });
              const ok = await loadBookFromPath(filePath);
              if (ok) {
                toast.success("Đã nạp sách thành công!", { id: "load-epub" });
                setActiveTab("books");
              } else {
                toast.error("Không thể đọc file EPUB này", { id: "load-epub" });
              }
            }
          }
        });
      } catch (err) {
        console.warn("Could not register Tauri drag-drop listener:", err);
      }
    }

    setupTauriDragDrop();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [loadBookFromPath, setIsDraggingFile, setActiveTab]);

  return (
    <div className="app-shell">
      <Toaster 
        position="top-right" 
        theme={theme === "light" ? "light" : "dark"} 
        richColors 
      />

      {/* Global Drag & Drop Overlay */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 bg-[var(--background)]/85 backdrop-blur-md border-2 border-dashed border-[var(--primary)] flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150">
          <div className="w-16 h-16 rounded bg-[color-mix(in_srgb,var(--primary)_15%,var(--card))] border border-[var(--primary)] flex items-center justify-center text-[var(--primary)] mb-3 shadow-lg">
            <Upload size={32} />
          </div>
          <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">
            Thả file sách điện tử (.epub) vào đây
          </h3>
          <p className="text-xs text-[var(--muted-foreground)] max-w-sm text-center">
            Hệ thống sẽ tự động giải nén và phân tích phong cách bằng Jev Core.
          </p>
        </div>
      )}

      {/* Top Desktop Titlebar */}
      <AppTitlebar onOpenExport={() => setIsExportOpen(true)} />

      {/* Main Shell Body */}
      <div className="shell-body">
        {/* LinguaGacha Collapsible Sidebar */}
        <Sidebar />

        {/* LinguaGacha Workspace Frame with 8px Corner */}
        <main className="workspace-frame">
          {activeTab === "books" && <BookView />}
          {activeTab === "reader" && <EpubReaderViewer />}
          {activeTab === "presets" && <PresetGallery />}
          {activeTab === "editor" && <TypographyControls />}
          {activeTab === "ai" && <GatewayView />}
          {activeTab === "ai-editor" && <ChapterEnhancerView />}
          {activeTab === "settings" && (
            <div className="flex-1 flex flex-col p-4 overflow-y-auto max-w-4xl mx-auto w-full gap-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--border)]">
                <div className="w-8 h-8 rounded flex items-center justify-center bg-[var(--secondary)] text-[var(--foreground)] border border-[var(--border)]">
                  <SettingsIcon size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--foreground)]">Cài Đặt & Giới Thiệu</h2>
                  <p className="text-xs text-[var(--muted-foreground)]">Thông tin kiến trúc, bản quyền và an toàn hệ thống.</p>
                </div>
              </div>

              {/* Setting Cards using LinguaGacha setting-card-row */}
              <div className="flex flex-col gap-3">
                <div className="setting-card-row">
                  <div className="setting-card-row__copy">
                    <div className="flex items-center gap-2">
                      <h3 className="setting-card-row__title">Chủ đề giao diện (Appearance Theme)</h3>
                      <span className="app-badge app-badge--brand text-[10px] h-[18px]">LinguaGacha Design</span>
                    </div>
                    <p className="setting-card-row__description">
                      Chuyển đổi giữa chế độ Sáng (Light), Tối (Dark) hoặc đồng bộ theo cấu hình Hệ điều hành (System).
                    </p>
                  </div>
                  <div className="setting-card-row__action">
                    <div className="segmented-toggle">
                      <button
                        type="button"
                        data-active={theme === "light" ? "true" : undefined}
                        data-variant="primary"
                        onClick={() => setTheme("light")}
                        className="segmented-toggle__item"
                      >
                        Sáng
                      </button>
                      <button
                        type="button"
                        data-active={theme === "dark" ? "true" : undefined}
                        data-variant="primary"
                        onClick={() => setTheme("dark")}
                        className="segmented-toggle__item"
                      >
                        Tối
                      </button>
                      <button
                        type="button"
                        data-active={theme === "system" ? "true" : undefined}
                        data-variant="primary"
                        onClick={() => setTheme("system")}
                        className="segmented-toggle__item"
                      >
                        Hệ thống
                      </button>
                    </div>
                  </div>
                </div>

                <div className="setting-card-row">
                  <div className="setting-card-row__copy">
                    <h3 className="setting-card-row__title">Về NiceEbook Studio</h3>
                    <p className="setting-card-row__description">
                      Phần mềm thiết kế và làm đẹp sách điện tử (EPUB) tự động bằng AI, phong cách thẩm mỹ chuẩn mực lấy cảm hứng từ LinguaGacha, tích hợp Jev Core System-1 Decision Plane siêu tốc chạy trực tiếp trong Rust.
                    </p>
                  </div>
                  <div className="setting-card-row__action">
                    <span className="app-badge app-badge--brand text-xs font-mono">v0.1.0-alpha</span>
                  </div>
                </div>

                <div className="setting-card-row">
                  <div className="setting-card-row__copy">
                    <h3 className="setting-card-row__title">Kiến trúc kỹ thuật & Bộ nhớ</h3>
                    <p className="setting-card-row__description">
                      Tauri v2 + Rust Core + React 19 + Tailwind CSS 4. Tối ưu bộ nhớ Native WebView &lt; 40MB RAM.
                    </p>
                  </div>
                  <div className="setting-card-row__action">
                    <span className="app-badge app-badge--success text-xs font-mono">RAM ~38MB</span>
                  </div>
                </div>

                <div className="setting-card-row">
                  <div className="setting-card-row__copy">
                    <h3 className="setting-card-row__title">Quyền riêng tư & Bảo mật Zero-Key</h3>
                    <p className="setting-card-row__description">
                      Sách được phân tích và đóng gói 100% cục bộ trên máy tính. Dữ liệu không bao giờ bị tải lên bất kỳ máy chủ đám mây nào khi sử dụng Jev Core.
                    </p>
                  </div>
                  <div className="setting-card-row__action">
                    <span className="app-badge app-badge--success text-xs font-mono">Zero-Cloud</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar />

      {/* Export EPUB Modal */}
      <ExportModal 
        isOpen={isExportOpen} 
        onClose={() => setIsExportOpen(false)} 
      />
    </div>
  );
}
