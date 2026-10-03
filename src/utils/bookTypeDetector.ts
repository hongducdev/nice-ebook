/**
 * BookTypeDetector: classifies a freshly ingested book into an *ingest workflow*.
 *
 * Purpose
 * -------
 * The application used to branch purely on file extension (`.epub` -> library,
 * `.pdf/.txt/.md` -> converter) and ignored the language of the book entirely,
 * even though `detectIsVietnameseBook()` already ran on every load. This module
 * turns those observations into a single, testable decision:
 *
 *   observations (kind, language, watermarks)  ->  BookProfile  ->  workflow + tab
 *
 * Design rules
 * ------------
 * 1. `LanguageDetector` is the canonical language authority. This module only
 *    *classifies* its output (does the detection rest on real evidence or is it
 *    the blind "en" fallback?) — it never re-implements the resolution rules.
 * 2. `BookProfile` stores observations plus ONE derived workflow enum. It does
 *    NOT store `needsOcr` / `needsTranslation` / `steps`, which are all derivable
 *    (see `buildWorkflowSteps`). One source of truth, no drift.
 * 3. Watermarks are NOT a workflow. They are a *step* (`cleanup`) that can be
 *    prepended to any workflow, which avoids contradictory precedence rules when
 *    a scanned, watermarked, foreign-language PDF arrives.
 * 4. Every function here is pure: no `invoke`, no `localStorage`, no React.
 *
 * Known duplicate detector (deliberate, with an exit condition)
 * -------------------------------------------------------------
 * `vietnameseHelper.detectIsVietnameseBook()` still exists and is still used by
 * 12 legacy call sites (font selection, export CSS, reader). It uses a
 * looser rule: Vietnamese metadata OR Vietnamese title OR description OR sample.
 *
 * The divergence is exactly one case: metadata says `vi` but the body text is
 * foreign (`detectIsVietnameseBook` -> true, this module -> false). The load paths
 * in `useAppStore` prefer this module's verdict whenever `detectionSource !==
 * "unknown"`, so the legacy helper only decides when there is no usable evidence.
 *
 * This is safe to delete once all 12 call sites read `bookProfile.isVietnamese`;
 * until then the reconciliation test in `bookTypeDetector.test.ts` is what stops
 * the two from drifting silently.
 */

import type { EpubMetadata } from "../stores/useAppStore";
import type { ActiveTab } from "../types/navigation";
import { LanguageDetector } from "./languageDetector";
import { detectBookWatermarks, stripWatermarkTokens } from "./watermarkCleaner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What kind of file the book came from. */
export type IngestKind = "epub" | "pdf-digital" | "pdf-scanned" | "txt" | "md";

/** The pipeline the user should follow for this book. */
export type BookWorkflow =
  | "polish"
  | "translate"
  | "ocr"
  | "ocr-translate"
  | "convert"
  | "convert-translate";

/** Identifiers for individual steps inside a workflow. */
export type WorkflowStepId = "cleanup" | "ocr" | "convert" | "translate" | "style" | "read";

export type DetectionSource = "metadata" | "heuristic" | "combined" | "unknown";

export interface BookProfile {
  /** Stable key identifying the book this profile describes. */
  bookIdentity: string;
  /** Origin format of the book. */
  kind: IngestKind;
  /** ISO-ish language code resolved by `LanguageDetector`. */
  languageCode: string;
  /** Human readable language name (Vietnamese UI copy). */
  languageName: string;
  /** Emoji flag for the chip in the UI. */
  languageFlag: string;
  /** 0..1 confidence of the language detection. */
  languageConfidence: number;
  /** Which evidence the detection rested on. */
  detectionSource: DetectionSource;
  /** Convenience boolean: `languageCode === "vi"`. */
  isVietnamese: boolean;
  /** True when library watermarks / junk headers were found. */
  hasWatermarks: boolean;
  /** How many chapters appear to carry a watermark. */
  watermarkChapters: number;
  /** The derived workflow. Single source of truth for routing. */
  workflow: BookWorkflow;
  /** Human readable explanations, shown in the workflow banner. */
  reasons: string[];
  /** Whether the detection is solid enough to auto-switch tabs. */
  autoRoutable: boolean;
}

export interface WorkflowStep {
  id: WorkflowStepId;
  label: string;
  tab: ActiveTab;
  description: string;
}

export interface DetectBookProfileContext {
  kind?: IngestKind;
  sourceName?: string | null;
  /** Hint from the PDF inspector: the file has no usable text layer. */
  isScannedPdf?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EMPTY_LANGUAGE_FLAG = "🏳️";

const LANGUAGE_FLAGS: Record<string, string> = {
  vi: "🇻🇳",
  en: "🇬🇧",
  zh: "🇨🇳",
  ja: "🇯🇵",
  ko: "🇰🇷",
  fr: "🇫🇷",
  de: "🇩🇪",
  es: "🇪🇸",
  ru: "🇷🇺",
};

export const WORKFLOW_LABELS: Record<BookWorkflow, string> = {
  polish: "Sách tiếng Việt",
  translate: "Dịch thuật",
  ocr: "OCR",
  "ocr-translate": "OCR → Dịch thuật",
  convert: "Chuyển đổi",
  "convert-translate": "Chuyển đổi → Dịch thuật",
};

export const WORKFLOW_TAB: Record<BookWorkflow, ActiveTab> = {
  polish: "books",
  translate: "translator",
  ocr: "converter",
  "ocr-translate": "converter",
  convert: "converter",
  "convert-translate": "converter",
};

export const KIND_LABELS: Record<IngestKind, string> = {
  epub: "EPUB",
  "pdf-digital": "PDF (có lớp văn bản)",
  "pdf-scanned": "PDF scan (ảnh)",
  txt: "TXT",
  md: "Markdown",
};

const DETECTION_SOURCE_LABELS: Record<DetectionSource, string> = {
  metadata: "metadata sách",
  heuristic: "phân tích văn bản",
  combined: "metadata + văn bản",
  unknown: "chưa đủ dữ liệu",
};

/** Minimum confidence required before we dare to switch tabs on our own. */
export const AUTO_ROUTE_CONFIDENCE_THRESHOLD = 0.75;

const MIN_SAMPLE_LENGTH = 10;
const CONFIDENCE_WHEN_UNKNOWN = 0.35;

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

/** True when this workflow ends in a translation step. */
export function isTranslationWorkflow(workflow: BookWorkflow | null | undefined): boolean {
  return workflow === "translate" || workflow === "ocr-translate" || workflow === "convert-translate";
}

/** Stable key identifying one book, used to reset per-book workflow state. */
export function bookIdentityKey(book?: EpubMetadata | null): string {
  if (!book) return "";
  return `${book.title}::${book.chapter_count}::${book.file_size_bytes}`;
}

/** Short label for chips / badges. */
export function workflowLabel(profile: BookProfile | null | undefined): string {
  if (!profile) return "";
  return WORKFLOW_LABELS[profile.workflow];
}

/**
 * Maps a file name / file type onto an ingest kind.
 *
 * `.pdf` maps to `pdf-digital` because we cannot know whether the PDF is scanned
 * before inspecting it; `ConverterView` upgrades the kind to `pdf-scanned` once
 * its inspector reports that no text layer exists. Unknown extensions fall back
 * to `epub`, the application's native format.
 */
export function workflowKindFromFile(
  name?: string | null,
  fileType?: string | null
): IngestKind {
  const raw = (fileType || name || "").toLowerCase().trim();
  if (!raw) return "epub";
  const ext = raw.includes(".") ? raw.slice(raw.lastIndexOf(".") + 1) : raw;
  switch (ext) {
    case "pdf":
      return "pdf-digital";
    case "txt":
      return "txt";
    case "md":
    case "markdown":
      return "md";
    case "epub":
    default:
      return "epub";
  }
}

/** Suggested Tesseract language pack for a detected language code. */
export function suggestOcrLanguage(languageCode: string): "vie" | "eng" | "vie+eng" | "chi_sim" | "jpn" {
  switch (languageCode) {
    case "vi":
      return "vie+eng";
    case "zh":
      return "chi_sim";
    case "ja":
      return "jpn";
    default:
      return "eng";
  }
}

/**
 * Builds the text sample used for detection.
 *
 * Body text first (chapter previews + `sample_text`), then the title/description
 * as a weak tail. Putting body text first matters: a Vietnamese *title* on a
 * foreign-language book must not decide the language on its own.
 *
 * Watermark tokens are stripped first. `LanguageDetector` treats the first two
 * Vietnamese diacritics anywhere in the sample as decisive, so a single pirate-site
 * footer line would otherwise flag a whole Chinese or English book as Vietnamese
 * and skip translation for it entirely.
 */
function buildDetectionSample(book: EpubMetadata): string {
  const parts: string[] = [];

  if (book.sample_text) parts.push(book.sample_text);
  if (book.chapters && book.chapters.length > 0) {
    for (const chapter of book.chapters.slice(0, 3)) {
      if (chapter.preview_text) parts.push(chapter.preview_text);
    }
  }
  if (book.description) parts.push(book.description);

  const body = stripWatermarkTokens(parts.join("\n").trim());
  if (body.length >= MIN_SAMPLE_LENGTH * 4) {
    return body.slice(0, 12000);
  }

  // Too little body text — add the chapter titles and the book title as weak signals.
  const titleParts: string[] = [];
  if (book.chapters) {
    for (const chapter of book.chapters.slice(0, 5)) {
      if (chapter.title) titleParts.push(chapter.title);
    }
  }
  if (book.title) titleParts.push(book.title);

  return `${body}\n${stripWatermarkTokens(titleParts.join("\n"))}`.trim().slice(0, 12000);
}

/**
 * Watermarks: library-specific markers are trustworthy, but the "broken
 * Vietnamese diacritics" heuristic matches ordinary Latin punctuation
 * (`Mia's`, `don't` -> `a'`), so it is only believed for Vietnamese books.
 */
function detectWatermarkFacts(
  book: EpubMetadata,
  isVietnamese: boolean
): { hasWatermarks: boolean; watermarkChapters: number } {
  const chapters = book.chapters ?? [];
  if (chapters.length === 0) {
    return { hasWatermarks: false, watermarkChapters: 0 };
  }

  const report = detectBookWatermarks(chapters);
  const hasLibraryMarker =
    report.detectedDomains.length > 0 ||
    report.detectedPatterns.some((pattern) => !pattern.startsWith("Lỗi tách dấu"));

  return {
    hasWatermarks: hasLibraryMarker || (isVietnamese && report.hasWatermarks),
    watermarkChapters: hasLibraryMarker || isVietnamese ? report.affectedChaptersCount : 0,
  };
}

/** Derives the workflow from the observations. Pure function, no lookups. */
export function deriveWorkflow(
  kind: IngestKind,
  isVietnamese: boolean,
  isScannedPdf = false
): BookWorkflow {
  const effectiveKind: IngestKind = kind === "pdf-digital" && isScannedPdf ? "pdf-scanned" : kind;
  if (effectiveKind === "pdf-scanned") {
    return isVietnamese ? "ocr" : "ocr-translate";
  }
  if (effectiveKind !== "epub") {
    return isVietnamese ? "convert" : "convert-translate";
  }
  return isVietnamese ? "polish" : "translate";
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Classifies a loaded book. Returns `null` when there is no book at all.
 *
 * The result is computed from data already present on `EpubMetadata` — no extra
 * EPUB parsing, no Rust round-trip.
 */
export function detectBookProfile(
  book?: EpubMetadata | null,
  context: DetectBookProfileContext = {}
): BookProfile | null {
  if (!book) return null;

  // An explicit `isScannedPdf` hint implies the source is a PDF, so callers can
  // pass just the hint without also having to spell out the kind.
  const requestedKind =
    context.kind ??
    (context.isScannedPdf === true
      ? "pdf-digital"
      : workflowKindFromFile(context.sourceName ?? null));
  // A PDF reported as scanned is re-classified here so `profile.kind`, the
  // derived workflow and `buildWorkflowSteps` can never disagree.
  const kind: IngestKind =
    requestedKind === "pdf-digital" && context.isScannedPdf === true ? "pdf-scanned" : requestedKind;

  // --- language ---------------------------------------------------------
  const sample = buildDetectionSample(book);
  const detection = LanguageDetector.detectLanguage(sample, book.language);
  const heuristic = LanguageDetector.detectFromTextHeuristics(sample);
  const metadataCode = LanguageDetector.normalizeMetadataCode(book.language);

  let detectionSource: DetectionSource = detection.source;
  let confidence = detection.confidence;

  if (!heuristic && !metadataCode) {
    // `detectLanguage` fell through to its blind "en" default. Report honestly.
    detectionSource = "unknown";
    confidence = CONFIDENCE_WHEN_UNKNOWN;
  }

  const languageCode = detection.languageCode;
  const isVietnamese = languageCode === "vi";

  // --- watermarks -------------------------------------------------------
  const { hasWatermarks, watermarkChapters } = detectWatermarkFacts(book, isVietnamese);

  // --- workflow ---------------------------------------------------------
  const workflow = deriveWorkflow(kind, isVietnamese);
  const chaptersWithoutTitle = (book.chapters ?? []).filter(
    (chapter) => !chapter.title || chapter.title.trim().length === 0
  ).length;

  // --- narration --------------------------------------------------------
  const reasons: string[] = [];

  if (detectionSource === "unknown") {
    reasons.push(
      `Chưa đủ dữ liệu văn bản để xác định ngôn ngữ — mặc định xử lý như tiếng Anh (${Math.round(
        confidence * 100
      )}%)`
    );
  } else {
    reasons.push(
      `Ngôn ngữ nhận diện: ${detection.languageName} — độ tin cậy ${Math.round(
        confidence * 100
      )}% (${DETECTION_SOURCE_LABELS[detectionSource]})`
    );
  }

  if (kind === "pdf-scanned") {
    reasons.push("PDF không có lớp văn bản — cần OCR để trích xuất chữ từ ảnh scan");
  } else if (kind === "pdf-digital") {
    reasons.push("PDF có lớp văn bản — trích xuất trực tiếp, không cần OCR");
  } else if (kind === "txt" || kind === "md") {
    reasons.push(`${KIND_LABELS[kind]} — cần đóng gói thành EPUB trước khi định kiểu`);
  }

  if (hasWatermarks) {
    reasons.push(
      `Phát hiện watermark / header rác trong ${watermarkChapters}/${book.chapter_count} chương`
    );
  }

  if (isTranslationWorkflow(workflow)) {
    reasons.push(
      `Sách không phải tiếng Việt — cần dịch sang tiếng Việt trước khi xuất bản`
    );
  } else if (workflow === "polish") {
    reasons.push("Sách đã là tiếng Việt — sẵn sàng định kiểu và xuất bản");
  }

  if (chaptersWithoutTitle > 0 && (book.chapter_count ?? 0) > 1) {
    reasons.push(
      `${chaptersWithoutTitle} chương thiếu tiêu đề — nên chạy Biên tập AI để chuẩn hoá H1/H2`
    );
  }

  return {
    bookIdentity: bookIdentityKey(book),
    kind,
    languageCode,
    languageName: detection.languageName,
    languageFlag: LANGUAGE_FLAGS[languageCode] ?? EMPTY_LANGUAGE_FLAG,
    languageConfidence: Number(confidence.toFixed(2)),
    detectionSource,
    isVietnamese,
    hasWatermarks,
    watermarkChapters,
    workflow,
    reasons,
    autoRoutable:
      detectionSource !== "unknown" && confidence >= AUTO_ROUTE_CONFIDENCE_THRESHOLD,
  };
}

/**
 * Derives the ordered steps of a workflow. Deliberately NOT stored on the
 * profile — a stored copy would be a second source of truth.
 */
export function buildWorkflowSteps(profile?: BookProfile | null): WorkflowStep[] {
  if (!profile) return [];

  const steps: WorkflowStep[] = [];

  if (profile.hasWatermarks) {
    steps.push({
      id: "cleanup",
      label: "Làm sạch",
      tab: "books",
      description: `Xoá watermark và header rác trong ${profile.watermarkChapters} chương`,
    });
  }

  if (profile.kind === "pdf-scanned") {
    steps.push({
      id: "ocr",
      label: "OCR",
      tab: "converter",
      description: "Nhận dạng văn bản từ ảnh scan bằng Tesseract hoặc AI Vision",
    });
  } else if (profile.kind !== "epub") {
    steps.push({
      id: "convert",
      label: "Chuyển đổi",
      tab: "converter",
      description: `Trích xuất văn bản từ ${KIND_LABELS[profile.kind]} và đóng gói thành EPUB`,
    });
  }

  if (isTranslationWorkflow(profile.workflow)) {
    steps.push({
      id: "translate",
      label: "Dịch thuật",
      tab: "translator",
      description: "Dịch sang tiếng Việt, bảo toàn 100% cấu trúc XHTML",
    });
  }

  steps.push({
    id: "style",
    label: "Định kiểu",
    tab: "editor",
    description: "Kiểm tra và tinh chỉnh kiểu chữ trên style gốc của sách",
  });

  steps.push({
    id: "read",
    label: "Xuất bản",
    tab: "reader",
    description: "Đọc thử, soát lỗi rồi xuất EPUB",
  });

  return steps;
}

/**
 * Returns the index of the first step that has not been completed yet.
 * Returns `steps.length` when everything is done, and `-1` when there is no plan.
 */
export function currentStepIndex(
  steps: WorkflowStep[],
  completedStepIds: readonly string[]
): number {
  if (steps.length === 0) return -1;
  const done = new Set(completedStepIds);
  const index = steps.findIndex((step) => !done.has(step.id));
  return index === -1 ? steps.length : index;
}
