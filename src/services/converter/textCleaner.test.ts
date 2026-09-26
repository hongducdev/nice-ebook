import { describe, it, expect } from "vitest";
import {
  cleanRunningHeadersAndFooters,
  dehyphenateAndMergeLines,
  detectChapterMarkers,
  chunkTextBySize,
} from "./textCleaner";

describe("textCleaner", () => {
  describe("cleanRunningHeadersAndFooters", () => {
    it("strips recurring headers, footers and page numbers across pages", () => {
      const page1 = "Tây Du Ký - Ngô Thừa Ân\nChương 1: Linh Hầu Xuất Thế\nNội dung trang 1\nTrang 1";
      const page2 = "Tây Du Ký - Ngô Thừa Ân\nTiếp tục trang 2 câu chuyện\nNội dung trang 2\nTrang 2";
      const page3 = "Tây Du Ký - Ngô Thừa Ân\nĐoạn kết trang 3\nNội dung trang 3\nTrang 3";

      const cleaned = cleanRunningHeadersAndFooters([page1, page2, page3]);
      expect(cleaned.length).toBe(3);

      for (const p of cleaned) {
        expect(p).not.toContain("Tây Du Ký - Ngô Thừa Ân");
        expect(p).not.toMatch(/^Trang \d+$/m);
      }

      expect(cleaned[0]).toContain("Chương 1: Linh Hầu Xuất Thế");
      expect(cleaned[0]).toContain("Nội dung trang 1");
    });

    it("returns single page unchanged without false positives", () => {
      const single = ["Chương 1\nMột mình một trang\nHết"];
      const cleaned = cleanRunningHeadersAndFooters(single);
      expect(cleaned).toEqual(single);
    });
  });

  describe("dehyphenateAndMergeLines", () => {
    it("de-hyphenates words broken across line wraps", () => {
      const input = "Hệ thống tự-\nđộng chuyển-\nđổi sách điện tử.";
      const output = dehyphenateAndMergeLines(input);
      expect(output).toContain("tựđộng");
      expect(output).toContain("chuyểnđổi");
    });

    it("merges soft line breaks within a single sentence", () => {
      const input = "Đây là một dòng văn bản dài\nđược ngắt đôi ở giữa câu\nnhưng thuộc cùng một đoạn.";
      const output = dehyphenateAndMergeLines(input);
      expect(output).toBe("Đây là một dòng văn bản dài được ngắt đôi ở giữa câu nhưng thuộc cùng một đoạn.");
    });

    it("preserves paragraphs separated by blank lines and dialog lines", () => {
      const input = "Đoạn văn thứ nhất kết thúc ở đây.\n\nĐoạn văn thứ hai bắt đầu.\n— Xin chào hiệp khách!";
      const output = dehyphenateAndMergeLines(input);
      expect(output).toContain("Đoạn văn thứ nhất kết thúc ở đây.");
      expect(output).toContain("Đoạn văn thứ hai bắt đầu.");
      expect(output).toContain("— Xin chào hiệp khách!");
    });
  });

  describe("detectChapterMarkers", () => {
    it("detects Vietnamese chapter markers and splits accordingly", () => {
      const fullText = `
Mở đầu câu chuyện ngàn năm trước.

Chương 1: Khởi Nguồn Sức Mạnh
Nội dung của chương thứ nhất rất hoành tráng.

Chương 2: Luyện Kiếm
Kiếm pháp ảo diệu vô song.
      `.trim();

      const chapters = detectChapterMarkers(fullText);
      expect(chapters.length).toBe(3);
      expect(chapters[0].title).toBe("Mở Đầu");
      expect(chapters[0].content).toContain("Mở đầu câu chuyện ngàn năm trước.");
      expect(chapters[1].title).toBe("Chương 1: Khởi Nguồn Sức Mạnh");
      expect(chapters[1].content).toContain("Nội dung của chương thứ nhất rất hoành tráng.");
      expect(chapters[2].title).toBe("Chương 2: Luyện Kiếm");
      expect(chapters[2].content).toContain("Kiếm pháp ảo diệu vô song.");
    });

    it("detects Markdown headings as chapter titles", () => {
      const md = `
# Chương I: Đại Náo Thiên Cung
Tôn Ngộ Không vung Thiết Bảng.

# Chương II: Dưới Dãy Ngũ Hành
Năm trăm năm dưới chân núi.
      `.trim();

      const chapters = detectChapterMarkers(md);
      expect(chapters.length).toBe(2);
      expect(chapters[0].title).toBe("Chương I: Đại Náo Thiên Cung");
      expect(chapters[1].title).toBe("Chương II: Dưới Dãy Ngũ Hành");
    });
  });

  describe("chunkTextBySize", () => {
    it("chunks large text into parts when no chapter markers exist", () => {
      const paras = Array.from({ length: 30 }, (_, i) => `Đoạn văn số ${i + 1} có rất nhiều nội dung chi tiết để kiểm tra tính năng chia đoạn.`);
      const text = paras.join("\n\n");
      const chunks = chunkTextBySize(text, 50);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].title).toBe("Phần 1");
    });
  });
});
