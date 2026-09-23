import { useState } from "react";
import { 
  BookOpen, 
  Palette, 
  Cpu, 
  Settings, 
  FolderOpen, 
  Sparkles, 
  Activity,
  Layers,
  ChevronRight,
  RefreshCw
} from "lucide-react";
import { Toaster, toast } from "sonner";

export default function App() {
  const [activeTab, setActiveTab] = useState<"books" | "presets" | "ai" | "settings">("books");
  const [isScanning] = useState(false);

  return (
    <div className="flex h-screen w-screen bg-[#09090b] text-[#f4f4f5] select-none overflow-hidden">
      <Toaster position="top-right" theme="dark" richColors />

      {/* Left Sidebar (LinguaGacha Navigation Style) */}
      <aside className="w-18 flex flex-col items-center py-5 border-r border-[#27272a] bg-[#101014] z-20">
        {/* App Logo */}
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-8 cursor-pointer hover:scale-105 transition-transform">
          <BookOpen className="w-5 h-5 text-white" />
        </div>

        {/* Nav Items */}
        <nav className="flex flex-col gap-3 w-full px-2">
          {[
            { id: "books", label: "Sách", icon: Layers },
            { id: "presets", label: "Phong cách", icon: Palette },
            { id: "ai", label: "AI Gateway", icon: Cpu },
            { id: "settings", label: "Cài đặt", icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as typeof activeTab)}
                title={item.label}
                className={`relative group w-full py-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                  isActive
                    ? "bg-indigo-600/15 text-indigo-400 font-medium"
                    : "text-[#71717a] hover:text-[#f4f4f5] hover:bg-[#18181b]"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-500 rounded-r-full shadow-sm shadow-indigo-500/50" />
                )}
                <Icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${isActive ? "text-indigo-400" : ""}`} />
                <span className="text-[10px] tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer info in sidebar */}
        <div className="mt-auto flex flex-col items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="System Ready" />
          <span className="text-[9px] text-[#52525b] font-mono">v0.1.0</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0c0c0e]">
        {/* Header Bar */}
        <header className="h-14 border-b border-[#27272a] px-6 flex items-center justify-between bg-[#101014]/60 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-wide bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
              NiceEbook Studio
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
              Phase 1 Preview
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => toast.info("Đang kiểm tra các cổng local AI...")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18181b] hover:bg-[#222226] border border-[#27272a] text-[#d4d4d8] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin text-indigo-400" : ""}`} />
              <span>Quét AI Gateway</span>
            </button>
            <button 
              onClick={() => toast.success("Sẵn sàng chọn file EPUB")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-all hover:shadow-indigo-600/50"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Mở sách EPUB</span>
            </button>
          </div>
        </header>

        {/* Workspace Body */}
        <main className="flex-1 overflow-auto p-6 flex flex-col items-center justify-center">
          <div className="max-w-xl w-full flex flex-col items-center text-center">
            {/* Drag & Drop Hero Box */}
            <div 
              onClick={() => toast.info("Chức năng nạp file EPUB sẽ kích hoạt ở Phase 2")}
              className="w-full p-10 rounded-2xl border-2 border-dashed border-[#27272a] hover:border-indigo-500/50 bg-[#121216]/50 hover:bg-[#16161b] transition-all cursor-pointer group flex flex-col items-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-5 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all shadow-inner">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-zinc-100 mb-1">
                Kéo thả file sách (.epub, .txt) vào đây
              </h3>
              <p className="text-xs text-[#71717a] max-w-sm mb-4">
                Hệ thống Jev Core sẽ tự động phân tích cấu trúc, văn phong và đề xuất phong cách thiết kế tối ưu nhất.
              </p>
              <div className="flex items-center gap-2 text-xs text-indigo-400 font-medium group-hover:underline">
                <span>Hoặc bấm để duyệt file trên máy tính</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Quick Feature Grid */}
            <div className="grid grid-cols-3 gap-3 w-full mt-6 text-left">
              <div className="p-3.5 rounded-xl bg-[#141418] border border-[#27272a]/70">
                <span className="text-[11px] font-semibold text-indigo-400 block mb-1">Jev Core (Offline)</span>
                <p className="text-[11px] text-[#71717a] leading-relaxed">Nhận diện thể loại và cấu trúc ngay cả khi không có API key hay internet.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#141418] border border-[#27272a]/70">
                <span className="text-[11px] font-semibold text-emerald-400 block mb-1">9Router Auto-Discovery</span>
                <p className="text-[11px] text-[#71717a] leading-relaxed">Tự động kết nối 9router, Cockpit, Ollama trên localhost.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#141418] border border-[#27272a]/70">
                <span className="text-[11px] font-semibold text-purple-400 block mb-1">Live CSS Hot-Reload</span>
                <p className="text-[11px] text-[#71717a] leading-relaxed">Xem trước định dạng sách tức thì với độ trễ dưới 50ms.</p>
              </div>
            </div>
          </div>
        </main>

        {/* Status Bar (LinguaGacha Footer Style) */}
        <footer className="h-8 border-t border-[#27272a] px-4 flex items-center justify-between bg-[#101014] text-[11px] text-[#71717a]">
          <div className="flex items-center gap-4">
            {/* Gateway Status Badge */}
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <span className="text-[#a1a1aa] font-medium">9Router / Cockpit:</span>
              <span className="text-emerald-400 font-mono">Tự động quét (20128/8000)</span>
            </div>

            <span className="text-[#3f3f46]">|</span>

            {/* Jev System-1 Badge */}
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="text-[#a1a1aa] font-medium">Jev Core:</span>
              <span className="text-indigo-400 font-mono">System-1 Heuristic Sẵn Sàng</span>
            </div>
          </div>

          <div className="flex items-center gap-4 font-mono text-[10px] text-[#52525b]">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-[#71717a]" />
              <span>RAM ~38MB</span>
            </span>
            <span>Tauri v2 + Rust</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
