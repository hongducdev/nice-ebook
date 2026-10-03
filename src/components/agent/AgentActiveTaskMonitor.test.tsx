import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentActiveTaskMonitorView } from "./AgentActiveTaskMonitor";

describe("AgentActiveTaskMonitor Component", () => {
  it("renders nothing when no tasks are running", () => {
    const html = renderToStaticMarkup(<AgentActiveTaskMonitorView />);
    expect(html).toBe("");
  });

  it("renders realtime translation progress when translating", () => {
    const html = renderToStaticMarkup(
      <AgentActiveTaskMonitorView
        isTranslating={true}
        translationProgress={{
          currentChapterIndex: 2,
          totalChapters: 10,
          currentChapterHref: "ch2.xhtml",
          currentChapterTitle: "Chương 2: Tu Luyện",
          currentBlock: 12,
          totalBlocks: 30,
          percent: 40,
        }}
        onNavigateTab={vi.fn()}
        onStopTranslation={vi.fn()}
      />
    );

    expect(html).toContain("Đang dịch: Chương 2: Tu Luyện");
    expect(html).toContain("40%");
    expect(html).toContain("Chương 2/10");
    expect(html).toContain("Đoạn 12/30");
    expect(html).toContain("Tab Dịch");
    expect(html).toContain("Dừng");
  });

  it("renders realtime enhancement progress when batch enhancing", () => {
    const html = renderToStaticMarkup(
      <AgentActiveTaskMonitorView
        isBatchEnhancing={true}
        enhanceProgress={{
          current: 5,
          total: 20,
          currentChapterHref: "ch5.xhtml",
        }}
        onNavigateTab={vi.fn()}
        onStopBatchEnhance={vi.fn()}
      />
    );

    expect(html).toContain("Đang biên tập &amp; tối ưu chương");
    expect(html).toContain("25%");
    expect(html).toContain("Chương 5/20");
    expect(html).toContain("Tab AI");
    expect(html).toContain("Dừng");
  });

  it("renders generic running workflow job when active", () => {
    const html = renderToStaticMarkup(
      <AgentActiveTaskMonitorView
        runningJob={{
          id: "job_1",
          type: "export",
          label: "Đóng gói file EPUB hoàn chỉnh",
          status: "running",
          progress: 80,
          detail: "Đang nén các file xhtml...",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }}
      />
    );

    expect(html).toContain("Đóng gói file EPUB hoàn chỉnh");
    expect(html).toContain("80%");
    expect(html).toContain("Đang nén các file xhtml...");
  });
});
