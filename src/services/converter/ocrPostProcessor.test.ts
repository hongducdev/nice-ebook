import { describe, it, expect } from "vitest";
import { cleanOcrText } from "./ocrPostProcessor";

describe("ocrPostProcessor", () => {
  it("removes isolated symbol speckle lines", () => {
    const raw = `
Chương 1: Mở Đầu
|
~
Nội dung chương một bắt đầu ở đây.
.
`;
    const cleaned = cleanOcrText(raw);
    expect(cleaned).toContain("Chương 1: Mở Đầu");
    expect(cleaned).toContain("Nội dung chương một bắt đầu ở đây.");
    expect(cleaned).not.toMatch(/^\|$/m);
    expect(cleaned).not.toMatch(/^~$/m);
  });

  it("fixes disconnected Vietnamese accents and merges broken words", () => {
    const raw = "Mùa thu lá vàng rơ i trên con đường vắng.";
    const cleaned = cleanOcrText(raw);
    expect(cleaned).toContain("Mùa thu lá vàng");
  });

  it("merges soft line wraps and cleans excess spaces", () => {
    const raw = "Đây  là   một dòng văn bản\nđược gộp lại mượt mà.";
    const cleaned = cleanOcrText(raw);
    expect(cleaned).toBe("Đây là một dòng văn bản được gộp lại mượt mà.");
  });
});
