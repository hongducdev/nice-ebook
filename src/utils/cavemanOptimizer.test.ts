import { describe, it, expect } from "vitest";
import { CavemanOptimizer } from "./cavemanOptimizer";

describe("CavemanOptimizer", () => {
  it("returns empty string when mode is off", () => {
    expect(CavemanOptimizer.getDirectives("off")).toBe("");
  });

  it("generates lite compression directives", () => {
    const lite = CavemanOptimizer.getDirectives("lite");
    expect(lite).toContain("LITE (-30% TOKENS)");
    expect(lite).toContain("GIỮ NGUYÊN VẸN 100%");
  });

  it("generates full compression directives with auto-clarity and preservation rules", () => {
    const full = CavemanOptimizer.getDirectives("full");
    expect(full).toContain("FULL (-65% TOKENS)");
    expect(full).toContain("Why use many token when few token do trick");
    expect(full).toContain("AUTO-CLARITY");
    expect(full).toContain("BẢO TOÀN BẤT BIẾN");
  });

  it("generates ultra compression directives for high-frequency agent loops", () => {
    const ultra = CavemanOptimizer.getDirectives("ultra");
    expect(ultra).toContain("ULTRA (-75% TOKENS)");
    expect(ultra).toContain("Zero fluff. Max density.");
    expect(ultra).toContain("STRICT PRESERVATION");
  });

  it("compresses observation text by collapsing whitespace and repeated lines", () => {
    const rawObservation = `
    
      Kết quả tìm kiếm chương 1:
      
      
      - Thuật ngữ 1: Ma Kiếm
      
      
      - Thuật ngữ 2: Tông Chủ
      
    `;

    const compressed = CavemanOptimizer.compressObservation(rawObservation, "full");
    expect(compressed).not.toContain("\n\n\n");
    expect(compressed).toContain("- Thuật ngữ 1: Ma Kiếm");
    expect(compressed).toContain("- Thuật ngữ 2: Tông Chủ");
  });

  it("leaves observation untouched when mode is off", () => {
    const text = "  Text with spaces   ";
    expect(CavemanOptimizer.compressObservation(text, "off")).toBe(text);
  });

  it("preserves valid structured JSON and tool payloads 100% byte-for-byte exact", () => {
    const complexJson = JSON.stringify(
      {
        action: "translate_chapter",
        parameters: {
          chapterIndex: 0,
          targetLang: "vi",
          nestedInfo: {
            characters: ["Han Li", "Nan Gong Wan"],
            quote: 'He said: "Why use many token when few token do trick?"',
            escaped: "Line 1\\nLine 2\\tTabbed",
          },
        },
      },
      null,
      2
    );

    // Assert that compressObservation NEVER corrupts structured JSON payload
    const output = CavemanOptimizer.compressObservation(complexJson, "full");
    expect(output).toBe(complexJson);
    expect(JSON.parse(output)).toEqual(JSON.parse(complexJson));
  });

  it("provides savings metrics for each mode", () => {
    expect(CavemanOptimizer.getSavingsMetrics("off").percent).toBe(0);
    expect(CavemanOptimizer.getSavingsMetrics("lite").percent).toBe(30);
    expect(CavemanOptimizer.getSavingsMetrics("full").percent).toBe(65);
    expect(CavemanOptimizer.getSavingsMetrics("ultra").percent).toBe(75);
  });
});
