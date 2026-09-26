/**
 * NiceEbook Studio - Watermark & Header/Footer Cleaner Engine
 * Detects and purges watermark stamps, sharing notes, promotional links,
 * and header/footer debris from Vietnamese ebook portals (dtv-ebook, tve-4u, truyenfull, etc.)
 */

export interface WatermarkCleanOptions {
  customKeywords?: string[];
  stripPageNumbers?: boolean;
  stripHtmlHeadersFooters?: boolean;
}

export interface ChapterCleanResult {
  cleanedHtml: string;
  removedBlocksCount: number;
  inlineFixesCount: number;
  removedSnippets: string[];
}

export interface BookCleanSummary {
  updatedChapters: Record<string, string>;
  totalRemovedBlocks: number;
  totalInlineFixes: number;
  affectedChaptersCount: number;
  detectedSnippets: string[];
}

export const DEFAULT_WATERMARK_KEYWORDS = [
  "dtv-ebook.com",
  "www.dtv-ebook.com",
  "dtv-ebook.vn",
  "dtv-ebook",
  "dtvebook.com",
  "dtvebook",
  "dtv ebook",
  "tve-4u.org",
  "tve-4u.vn",
  "tve-4u",
  "e-thuvien.com",
  "e-thuvien",
  "truyenfull.vn",
  "truyenfull.com",
  "truyenfull",
  "tangthuvien.vn",
  "tangthuvien.com",
  "tangthuvien",
  "bachngocsach.com",
  "bachngocsach",
  "metruyenchu.com",
  "metruyenchu",
  "santruyen.com",
  "santruyen",
  "isach.info",
  "isach",
  "wikidich",
  "wattpad",
  "truyencv",
  "vnvoc.com",
  "vforum.vn",
];

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
 * Repairs broken Vietnamese diacritics caused by split tone marks (e.g. "Hô`ng" -> "Hồng", "lâ`y" -> "lấy")
 */
export function repairVietnameseBrokenDiacritics(text: string): string {
  if (!text) return "";
  let repaired = text;

  // Fix grave accent (huyền): letter followed by backtick `
  repaired = repaired.replace(/([aAăĂâÂeEêÊiIoOôÔơƠuUưƯyY])\s*`\s*/g, (match, char) => {
    return GRAVE_MAP[char] || match;
  });

  // Fix acute accent (sắc): letter followed by single quote or acute '
  repaired = repaired.replace(/([aAăĂâÂeEêÊiIoOôÔơƠuUưƯyY])\s*['´]\s*/g, (match, char) => {
    return ACUTE_MAP[char] || match;
  });

  return repaired;
}

const WATERMARK_PHRASE_REGEXES = [
  // Combined repeating title + author + website header pattern (e.g. from dtv-ebook)
  /(?:[\p{L}\d\s'"`–—\-]{0,70})?(?:https?:\/\/)?(?:www\.)?dtv-ebook\.(?:com|vn)\S*/giu,
  /(?:https?:\/\/)?(?:www\.)?dtvebook\.(?:com|vn)\S*/gi,
  /(?:www\.)?dtv-ebook\.com/gi,
  /https?:\/\/(?:www\.)?tve-4u\.(?:org|vn|com)\S*/gi,
  /https?:\/\/(?:www\.)?e-thuvien\.(?:com|vn)\S*/gi,
  /https?:\/\/(?:www\.)?truyenfull\.(?:vn|com)\S*/gi,
  /https?:\/\/(?:www\.)?tangthuvien\.(?:vn|com)\S*/gi,
  /https?:\/\/(?:www\.)?bachngocsach\.(?:com|vn)\S*/gi,
  /https?:\/\/(?:www\.)?metruyenchu\.(?:com|vn)\S*/gi,
  /https?:\/\/(?:www\.)?santruyen\.(?:com|vn)\S*/gi,
  /https?:\/\/(?:www\.)?isach\.(?:info|net)\S*/gi,
  /(?:chia sẻ bởi|đăng tải tại|nguồn|tải ebook tại|download ebook miễn phí tại|thực hiện bởi)[:\s]+[^\n<]{0,80}(?:dtv-ebook|tve-4u|truyenfull|tangthuvien|bachngocsach|metruyenchu|isach)[^\n<]*/gi,
  /\(?Truyện được chia sẻ tại [^\n<)]+\)?/gi,
  /\(?Chúc (?:các )?bạn đọc truyện vui vẻ\)?/gi,
  /\(?Ủng hộ tác giả bằng cách mua sách gốc\)?/gi,
];

/**
 * Strips HTML tags to extract raw plain text
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks if a line or paragraph text is a pure watermark or header/footer junk block
 */
export function isWatermarkOrJunkText(
  text: string,
  options?: WatermarkCleanOptions
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  // 1. Check for page numbers (e.g. "Trang 15", "Page 3 of 100", "- 42 -")
  if (options?.stripPageNumbers !== false) {
    if (
      /^[-–—\s]*\d+[-–—\s]*$/.test(trimmed) ||
      /^(?:Trang|Page)\s+\d+(?:\s*(?:\/|of)\s*\d+)?$/i.test(trimmed)
    ) {
      return true;
    }
  }

  // If text is long (> 300 chars), it is narrative content, not a pure watermark block
  if (trimmed.length > 320) {
    return false;
  }

  const lower = trimmed.toLowerCase();

  // 2. Check if the block is essentially just a watermark domain / brand
  for (const kw of DEFAULT_WATERMARK_KEYWORDS) {
    if (
      lower === kw ||
      lower === `www.${kw}` ||
      lower.startsWith(`${kw} `) ||
      lower.endsWith(` ${kw}`)
    ) {
      return true;
    }
  }

  // 3. Check custom user keywords
  if (options?.customKeywords) {
    for (const kw of options.customKeywords) {
      const cleanKw = kw.trim().toLowerCase();
      if (
        cleanKw.length > 0 &&
        (lower === cleanKw || lower.startsWith(`${cleanKw} `) || lower.endsWith(` ${cleanKw}`))
      ) {
        return true;
      }
    }
  }

  // 4. Check if text matches watermark phrases and has negligible remaining story content
  const { cleanedText, fixesCount } = stripInlineWatermarks(trimmed, options?.customKeywords);
  if (fixesCount > 0) {
    const strippedRemaining = cleanedText
      .replace(/^(?:Nguồn|Chia sẻ bởi|Đăng tải tại|Thực hiện bởi|Website|Trang web)[:\s\-–—]*/i, "")
      .trim();
    if (strippedRemaining.length < 10) {
      return true;
    }
  }

  return false;
}

/**
 * Strips inline watermark strings embedded within narrative sentences
 * e.g., "Kiếm quang rực sáng. (Truyện được chia sẻ tại dtv-ebook.com) Gió tuyết gầm thét."
 * -> "Kiếm quang rực sáng. Gió tuyết gầm thét."
 */
export function stripInlineWatermarks(
  text: string,
  customKeywords?: string[]
): { cleanedText: string; fixesCount: number } {
  if (!text) return { cleanedText: "", fixesCount: 0 };

  let current = text;
  let fixesCount = 0;

  // Apply phrase regexes
  for (const regex of WATERMARK_PHRASE_REGEXES) {
    regex.lastIndex = 0;
    if (regex.test(current)) {
      current = current.replace(regex, () => {
        fixesCount++;
        return "";
      });
    }
  }

  // Apply custom keywords
  if (customKeywords && customKeywords.length > 0) {
    for (const kw of customKeywords) {
      const trimmedKw = kw.trim();
      if (trimmedKw.length > 2 && current.toLowerCase().includes(trimmedKw.toLowerCase())) {
        const esc = trimmedKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const kwRegex = new RegExp(`\\(?[^\\n()]*${esc}[^\\n()]*\\)?`, "gi");
        current = current.replace(kwRegex, () => {
          fixesCount++;
          return "";
        });
      }
    }
  }

  // Clean remaining double spaces or trailing punctuation artifacts
  current = current.replace(/[ \t]{2,}/g, " ").replace(/\(\s*\)/g, "").trim();

  return { cleanedText: current, fixesCount };
}

/**
 * Thoroughly cleans watermarks from a single chapter HTML string
 */
export function cleanChapterHtmlWatermarks(
  html: string,
  options?: WatermarkCleanOptions
): ChapterCleanResult {
  if (!html) {
    return { cleanedHtml: "", removedBlocksCount: 0, inlineFixesCount: 0, removedSnippets: [] };
  }

  let cleaned = html;
  let removedBlocksCount = 0;
  let inlineFixesCount = 0;
  const removedSnippets: string[] = [];

  // 1. Remove explicit HTML header & footer elements and watermark-classed elements if enabled
  if (options?.stripHtmlHeadersFooters !== false) {
    cleaned = cleaned.replace(/<(?:header|footer)\b[^>]*>[\s\S]*?<\/(?:header|footer)>/gi, (match) => {
      removedBlocksCount++;
      removedSnippets.push(stripHtmlTags(match).slice(0, 80));
      return "";
    });

    cleaned = cleaned.replace(
      /<(?:div|p|section)\b[^>]*class="[^"]*(?:watermark|dtv-watermark|copyright-note|ads|sharing-note)[^"]*"[^>]*>[\s\S]*?<\/(?:div|p|section)>/gi,
      (match) => {
        removedBlocksCount++;
        removedSnippets.push(stripHtmlTags(match).slice(0, 80));
        return "";
      }
    );
  }

  // 2. Parse block elements (<p>, <div>, <h1>-<h6>, <blockquote>)
  const blockRegex = /<((?:p|div|h[1-6]|section|blockquote))\b[^>]*>[\s\S]*?<\/\1>/gi;

  cleaned = cleaned.replace(blockRegex, (rawBlock) => {
    const plainText = stripHtmlTags(rawBlock);

    // If the entire block is a watermark or junk line, eliminate it
    if (isWatermarkOrJunkText(plainText, options)) {
      removedBlocksCount++;
      removedSnippets.push(plainText.slice(0, 80));
      return "";
    }

    // Otherwise, check if there are inline watermarks to clean inside this block
    const { cleanedText, fixesCount } = stripInlineWatermarks(plainText, options?.customKeywords);
    const repairedText = repairVietnameseBrokenDiacritics(cleanedText);
    if (fixesCount > 0 || repairedText !== plainText) {
      if (fixesCount > 0) inlineFixesCount += fixesCount;
      // Replace text inside block while keeping outer tags
      const openTagMatch = rawBlock.match(/^<[a-z0-9]+\b[^>]*>/i);
      const closeTagMatch = rawBlock.match(/<\/[a-z0-9]+>$/i);
      if (openTagMatch && closeTagMatch) {
        return `${openTagMatch[0]}${repairedText}${closeTagMatch[0]}`;
      }
    }

    return rawBlock;
  });

  return {
    cleanedHtml: cleaned,
    removedBlocksCount,
    inlineFixesCount,
    removedSnippets,
  };
}

/**
 * Cleans watermarks across all chapters in a book
 */
export function cleanAllChaptersWatermarks(
  chapters: Record<string, string>,
  options?: WatermarkCleanOptions
): BookCleanSummary {
  const updatedChapters: Record<string, string> = {};
  let totalRemovedBlocks = 0;
  let totalInlineFixes = 0;
  let affectedChaptersCount = 0;
  const detectedSnippets: string[] = [];

  for (const [href, html] of Object.entries(chapters)) {
    const result = cleanChapterHtmlWatermarks(html, options);

    if (result.removedBlocksCount > 0 || result.inlineFixesCount > 0) {
      affectedChaptersCount++;
      totalRemovedBlocks += result.removedBlocksCount;
      totalInlineFixes += result.inlineFixesCount;
      detectedSnippets.push(...result.removedSnippets);
      updatedChapters[href] = result.cleanedHtml;
    } else {
      updatedChapters[href] = html;
    }
  }

  return {
    updatedChapters,
    totalRemovedBlocks,
    totalInlineFixes,
    affectedChaptersCount,
    detectedSnippets: Array.from(new Set(detectedSnippets)),
  };
}

export interface DetectedWatermarkReport {
  hasWatermarks: boolean;
  affectedChaptersCount: number;
  totalChaptersCount: number;
  detectedDomains: string[];
  detectedPatterns: string[];
  sampleSnippets: string[];
}

/**
 * Automatically inspects all chapters of a book to search and detect watermarks and broken diacritics
 */
export function detectBookWatermarks(
  chapters: Array<{ href: string; title: string; preview_text?: string }>
): DetectedWatermarkReport {
  const detectedDomains = new Set<string>();
  const detectedPatterns = new Set<string>();
  const sampleSnippets: string[] = [];
  let affectedChaptersCount = 0;

  for (const ch of chapters) {
    const textToCheck = `${ch.title} ${ch.preview_text || ""}`;
    let chapterHasWatermark = false;

    // Check keywords
    for (const kw of DEFAULT_WATERMARK_KEYWORDS) {
      if (textToCheck.toLowerCase().includes(kw)) {
        detectedDomains.add(kw);
        detectedPatterns.add(kw);
        chapterHasWatermark = true;
      }
    }

    // Check regexes
    for (const regex of WATERMARK_PHRASE_REGEXES) {
      regex.lastIndex = 0;
      const match = regex.exec(textToCheck);
      if (match) {
        detectedPatterns.add(match[0]);
        chapterHasWatermark = true;
      }
    }

    // Check broken diacritics
    if (/[aAăĂâÂeEêÊiIoOôÔơƠuUưƯyY]\s*[`'´]/.test(textToCheck)) {
      detectedPatterns.add("Lỗi tách dấu tiếng Việt (` / ')");
      chapterHasWatermark = true;
    }

    if (chapterHasWatermark) {
      affectedChaptersCount++;
      if (sampleSnippets.length < 3 && ch.preview_text) {
        sampleSnippets.push(ch.preview_text.slice(0, 100));
      }
    }
  }

  return {
    hasWatermarks: affectedChaptersCount > 0,
    affectedChaptersCount,
    totalChaptersCount: chapters.length,
    detectedDomains: Array.from(detectedDomains),
    detectedPatterns: Array.from(detectedPatterns),
    sampleSnippets,
  };
}
