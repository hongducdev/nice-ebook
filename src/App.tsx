import { useEffect } from "react";
import { Toaster } from "sonner";
import { useAppStore } from "./stores/useAppStore";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { StatusBar } from "./components/layout/StatusBar";
import { BookView } from "./components/books/BookView";
import { PresetGallery } from "./components/styles/PresetGallery";
import { TypographyControls } from "./components/styles/TypographyControls";
import { EpubReaderViewer } from "./components/preview/EpubReaderViewer";
import { GatewayView } from "./components/ai/GatewayView";
import { Settings as SettingsIcon, Info, ShieldCheck, Zap } from "lucide-react";

export default function App() {
  const { activeTab, scanGateways } = useAppStore();

  // Auto scan local gateways once on startup
  useEffect(() => {
    scanGateways();
  }, [scanGateways]);

  return (
    <div className="flex h-screen w-screen bg-[#09090b] text-[#f4f4f5] select-none overflow-hidden font-sans">
      <Toaster position="top-right" theme="dark" richColors />

      {/* Left Sidebar (LinguaGacha Navigation) */}
      <Sidebar />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0c0c0e]">
        <Header />

        {/* Dynamic Tab Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {activeTab === "books" && <BookView />}
          {activeTab === "reader" && <EpubReaderViewer />}
          {activeTab === "presets" && <PresetGallery />}
          {activeTab === "editor" && <TypographyControls />}
          {activeTab === "ai" && <GatewayView />}
          {activeTab === "settings" && (
            <div className="flex-1 flex flex-col p-6 overflow-y-auto max-w-4xl mx-auto w-full select-none">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#18181f] border border-[#27272a] flex items-center justify-center text-zinc-300">
                  <SettingsIcon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-100">Cài Đặt Hệ Thống</h2>
                  <p className="text-xs text-[#71717a]">Thông tin bản quyền và kiến trúc ứng dụng.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-[#141418] border border-[#27272a]">
                  <div className="flex items-center gap-2 mb-2 text-indigo-400 font-semibold text-sm">
                    <Info className="w-4 h-4" />
                    <span>Về NiceEbook Studio</span>
                  </div>
                  <p className="text-xs text-[#a1a1aa] leading-relaxed mb-3">
                    Phần mềm thiết kế và làm đẹp sách điện tử (EPUB) tự động bằng AI, phong cách lấy cảm hứng từ LinguaGacha, tích hợp Jev Core System-1 Decision Plane siêu tốc chạy trực tiếp trong Rust.
                  </p>
                  <div className="text-[11px] font-mono text-[#52525b] space-y-1">
                    <div>Phiên bản: 0.1.0-alpha</div>
                    <div>Kiến trúc: Tauri v2 + Rust + React 19</div>
                    <div>Tối ưu: Native WebView &lt; 40MB RAM</div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-[#141418] border border-[#27272a]">
                  <div className="flex items-center gap-2 mb-2 text-emerald-400 font-semibold text-sm">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Quyền Riêng Tư & An Toàn</span>
                  </div>
                  <p className="text-xs text-[#a1a1aa] leading-relaxed mb-3">
                    Sách của bạn được xử lý 100% cục bộ trên máy tính. Thuật toán Jev Core không bao giờ tải nội dung sách của bạn lên bất kỳ máy chủ đám mây nào khi ở chế độ Zero-Key.
                  </p>
                  <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Bảo mật tuyệt đối</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        <StatusBar />
      </div>
    </div>
  );
}
