import { detectChapterMarkers, dehyphenateAndMergeLines, ChapterChunk } from "./textCleaner";
import { isVietnameseText } from "../../utils/vietnameseHelper";

export interface ParsedDocument {
  title: string;
  author: string;
  language: string;
  description?: string;
  chapters: ChapterChunk[];
}

export function parseTxtOrMarkdown(content: string, fileName = "book.txt"): ParsedDocument {
  let rawText = content.trim();
  let title = fileName.replace(/\.[^/.]+$/, "");
  let author = "Khuyết Danh";
  let description: string | undefined;

  // 1. Check for YAML frontmatter (--- ... ---)
  if (rawText.startsWith("---")) {
    const endFm = rawText.indexOf("---", 3);
    if (endFm !== -1) {
      const fmContent = rawText.slice(3, endFm).trim();
      rawText = rawText.slice(endFm + 3).trim();

      const lines = fmContent.split("\n");
      for (const line of lines) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim().toLowerCase();
          const val = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, "");
          if (key === "title" && val) title = val;
          if (key === "author" && val) author = val;
          if (key === "description" && val) description = val;
        }
      }
    }
  }

  // 2. If title wasn't in frontmatter, check first lines for Title/Author conventions
  const allLines = rawText.split("\n");
  let metadataLinesCount = 0;
  for (let i = 0; i < Math.min(6, allLines.length); i++) {
    const line = allLines[i].trim();
    if (!line) {
      if (metadataLinesCount > 0) metadataLinesCount++;
      continue;
    }

    if (i === 0 && line.startsWith("# ") && !/^#\s+(?:Chương|Chapter|Hồi|Phần)/i.test(line)) {
      title = line.replace(/^#\s+/, "").trim();
      metadataLinesCount = i + 1;
    } else if (line.toLowerCase().startsWith("tên truyện:") || line.toLowerCase().startsWith("tiêu đề:")) {
      title = line.replace(/^(?:tên truyện|tiêu đề):\s*/i, "").trim();
      metadataLinesCount = i + 1;
    } else if (line.toLowerCase().startsWith("tác giả:") || line.toLowerCase().startsWith("author:")) {
      author = line.replace(/^(?:tác giả|author):\s*/i, "").trim();
      metadataLinesCount = i + 1;
    } else {
      break;
    }
  }

  if (metadataLinesCount > 0) {
    rawText = allLines.slice(metadataLinesCount).join("\n").trim();
  }

  // 3. Language detection
  const isVietnamese = isVietnameseText(rawText.slice(0, 3000));
  const language = isVietnamese ? "vi" : "en";

  // 4. Split chapters and clean text
  const rawChapters = detectChapterMarkers(rawText);
  const chapters: ChapterChunk[] = rawChapters.map((ch) => ({
    title: ch.title,
    content: dehyphenateAndMergeLines(ch.content),
  }));

  return {
    title,
    author,
    language,
    description,
    chapters,
  };
}
