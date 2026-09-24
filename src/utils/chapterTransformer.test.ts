import { describe, it, expect } from "vitest";
import { ChapterTransformer, ChapterEnhancePlan } from "./chapterTransformer";

describe("ChapterTransformer", () => {
  it("should strip HTML tags and decode basic entities", () => {
    const raw = "<p>Xin ch&agrave;o &amp; <strong>tạm biệt</strong>&nbsp;bạn</p>";
    const text = ChapterTransformer.stripHtml(raw);
    expect(text).toContain("Xin ch");
    expect(text).toContain("&");
    expect(text).toContain("tạm biệt bạn");
  });

  it("should extract blocks with index and tag names correctly", () => {
    const sampleHtml = `
      <html>
        <head><title>Chương 1</title></head>
        <body>
          <p class="trash-1">Tên cuốn sách</p>
          <p class="trash-2">Tác giả</p>
          <p class="empty">&nbsp;</p>
          <p class="p-first">Đây là mở đầu của câu chuyện tuyệt vời.</p>
          <p>Đoạn văn tiếp theo chứa nhiều bài học.</p>
        </body>
      </html>
    `;

    const { blocks, headerPrefix, footerSuffix } = ChapterTransformer.extractBlocks(sampleHtml);
    expect(headerPrefix).toContain("<body");
    expect(footerSuffix).toContain("</body>");
    expect(blocks.length).toBe(5);
    expect(blocks[0].id).toBe("p_0");
    expect(blocks[0].text).toBe("Tên cuốn sách");
    expect(blocks[3].text).toContain("Đây là mở đầu");
  });

  it("should replace typos in text without altering HTML attributes", () => {
    const rawBlock = '<p class="tiêu sử" data-ref="tiêu sử">Ông đã đọc cuốn tiêu sử này chưa?</p>';
    const { updated, changed } = ChapterTransformer.replaceInBlockHtml(rawBlock, "tiêu sử", "tiểu sử");

    expect(changed).toBe(true);
    // Attribute should remain intact
    expect(updated).toContain('class="tiêu sử"');
    expect(updated).toContain('data-ref="tiêu sử"');
    // Inner text should be corrected
    expect(updated).toContain("Ông đã đọc cuốn tiểu sử này chưa?");
  });

  it("should apply full enhance plan: canonical H1, clean top junk, insert H2/H3, and fix typos", () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Original</title></head>
        <body>
          <p class="meta">Rác top 0</p>
          <p class="meta">Rác top 1</p>
          <p class="meta">Rác top 2</p>
          <p>Đoạn 3 mở đầu.</p>
          <p>Đoạn 4 về khó khăn.</p>
          <p>Đoạn 5 về nổ lực bản thân.</p>
          <p>Đoạn 6 về phương pháp mới.</p>
        </body>
      </html>
    `;

    const plan: ChapterEnhancePlan = {
      h1_title: "Chương 1: Khởi Đầu Mới",
      top_junk_indices: [0, 1, 2],
      headings: [
        {
          level: "h2",
          title: "1. Vượt Qua Khó Khăn",
          before_paragraph_index: 4,
        },
        {
          level: "h3",
          title: "Chiến Lược Tư Duy",
          before_paragraph_index: 6,
        },
      ],
      spelling_corrections: [
        {
          paragraph_id: "p_5",
          original: "nổ lực",
          corrected: "nỗ lực",
          reason: "lỗi chính tả dấu hỏi/ngã",
        },
      ],
    };

    const result = ChapterTransformer.applyPlan(sampleHtml, plan);

    expect(result.canonicalH1).toBe("Chương 1: Khởi Đầu Mới");
    expect(result.cleanedTopIndices).toEqual([0, 1, 2]);
    expect(result.appliedCorrections).toHaveLength(1);
    expect(result.appliedCorrections[0].status).toBe("applied");

    // Verify output HTML
    expect(result.updatedHtml).toContain('<h1 class="chapter-title">Chương 1: Khởi Đầu Mới</h1>');
    expect(result.updatedHtml).not.toContain("Rác top 0");
    expect(result.updatedHtml).not.toContain("Rác top 1");
    expect(result.updatedHtml).not.toContain("Rác top 2");
    expect(result.updatedHtml).toContain('<h2 class="chapter-subheading">1. Vượt Qua Khó Khăn</h2>');
    expect(result.updatedHtml).toContain('<h3 class="chapter-subheading">Chiến Lược Tư Duy</h3>');
    expect(result.updatedHtml).toContain("nỗ lực bản thân");
    expect(result.updatedHtml).not.toContain("nổ lực bản thân");
  });
});
