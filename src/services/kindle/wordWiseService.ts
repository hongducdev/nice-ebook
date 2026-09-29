import { findWordWiseLemma, WordWiseDefinition } from "./wordWiseDict";

export interface WordWiseOptions {
  /**
   * Difficulty threshold (1-5).
   * 1 = C2 Rare/Literary only
   * 2 = C1 Advanced+
   * 3 = C1 Upper-intermediate+ (default)
   * 4 = B2 Advanced+
   * 5 = All advanced words (B2-C2)
   */
  maxDifficulty?: 1 | 2 | 3 | 4 | 5;

  /**
   * Definition language: "en" (English) or "vi" (Vietnamese)
   */
  language?: "en" | "vi";

  /**
   * Maximum times to annotate the same word lemma within a single chapter.
   * Default: 3 (avoids cluttering if a word appears 20 times). Set to 0 for unlimited.
   */
  maxOccurrencesPerWord?: number;

  /**
   * Optional custom lemma definitions or AI-generated definitions to supplement the dictionary.
   */
  customLemmas?: Record<string, WordWiseDefinition>;

  /**
   * Optional words to exclude (words the reader already knows).
   */
  ignoredWords?: string[];
}

export interface WordWiseResult {
  html: string;
  annotatedCount: number;
  uniqueLemmasCount: number;
  annotatedLemmas: { lemma: string; count: number; gloss: string; difficulty: number }[];
}

export interface WordWiseAnalysis {
  totalWords: number;
  difficultWordsFound: number;
  difficultyBreakdown: Record<number, number>;
  topDifficultWords: { word: string; lemma: string; difficulty: number; count: number }[];
}

/**
 * Regex that segments HTML into either protected blocks / tags OR text.
 * Group 1: Tags or protected content (<script>, <style>, <code>, <pre>, existing <ruby>)
 * Group 2: Raw text outside tags
 */
const HTML_TOKEN_REGEX = /<(script|style|code|pre|ruby)\b[\s\S]*?<\/\1>|<[^>]+>|([^<]+)/gi;

/**
 * Scans an HTML/XHTML chapter and injects Kindle-compatible Word Wise HTML5 <ruby> tags.
 */
export function injectWordWiseRuby(html: string, options: WordWiseOptions = {}): WordWiseResult {
  const {
    maxDifficulty = 3,
    language = "vi",
    maxOccurrencesPerWord = 3,
    customLemmas = {},
    ignoredWords = [],
  } = options;

  const ignoredSet = new Set(ignoredWords.map((w) => w.toLowerCase().trim()));
  const lemmaOccurrences: Record<string, number> = {};
  const annotatedLemmasMap: Record<
    string,
    { lemma: string; count: number; gloss: string; difficulty: number }
  > = {};
  let totalAnnotated = 0;

  // First strip any existing Kindle Word Wise annotations to prevent duplicate wrapping
  const cleanHtml = stripWordWiseRuby(html);

  const processedHtml = cleanHtml.replace(HTML_TOKEN_REGEX, (match, _p1, p2) => {
    // If not raw text, preserve it 100%
    if (!p2) return match;

    // Scan words in text node
    return p2.replace(/\b([A-Za-z]+(?:'[A-Za-z]+)?)\b/g, (wordMatch: string, word: string) => {
      const lower = word.toLowerCase();
      if (ignoredSet.has(lower)) return wordMatch;

      // Check custom lemmas first, then built-in dictionary
      let def: WordWiseDefinition | null = customLemmas[lower] || null;
      if (!def) {
        def = findWordWiseLemma(word);
      }

      if (!def) return wordMatch;

      // Check difficulty threshold
      if (def.difficulty > maxDifficulty) return wordMatch;

      // Check per-chapter occurrence cap (if enabled)
      const currentCount = lemmaOccurrences[def.lemma] || 0;
      if (maxOccurrencesPerWord > 0 && currentCount >= maxOccurrencesPerWord) {
        return wordMatch;
      }

      lemmaOccurrences[def.lemma] = currentCount + 1;
      totalAnnotated++;

      const gloss = language === "vi" ? def.vi : def.en;

      if (!annotatedLemmasMap[def.lemma]) {
        annotatedLemmasMap[def.lemma] = {
          lemma: def.lemma,
          count: 0,
          gloss,
          difficulty: def.difficulty,
        };
      }
      annotatedLemmasMap[def.lemma].count++;

      // NOTE: `class` is a styling hook for EPUB readers, but a Kindle conversion (Calibre /
      // Send-to-Kindle) may normalise it away. The data attribute is a second hook that survives,
      // and the element selectors in the generated CSS are the final fallback.
      return `<ruby class="kindle-wordwise" data-kindle-wordwise="1" data-lemma="${def.lemma}" data-difficulty="${def.difficulty}">${word}<rt>${gloss}</rt></ruby>`;
    });
  });

  return {
    html: processedHtml,
    annotatedCount: totalAnnotated,
    uniqueLemmasCount: Object.keys(annotatedLemmasMap).length,
    annotatedLemmas: Object.values(annotatedLemmasMap).sort((a, b) => b.count - a.count),
  };
}

/**
 * Removes all Kindle Word Wise <ruby> annotations from an HTML/XHTML string,
 * cleanly restoring the original text content.
 *
 * Matches on the marker class OR the data attribute, because a conversion may drop one and keep
 * the other.
 */
export function stripWordWiseRuby(html: string): string {
  if (!html.includes("kindle-wordwise")) return html;
  return html.replace(
    /<ruby[^>]*kindle-wordwise[^>]*>([\s\S]*?)<rt>[\s\S]*?<\/rt><\/ruby>/gi,
    "$1"
  );
}

/**
 * Analyzes the text content of a chapter or book to report vocabulary statistics.
 */
export function analyzeChapterDifficulty(html: string): WordWiseAnalysis {
  // Strip tags and scripts
  const text = html.replace(/<[^>]+>/g, " ");
  const words = text.match(/\b[A-Za-z]+(?:'[A-Za-z]+)?\b/g) || [];

  const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const lemmaCounts: Record<string, { word: string; lemma: string; difficulty: number; count: number }> = {};
  let difficultCount = 0;

  for (const word of words) {
    const def = findWordWiseLemma(word);
    if (def) {
      difficultCount++;
      breakdown[def.difficulty] = (breakdown[def.difficulty] || 0) + 1;

      if (!lemmaCounts[def.lemma]) {
        lemmaCounts[def.lemma] = {
          word,
          lemma: def.lemma,
          difficulty: def.difficulty,
          count: 0,
        };
      }
      lemmaCounts[def.lemma].count++;
    }
  }

  const topDifficultWords = Object.values(lemmaCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    totalWords: words.length,
    difficultWordsFound: difficultCount,
    difficultyBreakdown: breakdown,
    topDifficultWords,
  };
}
