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
    fontFamily: "'Literata', 'Lora', 'Merriweather', 'Noto Serif', -apple-system-ui-serif, 'Cambria', 'Songti SC', 'Microsoft YaHei', 'SimSun', 'Noto Serif CJK SC', 'Georgia', 'Times New Roman', serif",
    description: "Font đọc sách chuẩn mực của Google Books, hỗ trợ dấu tiếng Việt đa nền tảng đẹp nhất",
    isRecommendedForVietnamese: true,
  },
  {
    id: "be-vietnam-pro",
    name: "Be Vietnam Pro",
    category: "sans",
    fontFamily: "'Be Vietnam Pro', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', 'Source Han Sans SC', 'Noto Sans CJK SC', Arial, 'Noto Sans', sans-serif",
    description: "Font sans-serif hiện đại thiết kế chuyên biệt cho tiếng Việt bởi type designer Việt Nam",
    isRecommendedForVietnamese: true,
  },
  {
    id: "lora",
    name: "Lora",
    category: "serif",
    fontFamily: "'Lora', 'Literata', 'Merriweather', 'Noto Serif', -apple-system-ui-serif, 'Cambria', 'Songti SC', 'Microsoft YaHei', 'SimSun', 'Noto Serif CJK SC', 'Georgia', 'Times New Roman', serif",
    description: "Font có chân thanh lịch, nét bút mềm mại, hỗ trợ tiếng Việt đầy đủ",
    isRecommendedForVietnamese: true,
  },
  {
    id: "merriweather",
    name: "Merriweather",
    category: "serif",
    fontFamily: "'Merriweather', 'Literata', 'Lora', 'Noto Serif', -apple-system-ui-serif, 'Cambria', 'Songti SC', 'Microsoft YaHei', 'SimSun', 'Noto Serif CJK SC', 'Georgia', serif",
    description: "Độ tương phản cao, nét đậm rõ ràng, lý tưởng cho đọc lâu trên màn hình e-ink",
    isRecommendedForVietnamese: true,
  },
  {
    id: "inter",
    name: "Inter",
    category: "sans",
    fontFamily: "'Inter', 'Be Vietnam Pro', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', 'Source Han Sans SC', 'Noto Sans CJK SC', Arial, 'Noto Sans', sans-serif",
    description: "Font không chân tối giản, siêu nét trên màn hình Retina / HiDPI",
    isRecommendedForVietnamese: true,
  },
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono",
    category: "mono",
    fontFamily: "'JetBrains Mono', 'Segoe UI', 'Consolas', 'Courier New', 'Be Vietnam Pro', 'Microsoft YaHei', monospace",
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

const GRAVE_MAP: Record<string, string> = {
  a: "à", A: "À", ă: "ằ", Ă: "Ằ", â: "ầ", Â: "Ầ",
  e: "è", E: "È", ê: "ề", Ê: "Ề",
  i: "ì", I: "Ì",
  o: "ò", O: "Ò", ô: "ồ", Ô: "Ồ", ơ: "ờ", Ơ: "Ờ",
  u: "ù", U: "Ù", ư: "ừ", Ư: "Ừ",
  y: "ỳ", Y: "Ỳ",
};

const ACUTE_MAP: Record<string, string> = {
  a: "á", A: "Á", ă: "ắ", Ă: "Ắ", â: "ấ", Â: "Ấ",
  e: "é", E: "É", ê: "ế", Ê: "Ế",
  i: "í", I: "Í",
  o: "ó", O: "Ó", ô: "ố", Ô: "Ố", ơ: "ớ", Ơ: "Ớ",
  u: "ú", U: "Ú", ư: "ứ", Ư: "Ứ",
  y: "ý", Y: "Ý",
};

/**
 * Tự động hàn gắn và chuẩn hóa các lỗi dấu tiếng Việt bị tách rời / phân rã Unicode:
 * - Chuyển NFD sang NFC (dựng sẵn chuẩn quốc tế)
 * - Hàn gắn các từ bị rách dấu cách sau nguyên âm mang dấu: "Ấ y" -> "Ấy", "Chế t" -> "Chết", "Cuố n" -> "Cuốn"
 * - Hàn gắn dấu huyền/sắc bị văng thành dấu nháy: "tâ`m" -> "tầm", "quyê`n" -> "quyền", "vê`" -> "về", "bă`ng" -> "bằng"
 */
export function healVietnameseTypographyAndDiacritics(text: string): string {
  if (!text) return "";

  // 1. Chuẩn hóa NFD -> NFC
  let res = text.normalize("NFC");

  // 2. Hàn gắn dấu huyền ` bị văng rời
  res = res.replace(/([aAăĂâÂeEêÊiIoOôÔơƠuUưƯyY])\s*[`]/g, (match, char) => {
    return GRAVE_MAP[char] || match;
  });

  // 3. Hàn gắn dấu sắc ' hoặc ´ bị văng rời
  res = res.replace(/([aAăĂâÂeEêÊiIoOôÔơƠuUưƯyY])\s*['´]/g, (match, char) => {
    return ACUTE_MAP[char] || match;
  });

  res = res.normalize("NFC");

  // 4. Hàn gắn các từ có nguyên âm mang dấu bị tách rời khoảng trắng với phụ âm cuối:
  // e.g. "Ấ y" -> "Ấy", "Chế t" -> "Chết", "Cuố n" -> "Cuốn", "gố c" -> "gốc", "xuấ t" -> "xuất", "chiế u" -> "chiếu"
  res = res.replace(
    /(?<![\p{L}\p{N}])([\p{L}]*?[áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ])\s+([cmnpt]|ng|ch|nh|[iyu])(?!\p{L})/giu,
    "$1$2"
  );

  return res;
}
