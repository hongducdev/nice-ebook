/**
 * NiceEbook Studio - Automatic Semantic Chapter Paginator & Section Detector
 *
 * Tự động nhận biết các thành phần cấu trúc của sách (Tên sách, Tác giả,
 * Tuyên bố miễn trừ trách nhiệm / Lời tựa, và Tiêu đề chương) để tự động
 * đẩy thành từng trang riêng biệt (page break / pagination) cho cả máy đọc sách
 * (Kindle, Kobo) và trình xem trước.
 */

import { healVietnameseTypographyAndDiacritics } from "./vietnameseHelper";

export interface PaginationResult {
  paginatedHtml: string;
  detectedTitle: string | null;
  detectedAuthor: string | null;
  hasDisclaimerPage: boolean;
  detectedChapterTitle: string | null;
}

/**
 * Tự động nhận biết các khối nội dung và chèn ngắt trang chuẩn EPUB & visual divider
 */
export function autoPaginateAndStructureChapterHtml(rawHtml: string): PaginationResult {
  if (!rawHtml || typeof rawHtml !== "string") {
    return {
      paginatedHtml: "",
      detectedTitle: null,
      detectedAuthor: null,
      hasDisclaimerPage: false,
      detectedChapterTitle: null,
    };
  }

  // 1. Hàn gắn lỗi dấu tiếng Việt trước khi phân tích
  const healed = healVietnameseTypographyAndDiacritics(rawHtml);

  // Tách nội dung thành các khối đoạn văn hoặc dòng
  // Hỗ trợ cả thẻ HTML <p>, <div> hoặc text thuần xuống dòng
  const isHtml = /<[a-z][\s\S]*>/i.test(healed);

  let blocks: string[] = [];
  if (isHtml) {
    // Tách các thẻ <p>, <div>, <h1>-<h6>, <blockquote>
    const regex = /<((?:p|div|h[1-6]|section|blockquote))\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(healed)) !== null) {
      const text = match[2].replace(/<[^>]*>/g, " ").trim();
      if (text.length > 0) {
        blocks.push(text);
      }
    }

    if (blocks.length === 0) {
      // Fallback nếu không khớp thẻ block
      blocks = healed.split(/\n\s*\n/).map((s) => s.replace(/<[^>]*>/g, " ").trim()).filter(Boolean);
    }
  } else {
    blocks = healed.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }

  if (blocks.length === 0) {
    return {
      paginatedHtml: healed,
      detectedTitle: null,
      detectedAuthor: null,
      hasDisclaimerPage: false,
      detectedChapterTitle: null,
    };
  }

  let detectedTitle: string | null = null;
  let detectedAuthor: string | null = null;
  let hasDisclaimerPage = false;
  let disclaimerContent: string | null = null;
  let detectedChapterTitle: string | null = null;
  const chapterBodyParagraphs: string[] = [];

  let state: "title" | "author" | "disclaimer" | "chapter" = "title";

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;

    // Check if this block is a Chapter Marker
    // e.g. "Chương 1. Tám giờ mười lăm phút..." or "Chương 1: Khởi Đầu" or "Hồi 1"
    const chapterMatch = block.match(/^(Chương\s+\d+|Hồi\s+\d+|Chapter\s+\d+|Quyển\s+\d+|Phần\s+\d+|Tiết\s+\d+)([\s:.\-–—]*)(.*)$/i);

    if (chapterMatch) {
      state = "chapter";
      const marker = chapterMatch[1].trim();
      const remainder = chapterMatch[3]?.trim();

      // If remainder is a short title (e.g. "Khởi Đầu") vs full narrative sentence
      // Narrative sentences usually have punctuation or length > 50 chars
      const isShortHeadingTitle = remainder.length > 0 && remainder.length <= 40 && !remainder.includes(".") && !remainder.includes(",");

      if (isShortHeadingTitle) {
        detectedChapterTitle = `${marker}: ${remainder}`;
      } else {
        detectedChapterTitle = marker;
        if (remainder && remainder.length > 0) {
          chapterBodyParagraphs.push(remainder);
        }
      }
      continue;
    }

    if (state === "chapter") {
      chapterBodyParagraphs.push(block);
      continue;
    }

    // Check if this block is Author line
    if (/^(Tác giả|Author|Người viết|Nguyên tác)\s*[:：]/i.test(block)) {
      detectedAuthor = block;
      state = "disclaimer";
      continue;
    }

    // Check if this block is Disclaimer / Copyright line
    if (
      /^(Tuyên bố miễn trừ|Miễn trừ trách nhiệm|Bản quyền|Disclaimer|Lời nói đầu|Thông tin xuất bản|Cuốn sách này)/i.test(block) ||
      block.includes("Kỳ Thư Võng") ||
      block.includes("qinkan.net") ||
      block.includes("miễn trừ trách nhiệm")
    ) {
      hasDisclaimerPage = true;
      disclaimerContent = block;
      state = "chapter";
      continue;
    }

    // First short line is usually the Book Title
    if (!detectedTitle && i === 0 && block.length < 70) {
      detectedTitle = block;
      continue;
    }

    // Otherwise, if state hasn't transitioned, treat as narrative body
    chapterBodyParagraphs.push(block);
  }

  // Build beautiful paginated XHTML with standard e-reader page breaks
  const outputSections: string[] = [];

  const visualPageDivider = `
<div class="page-break-divider" style="page-break-after: always; break-after: page; margin: 3.5rem auto 3rem; text-align: center; border-bottom: 2px dashed rgba(150, 150, 150, 0.35); position: relative;">
  <span style="background: inherit; padding: 0 12px; font-size: 11px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.15em; font-family: sans-serif; font-weight: 600;">
    ─── Trang Kế Tiếp (Page Break) ───
  </span>
</div>`;

  // 1. Trang Tiêu Đề (Title & Author Page)
  if (detectedTitle || detectedAuthor) {
    outputSections.push(`
<section class="book-section book-title-page" style="page-break-before: always; break-before: page; page-break-after: always; break-after: page; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 50vh; text-align: center; padding: 3rem 1.5rem;">
  ${detectedTitle ? `<h1 class="book-main-title" style="font-size: 2.2em; font-weight: 700; line-height: 1.25; margin-bottom: 1.5rem; letter-spacing: 0.05em;">${detectedTitle}</h1>` : ""}
  ${detectedAuthor ? `<p class="book-author-name" style="font-size: 1.2em; font-style: italic; opacity: 0.85; margin-top: 0;">${detectedAuthor}</p>` : ""}
</section>
${visualPageDivider}`);
  }

  // 2. Trang Tuyên Bố Miễn Trừ / Bản Quyền (Disclaimer Page)
  if (hasDisclaimerPage && disclaimerContent) {
    outputSections.push(`
<section class="book-section book-disclaimer-page" style="page-break-before: always; break-before: page; page-break-after: always; break-after: page; padding: 2.5rem 1.5rem; margin: 2rem auto; max-width: 680px;">
  <div style="padding: 1.5rem; border-radius: 8px; border-left: 4px solid currentColor; background: rgba(150, 150, 150, 0.08); font-size: 0.95em; line-height: 1.7; opacity: 0.9;">
    <div style="font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.85em; margin-bottom: 0.75rem; opacity: 0.8;">
      ⚖️ Thông Tin Xuất Bản &amp; Miễn Trừ Trách Nhiệm
    </div>
    <p style="margin: 0; text-indent: 0; text-align: justify;">${disclaimerContent}</p>
  </div>
</section>
${visualPageDivider}`);
  }

  // 3. Trang Thân Bài Chương (Chapter Content Page)
  outputSections.push(`
<section class="book-section chapter-content-page" style="page-break-before: always; break-before: page; padding-top: 1rem;">
  ${detectedChapterTitle ? `<h2 class="chapter-main-heading" style="text-align: center; font-size: 1.8em; font-weight: 700; margin: 1.5em 0 1.2em; letter-spacing: 0.05em;">${detectedChapterTitle}</h2>` : ""}
  ${chapterBodyParagraphs.map((p) => `<p style="text-indent: 1.5em; margin-bottom: 0.6em; text-align: justify;">${p}</p>`).join("\n")}
</section>`);

  const finalHtml = `<div class="chapter-body paginated-flow">${outputSections.join("\n")}</div>`;

  return {
    paginatedHtml: finalHtml,
    detectedTitle,
    detectedAuthor,
    hasDisclaimerPage,
    detectedChapterTitle,
  };
}
