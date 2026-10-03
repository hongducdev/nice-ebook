import React from "react";
import { Search, Terminal, Copy, Check, Trash2 } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "../ui/empty";

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
  category?: "translation" | "enhancement" | "system";
}

export type LogFilterKey = "all" | "info" | "success" | "warning" | "detail";

/** Filter chips for the detailed translation log window. */
export const LOG_FILTERS: Array<{ key: LogFilterKey; label: string; title: string }> = [
  { key: "all", label: "Tất cả", title: "Hiện mọi dòng nhật ký" },
  { key: "success", label: "Thành công", title: "Chỉ các bước hoàn tất" },
  { key: "info", label: "Thông tin", title: "Chỉ thông tin tiến trình" },
  { key: "warning", label: "Cảnh báo", title: "Chỉ lỗi / cảnh báo" },
  { key: "detail", label: "Chi tiết", title: "Log chi tiết từng mẻ dịch, câu dịch & thực thể" },
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
  onCopyLogs?: () => void;
  onClearLogs?: () => void;
  isCopied?: boolean;
  emptyPlaceholder?: {
    title?: string;
    description?: string;
    icon?: React.ElementType;
  };
  ariaLabel?: string;
  endRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Detailed log viewer for a translation or AI enhancer run: per-type filter chips
 * with counts, free-text search, auto-scroll toggle, copy/clear actions, and structured
 * translated block inspection. Pure — all state lives with the caller, so it can be
 * rendered to static markup in tests.
 */
export function TranslationLogPanel({
  logs,
  filter,
  search,
  autoScroll,
  onFilterChange,
  onSearchChange,
  onToggleAutoScroll,
  onCopyLogs,
  onClearLogs,
  isCopied = false,
  emptyPlaceholder,
  ariaLabel = "Nhật ký dịch chi tiết",
  endRef,
}: TranslationLogPanelProps) {
  const counts = countLogs(logs);
  const visible = filterLogs(logs, filter, search);
  const EmptyIcon = emptyPlaceholder?.icon || Terminal;

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
            className={`shrink-0 h-6 px-2.5 rounded-full border text-xs font-medium cursor-pointer ${
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
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Tìm trong log..."
              aria-label="Tìm kiếm trong nhật ký"
              className="w-28 focus:w-44 transition-all rounded pl-6 pr-2 h-6 text-xs"
            />
          </div>
          <Button
            type="button"
            variant={autoScroll ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleAutoScroll}
            aria-pressed={autoScroll}
            title="Tự động cuộn xuống dòng mới nhất"
            className={`h-6 px-2.5 rounded border text-xs font-medium cursor-pointer ${
              autoScroll
                ? "border-primary/50 text-primary bg-primary/10 hover:bg-primary/15"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {autoScroll ? "⌄ Tự cuộn" : "‖ Dừng cuộn"}
          </Button>

          {onCopyLogs && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCopyLogs}
              title="Sao chép toàn bộ nhật ký"
              className="h-5 px-1.5 rounded border border-border text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {isCopied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
            </Button>
          )}

          {onClearLogs && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearLogs}
              title="Xóa toàn bộ dòng nhật ký"
              className="h-5 px-1.5 rounded border border-border text-muted-foreground hover:text-destructive cursor-pointer"
            >
              <Trash2 size={11} />
            </Button>
          )}
        </div>
      </div>

      <div
        role="log"
        aria-label={ariaLabel}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed flex flex-col select-text"
      >
        {logs.length === 0 ? (
          <Empty className="flex-1 gap-2 select-none">
            <EmptyMedia>
              <EmptyIcon size={24} className="text-muted-foreground opacity-40" />
            </EmptyMedia>
            {emptyPlaceholder?.title && (
              <EmptyTitle className="text-xs font-normal text-muted-foreground">
                {emptyPlaceholder.title}
              </EmptyTitle>
            )}
            <EmptyDescription className="text-xs text-muted-foreground">
              {emptyPlaceholder?.description || "Nhật ký hoạt động dịch AI sẽ xuất hiện tại đây..."}
            </EmptyDescription>
          </Empty>
        ) : visible.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs select-none">
            Không có dòng log nào khớp bộ lọc hiện tại.
          </div>
        ) : (
          <>
            {visible.map((log) => {
              const time = new Date(log.timestamp).toLocaleTimeString();
              const { badge, colorClass } = BADGES[log.type];

              // Check if line represents a translated block text (e.g. "📝 [p_0] ..." or "🔄 [Bù p_1] ...")
              const blockMatch = /^\s*(?:📝|🔄)\s*\[([^\]]+)\]\s*([\s\S]*)/.exec(log.text);

              if (blockMatch) {
                const blockTag = blockMatch[1];
                const blockContent = blockMatch[2];
                const isRecovery = log.text.includes("🔄");

                return (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2 py-1 px-2 my-0.5 rounded-md border transition-colors ${
                      isRecovery
                        ? "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
                        : "border-primary/20 bg-primary/5 hover:bg-primary/10"
                    }`}
                  >
                    <span className="text-[#555] dark:text-[#777] select-none shrink-0 font-mono text-xs mt-0.5">
                      [{time}]
                    </span>
                    <span
                      className={`select-none shrink-0 font-mono text-xs font-semibold px-2 py-0.5 rounded border mt-0.5 ${
                        isRecovery
                          ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
                          : "text-primary bg-primary/10 border-primary/20"
                      }`}
                    >
                      {blockTag}
                    </span>
                    <span className="text-foreground/90 break-words whitespace-pre-wrap flex-1 text-xs leading-relaxed font-sans select-text">
                      {blockContent}
                    </span>
                  </div>
                );
              }

              // Color enhancement for specific log markers
              let enhancedClass = colorClass;
              if (log.type === "info") {
                if (log.text.includes("⌛")) enhancedClass = "text-foreground font-semibold";
                else if (log.text.includes("📌")) enhancedClass = "text-sky-400 font-semibold";
                else if (log.text.includes("✍️")) enhancedClass = "text-amber-400 font-semibold";
              } else if (log.type === "detail") {
                if (log.text.includes("+ [H")) enhancedClass = "text-sky-400";
                else if (log.text.includes("* [p_")) enhancedClass = "text-foreground/90";
              }

              return (
                <div key={log.id} className="flex items-start gap-2 py-0.5 border-b border-border/30">
                  <span className="text-[#555] dark:text-[#777] select-none shrink-0 text-xs">
                    [{time}]
                  </span>
                  <span className={`select-none shrink-0 w-8 ${enhancedClass}`}>{badge}</span>
                  <span className={`${enhancedClass} break-words whitespace-pre-wrap flex-1`}>
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
