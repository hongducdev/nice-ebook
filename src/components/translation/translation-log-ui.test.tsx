import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TranslationLogPanel,
  countLogs,
  filterLogs,
  LOG_FILTERS,
  type TranslationLogEntry,
} from "./TranslationLogPanel";

// No jsdom / testing-library in this repo — the panel is pure, so it renders to
// static markup and assertions read the HTML string.

const LOGS: TranslationLogEntry[] = [
  { id: "1", timestamp: 1700000000000, type: "info", text: "Bắt đầu dịch chương 1" },
  { id: "2", timestamp: 1700000001000, type: "detail", text: "Mẻ 1/3 gửi tới gpt-4o" },
  { id: "3", timestamp: 1700000002000, type: "warning", text: "Mô hình gặp sự cố, thử fallback" },
  { id: "4", timestamp: 1700000003000, type: "success", text: "Đã lưu bản dịch chương 1" },
  { id: "5", timestamp: 1700000004000, type: "detail", text: "Tên riêng đã khóa (2): Han Li, Qing Yuan Peak" },
];

function render(overrides: Partial<Parameters<typeof TranslationLogPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <TranslationLogPanel
      logs={LOGS}
      filter="all"
      search=""
      autoScroll
      onFilterChange={() => {}}
      onSearchChange={() => {}}
      onToggleAutoScroll={() => {}}
      {...overrides}
    />
  );
}

describe("countLogs / filterLogs", () => {
  it("counts each log type and the total", () => {
    expect(countLogs(LOGS)).toEqual({ all: 5, info: 1, success: 1, warning: 1, detail: 2 });
  });

  it("filters by type", () => {
    expect(filterLogs(LOGS, "detail", "").map((l) => l.id)).toEqual(["2", "5"]);
  });

  it("filters by case-insensitive search across all types", () => {
    expect(filterLogs(LOGS, "all", "TÊN RIÊNG").map((l) => l.id)).toEqual(["5"]);
  });

  it("combines type filter and search", () => {
    expect(filterLogs(LOGS, "info", "chương")).toHaveLength(1);
    expect(filterLogs(LOGS, "warning", "chương")).toHaveLength(0);
  });
});

describe("TranslationLogPanel", () => {
  it("renders every filter chip with its count and marks the active one", () => {
    const html = render({ filter: "warning" });

    for (const f of LOG_FILTERS) {
      expect(html).toContain(f.label);
    }
    // "Cảnh báo <span>1</span>" — the chip carries the per-type count.
    expect(html).toMatch(/Cảnh báo[\s\S]{0,60}>1</);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('role="log"');
  });

  it("renders only the lines matching the active filter", () => {
    const html = render({ filter: "warning" });

    expect(html).toContain("Mô hình gặp sự cố, thử fallback");
    expect(html).not.toContain("Bắt đầu dịch chương 1");
    expect(html).not.toContain("Đã lưu bản dịch chương 1");
  });

  it("renders only the lines matching the search box", () => {
    const html = render({ search: "Han Li" });

    expect(html).toContain("Tên riêng đã khóa (2)");
    expect(html).not.toContain("Mô hình gặp sự cố");
  });

  it("shows the empty state when there are no logs at all", () => {
    const html = render({ logs: [] });
    expect(html).toContain("Nhật ký hoạt động dịch AI sẽ xuất hiện tại đây...");
  });

  it("shows the no-match state when filters exclude everything", () => {
    const html = render({ filter: "warning", search: "không tồn tại" });
    expect(html).toContain("Không có dòng log nào khớp bộ lọc hiện tại.");
    // The toolbar is still rendered so the user can clear the filter.
    expect(html).toContain("Tất cả");
  });

  it("reflects the auto-scroll toggle state", () => {
    expect(render({ autoScroll: true })).toContain("Tự cuộn");
    expect(render({ autoScroll: false })).toContain("Dừng cuộn");
  });

  it("renders translated block text entries with highlighted block badge in detail mode", () => {
    const detailLogs: TranslationLogEntry[] = [
      {
        id: "d1",
        timestamp: 1700000005000,
        type: "detail",
        text: "📝 [p_0] Tiêu đề chương 1: Cậu bé sống sót",
      },
      {
        id: "d2",
        timestamp: 1700000006000,
        type: "detail",
        text: "🔄 [Bù p_1] Đoạn văn được quét vét thành công.",
      },
    ];

    const html = render({ logs: detailLogs, filter: "detail" });
    expect(html).toContain("p_0");
    expect(html).toContain("Tiêu đề chương 1: Cậu bé sống sót");
    expect(html).toContain("Bù p_1");
    expect(html).toContain("Đoạn văn được quét vét thành công.");
  });

  it("renders copy and clear buttons when provided", () => {
    const html = render({
      onCopyLogs: () => {},
      onClearLogs: () => {},
      isCopied: true,
    });

    expect(html).toContain("Sao chép toàn bộ nhật ký");
    expect(html).toContain("Xóa toàn bộ dòng nhật ký");
  });

  it("renders custom emptyPlaceholder when logs are empty", () => {
    const html = render({
      logs: [],
      emptyPlaceholder: {
        title: "Chưa có tiến trình biên tập nào",
        description: "Bắt đầu xử lý AI để ghi log",
      },
    });

    expect(html).toContain("Chưa có tiến trình biên tập nào");
    expect(html).toContain("Bắt đầu xử lý AI để ghi log");
  });
});
