import { describe, it, expect } from "vitest";
import {
  isVietnameseText,
  isVietnameseLanguage,
  detectIsVietnameseBook,
  getRecommendedVietnameseFont,
  VIETNAMESE_FONTS,
} from "./vietnameseHelper";
import { EpubMetadata } from "../stores/useAppStore";

describe("vietnameseHelper", () => {
  describe("isVietnameseText", () => {
    it("returns true for text with Vietnamese diacritics", () => {
      expect(isVietnameseText("Truyện Kiều của Nguyễn Du")).toBe(true);
      expect(isVietnameseText("Tiên hiệp kỳ ảo, tu tiên đắc đạo")).toBe(true);
      expect(isVietnameseText("Một ngày nọ, trời trong xanh")).toBe(true);
    });

    it("returns false for plain English / Latin text", () => {
      expect(isVietnameseText("The Lord of the Rings")).toBe(false);
      expect(isVietnameseText("Chapter 1: The Beginning")).toBe(false);
      expect(isVietnameseText("Hello world! Just some text.")).toBe(false);
      expect(isVietnameseText(null)).toBe(false);
      expect(isVietnameseText("")).toBe(false);
    });

    it("returns false for other European languages with generic accents (French, Spanish, German)", () => {
      // French
      expect(isVietnameseText("Les Misérables par Victor Hugo. Le château et le café à Paris.")).toBe(false);
      // Spanish
      expect(isVietnameseText("Cien años de soledad por Gabriel García Márquez en España.")).toBe(false);
      // German
      expect(isVietnameseText("Faust von Johann Wolfgang von Goethe. Über allen Gipfeln ist Ruh.")).toBe(false);
    });
  });

  describe("isVietnameseLanguage", () => {
    it("recognizes standard Vietnamese language codes", () => {
      expect(isVietnameseLanguage("vi")).toBe(true);
      expect(isVietnameseLanguage("vie")).toBe(true);
      expect(isVietnameseLanguage("vi-VN")).toBe(true);
      expect(isVietnameseLanguage("vi_VN")).toBe(true);
      expect(isVietnameseLanguage("vietnamese")).toBe(true);
    });

    it("returns false for other languages", () => {
      expect(isVietnameseLanguage("en")).toBe(false);
      expect(isVietnameseLanguage("en-US")).toBe(false);
      expect(isVietnameseLanguage("ja")).toBe(false);
      expect(isVietnameseLanguage("zh")).toBe(false);
      expect(isVietnameseLanguage(null)).toBe(false);
    });
  });

  describe("detectIsVietnameseBook", () => {
    it("detects Vietnamese book via language tag", () => {
      const book: EpubMetadata = {
        title: "English Title",
        author: "Author",
        language: "vi",
        description: null,
        cover_data_url: null,
        chapter_count: 5,
        file_size_bytes: 1000,
        chapters: [],
        sample_text: "",
      };
      expect(detectIsVietnameseBook(book)).toBe(true);
    });

    it("detects Vietnamese book via title when language tag is mislabeled as en", () => {
      const book: EpubMetadata = {
        title: "Dế Mèn Phiêu Lưu Ký",
        author: "Tô Hoài",
        language: "en", // Misconfigured OPF
        description: null,
        cover_data_url: null,
        chapter_count: 10,
        file_size_bytes: 2000,
        chapters: [],
        sample_text: "",
      };
      expect(detectIsVietnameseBook(book)).toBe(true);
    });

    it("detects Vietnamese book via sample_text or chapters", () => {
      const book: EpubMetadata = {
        title: "Book",
        author: "Author",
        language: "und",
        description: null,
        cover_data_url: null,
        chapter_count: 1,
        file_size_bytes: 500,
        chapters: [
          { id: "1", href: "1.xhtml", title: "Chương 1: Mở đầu câu chuyện", preview_text: "" },
        ],
        sample_text: "Đây là nội dung thử nghiệm của một tác phẩm tiếng Việt.",
      };
      expect(detectIsVietnameseBook(book)).toBe(true);
    });

    it("returns false for genuine foreign book", () => {
      const book: EpubMetadata = {
        title: "Pride and Prejudice",
        author: "Jane Austen",
        language: "en",
        description: "It is a truth universally acknowledged...",
        cover_data_url: null,
        chapter_count: 61,
        file_size_bytes: 500000,
        chapters: [{ id: "1", href: "1.xhtml", title: "Chapter 1", preview_text: "Preview" }],
        sample_text: "It is a truth universally acknowledged, that a single man in possession...",
      };
      expect(detectIsVietnameseBook(book)).toBe(false);
    });
  });

  describe("getRecommendedVietnameseFont", () => {
    it("recommends Literata for Wuxia and Classic", () => {
      expect(getRecommendedVietnameseFont("wuxia").id).toBe("literata");
      expect(getRecommendedVietnameseFont("classic").id).toBe("literata");
    });

    it("recommends Be Vietnam Pro for Light Novel", () => {
      expect(getRecommendedVietnameseFont("light_novel").id).toBe("be-vietnam-pro");
    });

    it("recommends Merriweather for Mystery", () => {
      expect(getRecommendedVietnameseFont("mystery").id).toBe("merriweather");
    });
  });

  describe("VIETNAMESE_FONTS", () => {
    it("contains curated font list", () => {
      expect(VIETNAMESE_FONTS.length).toBeGreaterThanOrEqual(5);
      const fontIds = VIETNAMESE_FONTS.map((f) => f.id);
      expect(fontIds).toContain("literata");
      expect(fontIds).toContain("be-vietnam-pro");
      expect(fontIds).toContain("lora");
      expect(fontIds).toContain("merriweather");
    });
  });
});
