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
  tagsMap?: Record<string, string>;
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
   * Cleans Ruby furigana tags (<rt>, <rp>) for East Asian text (Japanese/Chinese),
   * keeping only the base text so LLM translates clean text without duplicate reading pronunciations.
   * (e.g. <ruby>漢字<rt>かんじ</rt></ruby> => 漢字)
   */
  public static cleanRubyText(html: string): string {
    if (!html || !html.includes("<ruby")) return html;
    return html.replace(/<ruby\b[^>]*>([\s\S]*?)<\/ruby>/gi, (_, inner) => {
      return inner
        .replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, "")
        .replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, "")
        .trim();
    });
  }

  /**
   * Masks inline markup using secure tokens:
   * - Pure symbols/footnotes (<a href="#fn1">[1]</a>, <img/>, empty anchors) are masked as standalone ⟦TAG_N⟧
   * - Text-bearing links and spans (<a href="...">Chapter 2</a>, <span class="...">Title</span>)
   *   are wrapped in paired tokens (⟦TAG_N⟧...⟦/TAG_N⟧) so the LLM translates the inner text!
   */
  public static maskInlineMarkup(html: string): { maskedHtml: string; tagsMap: Map<string, string> } {
    const tagsMap = new Map<string, string>();
    if (!html) return { maskedHtml: "", tagsMap };

    // 1. Clean ruby furigana first
    const cleaned = this.cleanRubyText(html);
    let counter = 0;

    // Matches inline markup strictly in document order:
    // Pattern 1: Footnotes <span class="footnote">...</span> or <sup>...</sup>
    // Pattern 2: Container tags <a ...>...</a>, <span ...>...</span>, <abbr>...</abbr>, <cite>...</cite>
    // Pattern 3: Standalone tags <img ...>, self-closing <a .../>, <code>...</code>
    const inlineTagRegex = /<(?:span|sup)\b[^>]*class=["'][^"']*(?:footnote|noteref)[^"']*["'][^>]*>[\s\S]*?<\/(?:span|sup)>|<sup\b[^>]*>[\s\S]*?<\/sup>|<(?:a|span|abbr|cite|dfn)\b[^>]*>[\s\S]*?<\/(?:a|span|abbr|cite|dfn)>|<img\b[^>]*\/?>|<a\b[^>]*\/?>|<code\b[^>]*>[\s\S]*?<\/code>/gi;

    const maskedHtml = cleaned.replace(inlineTagRegex, (fullMatch) => {
      // 1. Footnote container
      if (/<(?:span|sup)\b[^>]*class=["'][^"']*(?:footnote|noteref)/i.test(fullMatch) || fullMatch.toLowerCase().startsWith("<sup")) {
        const placeholder = `⟦TAG_${counter++}⟧`;
        tagsMap.set(placeholder, fullMatch);
        return placeholder;
      }

      // 2. Standalone tags: <img>, self-closing <a />, <code>...</code>
      if (/^<img\b|^<code\b|^<a\b[^>]*\/>/i.test(fullMatch)) {
        const placeholder = `⟦TAG_${counter++}⟧`;
        tagsMap.set(placeholder, fullMatch);
        return placeholder;
      }

      // 3. Paired tags: <a ...>...</a>, <span ...>...</span>, etc.
      const match = /^<([a-z0-9]+)\b([^>]*)>([\s\S]*?)<\/\1>$/i.exec(fullMatch);
      if (match) {
        const tagName = match[1].toLowerCase();
        const attrs = match[2];
        const innerText = match[3];

        // Do not mask dropcap span so initial letter stays in translatable sentence
        if (tagName === "span" && /class=["'][^"']*(?:dropcap|first-letter|lettrine)[^"']*["']/i.test(attrs)) {
          return fullMatch;
        }

        const trimmed = innerText.trim();
        const isPureSymbol =
          trimmed.length === 0 ||
          (trimmed.length <= 8 &&
            (/^\[?\d+[a-z]?\]?$/i.test(trimmed) ||
             /^\[?[a-z]?\d+\]?$/i.test(trimmed) ||
             /^[*\-–—†‡#•↩\s]+$/.test(trimmed) ||
             /^\[[a-z]{1,4}\]$/i.test(trimmed) ||
             /^<img\b/i.test(trimmed)));

        if (isPureSymbol) {
          const placeholder = `⟦TAG_${counter++}⟧`;
          tagsMap.set(placeholder, fullMatch);
          return placeholder;
        } else {
          // Text-bearing container: MUST translate inner text!
          const openToken = `⟦TAG_${counter}⟧`;
          const closeToken = `⟦/TAG_${counter}⟧`;
          counter++;

          tagsMap.set(openToken, `<${tagName}${attrs}>`);
          tagsMap.set(closeToken, `</${tagName}>`);

          return `${openToken}${innerText}${closeToken}`;
        }
      }

      return fullMatch;
    });

    return { maskedHtml, tagsMap };
  }

  /**
   * Unmasks tokens back into byte-identical original markup with full fail-safe recovery:
   * - Restores tokens in-place to preserve exact position within sentence
   * - Deduplicates if the model accidentally hallucinated duplicate tokens
   * - Re-appends missing tags to the end if model omitted the placeholder token
   */
  public static unmaskInlineMarkup(
    text: string,
    tagsMap: Map<string, string> | Record<string, string>
  ): { restoredText: string; missingPlaceholders: string[] } {
    const map = tagsMap instanceof Map ? tagsMap : new Map(Object.entries(tagsMap || {}));
    if (!text || map.size === 0) {
      return { restoredText: text, missingPlaceholders: [] };
    }

    let restored = text;
    const missingPlaceholders: string[] = [];

    for (const [placeholder, originalMarkup] of map.entries()) {
      if (restored.includes(placeholder)) {
        // Replace first occurrence with actual markup
        const firstIndex = restored.indexOf(placeholder);
        restored =
          restored.slice(0, firstIndex) +
          originalMarkup +
          restored.slice(firstIndex + placeholder.length);

        // Strip duplicate occurrences of the same placeholder if model hallucinated
        while (restored.includes(placeholder)) {
          restored = restored.replace(placeholder, "");
        }
      } else {
        // Only mark missing if it is a standalone tag or an opening tag (not closing tag ⟦/TAG_N⟧)
        if (!placeholder.startsWith("⟦/")) {
          missingPlaceholders.push(placeholder);
        }
      }
    }

    // Fail-safe: If model lost any placeholder, append original markup
    if (missingPlaceholders.length > 0) {
      for (const missing of missingPlaceholders) {
        const orig = map.get(missing);
        const closeToken = missing.replace(/^⟦/, "⟦/");
        const closeMarkup = map.get(closeToken);

        if (orig && !restored.includes(orig)) {
          if (closeMarkup) {
            // Re-wrap or append paired tag
            restored += `${orig}${closeMarkup}`;
          } else {
            // Standalone tag
            restored += orig;
          }
        }
      }
    }

    return { restoredText: restored, missingPlaceholders };
  }

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
      // Apply LinguaGacha-style inline markup masking & ruby cleaning
      const { maskedHtml, tagsMap } = this.maskInlineMarkup(innerHtml);
      const plainText = this.stripHtmlToPlainText(maskedHtml);

      // Skip blocks with no translatable text (e.g. empty spacers, raw image containers)
      if (!plainText || plainText.length === 0) {
        continue;
      }

      // If a container block (like <blockquote>, <li>, <dd>, <td>) contains nested block elements (<p>, <h1>..<h6>, <li>),
      // skip the outer container so that child blocks are individually translated without losing their child structure!
      if ((tag === "blockquote" || tag === "li" || tag === "dt" || tag === "dd" || tag === "td" || tag === "th") &&
          /<(?:p|h[1-6]|blockquote|li|table|ul|ol)\b/i.test(innerHtml)) {
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
        tagsMap: tagsMap.size > 0 ? Object.fromEntries(tagsMap) : undefined,
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

      const { maskedHtml, tagsMap } = this.maskInlineMarkup(innerHtml);
      const plainText = this.stripHtmlToPlainText(maskedHtml);
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
        tagsMap: tagsMap.size > 0 ? Object.fromEntries(tagsMap) : undefined,
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
      let translatedText = this.applyGlossary(rawTranslation.trim(), glossary);

      // Unmask LinguaGacha-style inline tags back to byte-identical original XHTML markup
      if (block.tagsMap && Object.keys(block.tagsMap).length > 0) {
        const { restoredText } = this.unmaskInlineMarkup(translatedText, block.tagsMap);
        translatedText = restoredText;
      }

      // Heuristic fail-safe: If original inner HTML contained links or footnotes and the model omitted them,
      // re-append the missing link/footnote elements to the end of translatedText so critical links are never lost.
      const linkRegex = /<(?:span|sup)\b[^>]*class=["'][^"']*(?:footnote|noteref)[^"']*["'][^>]*>[\s\S]*?<\/(?:span|sup)>|<a\b[^>]*>[\s\S]*?<\/a>/gi;
      let fnMatch: RegExpExecArray | null;
      const missingLinks: string[] = [];
      while ((fnMatch = linkRegex.exec(block.originalInnerHtml)) !== null) {
        const fnHtml = fnMatch[0];
        // Check if the link destination (href or id) is already preserved in translatedText,
        // even if its inner text was translated into the target language!
        const hrefMatch = /href=["']([^"']*)["']/i.exec(fnHtml);
        const idMatch = /id=["']([^"']*)["']/i.exec(fnHtml);

        let isAlreadyPresent = false;
        if (hrefMatch && hrefMatch[1]) {
          isAlreadyPresent = translatedText.includes(`href="${hrefMatch[1]}"`) || translatedText.includes(`href='${hrefMatch[1]}'`);
        } else if (idMatch && idMatch[1]) {
          isAlreadyPresent = translatedText.includes(`id="${idMatch[1]}"`) || translatedText.includes(`id='${idMatch[1]}'`);
        } else {
          isAlreadyPresent = translatedText.includes(fnHtml);
        }

        if (!isAlreadyPresent) {
          missingLinks.push(fnHtml);
        }
      }
      const finalTranslatedText = missingLinks.length > 0
        ? `${translatedText}${missingLinks.join("")}`
        : translatedText;

      // Preserve <br /> line breaks if original had <br>
      let formattedTranslatedText = finalTranslatedText;
      if (/<br\b[^>]*\/?>/i.test(block.originalInnerHtml)) {
        if (formattedTranslatedText.includes("\n")) {
          formattedTranslatedText = formattedTranslatedText.replace(/\n+/g, "<br />");
        } else if (!formattedTranslatedText.includes("<br")) {
          const headingSplitMatch = /^(Chương\s+[^\s:–—]+|Chapter\s+[^\s:–—]+|Hồi\s+[^\s:–—]+|Phần\s+[^\s:–—]+|Tiết\s+[^\s:–—]+|第[^\s:–—]+章)\s*[:：–—]\s*(.*)$/i.exec(formattedTranslatedText);
          if (headingSplitMatch) {
            formattedTranslatedText = `${headingSplitMatch[1]}<br />${headingSplitMatch[2]}`;
          }
        }
      }

      // Preserve Drop Cap / Initial Letter formatting from original block
      const dropCapRegex = /^(\s*<span\b[^>]*class=["'][^"']*(?:dropcap|first-letter|lettrine|initial|cap)[^"']*["'][^>]*>)([\s\S]*?)(<\/span>\s*)/i;
      const dropCapMatch = dropCapRegex.exec(block.originalInnerHtml);
      if (dropCapMatch && formattedTranslatedText && !dropCapMatch[1].includes("footnote")) {
        const openTag = dropCapMatch[1];
        const closeTag = dropCapMatch[3];
        if (!formattedTranslatedText.includes(openTag)) {
          const firstChar = formattedTranslatedText.charAt(0);
          const rest = formattedTranslatedText.slice(1);
          formattedTranslatedText = `${openTag}${firstChar}${closeTag}${rest}`;
        }
      }

      // Preserve whole-block inline styling wrappers (e.g. <em>...</em>, <strong>...</strong>, <i>...</i>, <b>...</b>)
      const blockWrapperRegex = /^\s*<((?:em|strong|i|b|cite|u))\b([^>]*)>([\s\S]*?)<\/\1>\s*$/i;
      const wrapperMatch = blockWrapperRegex.exec(block.originalInnerHtml);
      if (wrapperMatch && formattedTranslatedText) {
        const wrapTag = wrapperMatch[1];
        const wrapAttrs = wrapperMatch[2];
        if (!formattedTranslatedText.startsWith(`<${wrapTag}`) && !formattedTranslatedText.endsWith(`</${wrapTag}>`)) {
          formattedTranslatedText = `<${wrapTag}${wrapAttrs}>${formattedTranslatedText}</${wrapTag}>`;
        }
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
