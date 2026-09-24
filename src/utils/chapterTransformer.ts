export interface ChapterBlock {
  id: string; // "p_0", "p_1", etc.
  index: number;
  tagName: string;
  rawHtml: string;
  text: string;
}

export interface HeadingInsertion {
  level: "h2" | "h3";
  title: string;
  before_paragraph_index: number;
}

export interface SpellingCorrection {
  paragraph_id: string;
  original: string;
  corrected: string;
  reason: string;
}

export interface ChapterEnhancePlan {
  h1_title?: string;
  top_junk_indices?: number[];
  headings?: HeadingInsertion[];
  spelling_corrections?: SpellingCorrection[];
}

export interface ChapterEnhanceResult {
  updatedHtml: string;
  canonicalH1: string | null;
  cleanedTopIndices: number[];
  insertedHeadings: Array<{ level: string; title: string; targetIndex: number }>;
  appliedCorrections: Array<SpellingCorrection & { status: "applied" | "skipped" }>;
}

export class ChapterTransformer {
  /**
   * Strips HTML tags to extract readable plain text from a segment
   */
  public static stripHtml(html: string): string {
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
   * Parses the HTML string and extracts individual block elements from the <body>
   */
  public static extractBlocks(html: string): {
    headerPrefix: string;
    blocks: ChapterBlock[];
    footerSuffix: string;
  } {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (!bodyMatch) {
      // Fallback if no body tag exists
      return {
        headerPrefix: "",
        blocks: [
          {
            id: "p_0",
            index: 0,
            tagName: "div",
            rawHtml: html,
            text: SelfStrip(html),
          },
        ],
        footerSuffix: "",
      };
    }

    const bodyOpenIdx = html.indexOf(bodyMatch[0]);
    const bodyTagClose = html.indexOf(">", bodyOpenIdx) + 1;
    const bodyEndIdx = html.toLowerCase().indexOf("</body>", bodyTagClose);

    const headerPrefix = html.slice(0, bodyTagClose);
    const bodyInner = html.slice(bodyTagClose, bodyEndIdx);
    const footerSuffix = html.slice(bodyEndIdx);

    // Match block-level elements (<p>, <div>, <h1>-<h6>, <section>, <blockquote>)
    const blockRegex = /<((?:p|div|h[1-6]|section|blockquote))\b[^>]*>[\s\S]*?<\/\1>|<(hr|br)\b[^>]*\/?>/gi;
    const blocks: ChapterBlock[] = [];
    let match: RegExpExecArray | null;
    let blockIndex = 0;
    let lastIndex = 0;

    while ((match = blockRegex.exec(bodyInner)) !== null) {
      // If there is significant text between blocks, capture it
      const skippedText = bodyInner.slice(lastIndex, match.index).trim();
      if (skippedText.length > 0 && SelfStrip(skippedText).length > 0) {
        blocks.push({
          id: `p_${blockIndex}`,
          index: blockIndex,
          tagName: "p",
          rawHtml: `<p>${skippedText}</p>`,
          text: SelfStrip(skippedText),
        });
        blockIndex++;
      }

      const raw = match[0];
      const tag = match[1] || match[2] || "p";
      const text = SelfStrip(raw);

      blocks.push({
        id: `p_${blockIndex}`,
        index: blockIndex,
        tagName: tag.toLowerCase(),
        rawHtml: raw,
        text,
      });

      blockIndex++;
      lastIndex = blockRegex.lastIndex;
    }

    // Capture trailing text
    const trailingText = bodyInner.slice(lastIndex).trim();
    if (trailingText.length > 0 && SelfStrip(trailingText).length > 0) {
      blocks.push({
        id: `p_${blockIndex}`,
        index: blockIndex,
        tagName: "p",
        rawHtml: `<p>${trailingText}</p>`,
        text: SelfStrip(trailingText),
      });
    }

    return {
      headerPrefix,
      blocks,
      footerSuffix,
    };
  }

  /**
   * Safely replaces target words inside a block's HTML without corrupting tag attributes
   */
  public static replaceInBlockHtml(rawHtml: string, original: string, corrected: string): {
    updated: string;
    changed: boolean;
  } {
    if (!original || !rawHtml.includes(original)) {
      return { updated: rawHtml, changed: false };
    }

    // Split HTML into tags and text chunks
    const parts = rawHtml.split(/(<[^>]+>)/g);
    let changed = false;

    const newParts = parts.map((part) => {
      // If part is an HTML tag, don't modify it
      if (part.startsWith("<") && part.endsWith(">")) {
        return part;
      }
      if (part.includes(original)) {
        changed = true;
        return part.split(original).join(corrected);
      }
      return part;
    });

    return {
      updated: newParts.join(""),
      changed,
    };
  }

  /**
   * Transforms the chapter HTML based on the enhance plan:
   * 1. Applies spelling fixes by paragraph id
   * 2. Cleans top junk elements
   * 3. Injects standardized H1
   * 4. Injects H2/H3 subheadings before target paragraph indices
   */
  public static applyPlan(html: string, plan: ChapterEnhancePlan): ChapterEnhanceResult {
    const { headerPrefix, blocks, footerSuffix } = this.extractBlocks(html);

    const junkSet = new Set(plan.top_junk_indices || []);
    const appliedCorrections: Array<SpellingCorrection & { status: "applied" | "skipped" }> = [];

    // Map blocks by ID and index
    const blocksMap = new Map<number, ChapterBlock>();
    blocks.forEach((b) => blocksMap.set(b.index, { ...b }));

    // 1. Apply spelling corrections
    if (plan.spelling_corrections && plan.spelling_corrections.length > 0) {
      for (const corr of plan.spelling_corrections) {
        // Resolve target index from paragraph_id e.g. "p_7" -> 7
        const match = corr.paragraph_id.match(/p_?(\d+)/i);
        const targetIdx = match ? parseInt(match[1], 10) : -1;
        const block = targetIdx >= 0 ? blocksMap.get(targetIdx) : undefined;

        if (block) {
          const { updated, changed } = this.replaceInBlockHtml(block.rawHtml, corr.original, corr.corrected);
          if (changed) {
            block.rawHtml = updated;
            block.text = SelfStrip(updated);
            appliedCorrections.push({ ...corr, status: "applied" });
          } else {
            appliedCorrections.push({ ...corr, status: "skipped" });
          }
        } else {
          appliedCorrections.push({ ...corr, status: "skipped" });
        }
      }
    }

    // 2. Prepare headings lookup by target index
    const headingsByTarget = new Map<number, HeadingInsertion[]>();
    const insertedHeadings: Array<{ level: string; title: string; targetIndex: number }> = [];

    if (plan.headings && plan.headings.length > 0) {
      for (const h of plan.headings) {
        const list = headingsByTarget.get(h.before_paragraph_index) || [];
        list.push(h);
        headingsByTarget.set(h.before_paragraph_index, list);
        insertedHeadings.push({
          level: h.level.toLowerCase(),
          title: h.title,
          targetIndex: h.before_paragraph_index,
        });
      }
    }

    // 3. Assemble new body content
    const bodyPieces: string[] = [];

    // Optional canonical H1 injection
    if (plan.h1_title && plan.h1_title.trim().length > 0) {
      bodyPieces.push(`<h1 class="chapter-title">${escapeXml(plan.h1_title.trim())}</h1>\n`);
    }

    // Iterate through blocks and assemble
    for (let i = 0; i < blocks.length; i++) {
      // Check if any headings need to be inserted before this paragraph
      const headingsBefore = headingsByTarget.get(i);
      if (headingsBefore) {
        for (const h of headingsBefore) {
          const tag = h.level === "h3" ? "h3" : "h2";
          bodyPieces.push(`<${tag} class="chapter-subheading">${escapeXml(h.title.trim())}</${tag}>\n`);
        }
      }

      // Check if this block is marked as top junk
      if (junkSet.has(i)) {
        // Skip junk block
        continue;
      }

      const currentBlock = blocksMap.get(i);
      if (currentBlock) {
        // If we injected a canonical H1, remove any duplicate raw <h1> at the top
        if (plan.h1_title && currentBlock.tagName === "h1") {
          continue;
        }
        bodyPieces.push(currentBlock.rawHtml + "\n");
      }
    }

    // Reconstruct full HTML document
    let updatedHtml = `${headerPrefix}\n${bodyPieces.join("")}${footerSuffix}`;

    return {
      updatedHtml,
      canonicalH1: plan.h1_title || null,
      cleanedTopIndices: Array.from(junkSet),
      insertedHeadings,
      appliedCorrections,
    };
  }
}

function SelfStrip(html: string): string {
  return ChapterTransformer.stripHtml(html);
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
