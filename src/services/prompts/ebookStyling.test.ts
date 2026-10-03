import { describe, it, expect } from "vitest";
import {
  buildStyleAuditUserPrompt,
  generateOfflineStyleAuditFallback,
  sanitizeCssOverrides,
} from "./ebookStyling";

describe("ebookStyling - AI Style Audit & Fix on Original Styles", () => {
  describe("buildStyleAuditUserPrompt", () => {
    it("builds a prompt containing original CSS and text snippet", () => {
      const prompt = buildStyleAuditUserPrompt({
        title: "Dế Mèn Phiêu Lưu Ký",
        author: "Tô Hoài",
        originalCss: "body { font-size: 15px; color: #222; }",
        sampleText: "Tôi sống độc lập từ thuở bé...",
        isVietnamese: true,
      });

      expect(prompt).toContain("Dế Mèn Phiêu Lưu Ký");
      expect(prompt).toContain("Tô Hoài");
      expect(prompt).toContain("Tiếng Việt");
      expect(prompt).toContain("body { font-size: 15px; color: #222; }");
      expect(prompt).toContain("Tôi sống độc lập");
    });
  });

  describe("generateOfflineStyleAuditFallback", () => {
    it("flags non-Vietnamese font for Vietnamese book and recommends Literata", () => {
      const result = generateOfflineStyleAuditFallback({
        title: "Số Đỏ",
        originalCss: "body { font-family: Arial, sans-serif; line-height: 1.2; }",
        signature: {
          fontFamily: "Arial, sans-serif",
          fontSize: 14,
          lineHeight: 1.2,
          textAlign: "left",
          firstLineIndent: "0",
          confidence: 0.8,
          colors: { bg: "#ffffff", text: "#000000", accent: null },
        },
        isVietnamese: true,
      });

      expect(result.overallScore).toBeLessThan(90);
      expect(result.preservationNotes).toContain("Giữ nguyên");

      // Verify typography findings
      const fontItem = result.auditItems.find((i) => i.category === "typography");
      expect(fontItem).toBeDefined();
      expect(fontItem?.status).toBe("warning");
      expect(fontItem?.fixRecommendation).toContain("Literata");

      // Verify line-height findings
      const spacingItem = result.auditItems.find((i) => i.category === "spacing" && i.title.includes("dòng"));
      expect(spacingItem?.status).toBe("warning");

      // Verify suggested typography
      expect(result.suggestedTypography.fontFamily).toContain("Literata");
      expect(result.suggestedTypography.lineHeight).toBeGreaterThanOrEqual(1.5);
      expect(result.suggestedTypography.firstLineIndent).toBe("1.5em");

      // Verify custom CSS overrides
      expect(result.customCssOverrides).toContain("font-family");
      expect(result.customCssOverrides).toContain("line-height");
      expect(result.customCssOverrides).toContain("text-indent");
    });

    it("passes checks when font and spacing are already optimal", () => {
      const result = generateOfflineStyleAuditFallback({
        title: "Tắt Đèn",
        originalCss: "body { font-family: 'Literata', serif; line-height: 1.75; text-indent: 1.5em; } h1 { text-align: center; }",
        signature: {
          fontFamily: "'Literata', serif",
          fontSize: 16,
          lineHeight: 1.75,
          textAlign: "justify",
          firstLineIndent: "1.5em",
          confidence: 0.9,
          colors: { bg: "#fdfbf7", text: "#1a1a1a", accent: "#b91c1c" },
        },
        isVietnamese: true,
      });

      expect(result.overallScore).toBeGreaterThanOrEqual(90);
      const fontItem = result.auditItems.find((i) => i.category === "typography");
      expect(fontItem?.status).toBe("pass");
    });

    it("flags rigid fixed pixel widths for e-reader compatibility", () => {
      const result = generateOfflineStyleAuditFallback({
        title: "Bí Mật Khổ Sách",
        originalCss: "div.container { width: 800px; }",
        signature: {
          fontFamily: "'Lora', serif",
          fontSize: 16,
          lineHeight: 1.7,
          textAlign: "justify",
          firstLineIndent: "1.5em",
          confidence: 0.85,
          colors: { bg: null, text: null, accent: null },
        },
        isVietnamese: true,
      });

      const compatItem = result.auditItems.find((i) => i.category === "compatibility");
      expect(compatItem?.status).toBe("issue");
      expect(compatItem?.title).toContain("pixel cố định");
      expect(compatItem?.detail).toContain("px cố định");
    });
  });

  describe("sanitizeCssOverrides", () => {
    it("strips script tags and javascript: expressions", () => {
      const malicious = "body { color: red; } <script>alert(1)</script> background: url(javascript:alert(1));";
      const sanitized = sanitizeCssOverrides(malicious);

      expect(sanitized).not.toContain("<script>");
      expect(sanitized).not.toContain("javascript:");
      expect(sanitized).toContain("body { color: red; }");
    });
  });
});
