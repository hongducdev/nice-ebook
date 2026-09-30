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
  RefreshCw,
  Sparkles,
  Languages,
  Bot
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { isTranslationWorkflow } from "../../utils/bookTypeDetector";
import type { ActiveTab } from "../../types/navigation";
import { Badge } from "../ui/badge";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

export interface NavItem {
  id: ActiveTab | "agent";
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string | null;
  badgeTone?: "success" | "neutral" | "warning";
}

export interface NavigationGroup {
  id: string;
  title: string;
  items: NavItem[];
}

export function buildNavigationGroups(context: {
  currentBook?: { chapter_count?: number } | null;
  activeGateway?: { name?: string } | null;
  modifiedCount?: number;
  pendingConverterFile?: unknown;
  translationBadge?: string | null;
  bilingualActive?: boolean;
}): NavigationGroup[] {
  const {
    currentBook,
    activeGateway,
    modifiedCount = 0,
    pendingConverterFile,
    translationBadge,
    bilingualActive,
  } = context;

  return [
    {
      id: "pipeline",
      title: "Quy trình Ebook",
      items: [
        { 
          id: "converter" as const, 
          label: "1. Nạp & Chuyển đổi", 
          icon: RefreshCw,
          badge: pendingConverterFile ? "Đang chờ" : "OCR / Convert",
          badgeTone: pendingConverterFile ? "warning" : "neutral"
        },
        { 
          id: "translator" as const, 
          label: "2. Dịch thuật AI", 
          icon: Languages, 
          badge: translationBadge,
          badgeTone: translationBadge === "Đã dịch" ? "neutral" : "success"
        },
        { 
          id: "ai-editor" as const, 
          label: "3. Biên tập & Soát lỗi", 
          icon: Wand2, 
          badge: modifiedCount > 0 ? `${modifiedCount} ch.` : null,
          badgeTone: "success"
        },
        { 
          id: "presets" as const, 
          label: "4. Thư viện phong cách", 
          icon: Palette 
        },
        { 
          id: "editor" as const, 
          label: "5. Kiểu chữ & Bố cục", 
          icon: SlidersHorizontal 
        },
        { 
          id: "reader" as const, 
          label: "6. Đọc thử & Kiểm tra", 
          icon: BookOpenCheck,
          badge: bilingualActive ? "Song ngữ" : null,
          badgeTone: "success"
        },
        { 
          id: "kindle" as const, 
          label: "7. Gói Kindle & Xuất bản", 
          icon: Sparkles,
          badge: "X-Ray",
          badgeTone: "neutral"
        },
      ],
    },
    {
      id: "workspace",
      title: "Dự án & Hệ thống",
      items: [
        { 
          id: "books" as const, 
          label: "Tổng quan sách", 
          icon: Layers, 
          badge: currentBook ? `${currentBook.chapter_count} ch.` : null 
        },
        { 
          id: "ai" as const, 
          label: "Cổng AI & Mô hình", 
          icon: Boxes, 
          badge: activeGateway ? "Online" : null,
          badgeTone: activeGateway ? "success" : "neutral"
        },
        { 
          id: "agent" as const, 
          label: "Trợ lý Chat AI", 
          icon: Bot, 
          badge: "Agent",
          badgeTone: "success"
        },
        { 
          id: "settings" as const, 
          label: "Cài đặt ứng dụng", 
          icon: Settings 
        },
      ],
    },
  ];
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
    setAgentDrawerOpen,
    bookProfile,
    getTranslationCoverage,
    pendingConverterFile,
    translationConfig,
  } = useAppStore();

  const modifiedCount = Object.keys(modifiedChapters).length;

  // One semantic for "translated" across every reader (sidebar badge, stepper,
  // translator view): delegate to the store instead of re-deriving it here.
  const { translated: translatedCount, total: totalChapters } = getTranslationCoverage();
  const untranslatedCount = Math.max(0, totalChapters - translatedCount);
  const needsTranslation = isTranslationWorkflow(bookProfile?.workflow);
  const translationBadge = !needsTranslation
    ? null
    : untranslatedCount > 0
    ? `${untranslatedCount} ch.`
    : translatedCount > 0
    ? "Đã dịch"
    : null;
  const bilingualActive = translationConfig.mode === "bilingual" && translatedCount > 0;

  const navigationGroups = buildNavigationGroups({
    currentBook,
    activeGateway,
    modifiedCount,
    pendingConverterFile,
    translationBadge,
    bilingualActive,
  });

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
                    onClick={() => {
                      if (item.id === "agent") {
                        setAgentDrawerOpen(false);
                        setActiveTab("agent");
                      } else {
                        setActiveTab(item.id);
                      }
                    }}
                    title={isSidebarCollapsed ? item.label : undefined}
                    className={`sidebar-item ${isActive ? "sidebar-item--active" : ""}`}
                    aria-label={item.label}
                  >
                    <Icon className="sidebar-item__icon" />
                    <span className="sidebar-item__label">{item.label}</span>

                    {!isSidebarCollapsed && item.badge && (
                      <Badge
                        variant={item.badgeTone === "success" ? "secondary" : "outline"}
                        className={`ml-auto text-[10px] h-4.5 px-1.5 ${
                          item.badgeTone === "success"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : item.badgeTone === "warning"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                            : "text-muted-foreground"
                        }`}
                      >
                        {item.badge}
                      </Badge>
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
              className="size-8 rounded-md flex items-center justify-center text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary transition-colors"
              title={`Giao diện: ${
                theme === "dark" ? "Tối" : theme === "light" ? "Sáng" : "Hệ thống"
              } (Bấm để chuyển đổi)`}
              aria-label="Đổi giao diện"
            >
              {theme === "light" && <Sun size={16} className="text-primary" />}
              {theme === "dark" && <Moon size={16} className="text-primary" />}
              {theme === "system" && <Monitor size={16} className="text-primary" />}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-[11px] font-medium text-muted-foreground">Giao diện</span>
            <ToggleGroup
              type="single"
              value={theme}
              onValueChange={(val) => {
                if (val) setTheme(val as "light" | "dark" | "system");
              }}
              className="border border-border rounded-md p-0.5 bg-muted/40"
            >
              <ToggleGroupItem value="light" size="sm" className="size-6 p-0 data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs" title="Giao diện Sáng (Light)">
                <Sun size={13} />
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" size="sm" className="size-6 p-0 data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs" title="Giao diện Tối (Dark)">
                <Moon size={13} />
              </ToggleGroupItem>
              <ToggleGroupItem value="system" size="sm" className="size-6 p-0 data-[state=on]:bg-background data-[state=on]:text-primary data-[state=on]:shadow-xs" title="Theo Hệ Thống (System)">
                <Monitor size={13} />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        {/* LinguaGacha Profile / Brand Card */}
        <div className="sidebar-profile">
          <div className="size-6 rounded flex items-center justify-center bg-card border border-primary/30 overflow-hidden shrink-0">
            <img src="/app-icon.png" alt="NiceEbook Studio" className="w-full h-full object-contain" />
          </div>
          {!isSidebarCollapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold text-foreground truncate leading-tight">
                NiceEbook Studio
              </span>
              <span className="text-[10px] text-muted-foreground truncate font-mono">
                {activeGateway ? `● ${activeGateway.name}` : "○ Lõi Offline sẵn sàng"}
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
