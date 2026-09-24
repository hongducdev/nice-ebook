import { EpubMetadata } from "../stores/useAppStore";

export interface FontOption {
  id: string;
  name: string;
  category: "serif" | "sans" | "mono";
  fontFamily: string;
  description: string;
  isRecommendedForVietnamese: boolean;
}

export const VIETNAMESE_FONTS: FontOption[] = [
  {
    id: "literata",
    name: "Literata (Google Books)",
    category: "serif",
    fontFamily: "'Literata', 'Lora', 'Merriweather', 'Noto Serif', 'Palatino Linotype', 'Book Antiqua', 'Georgia', 'Times New Roman', 'DejaVu Serif', serif",
    description: "Font đọc sách chuẩn mực của Google Books, hỗ trợ dấu tiếng Việt đa nền tảng đẹp nhất",
    isRecommendedForVietnamese: true,
  },
  {
    id: "be-vietnam-pro",
    name: "Be Vietnam Pro",
    category: "sans",
    fontFamily: "'Be Vietnam Pro', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
    description: "Font sans-serif hiện đại thiết kế chuyên biệt cho tiếng Việt bởi type designer Việt Nam",
    isRecommendedForVietnamese: true,
  },
  {
    id: "lora",
    name: "Lora",
    category: "serif",
    fontFamily: "'Lora', 'Literata', 'Merriweather', 'Noto Serif', 'Palatino Linotype', 'Georgia', 'Times New Roman', serif",
    description: "Font có chân thanh lịch, nét bút mềm mại, hỗ trợ tiếng Việt đầy đủ",
    isRecommendedForVietnamese: true,
  },
  {
    id: "merriweather",
    name: "Merriweather",
    category: "serif",
    fontFamily: "'Merriweather', 'Literata', 'Lora', 'Noto Serif', 'Palatino Linotype', 'Georgia', serif",
    description: "Độ tương phản cao, nét đậm rõ ràng, lý tưởng cho đọc lâu trên màn hình e-ink",
    isRecommendedForVietnamese: true,
  },
  {
    id: "inter",
    name: "Inter",
    category: "sans",
    fontFamily: "'Inter', 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
    description: "Font không chân tối giản, siêu nét trên màn hình Retina / HiDPI",
    isRecommendedForVietnamese: true,
  },
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono",
    category: "mono",
    fontFamily: "'JetBrains Mono', 'Consolas', 'Courier New', 'DejaVu Sans Mono', monospace",
    description: "Font đơn cách kỹ thuật số, phù hợp tiểu thuyết khoa học viễn tưởng",
    isRecommendedForVietnamese: false,
  },
];

/**
 * Strict regex containing diacritics and letters uniquely characteristic of Vietnamese
 * (horn letters ơ/ư, d with stroke đ, dot below ạ/ẹ/ị/ọ/ụ/ỵ, hook above ả/ẻ/ỉ/ỏ/ủ/ỷ,
 * and double-accented letters ấ/ầ/ẩ/ẫ/ậ, ế/ề/ể/ễ/ệ, ố/ồ/ổ/ỗ/ộ, ắ/ằ/ẳ/ẵ/ặ, ứ/ừ/ử/ữ/ự).
 * Excludes generic Latin-extended accents (é, è, ê, à, á, â, ñ, ü) to prevent false positives
 * on French, Spanish, Portuguese, or German loanwords.
 */
const VIETNAMESE_STRICT_CHAR_REGEX =
  /[ơớờởỡợưứừửữựđĐạẹịọụỵảẻỉỏủỷấầẩẫậếềểễệốồổỗộắằẳẵặứừửữựƠỚỜỞỠỢƯỨỪỬỮỰẠẸỊỌỤỴẢẺỈỎỦỶẤẦẨẪẬẾỀỂỄỆỐỒỔỖỘẮẰẲẴẶỨỪỬỮỰ]/g;

/**
 * Check if a given text contains Vietnamese diacritic characters
 */
export function isVietnameseText(text?: string | null): boolean {
  if (!text) return false;
  const matches = text.match(VIETNAMESE_STRICT_CHAR_REGEX);
  return (matches?.length ?? 0) >= 2;
}

/**
 * Check if language code matches Vietnamese
 */
export function isVietnameseLanguage(lang?: string | null): boolean {
  if (!lang) return false;
  const normalized = lang.trim().toLowerCase();
  return (
    normalized === "vi" ||
    normalized.startsWith("vi-") ||
    normalized.startsWith("vi_") ||
    normalized === "vie" ||
    normalized === "vietnamese"
  );
}

/**
 * Comprehensive check whether an EPUB metadata belongs to a Vietnamese book
 */
export function detectIsVietnameseBook(book?: EpubMetadata | null): boolean {
  if (!book) return false;
  if (isVietnameseLanguage(book.language)) return true;
  if (isVietnameseText(book.title)) return true;
  if (isVietnameseText(book.description)) return true;
  if (isVietnameseText(book.sample_text)) return true;

  // Also check if any chapter title contains Vietnamese
  if (book.chapters && book.chapters.length > 0) {
    for (const ch of book.chapters.slice(0, 5)) {
      if (isVietnameseText(ch.title) || isVietnameseText(ch.preview_text)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Returns recommended Vietnamese font stack based on book genre / preset
 */
export function getRecommendedVietnameseFont(genre?: string): FontOption {
  switch (genre) {
    case "wuxia":
    case "classic":
      return VIETNAMESE_FONTS.find((f) => f.id === "literata") || VIETNAMESE_FONTS[0];
    case "light_novel":
      return VIETNAMESE_FONTS.find((f) => f.id === "be-vietnam-pro") || VIETNAMESE_FONTS[1];
    case "mystery":
      return VIETNAMESE_FONTS.find((f) => f.id === "merriweather") || VIETNAMESE_FONTS[3];
    case "scifi":
      return VIETNAMESE_FONTS.find((f) => f.id === "jetbrains-mono") || VIETNAMESE_FONTS[5];
    default:
      return VIETNAMESE_FONTS.find((f) => f.id === "literata") || VIETNAMESE_FONTS[0];
  }
}
