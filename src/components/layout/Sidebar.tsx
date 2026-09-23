import { 
  BookOpen, 
  Palette, 
  Cpu, 
  Settings, 
  Sliders, 
  Layers
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";

export function Sidebar() {
  const { activeTab, setActiveTab, currentBook, activeGateway } = useAppStore();

  const navItems = [
    { id: "books" as const, label: "Sách", icon: Layers, badge: currentBook ? "1" : null },
    { id: "presets" as const, label: "Phong cách", icon: Palette },
    { id: "editor" as const, label: "Tùy chỉnh", icon: Sliders },
    { id: "ai" as const, label: "AI Gateway", icon: Cpu, badge: activeGateway ? "Online" : null },
    { id: "settings" as const, label: "Cài đặt", icon: Settings },
  ];

  return (
    <aside className="w-18 flex flex-col items-center py-5 border-r border-[#27272a] bg-[#101014] z-20 select-none">
      {/* App Logo */}
      <div 
        onClick={() => setActiveTab("books")}
        className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 mb-8 cursor-pointer hover:scale-105 transition-all"
        title="NiceEbook Studio"
      >
        <BookOpen className="w-5 h-5 text-white" />
      </div>

      {/* Navigation list */}
      <nav className="flex flex-col gap-2.5 w-full px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={item.label}
              className={`relative group w-full py-2.5 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                isActive
                  ? "bg-indigo-600/15 text-indigo-400 font-medium"
                  : "text-[#71717a] hover:text-[#f4f4f5] hover:bg-[#18181b]"
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-500 rounded-r-full shadow-sm shadow-indigo-500/50" />
              )}
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${isActive ? "text-indigo-400" : ""}`} />
                {item.badge && (
                  <span className={`absolute -top-1 -right-2 text-[8px] font-bold px-1 rounded-full leading-tight ${
                    item.id === "ai" 
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                      : "bg-indigo-500 text-white"
                  }`}>
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom status indicator */}
      <div className="mt-auto flex flex-col items-center gap-2 pt-4">
        <div 
          className={`w-2.5 h-2.5 rounded-full ${
            activeGateway 
              ? "bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse" 
              : "bg-indigo-500/70"
          }`} 
          title={activeGateway ? `Gateway Online: ${activeGateway.name}` : "Jev Core Offline Ready"} 
        />
        <span className="text-[9px] text-[#52525b] font-mono">v0.1.0</span>
      </div>
    </aside>
  );
}
