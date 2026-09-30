import { useState, useRef, useEffect, useMemo } from "react";
import { 
  FileText, 
  Sparkles, 
  RefreshCw, 
  Play, 
  Square, 
  Download, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  Sliders, 
  Eye, 
  Copy, 
  Check, 
  Upload, 
  FolderOpen,
  Wand2,
  FileCode,
  BookCheck,
  Trash2
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import type { EpubMetadata } from "../../stores/useAppStore";
import {
  type IngestKind,
  buildWorkflowSteps,
  detectBookProfile,
  isTranslationWorkflow,
  suggestOcrLanguage,
  workflowLabel,
} from "../../utils/bookTypeDetector";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
import { 
  loadPdfDocument, 
  extractDigitalPdf, 
  inspectPdfSummary,
  ExtractedPdfBook,
  PdfDocumentSummary
} from "../../services/converter/digitalPdfExtractor";
import { parseTxtOrMarkdown } from "../../services/converter/txtMarkdownExtractor";
import { cleanOcrText } from "../../services/converter/ocrPostProcessor";
import { cleanChapterHtmlWatermarks } from "../../utils/watermarkCleaner";
import { dehyphenateAndMergeLines, detectChapterMarkers, ChapterChunk } from "../../services/converter/textCleaner";
import { 
  OcrWorkerManager, 
  OcrLanguage, 
  OcrProgressStatus,
  renderPdfPageToCanvas,
  canvasToDataUrl
} from "../../services/converter/ocrWorkerEngine";
import { AiService, JevVerdictChapterPlan } from "../../services/aiService";
import { ChapterTransformer, ChapterEnhancePlan } from "../../utils/chapterTransformer";
import { createNewEpub } from "../../services/converter/epubBuilder";
import { ProgressModal, ProgressStage, ProgressStepItem } from "./ProgressModal";
import { MetadataModal } from "../metadata/MetadataModal";
import { notifyIngestRoute } from "../workflow/ingestRouteToast";

export function ConverterView() {
  const { 
    loadBookFromBytes, 
    pendingConverterFile, 
    setPendingConverterFile,
    activeGateway,
    selectedModel
  } = useAppStore();

  // Active step / sub-tab in converter
  const [activeStep, setActiveStep] = useState<"upload" | "ocr" | "export">("upload");

  // Loaded File State
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);
  const [fileType, setFileType] = useState<"pdf" | "txt" | "md" | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  // Inspection & Metadata
  const [extractedPdfData, setExtractedPdfData] = useState<ExtractedPdfBook | null>(null);
  const [pdfSummary, setPdfSummary] = useState<PdfDocumentSummary | null>(null);
  const [isExtractingDigital, setIsExtractingDigital] = useState(false);
  const [digitalExtractProgress, setDigitalExtractProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const digitalAbortRef = useRef<AbortController | null>(null);

  // Editable Book Metadata
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [bookLanguage, setBookLanguage] = useState("vi");
  const [bookDescription, setBookDescription] = useState("");
  const [bookCoverDataUrl, setBookCoverDataUrl] = useState<string | null>(null);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [isEnhancingJev, setIsEnhancingJev] = useState(false);

  const activeJev = extractedPdfData?.jevDecision || pdfSummary?.jevDecision;

  /**
   * File-scoped classification of the file being converted.
   *
   * Deliberately separate from `bookProfile` in the store: `bookProfile`
   * describes the book currently open in the Studio, while this describes the
   * file on the converter's workbench (usually a different file).
   */
  const sourceProfile = useMemo(() => {
    if (!loadedFileName || (!extractedPdfData && !pdfSummary)) return null;
    const isScanned =
      (extractedPdfData?.scanInfo.isScanned ?? pdfSummary?.scanInfo.isScanned) === true;

    const meta: EpubMetadata = {
      title: extractedPdfData?.title || pdfSummary?.title || bookTitle || loadedFileName,
      author: extractedPdfData?.author || pdfSummary?.author || bookAuthor || "",
      language: extractedPdfData?.language || pdfSummary?.language || "",
      description: null,
      cover_data_url: null,
      chapter_count: extractedPdfData?.chapters.length ?? 0,
      file_size_bytes: fileSizeBytes,
      chapters: [],
      sample_text: extractedPdfData?.sampleText || "",
    };

    const kind: IngestKind =
      fileType === "pdf" ? "pdf-digital" : fileType === "md" ? "md" : "txt";

    return detectBookProfile(meta, { kind, isScannedPdf: isScanned });
  }, [
    loadedFileName,
    extractedPdfData,
    pdfSummary,
    fileSizeBytes,
    fileType,
    bookTitle,
    bookAuthor,
  ]);

  const sourceNeedsTranslation = isTranslationWorkflow(sourceProfile?.workflow);
  const sourceSteps = useMemo(
    () => buildWorkflowSteps(sourceProfile).map((step) => step.label),
    [sourceProfile]
  );

  // Suggest the Tesseract language pack from the detected source language.
  // Applied once per loaded file so a later manual choice is never overridden.
  const ocrLanguageAppliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!sourceProfile || !loadedFileName) return;
    if (ocrLanguageAppliedFor.current === loadedFileName) return;
    ocrLanguageAppliedFor.current = loadedFileName;
    if (sourceProfile.detectionSource === "unknown") return;
    setOcrLanguage(suggestOcrLanguage(sourceProfile.languageCode));
  }, [sourceProfile, loadedFileName]);

  // Global Progress Popup Modal State
  const [modalProgress, setModalProgress] = useState<{
    isOpen: boolean;
    title: string;
    statusText: string;
    subText?: string;
    percent: number;
    stage: ProgressStage;
    steps?: ProgressStepItem[];
    canCancel?: boolean;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: "",
    statusText: "",
    percent: 0,
    stage: "reading",
  });

  const closeProgressModal = () => {
    setModalProgress((prev) => ({ ...prev, isOpen: false }));
  };

  // Scanned OCR State
  const [ocrEngine, setOcrEngine] = useState<"tesseract" | "vision">("tesseract");
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>("vie+eng");
  const [ocrScale, setOcrScale] = useState<number>(2.0);
  const [ocrPageRangeMode, setOcrPageRangeMode] = useState<"all" | "custom" | "current">("all");
  const [customPageRange, setCustomPageRange] = useState("1-10");
  const [previewPageNumber, setPreviewPageNumber] = useState<number>(1);
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);

  // OCR Processing Execution
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgressStatus | null>(null);
  const [ocrRecognizedPages, setOcrRecognizedPages] = useState<Record<number, string>>({});
  const [activePageEditorText, setActivePageEditorText] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ocrManagerRef = useRef<OcrWorkerManager | null>(null);

  // Chapters & Export State
  const [chapters, setChapters] = useState<ChapterChunk[]>([]);
  const [chapterSplitMode, setChapterSplitMode] = useState<"auto" | "pages" | "single">("auto");
  const [pagesPerChapter, setPagesPerChapter] = useState(10);
  const [isGeneratingEpub, setIsGeneratingEpub] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize OCR Worker Manager on mount
  useEffect(() => {
    ocrManagerRef.current = new OcrWorkerManager();
    return () => {
      ocrManagerRef.current?.terminate();
    };
  }, []);

  // Handle pending file from store if routed from dropzone
  useEffect(() => {
    if (pendingConverterFile) {
      handleProcessRawFile(
        pendingConverterFile.name,
        pendingConverterFile.bytes,
        pendingConverterFile.type
      );
      setPendingConverterFile(null);
    }
  }, [pendingConverterFile, setPendingConverterFile]);

  // Render PDF Preview Canvas when previewPageNumber or pdfDoc changes
  useEffect(() => {
    let isCancelled = false;

    async function renderPage() {
      if (!pdfDoc || previewPageNumber < 1 || previewPageNumber > pdfDoc.numPages) return;
      if (!previewCanvasRef.current) return;

      setIsRenderingPreview(true);
      try {
        const page = await pdfDoc.getPage(previewPageNumber);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = previewCanvasRef.current;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;
      } catch (err) {
        if (!isCancelled) {
          console.warn("Failed rendering page preview:", err);
        }
      } finally {
        if (!isCancelled) {
          setIsRenderingPreview(false);
        }
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, previewPageNumber]);

  // Update active page editor text when switching pages
  useEffect(() => {
    setActivePageEditorText(ocrRecognizedPages[previewPageNumber] || "");
  }, [previewPageNumber, ocrRecognizedPages]);

  // Process ingested file
  async function handleProcessRawFile(name: string, bytes: Uint8Array, type: "pdf" | "txt" | "md") {
    setLoadedFileName(name);
    setFileSizeBytes(bytes.byteLength);
    setFileType(type);
    setExtractedPdfData(null);
    setPdfSummary(null);
    setChapters([]);

    setModalProgress({
      isOpen: true,
      title: "Đang Mở & Phân Tích Tài Liệu",
      statusText: `Đang nạp file ${name}...`,
      subText: "Kiểm tra cấu trúc và phân loại nội dung tự động",
      percent: -1,
      stage: "reading",
      canCancel: false,
    });

    try {
      if (type === "pdf") {
        const doc = await loadPdfDocument(bytes);
        setPdfDoc(doc);
        setPreviewPageNumber(1);

        // Fast summary inspection (< 150ms)
        const summary = await inspectPdfSummary(doc, name.replace(/\.pdf$/i, ""));
        setPdfSummary(summary);
        setBookTitle(summary.title);
        setBookAuthor(summary.author);
        setBookLanguage(summary.language);

        closeProgressModal();

        if (summary.scanInfo.isScanned) {
          toast.warning("Phát hiện PDF dạng scan! Bạn có thể sử dụng công cụ OCR để bóc tách chữ.");
        } else {
          toast.success(`Đã nạp nhanh PDF (${summary.totalPages} trang)!`);
          // If small document (<= 15 pages), extract automatically in background
          if (summary.totalPages <= 15) {
            triggerExtractDigitalPdf(doc, summary);
          }
        }
      } else {
        // TXT or MD
        const textDecoder = new TextDecoder("utf-8");
        const textContent = textDecoder.decode(bytes);
        const parsed = parseTxtOrMarkdown(textContent, name);
        setBookTitle(parsed.title);
        setBookAuthor(parsed.author);
        setBookLanguage(parsed.language);
        if (parsed.description) setBookDescription(parsed.description);
        setChapters(parsed.chapters);
        closeProgressModal();
        toast.success(`Đã nạp file ${type.toUpperCase()} (${parsed.chapters.length} chương) thành công!`);
      }
    } catch (err) {
      console.error("Lỗi nạp file chuyển đổi:", err);
      closeProgressModal();
      toast.error(err instanceof Error ? err.message : "Không thể đọc file đã chọn");
    }
  }

  // Trigger non-blocking extraction of digital PDF
  async function triggerExtractDigitalPdf(docToExtract?: pdfjsLib.PDFDocumentProxy, summaryToUse?: PdfDocumentSummary) {
    const doc = docToExtract || pdfDoc;
    const summary = summaryToUse || pdfSummary;
    if (!doc) return;

    setIsExtractingDigital(true);
    digitalAbortRef.current = new AbortController();

    setModalProgress({
      isOpen: true,
      title: "Trích Xuất Văn Bản Số (Digital PDF)",
      statusText: `Bắt đầu trích xuất ${doc.numPages} trang sách...`,
      subText: "Đang đọc các lớp chữ, dòng văn bản và loại bỏ header thừa",
      percent: 0,
      stage: "extracting",
      canCancel: true,
      onCancel: handleCancelDigitalExtract,
      steps: [
        { id: "load", label: "Đọc cấu trúc file PDF", status: "completed" },
        { id: "extract", label: `Bóc tách văn bản (${doc.numPages} trang)`, status: "running" },
        { id: "clean", label: "Dọn dẹp header/footer lặp lại", status: "pending" },
        { id: "split", label: "Phân chia chương tự động", status: "pending" },
      ],
    });

    try {
      const extracted = await extractDigitalPdf(
        doc,
        bookTitle || "Ebook Mới",
        (current, total, message) => {
          const pct = Math.round((current / total) * 100);
          setDigitalExtractProgress({ current, total, message });
          setModalProgress((prev) => ({
            ...prev,
            statusText: message,
            subText: `Tiến độ: ${pct}% • Trang ${current} / ${total}`,
            percent: pct,
            stage: "extracting",
            steps: [
              { id: "load", label: "Đọc cấu trúc file PDF", status: "completed" },
              { id: "extract", label: `Bóc tách văn bản (${current}/${total} trang)`, status: pct >= 100 ? "completed" : "running" },
              { id: "clean", label: "Dọn dẹp header/footer lặp lại", status: pct >= 100 ? "running" : "pending" },
              { id: "split", label: "Phân chia chương tự động", status: "pending" },
            ],
          }));
        },
        summary?.scanInfo,
        digitalAbortRef.current.signal
      );

      setExtractedPdfData(extracted);
      setChapters(extracted.chapters);

      setModalProgress((prev) => ({
        ...prev,
        statusText: `Hoàn tất trích xuất ${extracted.chapters.length} chương!`,
        subText: "Đã sẵn sàng chuyển sang bước Xem trước & Tạo EPUB",
        percent: 100,
        stage: "done",
        canCancel: false,
        steps: [
          { id: "load", label: "Đọc cấu trúc file PDF", status: "completed" },
          { id: "extract", label: "Bóc tách văn bản", status: "completed" },
          { id: "clean", label: "Dọn dẹp header/footer lặp lại", status: "completed" },
          { id: "split", label: `Phân chia ${extracted.chapters.length} chương`, status: "completed" },
        ],
      }));

      setTimeout(() => {
        closeProgressModal();
      }, 700);

      toast.success(`Đã trích xuất xong ${extracted.chapters.length} chương!`);
    } catch (err) {
      console.warn("Lỗi trích xuất PDF số:", err);
      closeProgressModal();
      toast.error("Lỗi khi trích xuất văn bản");
    } finally {
      setIsExtractingDigital(false);
      setDigitalExtractProgress(null);
    }
  }

  function handleCancelDigitalExtract() {
    if (digitalAbortRef.current) {
      digitalAbortRef.current.abort();
      digitalAbortRef.current = null;
    }
    setIsExtractingDigital(false);
    closeProgressModal();
    toast.info("Đã dừng trích xuất văn bản.");
  }

  // Fast Jev Verdict enhancement across chapters (< 5ms in Rust)
  async function handleRunJevVerdictOnChapters() {
    if (chapters.length === 0) return;
    setIsEnhancingJev(true);
    toast.loading("Đang chuẩn hóa và tối ưu cấu trúc các chương...", { id: "clean-verdict" });
    try {
      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      const enhanced: ChapterChunk[] = [];
      let totalTyposFixed = 0;
      let totalHeadingsAdded = 0;

      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        if (isTauri) {
          try {
            const bodyHtml = ch.content.startsWith("<p>") || ch.content.startsWith("<div")
              ? ch.content
              : ch.content.split("\n").filter((l) => l.trim().length > 0).map((l) => `<p>${l}</p>`).join("");

            const plan = await invoke<JevVerdictChapterPlan>("run_jev_verdict_chapter", {
              chapterTitle: ch.title,
              chapterHtml: bodyHtml,
              bookTitle: bookTitle || "Sách",
              author: bookAuthor || "Tác giả",
            });

            const enhancePlan: ChapterEnhancePlan = {
              h1_title: plan.h1_title,
              top_junk_indices: plan.top_junk_indices,
              headings: plan.headings?.map((h) => ({
                level: h.level === "h3" ? "h3" : "h2",
                title: h.title,
                before_paragraph_index: h.before_paragraph_index,
              })),
              spelling_corrections: plan.spelling_corrections,
            };

            const result = ChapterTransformer.applyPlan(bodyHtml, enhancePlan);
            totalTyposFixed += plan.spelling_corrections?.length || 0;
            totalHeadingsAdded += plan.headings?.length || 0;

            enhanced.push({
              title: plan.h1_title || ch.title,
              content: result.updatedHtml || ch.content,
            });
            continue;
          } catch (err) {
            console.warn("Jev chapter verdict error:", err);
          }
        }
        enhanced.push(ch);
      }

      setChapters(enhanced);
      toast.success(
        `Đã chuẩn hóa ${enhanced.length} chương (sửa ${totalTyposFixed} lỗi, thêm ${totalHeadingsAdded} phân đoạn).`,
        { id: "clean-verdict" }
      );
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi chuẩn hóa cấu trúc chương", { id: "clean-verdict" });
      setIsEnhancingJev(false);
    }
  }

  // One-click: Clean watermarks from all chapters in converter
  function handleCleanConverterWatermarks() {
    if (chapters.length === 0) return;
    let totalRemoved = 0;
    let totalInline = 0;
    const updated = chapters.map((ch) => {
      const res = cleanChapterHtmlWatermarks(ch.content);
      totalRemoved += res.removedBlocksCount;
      totalInline += res.inlineFixesCount;
      return {
        title: ch.title,
        content: res.cleanedHtml,
      };
    });
    setChapters(updated);
    toast.success(
      `Đã xóa ${totalRemoved} đoạn watermark/rác và ${totalInline} liên kết web trong ${chapters.length} chương!`
    );
  }

  // Open native or web file dialog
  async function handlePickFile() {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isTauri) {
      try {
        const selected = await open({
          multiple: false,
          filters: [
            { name: "Sách & Tài liệu", extensions: ["pdf", "txt", "md", "markdown"] },
            { name: "PDF Document", extensions: ["pdf"] },
            { name: "Text File", extensions: ["txt", "md"] },
          ],
        });

        if (selected && typeof selected === "string") {
          toast.loading("Đang đọc file...", { id: "read-file" });
          const { readFile } = await import("@tauri-apps/plugin-fs");
          const bytes = await readFile(selected);
          const ext = selected.toLowerCase().endsWith(".pdf")
            ? "pdf"
            : selected.toLowerCase().endsWith(".md") || selected.toLowerCase().endsWith(".markdown")
            ? "md"
            : "txt";
          const fileName = selected.split(/[\\/]/).pop() || "document";
          await handleProcessRawFile(fileName, bytes, ext);
          toast.success("Đã mở file thành công!", { id: "read-file" });
          return;
        }
      } catch (err) {
        console.warn("Tauri dialog error, falling back to input:", err);
      }
    }

    fileInputRef.current?.click();
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : file.name.toLowerCase().endsWith(".md") || file.name.toLowerCase().endsWith(".markdown")
      ? "md"
      : "txt";

    toast.loading(`Đang tải file ${file.name}...`, { id: "upload-file" });
    try {
      const buffer = await file.arrayBuffer();
      await handleProcessRawFile(file.name, new Uint8Array(buffer), ext);
      toast.success("Đã nạp file thành công!", { id: "upload-file" });
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi đọc file");
    } finally {
      e.target.value = "";
    }
  }

  // Calculate target page numbers to OCR based on page range mode
  const targetOcrPages = useMemo(() => {
    if (!pdfDoc) return [];
    const total = pdfDoc.numPages;

    if (ocrPageRangeMode === "current") {
      return [previewPageNumber];
    }

    if (ocrPageRangeMode === "all") {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    // Custom range parser: e.g. "1-5, 8, 11-15"
    const pages = new Set<number>();
    const parts = customPageRange.split(",");
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes("-")) {
        const [startStr, endStr] = trimmed.split("-");
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          for (let p = Math.max(1, start); p <= Math.min(total, end); p++) {
            pages.add(p);
          }
        }
      } else {
        const p = parseInt(trimmed, 10);
        if (!isNaN(p) && p >= 1 && p <= total) {
          pages.add(p);
        }
      }
    }

    return Array.from(pages).sort((a, b) => a - b);
  }, [pdfDoc, ocrPageRangeMode, customPageRange, previewPageNumber]);

  // Execute OCR (Tesseract or AI Vision)
  async function handleStartOcr() {
    if (!pdfDoc || targetOcrPages.length === 0) {
      toast.error("Vui lòng chọn trang cần nhận diện OCR.");
      return;
    }

    setIsOcrRunning(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setModalProgress({
      isOpen: true,
      title: ocrEngine === "tesseract" ? "Đang Quét OCR Cục Bộ (Tesseract)" : "Đang Quét OCR Bằng AI Vision",
      statusText: `Chuẩn bị quét ${targetOcrPages.length} trang...`,
      subText: `Ngôn ngữ: ${ocrLanguage} • Độ phân giải: ${ocrScale}x DPI`,
      percent: 0,
      stage: "ocr",
      canCancel: true,
      onCancel: handleCancelOcr,
      steps: [
        { id: "init", label: "Khởi tạo công cụ nhận diện OCR", status: "completed" },
        { id: "render", label: "Kết xuất ảnh trang Hi-DPI", status: "running" },
        { id: "recognize", label: `Nhận diện chữ (${targetOcrPages.length} trang)`, status: "pending" },
        { id: "post", label: "Chuẩn hóa tiếng Việt & ghép đoạn", status: "pending" },
      ],
    });

    try {
      if (ocrEngine === "tesseract") {
        const manager = ocrManagerRef.current || new OcrWorkerManager();
        ocrManagerRef.current = manager;

        const result = await manager.processBatch({
          pdfDoc,
          pageIndices: targetOcrPages,
          language: ocrLanguage,
          scale: ocrScale,
          signal,
          onProgress: (status) => {
            setOcrProgress(status);
            setModalProgress((prev) => ({
              ...prev,
              statusText: status.statusText,
              subText: `Trang ${status.pageNumber} (${status.overallPercent}%) • ${status.stage}`,
              percent: status.overallPercent,
              stage: "ocr",
              steps: [
                { id: "init", label: "Khởi tạo công cụ nhận diện OCR", status: "completed" },
                {
                  id: "render",
                  label: "Kết xuất ảnh trang Hi-DPI",
                  status: status.stage === "rendering" ? "running" : "completed",
                },
                {
                  id: "recognize",
                  label: `Nhận diện chữ (${status.pageNumber}/${status.totalPages})`,
                  status:
                    status.stage === "recognizing"
                      ? "running"
                      : status.overallPercent >= 90
                      ? "completed"
                      : "pending",
                },
                {
                  id: "post",
                  label: "Chuẩn hóa tiếng Việt & ghép đoạn",
                  status: status.stage === "post-processing" ? "running" : "pending",
                },
              ],
            }));
          },
          onPageDone: (pageNum, text) => {
            setOcrRecognizedPages((prev) => ({ ...prev, [pageNum]: text }));
            if (pageNum === previewPageNumber) {
              setActivePageEditorText(text);
            }
          },
        });

        if (result.isAborted) {
          closeProgressModal();
          toast.warning("Đã hủy quá trình quét OCR.");
        } else {
          setModalProgress((prev) => ({
            ...prev,
            statusText: `Đã hoàn tất nhận diện ${targetOcrPages.length} trang!`,
            subText: "Nội dung đã được chuẩn hóa và hiển thị trong khung soạn thảo",
            percent: 100,
            stage: "done",
            canCancel: false,
            steps: [
              { id: "init", label: "Khởi tạo công cụ nhận diện OCR", status: "completed" },
              { id: "render", label: "Kết xuất ảnh trang Hi-DPI", status: "completed" },
              { id: "recognize", label: "Nhận diện chữ", status: "completed" },
              { id: "post", label: "Chuẩn hóa tiếng Việt & ghép đoạn", status: "completed" },
            ],
          }));

          setTimeout(() => {
            closeProgressModal();
          }, 800);

          toast.success(`Đã hoàn tất OCR ${targetOcrPages.length} trang!`);
          reconstructChaptersFromOcr(result.pagesText);
        }
      } else {
        // AI Vision OCR via Gateway
        if (!activeGateway) {
          closeProgressModal();
          toast.error("Chưa có AI Gateway online để dùng tính năng AI Vision. Vui lòng bật 9router, Ollama hoặc cấu hình Gateway.");
          setIsOcrRunning(false);
          return;
        }

        const modelToUse = selectedModel || activeGateway.models[0] || "gpt-4o-mini";
        const total = targetOcrPages.length;
        const newResults: Record<number, string> = { ...ocrRecognizedPages };

        for (let i = 0; i < total; i++) {
          if (signal.aborted) break;

          const pageNum = targetOcrPages[i];
          const pct = Math.round((i / total) * 100);
          setOcrProgress({
            pageNumber: pageNum,
            totalPages: total,
            overallPercent: pct,
            stage: "recognizing",
            statusText: `AI Vision đang nhận diện trang ${pageNum} (${i + 1}/${total})...`,
          });

          setModalProgress((prev) => ({
            ...prev,
            statusText: `AI Vision đang nhận diện trang ${pageNum} (${i + 1}/${total})...`,
            subText: `Mô hình: ${modelToUse} • Tiến độ: ${pct}%`,
            percent: pct,
            stage: "ocr",
            steps: [
              { id: "init", label: "Khởi tạo kết nối AI Gateway", status: "completed" },
              { id: "render", label: "Kết xuất ảnh trang Hi-DPI", status: "completed" },
              { id: "recognize", label: `AI Vision nhận diện (${i + 1}/${total} trang)`, status: "running" },
              { id: "post", label: "Chuẩn hóa định dạng", status: "pending" },
            ],
          }));

          const page = await pdfDoc.getPage(pageNum);
          const canvas = await renderPdfPageToCanvas(page, 1.8);
          const base64Url = canvasToDataUrl(canvas, 0.9);

          const recognized = await AiService.extractTextWithVision({
            baseUrl: activeGateway.base_url,
            model: modelToUse,
            imageBase64Url: base64Url,
          });

          const cleaned = cleanOcrText(recognized);
          newResults[pageNum] = cleaned;
          setOcrRecognizedPages({ ...newResults });

          if (pageNum === previewPageNumber) {
            setActivePageEditorText(cleaned);
          }
        }

        setModalProgress((prev) => ({
          ...prev,
          statusText: `Đã hoàn tất AI Vision OCR ${total} trang!`,
          subText: "Nội dung nhận diện đã được nạp thành công",
          percent: 100,
          stage: "done",
          canCancel: false,
          steps: [
            { id: "init", label: "Khởi tạo kết nối AI Gateway", status: "completed" },
            { id: "render", label: "Kết xuất ảnh trang Hi-DPI", status: "completed" },
            { id: "recognize", label: "AI Vision nhận diện chữ", status: "completed" },
            { id: "post", label: "Chuẩn hóa định dạng", status: "completed" },
          ],
        }));

        setTimeout(() => {
          closeProgressModal();
        }, 800);

        toast.success(`Đã hoàn tất AI Vision OCR ${total} trang!`);
        reconstructChaptersFromOcr(newResults);
      }
    } catch (err) {
      console.error("OCR execution error:", err);
      closeProgressModal();
      toast.error(err instanceof Error ? err.message : "Lỗi khi quét OCR");
    } finally {
      setIsOcrRunning(false);
      setOcrProgress(null);
    }
  }

  function handleCancelOcr() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsOcrRunning(false);
    closeProgressModal();
    toast.info("Đã gửi yêu cầu dừng quét.");
  }

  // Save manual text edit for the current page
  function handleSaveCurrentPageText(text: string) {
    setActivePageEditorText(text);
    const updated = { ...ocrRecognizedPages, [previewPageNumber]: text };
    setOcrRecognizedPages(updated);
    reconstructChaptersFromOcr(updated);
  }

  // Re-build chapters array from extracted/recognized text
  function reconstructChaptersFromOcr(pagesMap: Record<number, string>) {
    const sortedPages = Object.keys(pagesMap)
      .map(Number)
      .sort((a, b) => a - b);

    if (chapterSplitMode === "single") {
      const fullText = sortedPages.map((p) => pagesMap[p]).join("\n\n");
      setChapters([{ title: bookTitle || "Toàn Bộ Sách", content: fullText }]);
      return;
    }

    if (chapterSplitMode === "pages") {
      const chunks: ChapterChunk[] = [];
      let currentChunkText: string[] = [];
      let partIdx = 1;

      for (let i = 0; i < sortedPages.length; i++) {
        currentChunkText.push(pagesMap[sortedPages[i]]);
        if (currentChunkText.length >= pagesPerChapter || i === sortedPages.length - 1) {
          chunks.push({
            title: `Phần ${partIdx} (Trang ${sortedPages[i - currentChunkText.length + 1]} - ${sortedPages[i]})`,
            content: currentChunkText.join("\n\n"),
          });
          partIdx++;
          currentChunkText = [];
        }
      }
      setChapters(chunks);
      return;
    }

    // Auto split by chapter markers (Chương, Chapter, Hồi, etc.)
    const combinedText = sortedPages.map((p) => pagesMap[p]).join("\n\n");
    const detected = detectChapterMarkers(combinedText);
    setChapters(detected);
  }

  // Format File Size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // One-click: Load directly into Studio
  async function handleLoadIntoStudio() {
    if (chapters.length === 0) {
      toast.error("Chưa có nội dung hoặc chương nào để nạp vào Studio.");
      return;
    }

    setIsGeneratingEpub(true);
    setModalProgress({
      isOpen: true,
      title: "Đang Đóng Gói Sách Điện Tử (EPUB 3)",
      statusText: "Rust Core đang tạo archive EPUB chuẩn quốc tế...",
      subText: `Bao gồm ${chapters.length} chương, stylesheet và navigation document`,
      percent: 60,
      stage: "packaging",
      canCancel: false,
      steps: [
        { id: "xhtml", label: "Tạo cấu trúc XHTML các chương", status: "completed" },
        { id: "css", label: "Áp dụng định dạng CSS & Typography", status: "completed" },
        { id: "zip", label: "Đóng gói ZIP EPUB 3 chuẩn", status: "running" },
      ],
    });

    try {
      const epubBytes = await createNewEpub({
        title: bookTitle || "Ebook Chuyển Đổi",
        author: bookAuthor || "Khuyết Danh",
        language: bookLanguage || "vi",
        description: bookDescription || undefined,
        coverBase64: bookCoverDataUrl || undefined,
        chapters,
      });

      const ok = await loadBookFromBytes(Array.from(epubBytes));

      setModalProgress((prev) => ({
        ...prev,
        statusText: "Đóng gói EPUB 3 thành công!",
        subText: "Sách đã được nạp trực tiếp vào Studio",
        percent: 100,
        stage: "done",
        steps: [
          { id: "xhtml", label: "Tạo cấu trúc XHTML các chương", status: "completed" },
          { id: "css", label: "Áp dụng định dạng CSS & Typography", status: "completed" },
          { id: "zip", label: "Đóng gói ZIP EPUB 3 chuẩn", status: "completed" },
        ],
      }));

      setTimeout(() => {
        closeProgressModal();
      }, 600);

      if (ok) {
        toast.success(`Đã nạp sách "${bookTitle}" vào Studio thành công!`);
        // `loadBookFromBytes` already classified the produced EPUB and routed the
        // user (foreign-language output leaves for the Translator). Do not force
        // a tab here — surface the decision instead.
        notifyIngestRoute();
      } else {
        toast.error("Không thể mở sách vừa tạo");
      }
    } catch (err) {
      console.error(err);
      closeProgressModal();
      toast.error(err instanceof Error ? err.message : "Lỗi khi tạo EPUB");
    } finally {
      setIsGeneratingEpub(false);
    }
  }

  // One-click: Export EPUB file to disk
  async function handleExportEpubFile() {
    if (chapters.length === 0) {
      toast.error("Chưa có nội dung để xuất file.");
      return;
    }

    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isTauri) {
      try {
        const defaultName = `${bookTitle || "ebook"}.epub`.replace(/[\\/:*?"<>|]/g, "_");
        const savePath = await save({
          filters: [{ name: "EPUB Ebook", extensions: ["epub"] }],
          defaultPath: defaultName,
        });

        if (savePath) {
          setModalProgress({
            isOpen: true,
            title: "Đang Tạo & Lưu File EPUB",
            statusText: "Đang đóng gói file sách chuẩn quốc tế...",
            subText: `Đường dẫn đích: ${savePath}`,
            percent: 75,
            stage: "packaging",
            canCancel: false,
          });

          await createNewEpub({
            title: bookTitle || "Ebook Chuyển Đổi",
            author: bookAuthor || "Khuyết Danh",
            language: bookLanguage || "vi",
            description: bookDescription || undefined,
            coverBase64: bookCoverDataUrl || undefined,
            chapters,
            outputPath: savePath,
          });

          closeProgressModal();
          toast.success(`Đã lưu file thành công tại: ${savePath}`);
          return;
        }
      } catch (err) {
        console.warn("Tauri save error:", err);
      }
    }

    // Web download fallback
    try {
      setModalProgress({
        isOpen: true,
        title: "Đang Tạo File EPUB",
        statusText: "Đang đóng gói dữ liệu sách...",
        percent: 80,
        stage: "packaging",
        canCancel: false,
      });

      const bytes = await createNewEpub({
        title: bookTitle || "Ebook Chuyển Đổi",
        author: bookAuthor || "Khuyết Danh",
        language: bookLanguage || "vi",
        description: bookDescription || undefined,
        coverBase64: bookCoverDataUrl || undefined,
        chapters,
      });

      const blob = new Blob([bytes as BlobPart], { type: "application/epub+zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${bookTitle || "ebook"}.epub`;
      a.click();
      URL.revokeObjectURL(url);
      closeProgressModal();
      toast.success("Đã tải xuống file EPUB!");
    } catch (err) {
      console.warn("Failed web download fallback:", err);
      closeProgressModal();
      toast.error("Không thể xuất file EPUB");
    }
  }

  // Export plain text / markdown file
  function handleExportTextFile(format: "txt" | "md") {
    const content = chapters
      .map((ch) => `${format === "md" ? `# ${ch.title}` : ch.title}\n\n${ch.content}`)
      .join("\n\n---\n\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bookTitle || "ebook"}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Đã xuất file .${format} thành công!`);
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--background)]">
      {/* Hidden file selector input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.markdown"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-[var(--border)] bg-[var(--card)]/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_15%,var(--card))] border border-[var(--primary)] text-[var(--primary)] shadow-sm">
            <RefreshCw size={18} className="animate-in spin-in-180 duration-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-[var(--foreground)]">Bước 1: Nạp &amp; Chuyển Đổi Sách</h1>
              <span className="app-badge app-badge--brand text-[10px] font-mono">PDF &bull; OCR &bull; TXT &bull; MD</span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              Chuyển đổi PDF (văn bản số &amp; PDF scan), TXT, Markdown sang định dạng EPUB 3 chuẩn hoá.
            </p>
          </div>
        </div>

        {/* Step Navigation Tabs */}
        <div className="segmented-toggle">
          <button
            type="button"
            data-active={activeStep === "upload" ? "true" : undefined}
            data-variant="primary"
            onClick={() => setActiveStep("upload")}
            className="segmented-toggle__item flex items-center gap-1.5"
          >
            <Upload size={14} />
            <span>1. Nạp &amp; Phân Tích</span>
          </button>
          <button
            type="button"
            data-active={activeStep === "ocr" ? "true" : undefined}
            data-variant="primary"
            onClick={() => setActiveStep("ocr")}
            className="segmented-toggle__item flex items-center gap-1.5 relative"
          >
            <Eye size={14} />
            <span>2. Công Cụ OCR PDF Scan</span>
            {extractedPdfData?.scanInfo.isScanned && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>
          <button
            type="button"
            data-active={activeStep === "export" ? "true" : undefined}
            data-variant="primary"
            onClick={() => setActiveStep("export")}
            className="segmented-toggle__item flex items-center gap-1.5"
          >
            <Sparkles size={14} />
            <span>3. Xem Trước &amp; Tạo EPUB</span>
            {chapters.length > 0 && (
              <span className="text-[10px] opacity-75 font-mono">({chapters.length})</span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full">
        {/* ================= STEP 1: UPLOAD & INSPECTION ================= */}
        {activeStep === "upload" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-200">
            {/* Dropzone Hero */}
            {!loadedFileName ? (
              <div
                onClick={handlePickFile}
                className="border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] bg-[var(--card)] hover:bg-[color-mix(in_srgb,var(--primary)_5%,var(--card))] transition-all duration-200 rounded-xl p-12 flex flex-col items-center justify-center text-center cursor-pointer group shadow-sm"
              >
                <div className="w-16 h-16 rounded-2xl bg-[var(--secondary)] border border-[var(--border)] group-hover:scale-105 group-hover:border-[var(--primary)] flex items-center justify-center text-[var(--primary)] mb-4 transition-transform">
                  <FileText size={32} />
                </div>
                <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">
                  Chọn hoặc kéo thả file sách vào đây
                </h3>
                <p className="text-xs text-[var(--muted-foreground)] max-w-md mb-4">
                  Hỗ trợ file PDF (văn bản số &amp; PDF scan ảnh), TXT (tiểu thuyết/truyện chữ) và Markdown (.md).
                </p>
                <button
                  type="button"
                  className="app-button app-button--primary text-xs"
                >
                  <FolderOpen size={14} />
                  <span>Duyệt File Từ Máy Tính...</span>
                </button>
              </div>
            ) : (
              /* Loaded Document Card */
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between pb-4 border-b border-[var(--border)]">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))] border border-[var(--primary)] flex items-center justify-center text-[var(--primary)]">
                      {fileType === "pdf" ? <FileText size={24} /> : <FileCode size={24} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-[var(--foreground)]">{loadedFileName}</h2>
                        <span className="app-badge app-badge--neutral text-[10px] font-mono uppercase">
                          {fileType} &bull; {formatSize(fileSizeBytes)}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                        {fileType === "pdf"
                          ? `Tài liệu PDF gồm ${pdfDoc?.numPages || 0} trang.`
                          : `Tệp văn bản gồm ${chapters.length} chương được nhận diện.`}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handlePickFile}
                    className="app-button app-button--secondary text-xs"
                  >
                    <FolderOpen size={14} />
                    <span>Đổi File Khác...</span>
                  </button>
                </div>

                {/* Scanned vs Digital Alert for PDF */}
                {fileType === "pdf" && (extractedPdfData || pdfSummary) && (
                  <div className="mt-4">
                    {(extractedPdfData?.scanInfo.isScanned ?? pdfSummary?.scanInfo.isScanned) ? (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3 text-amber-600 dark:text-amber-400">
                        <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                        <div className="flex-1 text-xs">
                          <div className="font-semibold text-sm mb-1 flex items-center gap-2">
                            <span>Phát hiện PDF dạng SCAN (ảnh chụp)</span>
                            <span className="app-badge bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40 text-[10px]">
                              Cần OCR
                            </span>
                          </div>
                          <p className="text-[var(--foreground)] opacity-90 mb-2">
                            Tài liệu này hầu như không chứa lớp chữ số (trung bình chỉ khoảng {(extractedPdfData || pdfSummary)?.scanInfo.avgCharsPerPage} ký tự/trang). 
                            Để tạo ebook rõ đẹp, bạn có thể sử dụng công cụ OCR bóc tách chữ từ ảnh.
                          </p>
                          <button
                            type="button"
                            onClick={() => setActiveStep("ocr")}
                            className="app-button app-button--primary text-xs"
                          >
                            <Eye size={14} />
                            <span>Mở Công Cụ OCR PDF Scan Ngay</span>
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex flex-col gap-3 text-emerald-600 dark:text-emerald-400">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <CheckCircle2 size={20} className="shrink-0" />
                            <div className="text-xs">
                              <span className="font-semibold text-sm block text-emerald-600 dark:text-emerald-300">
                                PDF Văn Bản Số Chuẩn (Digital Text)
                              </span>
                              <span className="text-[var(--foreground)] opacity-90">
                                {chapters.length > 0
                                  ? `Đã trích xuất hoàn tất ${chapters.length} chương. Đã sẵn sàng tạo EPUB!`
                                  : `Tài liệu có lớp văn bản số (${pdfDoc?.numPages} trang). Nhấn 'Trích xuất' để bóc tách toàn bộ sách.`}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {chapters.length === 0 && !isExtractingDigital && (
                              <button
                                type="button"
                                onClick={() => triggerExtractDigitalPdf()}
                                className="app-button app-button--primary text-xs"
                              >
                                <Play size={14} />
                                <span>Trích Xuất Toàn Bộ ({pdfDoc?.numPages} trang)</span>
                              </button>
                            )}

                            {isExtractingDigital && (
                              <button
                                type="button"
                                onClick={handleCancelDigitalExtract}
                                className="app-button app-button--destructive text-xs"
                              >
                                <Square size={14} />
                                <span>Hủy</span>
                              </button>
                            )}

                            {chapters.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setActiveStep("export")}
                                className="app-button app-button--primary text-xs"
                              >
                                <span>Xem Trước &amp; Tạo EPUB ({chapters.length} chương)</span>
                                <ArrowRight size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Progress Bar when extracting */}
                        {isExtractingDigital && digitalExtractProgress && (
                          <div className="bg-[var(--background)]/60 rounded p-2.5 border border-emerald-500/20 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-[var(--foreground)]">{digitalExtractProgress.message}</span>
                              <span className="font-mono text-emerald-500">
                                {Math.round((digitalExtractProgress.current / digitalExtractProgress.total) * 100)}%
                              </span>
                            </div>
                            <div className="w-full bg-[var(--border)] h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-emerald-500 h-full transition-all duration-150"
                                style={{
                                  width: `${Math.round((digitalExtractProgress.current / digitalExtractProgress.total) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Metadata Header & Action */}
                <div className="mt-5 flex items-center justify-between pb-2 border-b border-[var(--border)]">
                  <div>
                    <h3 className="text-xs font-bold text-[var(--foreground)]">Thông tin &amp; Bìa sách (Metadata)</h3>
                    <p className="text-[11px] text-[var(--muted-foreground)]">Thiết lập tựa đề, tác giả, ngôn ngữ và ảnh bìa</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMetadataModalOpen(true)}
                    className="lg-button lg-button--secondary text-xs h-7 px-2.5 gap-1.5 text-[var(--primary)] font-medium"
                    title="Tự động tra cứu Google Books &amp; Open Library, chọn ảnh bìa đẹp"
                  >
                    <Sparkles size={12} />
                    <span>⚡ Bổ sung Metadata &amp; Tìm Bìa</span>
                  </button>
                </div>

                {/* Metadata Fields */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-[var(--foreground)] block mb-1">
                      Tên sách (Title)
                    </label>
                    <input
                      type="text"
                      value={bookTitle}
                      onChange={(e) => setBookTitle(e.target.value)}
                      placeholder="Nhập tiêu đề sách..."
                      className="w-full text-xs px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded focus:outline-none focus:border-[var(--primary)] text-[var(--foreground)]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--foreground)] block mb-1">
                      Tác giả (Author)
                    </label>
                    <input
                      type="text"
                      value={bookAuthor}
                      onChange={(e) => setBookAuthor(e.target.value)}
                      placeholder="Nhập tên tác giả..."
                      className="w-full text-xs px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded focus:outline-none focus:border-[var(--primary)] text-[var(--foreground)]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--foreground)] block mb-1">
                      Ngôn ngữ (Language)
                    </label>
                    <select
                      value={bookLanguage}
                      onChange={(e) => setBookLanguage(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded focus:outline-none focus:border-[var(--primary)] text-[var(--foreground)]"
                    >
                      <option value="vi">Tiếng Việt (vi)</option>
                      <option value="en">English (en)</option>
                      <option value="zh">Trung văn / Hán ngữ (zh)</option>
                      <option value="ja">Tiếng Nhật (ja)</option>
                      <option value="fr">Tiếng Pháp (fr)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--foreground)] block mb-1">
                      Mô tả ngắn (Description)
                    </label>
                    <input
                      type="text"
                      value={bookDescription}
                      onChange={(e) => setBookDescription(e.target.value)}
                      placeholder="Mô tả tóm tắt nội dung sách..."
                      className="w-full text-xs px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded focus:outline-none focus:border-[var(--primary)] text-[var(--foreground)]"
                    />
                  </div>
                </div>

                {/* Jev Core Decision Plane Badge & Card */}
                {activeJev && (
                  <div className="mt-4 bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))] border border-[var(--primary)]/30 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                        ⚡
                      </div>
                      <div className="text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[var(--foreground)]">Phân loại nội dung:</span>
                          <span className="app-badge app-badge--brand text-[10px] font-mono">
                            {activeJev.genre_label}
                          </span>
                          <span className="text-[11px] text-[var(--muted-foreground)]">
                            Tỉ lệ thoại: <strong className="text-[var(--foreground)]">{Math.round(activeJev.dialogue_ratio * 100)}%</strong>
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                          Tự động đề xuất phong cách:{" "}
                          <span className="text-[var(--primary)] font-semibold uppercase">{activeJev.recommended_preset}</span> &bull; {activeJev.explanation}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <span className="app-badge app-badge--success text-[10px] font-mono">
                        Xử lý cục bộ &lt; 2ms
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= STEP 2: SCANNED PDF OCR WORKSPACE ================= */}
        {activeStep === "ocr" && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-200">
            {!pdfDoc ? (
              <div className="text-center p-12 bg-[var(--card)] border border-[var(--border)] rounded-xl">
                <AlertTriangle size={32} className="mx-auto text-amber-500 mb-2" />
                <h3 className="text-base font-semibold text-[var(--foreground)]">Chưa có tài liệu PDF nào được nạp</h3>
                <p className="text-xs text-[var(--muted-foreground)] mb-4">
                  Vui lòng chuyển qua bước 1 để nạp file PDF cần quét OCR.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveStep("upload")}
                  className="app-button app-button--primary text-xs"
                >
                  <ArrowLeft size={14} />
                  <span>Quay Lại Bước 1 (Nạp File)</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left Panel: Preview Canvas & OCR Controls (5 cols) */}
                <div className="lg:col-span-5 flex flex-col gap-4">
                  {/* Visual Page Canvas */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 shadow-sm flex flex-col items-center">
                    <div className="w-full flex items-center justify-between mb-3 pb-2 border-b border-[var(--border)]">
                      <div className="flex items-center gap-1.5">
                        <Eye size={15} className="text-[var(--primary)]" />
                        <span className="text-xs font-semibold text-[var(--foreground)]">
                          Trang {previewPageNumber} / {pdfDoc.numPages}
                        </span>
                      </div>

                      {/* Pagination Controls */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={previewPageNumber <= 1 || isRenderingPreview}
                          onClick={() => setPreviewPageNumber((p) => Math.max(1, p - 1))}
                          className="p-1 rounded hover:bg-[var(--secondary)] text-[var(--foreground)] disabled:opacity-40"
                        >
                          <ArrowLeft size={14} />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={pdfDoc.numPages}
                          value={previewPageNumber}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 1 && val <= pdfDoc.numPages) {
                              setPreviewPageNumber(val);
                            }
                          }}
                          className="w-12 text-center text-xs py-0.5 px-1 bg-[var(--background)] border border-[var(--border)] rounded"
                        />
                        <button
                          type="button"
                          disabled={previewPageNumber >= pdfDoc.numPages || isRenderingPreview}
                          onClick={() => setPreviewPageNumber((p) => Math.min(pdfDoc.numPages, p + 1))}
                          className="p-1 rounded hover:bg-[var(--secondary)] text-[var(--foreground)] disabled:opacity-40"
                        >
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Canvas Container */}
                    <div className="relative w-full max-h-[460px] overflow-auto flex items-center justify-center bg-black/5 dark:bg-black/30 rounded border border-[var(--border)] p-2">
                      <canvas ref={previewCanvasRef} className="shadow-md max-w-full h-auto object-contain rounded" />
                      {isRenderingPreview && (
                        <div className="absolute inset-0 bg-[var(--background)]/60 backdrop-blur-xs flex items-center justify-center text-xs font-medium">
                          Đang tải trang...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* OCR Settings Card */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 shadow-sm flex flex-col gap-3">
                    <h3 className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-2">
                      <Sliders size={14} className="text-[var(--primary)]" />
                      <span>Cấu Hình Nhận Diện OCR</span>
                    </h3>

                    {/* Engine Picker */}
                    <div>
                      <label className="text-[11px] text-[var(--muted-foreground)] block mb-1">
                        Công cụ nhận diện (OCR Engine)
                      </label>
                      <div className="segmented-toggle w-full">
                        <button
                          type="button"
                          data-active={ocrEngine === "tesseract" ? "true" : undefined}
                          data-variant="primary"
                          onClick={() => setOcrEngine("tesseract")}
                          className="segmented-toggle__item flex-1 text-xs"
                        >
                          Tesseract (Cục bộ/Offline)
                        </button>
                        <button
                          type="button"
                          data-active={ocrEngine === "vision" ? "true" : undefined}
                          data-variant="primary"
                          onClick={() => setOcrEngine("vision")}
                          className="segmented-toggle__item flex-1 text-xs"
                        >
                          AI Vision (Gateway/LLM)
                        </button>
                      </div>
                    </div>

                    {/* Language & Resolution */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] text-[var(--muted-foreground)] block mb-1">
                          Ngôn ngữ OCR
                        </label>
                        <select
                          value={ocrLanguage}
                          onChange={(e) => setOcrLanguage(e.target.value as OcrLanguage)}
                          className="w-full text-xs px-2.5 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)]"
                        >
                          <option value="vie+eng">Tiếng Việt &amp; English</option>
                          <option value="vie">Chỉ Tiếng Việt (vie)</option>
                          <option value="eng">Chỉ English (eng)</option>
                          <option value="chi_sim">Trung văn (Hán giản)</option>
                          <option value="jpn">Tiếng Nhật (jpn)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] text-[var(--muted-foreground)] block mb-1">
                          Độ sắc nét (DPI Scale)
                        </label>
                        <select
                          value={ocrScale}
                          onChange={(e) => setOcrScale(parseFloat(e.target.value))}
                          className="w-full text-xs px-2.5 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)]"
                        >
                          <option value={1.5}>1.5x (Nhanh hơn)</option>
                          <option value={2.0}>2.0x (Chuẩn ~200 DPI)</option>
                          <option value={2.5}>2.5x (Chi tiết ~250 DPI)</option>
                        </select>
                      </div>
                    </div>

                    {/* Page Range Picker */}
                    <div>
                      <label className="text-[11px] text-[var(--muted-foreground)] block mb-1">
                        Khoảng trang quét OCR
                      </label>
                      <div className="flex items-center gap-2">
                        <select
                          value={ocrPageRangeMode}
                          onChange={(e) => setOcrPageRangeMode(e.target.value as any)}
                          className="text-xs px-2.5 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] shrink-0"
                        >
                          <option value="all">Tất cả trang ({pdfDoc.numPages})</option>
                          <option value="custom">Khoảng trang...</option>
                          <option value="current">Chỉ trang hiện tại ({previewPageNumber})</option>
                        </select>

                        {ocrPageRangeMode === "custom" && (
                          <input
                            type="text"
                            value={customPageRange}
                            onChange={(e) => setCustomPageRange(e.target.value)}
                            placeholder="vd: 1-10, 15-20"
                            className="flex-1 text-xs px-2.5 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)]"
                          />
                        )}
                      </div>
                      <span className="text-[10px] text-[var(--muted-foreground)] mt-1 block">
                        Số trang sẽ quét: {targetOcrPages.length} trang
                      </span>
                    </div>

                    {/* Progress Bar (if running) */}
                    {isOcrRunning && ocrProgress && (
                      <div className="bg-[var(--secondary)]/60 rounded p-2.5 border border-[var(--border)] flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-[var(--foreground)]">{ocrProgress.statusText}</span>
                          <span className="font-mono text-[var(--primary)]">{ocrProgress.overallPercent}%</span>
                        </div>
                        <div className="w-full bg-[var(--border)] h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-[var(--primary)] h-full transition-all duration-200"
                            style={{ width: `${ocrProgress.overallPercent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      {!isOcrRunning ? (
                        <button
                          type="button"
                          onClick={handleStartOcr}
                          className="app-button app-button--primary flex-1 text-xs justify-center"
                        >
                          <Play size={14} />
                          <span>Bắt Đầu Quét OCR ({targetOcrPages.length} trang)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleCancelOcr}
                          className="app-button app-button--destructive flex-1 text-xs justify-center"
                        >
                          <Square size={14} />
                          <span>Dừng Quét</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Panel: Recognized Text & Editor (7 cols) */}
                <div className="lg:col-span-7 flex flex-col gap-3">
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 shadow-sm flex flex-col gap-3">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                      <div className="flex items-center gap-2">
                        <FileText size={15} className="text-[var(--primary)]" />
                        <h3 className="text-xs font-semibold text-[var(--foreground)]">
                          Văn Bản Nhận Diện (Trang {previewPageNumber})
                        </h3>
                        {ocrRecognizedPages[previewPageNumber] && (
                          <span className="app-badge app-badge--success text-[10px]">Đã OCR</span>
                        )}
                      </div>

                      {/* Quick Polish Tools */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          title="Làm sạch lỗi scan & dấu tiếng Việt"
                          onClick={() => {
                            const cleaned = cleanOcrText(activePageEditorText);
                            handleSaveCurrentPageText(cleaned);
                            toast.success("Đã làm sạch văn bản trang hiện tại!");
                          }}
                          className="app-button app-button--ghost text-[11px] h-7 px-2"
                        >
                          <Wand2 size={13} />
                          <span>Làm sạch</span>
                        </button>

                        <button
                          type="button"
                          title="Gộp dòng mềm (De-hyphenate)"
                          onClick={() => {
                            const merged = dehyphenateAndMergeLines(activePageEditorText);
                            handleSaveCurrentPageText(merged);
                            toast.success("Đã gộp dòng mềm trang hiện tại!");
                          }}
                          className="app-button app-button--ghost text-[11px] h-7 px-2"
                        >
                          <FileCode size={13} />
                          <span>Gộp dòng</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(activePageEditorText);
                            setIsCopied(true);
                            setTimeout(() => setIsCopied(false), 2000);
                            toast.success("Đã chép nội dung vào bộ nhớ tạm!");
                          }}
                          className="app-button app-button--ghost text-[11px] h-7 px-2"
                        >
                          {isCopied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                          <span>{isCopied ? "Đã chép" : "Chép"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Textarea Editor */}
                    <textarea
                      rows={18}
                      value={activePageEditorText}
                      onChange={(e) => handleSaveCurrentPageText(e.target.value)}
                      placeholder="Nội dung chữ sau khi quét OCR sẽ hiển thị ở đây. Bạn có thể tự do đọc lại và chỉnh sửa trực tiếp..."
                      className="w-full text-xs font-mono p-3 bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)] resize-y leading-relaxed"
                    />

                    {/* Footer Info */}
                    <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)] pt-1">
                      <span>
                        Ký tự trang này: {activePageEditorText.length} &bull; Tổng trang đã OCR:{" "}
                        {Object.keys(ocrRecognizedPages).length} / {pdfDoc.numPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveStep("export")}
                        className="text-[var(--primary)] hover:underline font-medium flex items-center gap-1"
                      >
                        <span>Tiếp tục: Xem trước &amp; Tạo EPUB</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= STEP 3: PREVIEW & GENERATE EPUB ================= */}
        {activeStep === "export" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-200">
            {/* File-scoped detection: what this source file needs next */}
            {sourceProfile && (
              <div className="ingest-detect-strip" role="status" aria-live="polite">
                <span className="ingest-detect-strip__label">Nhận diện nguồn:</span>
                <span className="workflow-banner__chip workflow-banner__chip--lang">
                  <span aria-hidden="true">{sourceProfile.languageFlag}</span>
                  <span>{sourceProfile.languageName}</span>
                  <span className="workflow-banner__chip-meta">
                    {Math.round(sourceProfile.languageConfidence * 100)}%
                  </span>
                </span>
                <span className="workflow-banner__chip workflow-banner__chip--workflow">
                  {workflowLabel(sourceProfile)}
                </span>
                <span className="ingest-detect-strip__steps">
                  {sourceSteps.join(" → ")}
                </span>
              </div>
            )}

            {/* Summary Banner */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))] border border-[var(--primary)] flex items-center justify-center text-[var(--primary)]">
                  <BookCheck size={24} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[var(--foreground)]">
                    {bookTitle || "Ebook Chuyển Đổi"}
                  </h2>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    Tác giả: <span className="text-[var(--foreground)]">{bookAuthor || "Khuyết Danh"}</span> &bull; Ngôn ngữ:{" "}
                    <span className="text-[var(--foreground)] uppercase">{bookLanguage}</span> &bull; Số chương:{" "}
                    <span className="font-semibold text-[var(--primary)]">{chapters.length} chương</span>
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 w-full md:w-auto">
                <button
                  type="button"
                  disabled={isGeneratingEpub || chapters.length === 0}
                  onClick={handleLoadIntoStudio}
                  className="app-button app-button--primary flex-1 md:flex-initial text-xs shadow-md"
                >
                  <Sparkles size={14} />
                  <span>
                    {sourceNeedsTranslation
                      ? "Nạp Vào Studio & Dịch Thuật"
                      : "Nạp Vào Studio Làm Đẹp"}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isGeneratingEpub || chapters.length === 0}
                  onClick={handleExportEpubFile}
                  className="app-button app-button--secondary text-xs"
                >
                  <Download size={14} />
                  <span>Lưu File EPUB...</span>
                </button>

                <button
                  type="button"
                  disabled={chapters.length === 0}
                  onClick={() => handleExportTextFile("md")}
                  className="app-button app-button--ghost text-xs"
                >
                  <span>Xuất .MD</span>
                </button>
              </div>
            </div>

            {/* Chapter Split Configuration */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 shadow-sm flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[var(--border)] gap-2">
                <h3 className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-2">
                  <Sliders size={14} className="text-[var(--primary)]" />
                  <span>Cấu Hình Phân Chia Chương (Chapter Splitting)</span>
                </h3>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={isEnhancingJev || chapters.length === 0}
                    onClick={handleRunJevVerdictOnChapters}
                    className="app-button app-button--secondary text-xs flex items-center gap-1.5"
                    title="Chuẩn hóa tiêu đề H1, dọn rác đầu chương và sửa lỗi chính tả tự động"
                  >
                    <Sparkles size={13} className="text-amber-500" />
                    <span>{isEnhancingJev ? "Đang tối ưu..." : "⚡ Tối Ưu Cấu Trúc Nhanh (< 5ms)"}</span>
                  </button>

                  <button
                    type="button"
                    disabled={chapters.length === 0}
                    onClick={handleCleanConverterWatermarks}
                    className="app-button app-button--secondary text-xs flex items-center gap-1.5"
                    title="Xóa sạch các đoạn watermark dtv-ebook, tve-4u, truyenfull và header/footer rác"
                  >
                    <Trash2 size={13} className="text-amber-500" />
                    <span>🧹 Xóa Watermark DTV / Web</span>
                  </button>

                  <div className="segmented-toggle">
                    <button
                      type="button"
                      data-active={chapterSplitMode === "auto" ? "true" : undefined}
                      data-variant="primary"
                      onClick={() => {
                        setChapterSplitMode("auto");
                        if (ocrRecognizedPages && Object.keys(ocrRecognizedPages).length > 0) {
                          reconstructChaptersFromOcr(ocrRecognizedPages);
                        }
                      }}
                      className="segmented-toggle__item text-xs"
                    >
                      Tự động
                    </button>
                    <button
                      type="button"
                      data-active={chapterSplitMode === "pages" ? "true" : undefined}
                      data-variant="primary"
                      onClick={() => {
                        setChapterSplitMode("pages");
                        if (ocrRecognizedPages && Object.keys(ocrRecognizedPages).length > 0) {
                          reconstructChaptersFromOcr(ocrRecognizedPages);
                        }
                      }}
                      className="segmented-toggle__item text-xs"
                    >
                      Theo số trang
                    </button>
                    <button
                      type="button"
                      data-active={chapterSplitMode === "single" ? "true" : undefined}
                      data-variant="primary"
                      onClick={() => {
                        setChapterSplitMode("single");
                        if (ocrRecognizedPages && Object.keys(ocrRecognizedPages).length > 0) {
                          reconstructChaptersFromOcr(ocrRecognizedPages);
                        }
                      }}
                      className="segmented-toggle__item text-xs"
                    >
                      1 Chương
                    </button>
                  </div>
                </div>
              </div>

              {chapterSplitMode === "pages" && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[var(--muted-foreground)]">Số trang mỗi chương:</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={pagesPerChapter}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1) {
                        setPagesPerChapter(val);
                        if (ocrRecognizedPages && Object.keys(ocrRecognizedPages).length > 0) {
                          reconstructChaptersFromOcr(ocrRecognizedPages);
                        }
                      }
                    }}
                    className="w-16 px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-center"
                  />
                </div>
              )}
            </div>

            {/* Chapters Preview List */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                Danh Sách Chương ({chapters.length})
              </h3>

              {chapters.length === 0 ? (
                <div className="p-8 text-center bg-[var(--card)] border border-[var(--border)] rounded-xl text-xs text-[var(--muted-foreground)]">
                  Chưa có chương nào. Hãy nạp file hoặc chạy quét OCR ở bước 2.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {chapters.map((ch, idx) => (
                    <div
                      key={idx}
                      className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3.5 hover:border-[var(--primary)] transition-colors shadow-2xs flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-[var(--secondary)] flex items-center justify-center text-[10px] font-mono text-[var(--muted-foreground)]">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-semibold text-[var(--foreground)] line-clamp-1">
                            {ch.title}
                          </span>
                        </div>
                        <span className="text-[10px] text-[var(--muted-foreground)] font-mono shrink-0">
                          {ch.content.split(/\s+/).length} từ
                        </span>
                      </div>

                      <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2 italic leading-relaxed">
                        {ch.content.slice(0, 140)}...
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Global Realtime Progress Modal Popup */}
      <ProgressModal {...modalProgress} />

      {/* Auto Metadata & Cover Enrichment Modal */}
      <MetadataModal
        isOpen={isMetadataModalOpen}
        onClose={() => setIsMetadataModalOpen(false)}
        converterValues={{
          title: bookTitle,
          author: bookAuthor,
          language: bookLanguage,
          description: bookDescription,
          coverDataUrl: bookCoverDataUrl || undefined,
        }}
        onApplyConverterValues={(vals) => {
          setBookTitle(vals.title);
          setBookAuthor(vals.author);
          setBookLanguage(vals.language);
          setBookDescription(vals.description);
          if (vals.coverDataUrl) {
            setBookCoverDataUrl(vals.coverDataUrl);
          }
        }}
      />
    </div>
  );
}
