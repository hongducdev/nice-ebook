import { useState, useEffect } from "react";
import { Toaster, toast } from "sonner";
import { useAppStore } from "./stores/useAppStore";
import { Sidebar } from "./components/layout/Sidebar";
import { AppTitlebar } from "./components/layout/AppTitlebar";
import { StatusBar } from "./components/layout/StatusBar";
import { AppSplashScreen } from "./components/layout/AppSplashScreen";
import { BookView } from "./components/books/BookView";
import { PresetGallery } from "./components/styles/PresetGallery";
import { TypographyControls } from "./components/styles/TypographyControls";
import { EpubReaderViewer } from "./components/preview/EpubReaderViewer";
import { GatewayView } from "./components/ai/GatewayView";
import { ChapterEnhancerView } from "./components/ai/ChapterEnhancerView";
import { BookTranslatorView } from "./components/translation/BookTranslatorView";
import { KindleCompanionView } from "./components/kindle/KindleCompanionView";
import { ExportModal } from "./components/export/ExportModal";
import { ConverterView } from "./components/converter/ConverterView";
import { BookAgentDrawer } from "./components/agent/BookAgentDrawer";
import { BookAgentFullView } from "./components/agent/BookAgentFullView";
import { BookPipelineStepper } from "./components/workflow/BookPipelineStepper";
import { notifyIngestRoute } from "./components/workflow/ingestRouteToast";
import { workflowKindFromFile, workflowLabel } from "./utils/bookTypeDetector";
import { TooltipProvider } from "./components/ui/tooltip";
import { Card, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import { 
  Settings as SettingsIcon, 
  Upload,
  Sun,
  Moon,
  Monitor,
  Trash2,
  ShieldCheck,
  Cpu,
  Info
} from "lucide-react";
export default function App() {
  if (typeof window !== "undefined") {
    (window as any).__APP_STORE__ = useAppStore;
  }
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [splashStep, setSplashStep] = useState("Khởi tạo môi trường Studio...");
  const [splashProgress, setSplashProgress] = useState(30);
  const { 
    currentBook,
    activeTab, 
    scanGateways, 
    loadBookFromPath, 
    isDraggingFile, 
    setIsDraggingFile,
    setActiveTab,
    setPendingConverterFile,
    theme,
    setTheme,
    autoRouteOnIngest,
    setAutoRouteOnIngest,
    resetWorkflowState,
    bookProfile,
    isExportOpen,
    setIsExportOpen,
  } = useAppStore();

  // Auto scan local gateways once on startup with smooth splash progression
  useEffect(() => {
    let isMounted = true;
    async function initApp() {
      await new Promise((resolve) => setTimeout(resolve, 180));
      if (!isMounted) return;
      setSplashStep("Đang quét các cổng AI Proxy cục bộ...");
      setSplashProgress(65);

      await scanGateways();
      if (!isMounted) return;
      setSplashStep("Hoàn tất khởi động, sẵn sàng làm việc!");
      setSplashProgress(100);

      setTimeout(() => {
        if (isMounted) {
          setIsAppLoading(false);
        }
      }, 350);
    }

    initApp();
    return () => {
      isMounted = false;
    };
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
              const lower = filePath.toLowerCase();

              if (lower.endsWith(".epub")) {
                toast.loading("Đang đọc file EPUB...", { id: "load-epub" });
                const ok = await loadBookFromPath(filePath);
                if (ok) {
                  toast.success("Đã nạp sách thành công!", { id: "load-epub" });
                  // The store already routed the user (e.g. foreign book -> Translator).
                  // Only surface what it decided; never force a tab here.
                  notifyIngestRoute();
                } else {
                  toast.error("Không thể đọc file EPUB này", { id: "load-epub" });
                }
              } else if (
                lower.endsWith(".pdf") ||
                lower.endsWith(".txt") ||
                lower.endsWith(".md") ||
                lower.endsWith(".markdown")
              ) {
                const kind = workflowKindFromFile(filePath);
                const pipelineHint =
                  kind === "pdf-digital"
                    ? "quy trình: trích xuất văn bản → đóng gói EPUB"
                    : "quy trình: chuyển đổi → đóng gói EPUB";
                toast.loading("Đang nạp file vào trình chuyển đổi Ebook...", { id: "convert-file" });
                try {
                  const { readFile } = await import("@tauri-apps/plugin-fs");
                  const bytes = await readFile(filePath);
                  const fileName = filePath.split(/[\\/]/).pop() || "document";
                  setPendingConverterFile({ name: fileName, bytes, type: kind === "pdf-digital" ? "pdf" : kind === "md" ? "md" : "txt" });
                  setActiveTab("converter");
                  toast.success(`Đã mở trình chuyển đổi — ${pipelineHint}`, { id: "convert-file" });
                } catch (err) {
                  console.error(err);
                  toast.error("Không thể đọc file đã thả", { id: "convert-file" });
                }
              } else {
                toast.error("Vui lòng kéo thả file sách (.epub, .pdf, .txt, .md)");
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
    <TooltipProvider>
      <div className="app-shell">
      <Toaster 
        position="bottom-right" 
        theme={theme === "light" ? "light" : "dark"} 
        richColors 
        duration={2200}
        visibleToasts={1}
        closeButton
      />

      {/* Startup Splash Screen */}
      <AppSplashScreen
        isLoading={isAppLoading}
        stepMessage={splashStep}
        progressPercent={splashProgress}
      />

      {/* Global Drag & Drop Overlay */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 bg-[var(--background)]/85 backdrop-blur-md border-2 border-dashed border-[var(--primary)] flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150">
          <div className="w-16 h-16 rounded bg-[color-mix(in_srgb,var(--primary)_15%,var(--card))] border border-[var(--primary)] flex items-center justify-center text-[var(--primary)] mb-3 shadow-lg">
            <Upload size={32} />
          </div>
          <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">
            Thả file sách (.epub, .pdf, .txt, .md) vào đây
          </h3>
          <p className="text-xs text-[var(--muted-foreground)] max-w-sm text-center">
            Hệ thống tự nhận diện ngôn ngữ và chọn quy trình: dịch thuật, OCR hoặc chuyển đổi.
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
          {currentBook && activeTab !== "books" && activeTab !== "settings" && activeTab !== "agent" && (
            <div className="px-4 py-1.5 border-b border-[var(--border)] bg-[var(--card)]/40 flex-shrink-0 flex items-center justify-between">
              <BookPipelineStepper compact className="flex-1" />
            </div>
          )}
          {activeTab === "books" && <BookView />}
          {activeTab === "converter" && <ConverterView />}
          {activeTab === "reader" && <EpubReaderViewer />}
          {activeTab === "presets" && <PresetGallery />}
          {activeTab === "editor" && <TypographyControls />}
          {activeTab === "ai" && <GatewayView />}
          {activeTab === "ai-editor" && <ChapterEnhancerView />}
          {activeTab === "translator" && <BookTranslatorView />}
          {activeTab === "kindle" && <KindleCompanionView />}
          {activeTab === "agent" && <BookAgentFullView />}
          {activeTab === "settings" && (
            <div className="flex-1 flex flex-col p-6 overflow-y-auto max-w-4xl mx-auto w-full gap-5">
              <div className="flex items-center gap-3 pb-3 border-b border-border">
                <div className="size-9 rounded-md flex items-center justify-center bg-secondary text-foreground border border-border">
                  <SettingsIcon size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Cài Đặt & Giới Thiệu</h2>
                  <p className="text-xs text-muted-foreground">Thông tin kiến trúc, bản quyền và an toàn hệ thống.</p>
                </div>
              </div>

              <div className="flex flex-col gap-3.5">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <div className="flex flex-col gap-1 pr-4">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-medium">Chủ đề giao diện (Appearance Theme)</CardTitle>
                        <Badge variant="outline" className="text-[10px] h-4.5 border-primary/40 text-primary">LinguaGacha Design</Badge>
                      </div>
                      <CardDescription className="text-xs">
                        Chuyển đổi giữa chế độ Sáng (Light), Tối (Dark) hoặc đồng bộ theo cấu hình Hệ điều hành (System).
                      </CardDescription>
                    </div>
                    <ToggleGroup
                      type="single"
                      value={theme}
                      onValueChange={(val) => {
                        if (val) setTheme(val as "light" | "dark" | "system");
                      }}
                      className="border border-border rounded-md p-0.5 bg-muted/40"
                    >
                      <ToggleGroupItem value="light" size="sm" className="h-7 text-xs px-2.5 gap-1.5 data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs">
                        <Sun size={13} />
                        Sáng
                      </ToggleGroupItem>
                      <ToggleGroupItem value="dark" size="sm" className="h-7 text-xs px-2.5 gap-1.5 data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs">
                        <Moon size={13} />
                        Tối
                      </ToggleGroupItem>
                      <ToggleGroupItem value="system" size="sm" className="h-7 text-xs px-2.5 gap-1.5 data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs">
                        <Monitor size={13} />
                        Hệ thống
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <div className="flex flex-col gap-1 pr-4">
                      <CardTitle className="text-sm font-medium">Tự động chuyển quy trình khi nạp sách</CardTitle>
                      <CardDescription className="text-xs">
                        Nhận diện ngôn ngữ khi nạp sách: EPUB ngoại ngữ tự mở Dịch thuật AI, PDF scan tự mở OCR,
                        PDF/TXT/MD mở trình chuyển đổi. Tắt để chỉ hiện gợi ý trong thẻ quy trình.
                      </CardDescription>
                    </div>
                    <ToggleGroup
                      type="single"
                      value={autoRouteOnIngest ? "on" : "off"}
                      onValueChange={(val) => {
                        if (val) setAutoRouteOnIngest(val === "on");
                      }}
                      className="border border-border rounded-md p-0.5 bg-muted/40"
                    >
                      <ToggleGroupItem value="on" size="sm" className="h-7 text-xs px-3 data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs">
                        Bật
                      </ToggleGroupItem>
                      <ToggleGroupItem value="off" size="sm" className="h-7 text-xs px-3 data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs">
                        Tắt
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <div className="flex flex-col gap-1 pr-4">
                      <CardTitle className="text-sm font-medium">Quy trình của sách đang mở</CardTitle>
                      <CardDescription className="text-xs">
                        {bookProfile
                          ? `Đã nhận diện ${bookProfile.languageFlag} ${bookProfile.languageName} — quy trình "${workflowLabel(
                              bookProfile
                            )}". Xoá tiến trình để bắt đầu lại từ bước đầu.`
                          : "Chưa có sách nào được mở."}
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!bookProfile}
                      onClick={() => {
                        resetWorkflowState();
                        toast.success("Đã xoá tiến trình quy trình của sách hiện tại");
                      }}
                      className="text-xs h-8 gap-1.5"
                    >
                      <Trash2 size={13} />
                      Xoá tiến trình
                    </Button>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <div className="flex flex-col gap-1 pr-4">
                      <div className="flex items-center gap-2">
                        <Info size={14} className="text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">Về NiceEbook Studio</CardTitle>
                      </div>
                      <CardDescription className="text-xs">
                        Phần mềm thiết kế và làm đẹp sách điện tử (EPUB) tự động bằng AI, phong cách thẩm mỹ chuẩn mực lấy cảm hứng từ LinguaGacha, tích hợp lõi phân loại và chuẩn hóa siêu tốc chạy trực tiếp trong Rust.
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="font-mono text-xs">v0.1.0-alpha</Badge>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <div className="flex flex-col gap-1 pr-4">
                      <div className="flex items-center gap-2">
                        <Cpu size={14} className="text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">Kiến trúc kỹ thuật & Bộ nhớ</CardTitle>
                      </div>
                      <CardDescription className="text-xs">
                        Tauri v2 + Rust Core + React 19 + Tailwind CSS 4. Tối ưu bộ nhớ Native WebView &lt; 40MB RAM.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400">RAM ~38MB</Badge>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <div className="flex flex-col gap-1 pr-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={14} className="text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">Quyền riêng tư & Bảo mật Zero-Key</CardTitle>
                      </div>
                      <CardDescription className="text-xs">
                        Sách được phân tích và đóng gói 100% cục bộ trên máy tính. Dữ liệu không bao giờ bị tải lên bất kỳ máy chủ đám mây nào khi sử dụng chế độ xử lý cục bộ (Offline).
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400">Zero-Cloud</Badge>
                  </CardHeader>
                </Card>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar />

      {/* AI Book Project Chat Agent Drawer */}
      <BookAgentDrawer />

      {/* Export EPUB Modal */}
      <ExportModal 
        isOpen={isExportOpen} 
        onClose={() => setIsExportOpen(false)} 
      />
      </div>
    </TooltipProvider>
  );
}
