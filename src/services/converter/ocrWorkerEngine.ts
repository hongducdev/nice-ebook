import { createWorker, Worker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import { cleanOcrText } from "./ocrPostProcessor";

export interface OcrProgressStatus {
  pageNumber: number;
  totalPages: number;
  overallPercent: number;
  stage: "rendering" | "recognizing" | "post-processing" | "done";
  statusText: string;
}

export type OcrLanguage = "vie" | "eng" | "vie+eng" | "chi_sim" | "jpn";

export interface TesseractLogMessage {
  status?: string;
  progress?: number;
  userJobId?: string;
}

export interface BatchOcrOptions {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageIndices: number[]; // 1-indexed
  language?: OcrLanguage;
  scale?: number;
  onProgress?: (status: OcrProgressStatus) => void;
  onPageDone?: (pageNumber: number, text: string) => void;
  signal?: AbortSignal;
}

export interface BatchOcrResult {
  pagesText: Record<number, string>;
  fullText: string;
  isAborted: boolean;
}

/**
 * Renders a PDF page to an off-screen HTML5 Canvas at high resolution (target ~200-250 DPI)
 */
export async function renderPdfPageToCanvas(
  page: pdfjsLib.PDFPageProxy,
  scale = 2.0
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Không thể khởi tạo 2D context cho canvas.");
  }

  // Clear canvas to white background
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const renderContext = {
    canvasContext: context,
    viewport,
  };

  const renderTask = page.render(renderContext);
  await renderTask.promise;
  return canvas;
}

/**
 * Converts a Canvas into a JPEG Data URL (for AI Vision or thumbnail storage)
 */
export function canvasToDataUrl(canvas: HTMLCanvasElement, quality = 0.85): string {
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Manages Tesseract worker lifecycle to run OCR across multiple pages efficiently
 */
export class OcrWorkerManager {
  private worker: Worker | null = null;
  private currentLanguage = "";

  public async getWorker(
    language: OcrLanguage,
    onLogger?: (m: TesseractLogMessage) => void
  ): Promise<Worker> {
    if (this.worker && this.currentLanguage === language) {
      return this.worker;
    }

    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch (err) {
        console.warn("Failed terminating previous worker:", err);
      }
      this.worker = null;
    }

    const worker = await createWorker(language, 1, {
      logger: onLogger,
    });

    this.worker = worker;
    this.currentLanguage = language;
    return worker;
  }

  public async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch (err) {
        console.warn("Error terminating worker:", err);
      }
      this.worker = null;
      this.currentLanguage = "";
    }
  }

  /**
   * Run OCR on a single canvas
   */
  public async recognizeCanvas(
    canvas: HTMLCanvasElement | HTMLImageElement,
    language: OcrLanguage = "vie+eng",
    onLogger?: (m: TesseractLogMessage) => void
  ): Promise<string> {
    const worker = await this.getWorker(language, onLogger);
    const ret = await worker.recognize(canvas);
    return cleanOcrText(ret.data.text);
  }

  /**
   * Executes batch OCR on a list of PDF pages with progress tracking and abort support
   */
  public async processBatch(options: BatchOcrOptions): Promise<BatchOcrResult> {
    const {
      pdfDoc,
      pageIndices,
      language = "vie+eng",
      scale = 2.0,
      onProgress,
      onPageDone,
      signal,
    } = options;

    const totalPages = pageIndices.length;
    const pagesText: Record<number, string> = {};
    let isAborted = false;

    // Initialize worker upfront
    let workerProgressPercent = 0;
    const worker = await this.getWorker(language, (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        workerProgressPercent = Math.round(m.progress * 100);
      }
    });

    for (let i = 0; i < totalPages; i++) {
      if (signal?.aborted) {
        isAborted = true;
        break;
      }

      const pageNum = pageIndices[i];

      // 1. Rendering stage
      if (onProgress) {
        onProgress({
          pageNumber: pageNum,
          totalPages,
          overallPercent: Math.round((i / totalPages) * 100),
          stage: "rendering",
          statusText: `Đang kết xuất ảnh trang ${pageNum} (${i + 1}/${totalPages})...`,
        });
      }

      const page = await pdfDoc.getPage(pageNum);
      const canvas = await renderPdfPageToCanvas(page, scale);

      if (signal?.aborted) {
        isAborted = true;
        break;
      }

      // 2. Recognizing stage
      if (onProgress) {
        onProgress({
          pageNumber: pageNum,
          totalPages,
          overallPercent: Math.round(((i + 0.3) / totalPages) * 100),
          stage: "recognizing",
          statusText: `Đang nhận diện chữ trang ${pageNum} (${workerProgressPercent}%)...`,
        });
      }

      const ret = await worker.recognize(canvas);

      if (signal?.aborted) {
        isAborted = true;
        break;
      }

      // 3. Post-processing stage
      if (onProgress) {
        onProgress({
          pageNumber: pageNum,
          totalPages,
          overallPercent: Math.round(((i + 0.9) / totalPages) * 100),
          stage: "post-processing",
          statusText: `Đang chuẩn hóa tiếng Việt trang ${pageNum}...`,
        });
      }

      const cleanText = cleanOcrText(ret.data.text);
      pagesText[pageNum] = cleanText;

      if (onPageDone) {
        onPageDone(pageNum, cleanText);
      }
    }

    if (onProgress) {
      onProgress({
        pageNumber: totalPages,
        totalPages,
        overallPercent: 100,
        stage: "done",
        statusText: isAborted ? "Đã dừng quét OCR." : "Đã hoàn thành nhận diện OCR!",
      });
    }

    const fullText = pageIndices
      .map((p) => pagesText[p] || "")
      .filter((t) => t.trim().length > 0)
      .join("\n\n");

    return {
      pagesText,
      fullText,
      isAborted,
    };
  }
}
