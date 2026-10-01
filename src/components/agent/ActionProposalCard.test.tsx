import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionProposalCardView } from "./ActionProposalCard";
import { ActionProposal } from "../../services/agent/agentTools";

describe("ActionProposalCard Component", () => {
  const dummyProposal: ActionProposal = {
    id: "prop_test_1",
    toolName: "translate_chapter",
    title: 'Dịch chương: "Chương 1: Mở đầu" sang VI',
    description: "Đề xuất dịch tự động nội dung chương 1 qua AI Gateway.",
    parameters: { chapterIndex: 0, targetLang: "vi" },
    diffSummary: [
      { field: "Chương cần dịch", before: "Chapter 1", after: "Chương 1" },
      { field: "Ngôn ngữ đích", before: "EN", after: "VI" },
    ],
    createdAt: Date.now(),
  };

  it("renders pending state with decision buttons and diff table", () => {
    const html = renderToStaticMarkup(
      <ActionProposalCardView
        proposal={dummyProposal}
        status="pending"
        onConfirm={vi.fn()}
      />
    );

    expect(html).toContain("Chờ xác nhận");
    expect(html).toContain("Chấp nhận thực thi");
    expect(html).toContain("Bỏ qua");
    expect(html).toContain("Chương cần dịch");
    expect(html).toContain("Chapter 1");
    expect(html).toContain("Chương 1");
  });

  it("renders executing state with disabled button and live loader", () => {
    const html = renderToStaticMarkup(
      <ActionProposalCardView
        proposal={dummyProposal}
        status="executing"
        onConfirm={vi.fn()}
      />
    );

    expect(html).toContain("Đang thực thi...");
    expect(html).not.toContain("Chờ xác nhận");
    // Ensure button is disabled
    expect(html).toContain("disabled");
  });

  it("renders live progress when translating chapter", () => {
    const html = renderToStaticMarkup(
      <ActionProposalCardView
        proposal={dummyProposal}
        status="executing"
        isTranslating={true}
        translationProgress={{
          currentChapterIndex: 1,
          totalChapters: 1,
          currentChapterHref: "ch1.xhtml",
          currentChapterTitle: "Chương 1: Mở đầu",
          currentBlock: 5,
          totalBlocks: 20,
          percent: 25,
        }}
        onStopTranslation={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(html).toContain("Đang thực thi...");
    expect(html).toContain("25%");
    expect(html).toContain("Đoạn 5/20");
    expect(html).toContain("Dừng");
  });

  it("renders executed state with completed badge", () => {
    const html = renderToStaticMarkup(
      <ActionProposalCardView
        proposal={dummyProposal}
        status="executed"
        onConfirm={vi.fn()}
      />
    );

    expect(html).toContain("Đã thực thi");
    expect(html).not.toContain("Chấp nhận thực thi");
  });

  it("renders rejected state with skipped badge", () => {
    const html = renderToStaticMarkup(
      <ActionProposalCardView
        proposal={dummyProposal}
        status="rejected"
        onConfirm={vi.fn()}
      />
    );

    expect(html).toContain("Đã bỏ qua");
    expect(html).not.toContain("Chấp nhận thực thi");
  });
});
