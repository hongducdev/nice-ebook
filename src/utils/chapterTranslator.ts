/**
 * ChapterTranslator: Surgical XHTML chapter parser and translator engine.
 *
 * Designed to preserve 100% of EPUB XHTML markup integrity:
 * - Does not re-serialize or parse into a destructive DOM tree that loses namespaces,
 *   self-closing tags (<img />, <br />), entities or doctype.
 * - Extracts block elements (<p>, <h1-h6>, <blockquote>, <li>) with character offsets.
 * - Replaces text in reverse order so string offsets stay invariant.
 * - Fallbacks to original text if a block translation is missing or dropped by LLM.
 * - Supports both "replace" and "bilingual" (interlinear sibling paragraph) layout modes.
 */

export interface TranslatableBlock {
  id: string; // e.g. "p_0", "p_1"
  index: number;
  tag: string; // "p", "h1", "h2", "blockquote", etc.
  attributes: string; // raw attributes string, e.g. ' class="scene" id="c1"'
  startIndex: number;
  endIndex: number;
  innerStartIndex: number;
  innerEndIndex: number;
  originalInnerHtml: string;
  originalText: string;
}

export interface ChunkOptions {
  maxBlocks?: number;
  maxChars?: number;
}

export interface TranslationApplyOptions {
  mode: "replace" | "bilingual";
  glossary?: Record<string, string>;
  bilingualCssClass?: string;
  translatedTitle?: string;
}

export class ChapterTranslator {
  /**
   * Helper to strip HTML tags and decode common entities to plain text
   */
  public static stripHtmlToPlainText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .trim();
  }

  /**
   * Scans an XHTML chapter string and extracts all text-bearing block elements
   * while recording precise string slice offsets.
   */
  public static extractTranslatableBlocks(html: string): TranslatableBlock[] {
    const rawBlocks: Array<Omit<TranslatableBlock, "id" | "index">> = [];
    
    // Look only inside <body> if present to avoid altering <head> or metadata
    const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
    const searchArea = bodyMatch ? bodyMatch[1] : html;
    const offsetBase = bodyMatch ? bodyMatch.index + bodyMatch[0].indexOf(">") + 1 : 0;

    // 1. Matches standard block elements: <p>, <h1>..<h6>, <blockquote>, <li>, <dt>, <dd>, <figcaption>, <td>, <th>, <caption>, <pre>
    const standardBlockRegex = /<((?:p|h[1-6]|blockquote|li|dt|dd|figcaption|td|th|caption|pre))\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;

    while ((match = standardBlockRegex.exec(searchArea)) !== null) {
      const tag = match[1].toLowerCase();
      const attributes = match[2];
      const innerHtml = match[3];

      // Extract plain text to evaluate if the block has actual translatable content
      const plainText = this.stripHtmlToPlainText(innerHtml);

      // Skip blocks with no translatable text (e.g. empty spacers, raw image containers)
      if (!plainText || plainText.length === 0) {
        continue;
      }

      // Check if the block is solely an image tag without caption text
      if (/^\s*<img\b[^>]*\/?>\s*$/i.test(innerHtml)) {
        continue;
      }

      const blockStart = offsetBase + match.index;
      const blockEnd = blockStart + match[0].length;
      const openTagLength = 1 + match[1].length + attributes.length + 1;
      const innerStart = blockStart + openTagLength;
      const innerEnd = innerStart + innerHtml.length;

      rawBlocks.push({
        tag,
        attributes,
        startIndex: blockStart,
        endIndex: blockEnd,
        innerStartIndex: innerStart,
        innerEndIndex: innerEnd,
        originalInnerHtml: innerHtml,
        originalText: plainText,
      });
    }

    // 2. Secondary pass: Innermost / leaf <div> elements that contain standalone translatable text
    // (such as <div class="chapter-title">Chapter 1</div> or chapters styled solely using <div>)
    // without containing nested <div> or other block elements, or overlapping already captured blocks.
    // The negative lookahead `(?:(?!<div\b)[\s\S])*?` guarantees we only target the innermost <div> tags.
    const leafDivRegex = /<div\b([^>]*)>((?:(?!<div\b)[\s\S])*?)<\/div>/gi;
    while ((match = leafDivRegex.exec(searchArea)) !== null) {
      const attributes = match[1];
      const innerHtml = match[2];

      const blockStart = offsetBase + match.index;
      const blockEnd = blockStart + match[0].length;

      // Skip if this div encloses or overlaps any already extracted standard block
      const hasOverlap = rawBlocks.some(
        (b) =>
          (b.startIndex >= blockStart && b.endIndex <= blockEnd) ||
          (blockStart >= b.startIndex && blockEnd <= b.endIndex)
      );
      if (hasOverlap) {
        continue;
      }

      // Skip if the div contains nested block-level markup
      if (/<(?:p|h[1-6]|blockquote|li|table|ul|ol|header|section|article)\b/i.test(innerHtml)) {
        continue;
      }

      const plainText = this.stripHtmlToPlainText(innerHtml);
      if (!plainText || plainText.length === 0) {
        continue;
      }
      if (/^\s*<img\b[^>]*\/?>\s*$/i.test(innerHtml)) {
        continue;
      }

      const openTagLength = 1 + 3 + attributes.length + 1; // "<div" + attrs + ">"
      const innerStart = blockStart + openTagLength;
      const innerEnd = innerStart + innerHtml.length;

      rawBlocks.push({
        tag: "div",
        attributes,
        startIndex: blockStart,
        endIndex: blockEnd,
        innerStartIndex: innerStart,
        innerEndIndex: innerEnd,
        originalInnerHtml: innerHtml,
        originalText: plainText,
      });
    }

    // 3. Sort ascending by startIndex to guarantee deterministic layout order and sequential IDs
    rawBlocks.sort((a, b) => a.startIndex - b.startIndex);

    return rawBlocks.map((b, idx) => ({
      ...b,
      id: `p_${idx}`,
      index: idx,
    }));
  }

  /**
   * Chunks extracted blocks into manageable batches to maintain context
   * without exceeding LLM context windows (default: 10-15 blocks or ~1500 chars).
   */
  public static chunkBlocks(
    blocks: TranslatableBlock[],
    options?: ChunkOptions
  ): TranslatableBlock[][] {
    const maxBlocks = options?.maxBlocks ?? 12;
    const maxChars = options?.maxChars ?? 2000;

    const chunks: TranslatableBlock[][] = [];
    let currentChunk: TranslatableBlock[] = [];
    let currentCharCount = 0;

    for (const block of blocks) {
      const blockCharCount = block.originalText.length;

      if (
        currentChunk.length >= maxBlocks ||
        (currentChunk.length > 0 && currentCharCount + blockCharCount > maxChars)
      ) {
        chunks.push(currentChunk);
        currentChunk = [block];
        currentCharCount = blockCharCount;
      } else {
        currentChunk.push(block);
        currentCharCount += blockCharCount;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Synchronizes or replaces the <title> tag inside the <head> element
   * with the translated chapter title, properly XML-entity encoded.
   */
  public static syncHeadTitle(html: string, translatedTitle?: string): string {
    if (!translatedTitle || !translatedTitle.trim()) {
      return html;
    }
    const cleanTitle = translatedTitle.trim();
    const escaped = cleanTitle
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

    if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)) {
      return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${escaped}</title>`);
    } else if (/<head\b[^>]*>/i.test(html)) {
      return html.replace(/<head\b[^>]*>/i, `$&\n  <title>${escaped}</title>`);
    }
    return html;
  }

  /**
   * Applies custom glossary substitutions to text.
   * Sorts terms by length descending to prevent sub-string collision.
   */
  public static applyGlossary(text: string, glossary?: Record<string, string>): string {
    if (!glossary || Object.keys(glossary).length === 0) {
      return text;
    }

    let result = text;
    const keys = Object.keys(glossary).sort((a, b) => b.length - a.length);

    for (const key of keys) {
      const replacement = glossary[key];
      if (!key || !replacement || key === replacement) continue;

      // Escape special regex characters in the term
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "gi");
      result = result.replace(regex, replacement);
    }

    return result;
  }

  /**
   * Surgically replaces or augments block content in the original XHTML string.
   *
   * In 'replace' mode:
   *   Replaces the block's innerHtml with the translated text (with glossary applied).
   *   Keeps outer tag and all attributes intact.
   *
   * In 'bilingual' mode:
   *   Marks the original element with class="bilingual-original"
   *   and injects an immediately following sibling:
   *   <p class="bilingual-translated" data-bilingual-for="p_0">Translated text</p>
   *
   * By sorting blocks descending by startIndex, string mutations do not invalidate
   * subsequent slice offsets.
   */
  public static applyTranslations(
    originalHtml: string,
    translations: Record<string, string>,
    options: TranslationApplyOptions
  ): string {
    const { mode, glossary } = options;
    const blocks = this.extractTranslatableBlocks(originalHtml);

    if (blocks.length === 0) {
      return originalHtml;
    }

    // Sort descending by startIndex for surgical replacement
    const sortedBlocks = [...blocks].sort((a, b) => b.startIndex - a.startIndex);
    let output = originalHtml;

    for (const block of sortedBlocks) {
      const rawTranslation = translations[block.id];

      // Fail-safe: If model missed or failed this block ID, preserve original block untouched
      if (!rawTranslation || rawTranslation.trim().length === 0) {
        continue;
      }

      // Apply glossary terms if defined
      const translatedText = this.applyGlossary(rawTranslation.trim(), glossary);

      // Heuristic: If original inner HTML contained footnotes/anchors and the model omitted them,
      // re-append the missing footnote elements to the end of translatedText so critical links are never lost.
      const footnoteRegex = /<(?:span|sup)\b[^>]*class=["'][^"']*footnote[^"']*["'][^>]*>[\s\S]*?<\/(?:span|sup)>|<a\b[^>]*href=["']#[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;
      let fnMatch: RegExpExecArray | null;
      const missingFootnotes: string[] = [];
      while ((fnMatch = footnoteRegex.exec(block.originalInnerHtml)) !== null) {
        const fnHtml = fnMatch[0];
        if (!translatedText.includes(fnHtml)) {
          missingFootnotes.push(fnHtml);
        }
      }
      const finalTranslatedText = missingFootnotes.length > 0
        ? `${translatedText}${missingFootnotes.join("")}`
        : translatedText;

      // Preserve <br /> line breaks if original had <br> and translatedText has \n
      let formattedTranslatedText = finalTranslatedText;
      if (/<br\b[^>]*\/?>/i.test(block.originalInnerHtml) && formattedTranslatedText.includes("\n")) {
        formattedTranslatedText = formattedTranslatedText.replace(/\n+/g, "<br />");
      }

      if (mode === "replace") {
        // Surgically replace only inner content, keeping opening and closing tags + attributes intact
        const prefix = output.slice(0, block.innerStartIndex);
        const suffix = output.slice(block.innerEndIndex);
        output = prefix + formattedTranslatedText + suffix;
      } else {
        // Bilingual mode:
        if (block.tag === "td" || block.tag === "th") {
          // Inside table cell: preserve table structure by keeping sibling inside cell
          const prefix = output.slice(0, block.innerStartIndex);
          const originalContent = output.slice(block.innerStartIndex, block.innerEndIndex);
          const suffix = output.slice(block.innerEndIndex);
          const cellContent = `<div class="bilingual-original">${originalContent}</div><div class="bilingual-translated" data-bilingual-for="${block.id}">${formattedTranslatedText}</div>`;
          output = prefix + cellContent + suffix;
        } else {
          // Standard block element: insert sibling paragraph right after </tag>
          const originalOpenTag = `<${block.tag}${block.attributes}>`;
          let updatedOpenTag = originalOpenTag;

          if (/class=["']([^"']*)["']/i.test(block.attributes)) {
            updatedOpenTag = originalOpenTag.replace(
              /class=["']([^"']*)["']/i,
              'class="$1 bilingual-original"'
            );
          } else {
            updatedOpenTag = `<${block.tag} class="bilingual-original"${block.attributes}>`;
          }

          const originalCloseTag = `</${block.tag}>`;
          const translatedTag = `<p class="bilingual-translated" data-bilingual-for="${block.id}">${formattedTranslatedText}</p>`;

          const prefix = output.slice(0, block.startIndex);
          const originalContent = output.slice(block.innerStartIndex, block.innerEndIndex);
          const suffix = output.slice(block.endIndex);

          output = prefix + updatedOpenTag + originalContent + originalCloseTag + "\n" + translatedTag + suffix;
        }
      }
    }

    if (options.translatedTitle) {
      output = this.syncHeadTitle(output, options.translatedTitle);
    }

    return output;
  }
}
