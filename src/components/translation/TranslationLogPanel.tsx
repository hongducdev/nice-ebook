import { Search, Terminal } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Empty, EmptyMedia, EmptyDescription } from "../ui/empty";

/**
 * Shape of one terminal log line. Structurally identical to the store's
 * `TerminalLogEntry`, but declared locally so this panel stays a pure,
 * store-free component that can be rendered in a test.
 */
export interface TranslationLogEntry {
  id: string;
  timestamp: number;
  type: "info" | "warning" | "success" | "detail";
  text: string;
}

export type LogFilterKey = "all" | "info" | "success" | "warning" | "detail";

/** Filter chips for the detailed translation log window. */
export const LOG_FILTERS: Array<{ key: LogFilterKey; label: string; title: string }> = [
  { key: "all", label: "Tất cả", title: "Hiện mọi dòng nhật ký" },
  { key: "success", label: "Thành công", title: "Chỉ các bước hoàn tất" },
  { key: "info", label: "Thông tin", title: "Chỉ thông tin tiến trình" },
  { key: "warning", label: "Cảnh báo", title: "Chỉ lỗi / cảnh báo" },
  { key: "detail", label: "Chi tiết", title: "Log chi tiết từng mẻ dịch, thực thể & tên riêng" },
];

const BADGES: Record<TranslationLogEntry["type"], { badge: string; colorClass: string }> = {
  success: { badge: "OK", colorClass: "text-emerald-400" },
  warning: { badge: "WARN", colorClass: "text-amber-400" },
  info: { badge: "INFO", colorClass: "text-sky-300" },
  detail: { badge: "····", colorClass: "text-[#8a8a99]" },
};

/** How many log lines exist per type, for the filter chips. */
export function countLogs(logs: TranslationLogEntry[]): Record<LogFilterKey, number> {
  const counts: Record<LogFilterKey, number> = {
    all: logs.length,
    info: 0,
    success: 0,
    warning: 0,
    detail: 0,
  };
  for (const log of logs) counts[log.type] += 1;
  return counts;
}

/** Applies the active filter chip + search box to the raw log stream. */
export function filterLogs(
  logs: TranslationLogEntry[],
  filter: LogFilterKey,
  search: string
): TranslationLogEntry[] {
  const needle = search.trim().toLowerCase();
  return logs.filter((log) => {
    if (filter !== "all" && log.type !== filter) return false;
    if (needle && !log.text.toLowerCase().includes(needle)) return false;
    return true;
  });
}

export interface TranslationLogPanelProps {
  logs: TranslationLogEntry[];
  filter: LogFilterKey;
  search: string;
  autoScroll: boolean;
  onFilterChange: (filter: LogFilterKey) => void;
  onSearchChange: (search: string) => void;
  onToggleAutoScroll: () => void;
  endRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Detailed log viewer for a translation run: per-type filter chips with counts,
 * free-text search, and an auto-scroll toggle. Pure — all state lives with the
 * caller, so it can be rendered to static markup in tests.
 */
export function TranslationLogPanel({
  logs,
  filter,
  search,
  autoScroll,
  onFilterChange,
  onSearchChange,
  onToggleAutoScroll,
  endRef,
}: TranslationLogPanelProps) {
  const counts = countLogs(logs);
  const visible = filterLogs(logs, filter, search);

  return (
    <div className="w-full h-full flex flex-col bg-background">
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-border bg-muted/30 overflow-x-auto">
        {LOG_FILTERS.map((f) => (
          <Button
            key={f.key}
            type="button"
            variant={filter === f.key ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onFilterChange(f.key)}
            aria-pressed={filter === f.key}
            title={f.title}
            className={`shrink-0 h-5 px-2 rounded-full border text-[10px] font-medium ${
              filter === f.key
                ? "border-primary/50 text-primary bg-primary/10 hover:bg-primary/15"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label} <span className="opacity-70 font-mono">{counts[f.key]}</span>
          </Button>
        ))}
        <div className="flex items-center gap-1 ml-auto pl-2 shrink-0">
          <div className="relative">
            <Search size={11} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Tìm trong log..."
              aria-label="Tìm trong nhật ký dịch"
              className="w-28 focus:w-44 transition-all rounded pl-6 pr-2 h-5 text-[10px]"
            />
          </div>
          <Button
            type="button"
            variant={autoScroll ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleAutoScroll}
            aria-pressed={autoScroll}
            title="Tự động cuộn xuống dòng mới nhất"
            className={`h-5 px-2 rounded border text-[10px] font-medium ${
              autoScroll
                ? "border-primary/50 text-primary bg-primary/10 hover:bg-primary/15"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {autoScroll ? "⌄ Tự cuộn" : "‖ Dừng cuộn"}
          </Button>
        </div>
      </div>

      <div
        role="log"
        aria-label="Nhật ký dịch chi tiết"
        className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed flex flex-col select-text"
      >
        {logs.length === 0 ? (
          <Empty className="flex-1 gap-2 select-none">
            <EmptyMedia>
              <Terminal size={24} className="text-muted-foreground opacity-40" />
            </EmptyMedia>
            <EmptyDescription className="text-[11px] text-muted-foreground">
              Nhật ký hoạt động dịch AI sẽ xuất hiện tại đây...
            </EmptyDescription>
          </Empty>
        ) : visible.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-[11px] select-none">
            Không có dòng log nào khớp bộ lọc hiện tại.
          </div>
        ) : (
          <>
            {visible.map((log) => {
              const time = new Date(log.timestamp).toLocaleTimeString();
              const { badge, colorClass } = BADGES[log.type];
              return (
                <div key={log.id} className="flex items-start gap-2 py-0.5 border-b border-[#1a1a24]/50">
                  <span className="text-[#444] select-none shrink-0">[{time}]</span>
                  <span className={`select-none shrink-0 w-8 ${colorClass}`}>{badge}</span>
                  <span className={`${colorClass} break-words whitespace-pre-wrap flex-1`}>
                    {log.text}
                  </span>
                </div>
              );
            })}
            <div ref={endRef} />
          </>
        )}
      </div>
    </div>
  );
}
