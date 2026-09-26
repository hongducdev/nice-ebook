/**
 * NiceEbook Studio - Text Cleaner & Structure Reconstructor
 * Handles running header/footer removal, line-wrap de-hyphenation,
 * paragraph merging, and chapter marker detection.
 */

import { isWatermarkOrJunkText, stripInlineWatermarks } from "../../utils/watermarkCleaner";

export interface ChapterChunk {
  title: string;
  content: string;
}

/**
 * Strips running headers and footers that repeat across pages.
 * e.g., page numbers "12", book title "Tây Du Ký", chapter title running headers.
 */
export function cleanRunningHeadersAndFooters(pagesText: string[]): string[] {
  if (pagesText.length <= 1) {
    return pagesText;
  }

  const topLinesCount: Record<string, number> = {};
  const bottomLinesCount: Record<string, number> = {};

  const pagesSplit = pagesText.map((p) => {
    return p
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  });

  const totalPages = pagesSplit.length;

  for (const lines of pagesSplit) {
    if (lines.length > 0) {
      // Check top 2 lines
      const top1 = lines[0];
      topLinesCount[top1] = (topLinesCount[top1] || 0) + 1;
      if (lines.length > 1 && lines[1].length < 60) {
        const top2 = lines[1];
        topLinesCount[top2] = (topLinesCount[top2] || 0) + 1;
      }

      // Check bottom 2 lines
      const bot1 = lines[lines.length - 1];
      bottomLinesCount[bot1] = (bottomLinesCount[bot1] || 0) + 1;
      if (lines.length > 1) {
        const bot2 = lines[lines.length - 2];
        if (bot2.length < 60) {
          bottomLinesCount[bot2] = (bottomLinesCount[bot2] || 0) + 1;
        }
      }
    }
  }

  // Threshold: if a line appears in > 30% of pages as a top/bottom line, or is a pure page number
  const threshold = Math.max(2, Math.floor(totalPages * 0.3));

  const shouldStripLine = (line: string, isHeader: boolean): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return true;

    // Check if line matches known watermarks (dtv-ebook, tve-4u, truyenfull, etc.)
    if (isWatermarkOrJunkText(trimmed)) {
      return true;
    }

    // Pure page numbers (e.g. "12", "- 12 -", "Trang 12", "12 / 150")
    if (/^(?:-?\s*\d+\s*-?|Trang\s+\d+|\d+\s*\/\s*\d+)$/i.test(trimmed)) {
      return true;
    }

    if (isHeader) {
      return (topLinesCount[trimmed] || 0) >= threshold;
    } else {
      return (bottomLinesCount[trimmed] || 0) >= threshold;
    }
  };

  return pagesSplit.map((lines) => {
    let startIdx = 0;
    let endIdx = lines.length;

    while (startIdx < endIdx && startIdx < 2 && shouldStripLine(lines[startIdx], true)) {
      startIdx++;
    }

    while (endIdx > startIdx && endIdx > lines.length - 2 && shouldStripLine(lines[endIdx - 1], false)) {
      endIdx--;
    }

    return lines.slice(startIdx, endIdx).join('\n');
  });
}

/**
 * De-hyphenates words split across lines and merges broken lines into paragraphs.
 * e.g., "chuyển-\nđổi" -> "chuyển đổi", "tự-\n do" -> "tự do"
 */
export function dehyphenateAndMergeLines(text: string): string {
  if (!text) return "";

  // 1. Normalize line breaks to \n
  let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Remove soft hyphens and de-hyphenate words broken across line break
  // Vietnamese and English hyphens: "tự-\nđộng" -> "tự động", "trans-\nform" -> "transform"
  normalized = normalized.replace(/([a-zA-Zà-ỹÀ-Ỹ])[-–—]\s*\n\s*([a-zA-Zà-ỹÀ-Ỹ])/g, '$1$2');

  // 3. Process lines and merge paragraph wraps
  const rawLines = normalized.split('\n');
  const mergedParagraphs: string[] = [];
  let currentPara: string[] = [];

  const isHeadingOrMarker = (line: string): boolean => {
    const trimmed = line.trim();
    return (
      /^#{1,6}\s+/i.test(trimmed) ||
      /^(?:Chương|Chapter|Hồi|Phần|Mục|Quyển|Tiết|Bài)\s+[\dIVXLCDM]+/i.test(trimmed) ||
      /^(?:Lời nói đầu|Mở đầu|Kết thúc|Vĩ thanh|Ngoại truyện|Prologue|Epilogue)/i.test(trimmed)
    );
  };

  const isListOrQuote = (line: string): boolean => {
    const trimmed = line.trim();
    return /^[-*•–—]\s+/i.test(trimmed) || /^>\s+/i.test(trimmed) || /^\d+\.\s+/i.test(trimmed);
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();

    if (!line) {
      if (currentPara.length > 0) {
        mergedParagraphs.push(currentPara.join(' '));
        currentPara = [];
      }
      continue;
    }

    if (isHeadingOrMarker(line)) {
      if (currentPara.length > 0) {
        mergedParagraphs.push(currentPara.join(' '));
        currentPara = [];
      }
      mergedParagraphs.push(line);
      continue;
    }

    if (isListOrQuote(line)) {
      if (currentPara.length > 0) {
        mergedParagraphs.push(currentPara.join(' '));
        currentPara = [];
      }
      mergedParagraphs.push(line);
      continue;
    }

    if (currentPara.length === 0) {
      currentPara.push(line);
    } else {
      const prevLine = currentPara[currentPara.length - 1];
      // Check if previous line ended with hard sentence terminators
      const endsWithSentencePunctuation = /[.!?…:;]$/.test(prevLine) || /["'”’]$/.test(prevLine);

      // Check if current line starts with dialog dash or quotation
      const startsWithDialog = /^["'“‘–—\-]/.test(line);

      if (endsWithSentencePunctuation && (startsWithDialog || line.length < 30)) {
        // Likely a new paragraph
        mergedParagraphs.push(currentPara.join(' '));
        currentPara = [line];
      } else {
        // Merge with previous line
        currentPara.push(line);
      }
    }
  }

  if (currentPara.length > 0) {
    mergedParagraphs.push(currentPara.join(' '));
  }

  // Strip inline watermarks from each merged paragraph
  return mergedParagraphs
    .map((p) => stripInlineWatermarks(p).cleanedText)
    .filter((p) => p.trim().length > 0)
    .join('\n\n');
}

/**
 * Detects chapter markers and splits text into structured chapters.
 * Supports Vietnamese (Chương, Hồi, Phần, Mục, Quyển), English (Chapter, Part, Book),
 * Markdown headers (# Heading), and Roman numerals.
 */
export function detectChapterMarkers(fullText: string): ChapterChunk[] {
  const text = fullText.trim();
  if (!text) {
    return [{ title: "Chương 1", content: "" }];
  }

  const lines = text.split('\n');
  const chapters: ChapterChunk[] = [];

  const chapterRegex =
    /^(?:(?:Chương|Chapter|Hồi|Phần|Quyển|Mục|Tiết|Bài)\s+[\dIVXLCDM]+(?:[:.\-\s].*)?|#{1,3}\s+.+|Lời nói đầu|Mở đầu|Kết thúc|Vĩ thanh|Ngoại truyện|Prologue|Epilogue)$/i;

  let currentTitle = "Chương 1";
  let currentLines: string[] = [];
  let foundFirstMarker = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (chapterRegex.test(trimmed)) {
      if (!foundFirstMarker) {
        // If there's content before the first chapter (e.g. preface or intro)
        if (currentLines.length > 0) {
          const preText = currentLines.join('\n').trim();
          if (preText.length > 0) {
            chapters.push({
              title: "Mở Đầu",
              content: preText,
            });
          }
        }
        foundFirstMarker = true;
      } else {
        // Push the previous chapter
        chapters.push({
          title: currentTitle,
          content: currentLines.join('\n').trim(),
        });
      }

      currentTitle = trimmed.replace(/^#{1,3}\s+/, ''); // strip markdown hashes if present
      currentLines = [];
    } else {
      currentLines.push(rawLine);
    }
  }

  if (currentLines.length > 0 || chapters.length === 0) {
    chapters.push({
      title: currentTitle,
      content: currentLines.join('\n').trim(),
    });
  }

  // Fallback: If no chapters detected and text is very large (> 20,000 characters),
  // chunk by reasonable size (~1,500 - 3,000 words per chapter)
  if (chapters.length === 1 && chapters[0].content.length > 25000) {
    return chunkTextBySize(chapters[0].content);
  }

  return chapters;
}

/**
 * Fallback chunker when text lacks explicit chapter headings.
 */
export function chunkTextBySize(text: string, targetWordsPerChapter = 2500): ChapterChunk[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length <= 1) {
    return [{ title: "Chương 1", content: text }];
  }

  const chunks: ChapterChunk[] = [];
  let currentWords = 0;
  let currentParas: string[] = [];
  let chapterIndex = 1;

  for (const para of paragraphs) {
    const wordCount = para.split(/\s+/).length;
    currentParas.push(para);
    currentWords += wordCount;

    if (currentWords >= targetWordsPerChapter) {
      chunks.push({
        title: `Phần ${chapterIndex}`,
        content: currentParas.join('\n\n'),
      });
      chapterIndex++;
      currentParas = [];
      currentWords = 0;
    }
  }

  if (currentParas.length > 0) {
    chunks.push({
      title: `Phần ${chapterIndex}`,
      content: currentParas.join('\n\n'),
    });
  }

  return chunks;
}
