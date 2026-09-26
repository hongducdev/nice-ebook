import * as pdfjsLib from "pdfjs-dist";
import { invoke } from "@tauri-apps/api/core";
import {
  cleanRunningHeadersAndFooters,
  dehyphenateAndMergeLines,
  detectChapterMarkers,
  ChapterChunk,
} from "./textCleaner";
import {
  classifyPdfScanState,
  getSamplePageIndices,
  PageTextStats,
  ScanDetectionResult,
} from "./scanDetector";
import { isVietnameseText } from "../../utils/vietnameseHelper";
import { JevDecision } from "../../stores/useAppStore";

export interface ExtractedPdfBook {
  title: string;
  author: string;
  language: string;
  totalPages: number;
  scanInfo: ScanDetectionResult;
  jevDecision?: JevDecision;
  chapters: ChapterChunk[];
  rawPagesText: string[];
  sampleText: string;
}

export interface ProgressCallback {
  (current: number, total: number, message: string): void;
}

export function initPdfJsWorker(): void {
  if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
    } catch (err) {
      console.warn("Could not set local pdf.worker.min.mjs URL, falling back:", err);
    }
  }
}

/**
 * Loads a PDF document from ArrayBuffer or Uint8Array
 */
export async function loadPdfDocument(data: ArrayBuffer | Uint8Array): Promise<pdfjsLib.PDFDocumentProxy> {
  initPdfJsWorker();
  const loadingTask = pdfjsLib.getDocument({
    data: data instanceof Uint8Array ? data : new Uint8Array(data),
    useSystemFonts: true,
  });
  return await loadingTask.promise;
}

/**
 * Extracts raw text lines from a single PDF page with layout sorting (top to bottom, left to right)
 */
export async function extractPageText(page: pdfjsLib.PDFPageProxy): Promise<string> {
  const textContent = await page.getTextContent({
    includeMarkedContent: false,
  });
  const items = textContent.items as Array<{
    str: string;
    transform: number[];
    width?: number;
    height?: number;
  }>;

  if (!items || items.length === 0) {
    return "";
  }

  // Group items by line based on Y coordinate
  const linesMap: Map<number, Array<{ x: number; text: string }>> = new Map();

  for (const item of items) {
    if (!item.str || item.str.trim() === "") continue;

    const x = item.transform[4];
    const y = item.transform[5];

    // Find existing line bucket within vertical tolerance (3px)
    let foundLineY: number | null = null;
    for (const lineY of linesMap.keys()) {
      if (Math.abs(lineY - y) < 3.5) {
        foundLineY = lineY;
        break;
      }
    }

    if (foundLineY !== null) {
      linesMap.get(foundLineY)!.push({ x, text: item.str });
    } else {
      linesMap.set(y, [{ x, text: item.str }]);
    }
  }

  // Sort lines from top of page to bottom (descending Y in PDF coordinates)
  const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);

  const lines: string[] = [];
  for (const y of sortedY) {
    const lineItems = linesMap.get(y)!;
    // Sort items left to right
    lineItems.sort((a, b) => a.x - b.x);
    const lineStr = lineItems.map((it) => it.text).join(" ").trim();
    if (lineStr) {
      lines.push(lineStr);
    }
  }

  return lines.join("\n");
}

/**
 * Quick analysis to inspect total pages and detect whether the PDF is digital or scanned
 */
export async function quickScanInspectPdf(
  pdfDoc: pdfjsLib.PDFDocumentProxy
): Promise<ScanDetectionResult> {
  const totalPages = pdfDoc.numPages;
  const sampleIndices = getSamplePageIndices(totalPages, 10);
  const sampleStats: PageTextStats[] = [];

  for (const idx of sampleIndices) {
    try {
      const page = await pdfDoc.getPage(idx);
      const text = await extractPageText(page);
      sampleStats.push({
        pageIndex: idx,
        charCount: text.length,
        hasText: text.length > 20,
      });
    } catch {
      sampleStats.push({
        pageIndex: idx,
        charCount: 0,
        hasText: false,
      });
    }
  }

  return classifyPdfScanState(totalPages, sampleStats);
}

export interface PdfDocumentSummary {
  title: string;
  author: string;
  language: string;
  totalPages: number;
  scanInfo: ScanDetectionResult;
  jevDecision?: JevDecision;
}

/**
 * Super-fast summary inspection (< 150ms) to inspect metadata, Jev Core heuristics, and scan status
 */
export async function inspectPdfSummary(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  defaultTitle = "Ebook Mới"
): Promise<PdfDocumentSummary> {
  const totalPages = pdfDoc.numPages;

  // 1. First run scan check on sampled pages only
  const sampleIndices = getSamplePageIndices(totalPages, 8);
  const sampleStats: PageTextStats[] = [];
  const sampleTexts: string[] = [];

  for (const idx of sampleIndices) {
    try {
      const page = await pdfDoc.getPage(idx);
      const text = await extractPageText(page);
      sampleStats.push({
        pageIndex: idx,
        charCount: text.length,
        hasText: text.length > 20,
      });
      if (text.length > 0) {
        sampleTexts.push(text);
      }
      if (typeof page.cleanup === "function") {
        page.cleanup();
      }
    } catch {
      sampleStats.push({
        pageIndex: idx,
        charCount: 0,
        hasText: false,
      });
    }
  }

  const scanInfo = classifyPdfScanState(totalPages, sampleStats);

  // 2. Read PDF metadata
  let title = defaultTitle;
  let author = "Khuyết Danh";
  try {
    const meta = await pdfDoc.getMetadata();
    const info = meta.info as Record<string, unknown> | undefined;
    if (info) {
      if (typeof info.Title === "string" && info.Title.trim().length > 0) {
        title = info.Title.trim();
      }
      if (typeof info.Author === "string" && info.Author.trim().length > 0) {
        author = info.Author.trim();
      }
    }
  } catch (err) {
    console.warn("Failed reading PDF metadata:", err);
  }

  // 3. Jev Decision Plane: classify sampled text in < 2ms (if digital text exists)
  let jevDecision: JevDecision | undefined;
  const combinedSample = sampleTexts.join("\n\n");
  if (!scanInfo.isScanned && combinedSample.length > 50) {
    try {
      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      if (isTauri) {
        jevDecision = await invoke<JevDecision>("classify_text_jev", {
          text: combinedSample.slice(0, 5000),
        });
      }
    } catch (err) {
      console.warn("Jev classification failed:", err);
    }
  }

  return {
    title,
    author,
    language: jevDecision?.is_vietnamese ? "vi" : "en",
    totalPages,
    scanInfo,
    jevDecision,
  };
}

/**
 * Extracts entire digital PDF and structures it into chapters with concurrent page batching and memory cleanup
 */
export async function extractDigitalPdf(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  defaultTitle = "Ebook Mới",
  onProgress?: ProgressCallback,
  existingScanInfo?: ScanDetectionResult,
  signal?: AbortSignal
): Promise<ExtractedPdfBook> {
  const totalPages = pdfDoc.numPages;

  // 1. Reuse existing scan check or run quick scan check
  const scanInfo = existingScanInfo || (await quickScanInspectPdf(pdfDoc));

  // 2. Read PDF metadata
  let title = defaultTitle;
  let author = "Khuyết Danh";
  try {
    const meta = await pdfDoc.getMetadata();
    const info = meta.info as Record<string, unknown> | undefined;
    if (info) {
      if (typeof info.Title === "string" && info.Title.trim().length > 0) {
        title = info.Title.trim();
      }
      if (typeof info.Author === "string" && info.Author.trim().length > 0) {
        author = info.Author.trim();
      }
    }
  } catch (err) {
    console.warn("Failed reading PDF metadata:", err);
  }

  // 3. Extract text from all pages in concurrent batches of 4 pages
  const batchSize = 4;
  const rawPages: string[] = new Array(totalPages).fill("");

  for (let i = 1; i <= totalPages; i += batchSize) {
    if (signal?.aborted) break;

    const currentBatch: number[] = [];
    for (let b = 0; b < batchSize && (i + b) <= totalPages; b++) {
      currentBatch.push(i + b);
    }

    if (onProgress) {
      onProgress(
        i,
        totalPages,
        `Đang trích xuất trang ${i} - ${Math.min(i + batchSize - 1, totalPages)} / ${totalPages}...`
      );
    }

    await Promise.all(
      currentBatch.map(async (pageNum) => {
        try {
          const page = await pdfDoc.getPage(pageNum);
          const text = await extractPageText(page);
          rawPages[pageNum - 1] = text;
          if (typeof page.cleanup === "function") {
            page.cleanup();
          }
        } catch (err) {
          console.warn(`Error reading page ${pageNum}:`, err);
        }
        return pageNum;
      })
    );

    await new Promise((r) => setTimeout(r, 0));
  }

  // 4. Clean running headers/footers
  const cleanedPages = cleanRunningHeadersAndFooters(rawPages);
  const fullText = cleanedPages.join("\n\n");

  // 5. Jev Decision Plane Classification
  let jevDecision: JevDecision | undefined;
  if (fullText.length > 50) {
    try {
      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      if (isTauri) {
        jevDecision = await invoke<JevDecision>("classify_text_jev", {
          text: fullText.slice(0, 6000),
        });
      }
    } catch (err) {
      console.warn("Jev classification on extracted text failed:", err);
    }
  }

  const isVietnamese = jevDecision?.is_vietnamese ?? isVietnameseText(fullText.slice(0, 3000));
  const language = isVietnamese ? "vi" : "en";

  // 6. Split chapters
  const rawChapters = detectChapterMarkers(fullText);
  const chapters: ChapterChunk[] = rawChapters.map((ch) => ({
    title: ch.title,
    content: dehyphenateAndMergeLines(ch.content),
  }));

  const sampleText = fullText.slice(0, 500);

  return {
    title,
    author,
    language,
    totalPages,
    scanInfo,
    jevDecision,
    chapters,
    rawPagesText: cleanedPages,
    sampleText,
  };
}
