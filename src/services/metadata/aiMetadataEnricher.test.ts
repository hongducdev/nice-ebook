import { describe, it, expect } from "vitest";
import { AiMetadataEnricher, AiMetadataEnrichmentInput } from "./aiMetadataEnricher";

describe("AiMetadataEnricher.parseJsonResponse", () => {
  const fallback: AiMetadataEnrichmentInput = {
    title: "Dac Nhan Tam",
    author: "Dale Carnegie",
    language: "vi",
  };

  it("parses clean JSON response correctly", () => {
    const jsonStr = JSON.stringify({
      title: "Đắc Nhân Tâm",
      author: "Dale Carnegie",
      genre: "Kỹ năng sống",
      description: "Nghệ thuật giao tiếp và thu phục lòng người.",
      language: "vi",
      tags: ["Tâm lý", "Kỹ năng", "Giao tiếp"],
    });

    const res = AiMetadataEnricher.parseJsonResponse(jsonStr, fallback);
    expect(res.title).toBe("Đắc Nhân Tâm");
    expect(res.author).toBe("Dale Carnegie");
    expect(res.genre).toBe("Kỹ năng sống");
    expect(res.description).toContain("Nghệ thuật giao tiếp");
    expect(res.tags).toEqual(["Tâm lý", "Kỹ năng", "Giao tiếp"]);
  });

  it("extracts JSON wrapped in markdown code fences", () => {
    const fenced = `
Chắc chắn rồi! Dưới đây là phân tích của tôi:
\`\`\`json
{
  "title": "Số Đỏ",
  "author": "Vũ Trọng Phụng",
  "genre": "Tiểu thuyết trào phúng",
  "description": "Bức tranh hiện thực xã hội Việt Nam thời Pháp thuộc.",
  "language": "vi",
  "tags": ["Văn học Việt Nam", "Trào phúng"]
}
\`\`\`
Hy vọng thông tin này hữu ích cho bạn!
`;

    const res = AiMetadataEnricher.parseJsonResponse(fenced, {
      title: "So Do",
      author: "Vu Trong Phung",
    });
    expect(res.title).toBe("Số Đỏ");
    expect(res.author).toBe("Vũ Trọng Phụng");
    expect(res.genre).toBe("Tiểu thuyết trào phúng");
    expect(res.tags).toEqual(["Văn học Việt Nam", "Trào phúng"]);
  });

  it("falls back to input values when optional fields are missing", () => {
    const partialJson = JSON.stringify({
      description: "Chỉ có phần mô tả này.",
    });

    const res = AiMetadataEnricher.parseJsonResponse(partialJson, fallback);
    expect(res.title).toBe("Dac Nhan Tam");
    expect(res.author).toBe("Dale Carnegie");
    expect(res.genre).toBe("Chưa phân loại");
    expect(res.description).toBe("Chỉ có phần mô tả này.");
    expect(res.language).toBe("vi");
    expect(res.tags).toEqual([]);
  });

  it("throws descriptive error when response contains no JSON", () => {
    const invalidText = "Xin lỗi, tôi không thể tìm thấy thông tin cuốn sách này.";
    expect(() =>
      AiMetadataEnricher.parseJsonResponse(invalidText, fallback)
    ).toThrow("Không thể phân tích phản hồi JSON");
  });
});
