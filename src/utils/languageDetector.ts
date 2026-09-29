/**
 * LanguageDetector: Multi-tier heuristic and metadata language classifier.
 *
 * Tier 1: Unicode scripts (Japanese, Korean, Chinese, Cyrillic, Vietnamese strict diacritics).
 * Tier 2: Latin stop-word distribution (English, French, German, Spanish).
 * Tier 3: EPUB OPF metadata (dc:language) cross-verification and conflict resolution.
 */

import { isVietnameseText, isVietnameseLanguage } from "./vietnameseHelper";

export interface LanguageDetectionResult {
  languageCode: string;
  languageName: string;
  confidence: number; // 0.0 - 1.0
  source: "metadata" | "heuristic" | "combined";
  details?: string;
}

export const SUPPORTED_LANGUAGES_MAP: Record<string, string> = {
  vi: "Tiếng Việt (Vietnamese)",
  en: "Tiếng Anh (English)",
  zh: "Tiếng Trung (Chinese)",
  ja: "Tiếng Nhật (Japanese)",
  ko: "Tiếng Hàn (Korean)",
  fr: "Tiếng Pháp (French)",
  de: "Tiếng Đức (German)",
  es: "Tiếng Tây Ban Nha (Spanish)",
  ru: "Tiếng Nga (Russian)",
};

// Common stop words for Latin-script languages
const LATIN_STOP_WORDS: Record<string, Set<string>> = {
  en: new Set([
    "the", "and", "to", "of", "a", "in", "that", "have", "it", "for",
    "not", "on", "with", "he", "as", "you", "do", "at", "this", "but",
    "his", "by", "from", "they", "we", "say", "her", "she", "or", "an",
    "will", "my", "one", "all", "would", "there", "their", "what", "so"
  ]),
  fr: new Set([
    "le", "la", "les", "de", "des", "du", "un", "une", "et", "est",
    "dans", "en", "pour", "qui", "que", "sur", "avec", "il", "elle",
    "ne", "pas", "ce", "cette", "ces", "ont", "sont", "plus", "par",
    "au", "aux", "se", "sa", "son", "ses", "mais", "ou", "nous", "vous"
  ]),
  de: new Set([
    "der", "die", "das", "und", "in", "den", "von", "zu", "das", "mit",
    "sich", "des", "auf", "für", "ist", "im", "dem", "nicht", "ein", "eine",
    "als", "auch", "es", "an", "werden", "aus", "er", "hat", "dass", "sie",
    "nach", "wird", "bei", "einer", "um", "am", "sind", "noch", "wie", "einem"
  ]),
  es: new Set([
    "el", "la", "de", "que", "y", "en", "un", "se", "no", "haber",
    "por", "con", "su", "para", "como", "estar", "tener", "le", "lo", "lo",
    "todo", "pero", "más", "hacer", "o", "poder", "este", "ya", "otro", "este",
    "los", "las", "del", "al", "una", "sus", "sin", "sobre", "cuando", "donde"
  ]),
};

export class LanguageDetector {
  /**
   * Normalizes an ISO 639-1 or 639-2 language tag (e.g. "en-US", "eng", "zh-CN") to standard code.
   */
  public static normalizeMetadataCode(rawLang?: string | null): string | null {
    if (!rawLang || rawLang.trim().length === 0) return null;
    const lower = rawLang.trim().toLowerCase();

    if (isVietnameseLanguage(lower)) return "vi";
    if (lower.startsWith("en")) return "en";
    if (lower.startsWith("zh") || lower === "chi" || lower === "zho") return "zh";
    if (lower.startsWith("ja") || lower === "jpn") return "ja";
    if (lower.startsWith("ko") || lower === "kor") return "ko";
    if (lower.startsWith("fr") || lower === "fra" || lower === "fre") return "fr";
    if (lower.startsWith("de") || lower === "deu" || lower === "ger") return "de";
    if (lower.startsWith("es") || lower === "spa") return "es";
    if (lower.startsWith("ru") || lower === "rus") return "ru";

    return null;
  }

  /**
   * Detects language using script heuristics and stop-word distribution.
   */
  public static detectFromTextHeuristics(sampleText: string): {
    langCode: string;
    confidence: number;
    details: string;
  } | null {
    if (!sampleText || sampleText.trim().length < 10) {
      return null;
    }

    const clean = sampleText.replace(/<[^>]+>/g, " ");

    // 1. Vietnamese detection using strict diacritic regex (reusing vietnameseHelper)
    if (isVietnameseText(clean)) {
      return {
        langCode: "vi",
        confidence: 0.98,
        details: "Phát hiện ký tự dấu đặc trưng tiếng Việt",
      };
    }

    // 2. Japanese detection: Hiragana (3040-309F) or Katakana (30A0-30FF)
    const japaneseKanaCount = (clean.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
    if (japaneseKanaCount >= 3) {
      return {
        langCode: "ja",
        confidence: 0.99,
        details: "Phát hiện bảng chữ cái Hiragana/Katakana",
      };
    }

    // 3. Korean detection: Hangul Syllables (AC00-D7AF, 1100-11FF)
    const koreanHangulCount = (clean.match(/[\uAC00-\uD7AF\u1100-\u11FF]/g) || []).length;
    if (koreanHangulCount >= 3) {
      return {
        langCode: "ko",
        confidence: 0.99,
        details: "Phát hiện bảng chữ cái Hangul",
      };
    }

    // 4. Chinese detection: Hanzi / CJK Ideographs (4E00-9FFF) without Japanese Kana
    const cjkIdeographCount = (clean.match(/[\u4E00-\u9FFF]/g) || []).length;
    if (cjkIdeographCount >= 5 && japaneseKanaCount === 0) {
      return {
        langCode: "zh",
        confidence: 0.95,
        details: "Phát hiện chữ Hán (CJK Ideographs)",
      };
    }

    // 5. Russian detection: Cyrillic script (0400-04FF)
    const cyrillicCount = (clean.match(/[\u0400-\u04FF]/g) || []).length;
    if (cyrillicCount >= 5) {
      return {
        langCode: "ru",
        confidence: 0.95,
        details: "Phát hiện chữ Kirin (Cyrillic)",
      };
    }

    // 6. Latin-script languages (en, fr, de, es) via stop-word distribution
    const words = clean
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2);

    if (words.length < 5) {
      return null;
    }

    const scores: Record<string, number> = { en: 0, fr: 0, de: 0, es: 0 };
    for (const word of words) {
      for (const [lang, stopSet] of Object.entries(LATIN_STOP_WORDS)) {
        if (stopSet.has(word)) {
          scores[lang] += 1;
        }
      }
    }

    let topLang = "en";
    let topScore = 0;
    let totalStopHits = 0;

    for (const [lang, count] of Object.entries(scores)) {
      totalStopHits += count;
      if (count > topScore) {
        topScore = count;
        topLang = lang;
      }
    }

    if (totalStopHits >= 3 && topScore >= 2) {
      const confidence = Math.min(0.95, Math.max(0.65, topScore / totalStopHits));
      return {
        langCode: topLang,
        confidence: Number(confidence.toFixed(2)),
        details: `Phân tích từ dừng Latin (${topLang}: ${topScore}/${totalStopHits} hits)`,
      };
    }

    return null;
  }

  /**
   * Main entry point: Combines text heuristics and EPUB metadata dc:language.
   *
   * Resolution rule:
   * 1. If heuristics find clear non-Latin script (vi, ja, ko, zh, ru), heuristic always wins.
   * 2. For Latin scripts:
   *    - If heuristic and metadata agree -> source: "combined", confidence = 0.98.
   *    - If heuristic is confident (>= 0.70) and sample has ample text, heuristic wins.
   *    - If heuristic is weak or absent, valid metadata wins (source: "metadata").
   *    - Otherwise, default fallback is "en" with lower confidence.
   */
  public static detectLanguage(
    sampleText: string,
    metadataLang?: string | null
  ): LanguageDetectionResult {
    const metaCode = this.normalizeMetadataCode(metadataLang);
    const heuristic = this.detectFromTextHeuristics(sampleText);

    // Rule 1: Non-Latin or distinctive script detected
    if (heuristic && ["vi", "ja", "ko", "zh", "ru"].includes(heuristic.langCode)) {
      const isAgreed = metaCode === heuristic.langCode;
      return {
        languageCode: heuristic.langCode,
        languageName: SUPPORTED_LANGUAGES_MAP[heuristic.langCode] || "Khác",
        confidence: isAgreed ? 0.99 : heuristic.confidence,
        source: isAgreed ? "combined" : "heuristic",
        details: heuristic.details,
      };
    }

    // Rule 2: Latin text with heuristic match
    if (heuristic) {
      if (metaCode && metaCode === heuristic.langCode) {
        return {
          languageCode: heuristic.langCode,
          languageName: SUPPORTED_LANGUAGES_MAP[heuristic.langCode] || "Khác",
          confidence: 0.98,
          source: "combined",
          details: `Xác nhận chéo: ${heuristic.details} + metadata (${metaCode})`,
        };
      }

      // Strong heuristic (> 0.75) overrides generic metadata
      if (heuristic.confidence >= 0.75) {
        return {
          languageCode: heuristic.langCode,
          languageName: SUPPORTED_LANGUAGES_MAP[heuristic.langCode] || "Khác",
          confidence: heuristic.confidence,
          source: "heuristic",
          details: heuristic.details,
        };
      }
    }

    // Rule 3: Valid metadata fallback
    if (metaCode && SUPPORTED_LANGUAGES_MAP[metaCode]) {
      return {
        languageCode: metaCode,
        languageName: SUPPORTED_LANGUAGES_MAP[metaCode],
        confidence: 0.85,
        source: "metadata",
        details: `Nhận diện từ trường dc:language trong metadata sách (${metadataLang})`,
      };
    }

    // Rule 4: Default fallback to English
    return {
      languageCode: "en",
      languageName: SUPPORTED_LANGUAGES_MAP["en"],
      confidence: 0.5,
      source: "metadata",
      details: "Mặc định (chưa đủ dữ liệu văn bản để khẳng định)",
    };
  }
}
