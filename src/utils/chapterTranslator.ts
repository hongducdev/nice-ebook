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
}

export class ChapterTranslator {
  /**
   * Helper to strip HTML tags and decode common entities to plain text
   */
  public static stripHtmlToPlainText(html: string): string {
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
   * Scans an XHTML chapter string and extracts all text-bearing block elements
   * while recording precise string slice offsets.
   */
  public static extractTranslatableBlocks(html: string): TranslatableBlock[] {
    const blocks: TranslatableBlock[] = [];
    
    // Look only inside <body> if present to avoid altering <head> or metadata
    const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
    const searchArea = bodyMatch ? bodyMatch[1] : html;
    const offsetBase = bodyMatch ? bodyMatch.index + bodyMatch[0].indexOf(">") + 1 : 0;

    // Matches standard block elements: <p>, <h1>..<h6>, <blockquote>, <li>
    // Uses non-greedy inner match to handle consecutive blocks cleanly
    const blockRegex = /<((?:p|h[1-6]|blockquote|li))\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;
    let blockIndex = 0;

    while ((match = blockRegex.exec(searchArea)) !== null) {
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

      blocks.push({
        id: `p_${blockIndex}`,
        index: blockIndex,
        tag,
        attributes,
        startIndex: blockStart,
        endIndex: blockEnd,
        innerStartIndex: innerStart,
        innerEndIndex: innerEnd,
        originalInnerHtml: innerHtml,
        originalText: plainText,
      });

      blockIndex++;
    }

    return blocks;
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

      if (mode === "replace") {
        // Surgically replace only inner content, keeping opening and closing tags + attributes intact
        const prefix = output.slice(0, block.innerStartIndex);
        const suffix = output.slice(block.innerEndIndex);
        output = prefix + finalTranslatedText + suffix;
      } else {
        // Bilingual mode:
        // 1. Add class 'bilingual-original' to original tag
        // 2. Insert sibling <p class="bilingual-translated">... right after </tag>
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
        const translatedTag = `<p class="bilingual-translated" data-bilingual-for="${block.id}">${finalTranslatedText}</p>`;

        const prefix = output.slice(0, block.startIndex);
        const originalContent = output.slice(block.innerStartIndex, block.innerEndIndex);
        const suffix = output.slice(block.endIndex);

        output = prefix + updatedOpenTag + originalContent + originalCloseTag + "\n" + translatedTag + suffix;
      }
    }

    return output;
  }
}
