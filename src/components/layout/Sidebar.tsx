import { 
  Layers, 
  BookOpenCheck, 
  Palette, 
  SlidersHorizontal, 
  Boxes, 
  Settings, 
  Sun, 
  Moon, 
  Monitor,
  Wand2,
  RefreshCw
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";

interface NavItem {
  id: "books" | "reader" | "presets" | "editor" | "ai" | "settings" | "ai-editor" | "converter";
  label: string;
  icon: any;
  badge?: string | null;
  badgeTone?: "success" | "neutral";
}

export function Sidebar() {
  const { 
    activeTab, 
    setActiveTab, 
    currentBook, 
    activeGateway, 
    isSidebarCollapsed,
    theme,
    setTheme,
    modifiedChapters,
  } = useAppStore();

  const modifiedCount = Object.keys(modifiedChapters).length;

  const navigationGroups: { id: string; title: string; items: NavItem[] }[] = [
    {
      id: "library",
      title: "Thư viện & Sách",
      items: [
        { 
          id: "books" as const, 
          label: "Quản lý sách", 
          icon: Layers, 
          badge: currentBook ? `${currentBook.chapter_count}` : null 
        },
        { 
          id: "converter" as const, 
          label: "Chuyển đổi Ebook", 
          icon: RefreshCw,
          badge: "PDF / OCR",
          badgeTone: "success"
        },
        { 
          id: "reader" as const, 
          label: "Đọc thử & Soát lỗi", 
          icon: BookOpenCheck 
        },
      ],
    },
    {
      id: "styling",
      title: "Định kiểu & Bố cục",
      items: [
        { 
          id: "presets" as const, 
          label: "Thư viện phong cách", 
          icon: Palette 
        },
        { 
          id: "editor" as const, 
          label: "Kiểu chữ (Typography)", 
          icon: SlidersHorizontal 
        },
      ],
    },
    {
      id: "intelligence",
      title: "Trí tuệ nhân tạo",
      items: [
        { 
          id: "ai" as const, 
          label: "AI Gateway & Models", 
          icon: Boxes, 
          badge: activeGateway ? "Online" : null,
          badgeTone: activeGateway ? "success" : "neutral"
        },
        { 
          id: "ai-editor" as const, 
          label: "Biên tập & Soát lỗi AI", 
          icon: Wand2, 
          badge: modifiedCount > 0 ? `${modifiedCount} ch.` : null,
          badgeTone: "success"
        },
      ],
    },
    {
      id: "system",
      title: "Hệ thống",
      items: [
        { 
          id: "settings" as const, 
          label: "Cài đặt ứng dụng", 
          icon: Settings 
        },
      ],
    },
  ];

  return (
    <aside 
      className="shell-sidebar"
      data-collapsed={isSidebarCollapsed ? "true" : undefined}
    >
      <div className="shell-sidebar__scroll">
        {navigationGroups.map((group, groupIdx) => (
          <div key={group.id} className="w-full">
            {groupIdx > 0 && <div className="sidebar-group-separator" />}
            
            <div className="sidebar-group-title">
              {group.title}
            </div>

            <div className="flex flex-col">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    title={isSidebarCollapsed ? item.label : undefined}
                    className={`sidebar-item ${isActive ? "sidebar-item--active" : ""}`}
                    aria-label={item.label}
                  >
                    <Icon className="sidebar-item__icon" />
                    <span className="sidebar-item__label">{item.label}</span>

                    {!isSidebarCollapsed && item.badge && (
                      <span className={`ml-auto app-badge text-[10px] h-[18px] px-1.5 ${
                        item.badgeTone === "success" 
                          ? "app-badge--success" 
                          : "app-badge--neutral"
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar Footer */}
      <div className="shell-sidebar__bottom">
        {/* Theme appearance toggle */}
        {isSidebarCollapsed ? (
          <div className="flex justify-center py-1">
            <button
              type="button"
              onClick={() => {
                const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
                setTheme(next);
              }}
              className="w-8 h-8 rounded-[var(--ui-radius-button)] flex items-center justify-center text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--primary)] transition-colors"
              title={`Giao diện: ${
                theme === "dark" ? "Tối" : theme === "light" ? "Sáng" : "Hệ thống"
              } (Bấm để chuyển đổi)`}
              aria-label="Đổi giao diện"
            >
              {theme === "light" && <Sun size={16} className="text-[var(--primary)]" />}
              {theme === "dark" && <Moon size={16} className="text-[var(--primary)]" />}
              {theme === "system" && <Monitor size={16} className="text-[var(--primary)]" />}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-[11px] font-medium text-[var(--muted-foreground)]">Giao diện</span>
            <div className="segmented-toggle">
              <button
                type="button"
                onClick={() => setTheme("light")}
                title="Giao diện Sáng (Light)"
                data-active={theme === "light" ? "true" : undefined}
                className="segmented-toggle__item p-1"
              >
                <Sun size={13} />
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                title="Giao diện Tối (Dark)"
                data-active={theme === "dark" ? "true" : undefined}
                className="segmented-toggle__item p-1"
              >
                <Moon size={13} />
              </button>
              <button
                type="button"
                onClick={() => setTheme("system")}
                title="Theo Hệ Thống (System)"
                data-active={theme === "system" ? "true" : undefined}
                className="segmented-toggle__item p-1"
              >
                <Monitor size={13} />
              </button>
            </div>
          </div>
        )}

        {/* LinguaGacha Profile / Brand Card */}
        <div className="sidebar-profile">
          <div className="w-6 h-6 rounded flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_15%,var(--card))] border border-[var(--primary)]/30 overflow-hidden flex-shrink-0">
            <img src="/app-icon.png" alt="NiceEbook Studio" className="w-full h-full object-contain" />
          </div>
          {!isSidebarCollapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold text-[var(--foreground)] truncate leading-tight">
                NiceEbook Studio
              </span>
              <span className="text-[10px] text-[var(--muted-foreground)] truncate font-mono">
                {activeGateway ? `● ${activeGateway.name}` : "○ Jev Offline Ready"}
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
