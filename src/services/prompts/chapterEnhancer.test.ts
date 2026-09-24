import { describe, it, expect } from "vitest";
import {
  buildChapterEnhancerUserPrompt,
  parseChapterEnhancePlan,
} from "./chapterEnhancer";

describe("chapterEnhancer prompt and parser", () => {
  it("should build structured user prompt with paragraph identifiers", () => {
    const prompt = buildChapterEnhancerUserPrompt({
      chapterTitle: "Chương Mở Đầu",
      paragraphs: [
        { id: "p_0", index: 0, text: "Dòng rác 1" },
        { id: "p_1", index: 1, text: "Dòng rác 2" },
        { id: "p_2", index: 2, text: "Văn bản mở đầu" },
      ],
      features: {
        standardizeH1: true,
        cleanTopJunk: true,
        addHeadings: true,
        fixVietnameseTypos: true,
      },
    });

    expect(prompt).toContain('CHƯƠNG HIỆN TẠI: "Chương Mở Đầu"');
    expect(prompt).toContain("[p_0] Dòng rác 1");
    expect(prompt).toContain("[p_1] Dòng rác 2");
    expect(prompt).toContain("[p_2] Văn bản mở đầu");
  });

  it("should parse valid JSON response matching user screenshot format", () => {
    const mockAiResponse = `
    \`\`\`json
    {
      "h1_title": "Chương Mở Đầu: Các thói quen có thể thay đổi cuộc đời bạn",
      "top_junk_indices": [0, 1, 2],
      "headings": [
        { "level": "h2", "title": "1. Tìm hiểu những người đã vượt qua nghịch cảnh", "before_paragraph_index": 6 },
        { "level": "h3", "title": "9 thói quen để thoát khỏi suy nghĩ tiêu cực", "before_paragraph_index": 9 },
        { "level": "h2", "title": "2. Nghiên cứu những lối suy nghĩ vượt thời gian", "before_paragraph_index": 32 }
      ],
      "spelling_corrections": [
        { "paragraph_id": "p_7", "original": "tiêu sử", "corrected": "tiểu sử", "reason": "lỗi chính tả dấu hỏi/ngã" },
        { "paragraph_id": "p_31", "original": "New Yord Yankees", "corrected": "New York Yankees", "reason": "lỗi gõ nhầm ký tự d và k" },
        { "paragraph_id": "p_31", "original": "phẩu thuật", "corrected": "phẫu thuật", "reason": "lỗi chính tả dấu hỏi/ngã" }
      ]
    }
    \`\`\`
    `;

    const plan = parseChapterEnhancePlan(mockAiResponse);

    expect(plan.h1_title).toBe("Chương Mở Đầu: Các thói quen có thể thay đổi cuộc đời bạn");
    expect(plan.top_junk_indices).toEqual([0, 1, 2]);
    const headings = plan.headings || [];
    expect(headings).toHaveLength(3);
    expect(headings[0].level).toBe("h2");
    expect(headings[0].title).toBe("1. Tìm hiểu những người đã vượt qua nghịch cảnh");
    expect(headings[0].before_paragraph_index).toBe(6);

    const corrections = plan.spelling_corrections || [];
    expect(corrections).toHaveLength(3);
    expect(corrections[0].paragraph_id).toBe("p_7");
    expect(corrections[0].original).toBe("tiêu sử");
    expect(corrections[0].corrected).toBe("tiểu sử");
    expect(corrections[0].reason).toContain("hỏi/ngã");
  });

  it("should throw a descriptive error when no valid JSON is returned", () => {
    expect(() => parseChapterEnhancePlan("Xin chào, tôi là AI")).toThrow(
      "Không tìm thấy cấu trúc JSON hợp lệ"
    );
  });
});
