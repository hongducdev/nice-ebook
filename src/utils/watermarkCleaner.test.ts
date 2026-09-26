import { describe, it, expect } from "vitest";
import {
  isWatermarkOrJunkText,
  stripInlineWatermarks,
  cleanChapterHtmlWatermarks,
  cleanAllChaptersWatermarks,
  detectBookWatermarks,
} from "./watermarkCleaner";

describe("watermarkCleaner", () => {
  describe("isWatermarkOrJunkText", () => {
    it("identifies dtv-ebook domain and phrase watermarks", () => {
      expect(isWatermarkOrJunkText("dtv-ebook.com")).toBe(true);
      expect(isWatermarkOrJunkText("Chia sẻ bởi: dtv-ebook.com")).toBe(true);
      expect(isWatermarkOrJunkText("Nguồn: https://dtv-ebook.com")).toBe(true);
      expect(isWatermarkOrJunkText("Download ebook miễn phí tại dtv-ebook")).toBe(true);
      expect(isWatermarkOrJunkText("DTV EBOOK")).toBe(true);
    });

    it("identifies page numbers and running headers", () => {
      expect(isWatermarkOrJunkText("Trang 15")).toBe(true);
      expect(isWatermarkOrJunkText("- 42 -")).toBe(true);
      expect(isWatermarkOrJunkText("Page 3 of 100")).toBe(true);
    });

    it("does not flag substantive narrative content as watermarks", () => {
      const story =
        "Vương Lâm nhìn về phía xa, gió tuyết phủ đầy sơn cốc. Hắn khẽ thở dài một tiếng rồi tiếp tục bước đi trên con đường tu tiên đầy chông gai.";
      expect(isWatermarkOrJunkText(story)).toBe(false);
    });
  });

  describe("stripInlineWatermarks", () => {
    it("strips embedded watermark URLs and parentheses from narrative sentences", () => {
      const input = "Kiếm quang lóe lên sáng rực. (Truyện được chia sẻ tại dtv-ebook.com) Gió tuyết thét gào.";
      const { cleanedText, fixesCount } = stripInlineWatermarks(input);
      expect(fixesCount).toBeGreaterThan(0);
      expect(cleanedText).not.toContain("dtv-ebook.com");
      expect(cleanedText).toContain("Kiếm quang lóe lên sáng rực.");
      expect(cleanedText).toContain("Gió tuyết thét gào.");
    });
  });

  describe("cleanChapterHtmlWatermarks", () => {
    it("purges header/footer tags and dtv-ebook paragraphs from chapter HTML", () => {
      const html = `
        <html>
          <body>
            <header><p>dtv-ebook.com</p></header>
            <p>Chia sẻ bởi: dtv-ebook.com</p>
            <h1>Chương 1: Khởi Đầu</h1>
            <p>Nội dung câu chuyện bắt đầu rất liền mạch.</p>
            <p>Đoạn thứ hai tiếp diễn. (Truyện được chia sẻ tại dtv-ebook.com) Vẫn còn tiếp.</p>
            <p>Nguồn: dtv-ebook.com - Chúc các bạn đọc truyện vui vẻ</p>
            <footer><p>Trang 1</p></footer>
          </body>
        </html>
      `;

      const result = cleanChapterHtmlWatermarks(html);
      expect(result.removedBlocksCount).toBeGreaterThanOrEqual(4);
      expect(result.cleanedHtml).not.toContain("dtv-ebook.com");
      expect(result.cleanedHtml).not.toContain("Chia sẻ bởi");
      expect(result.cleanedHtml).not.toContain("Trang 1");
      expect(result.cleanedHtml).toContain("<h1>Chương 1: Khởi Đầu</h1>");
      expect(result.cleanedHtml).toContain("Nội dung câu chuyện bắt đầu rất liền mạch.");
      expect(result.cleanedHtml).toContain("Đoạn thứ hai tiếp diễn.");
    });
  });

  describe("cleanAllChaptersWatermarks", () => {
    it("cleans watermarks across multiple chapters and tallies statistics", () => {
      const bookChapters = {
        "text/ch1.xhtml": "<html><body><p>dtv-ebook</p><p>Nội dung chương 1</p></body></html>",
        "text/ch2.xhtml": "<html><body><p>Nội dung chương 2</p><p>Nguồn: dtv-ebook.com</p></body></html>",
        "text/ch3.xhtml": "<html><body><p>Chương 3 không có watermark.</p></body></html>",
      };

      const summary = cleanAllChaptersWatermarks(bookChapters);
      expect(summary.affectedChaptersCount).toBe(2);
      expect(summary.totalRemovedBlocks).toBe(2);
      expect(summary.updatedChapters["text/ch1.xhtml"]).not.toContain("dtv-ebook");
      expect(summary.updatedChapters["text/ch2.xhtml"]).not.toContain("dtv-ebook.com");
      expect(summary.updatedChapters["text/ch3.xhtml"]).toContain("Chương 3 không có watermark.");
    });

    it("cleans exact dtv-ebook header prefix and repairs broken diacritics from user's sample book", () => {
      const dirtyHtml = `
        <html>
          <body>
            <p>Nhục Hô\`ng Ngải Nhục Hô\`ng Ngải Thục Linh www.dtv-ebook.com Chương 1: Khủng Hoảng Bách cúi đâ\`u, lâ'y hơi.</p>
          </body>
        </html>
      `;

      const result = cleanChapterHtmlWatermarks(dirtyHtml);
      expect(result.cleanedHtml).not.toContain("www.dtv-ebook.com");
      expect(result.cleanedHtml).toContain("Bách cúi đầu, lấy hơi.");
    });
  });

  describe("detectBookWatermarks", () => {
    it("automatically discovers dtv-ebook watermarks across book chapters", () => {
      const chapters = [
        {
          href: "ch1.xhtml",
          title: "Chương 1: Khủng Hoảng",
          preview_text: "Nhục Hồn Ngải Thục Linh www.dtv-ebook.com Chương 1: Khủng Hoảng Bách cúi đầu...",
        },
        {
          href: "ch2.xhtml",
          title: "Chương 2: Điên Cuồng",
          preview_text: "Nhục Hồn Ngải Thục Linh www.dtv-ebook.com Chương 2: Điên Cuồng Những ngày sau...",
        },
        {
          href: "ch3.xhtml",
          title: "Chương 3: Lời Nhắn",
          preview_text: "Nội dung bình thường không có dấu.",
        },
      ];

      const report = detectBookWatermarks(chapters);
      expect(report.hasWatermarks).toBe(true);
      expect(report.affectedChaptersCount).toBe(2);
      expect(report.detectedDomains).toContain("www.dtv-ebook.com");
    });
  });
});
