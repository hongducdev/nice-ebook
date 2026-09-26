/**
 * NiceEbook Studio - Scanned PDF Detector
 * Inspects PDF pages and calculates text density heuristics to determine
 * whether a PDF is digital text or a scanned image requiring OCR.
 */

export interface ScanDetectionResult {
  isScanned: boolean;
  confidence: number;
  totalPages: number;
  sampledPages: number;
  totalCharsSampled: number;
  avgCharsPerPage: number;
  emptyPagesCount: number;
  recommendation: string;
}

export interface PageTextStats {
  pageIndex: number;
  charCount: number;
  hasText: boolean;
}

/**
 * Deterministic classifier based on sampled page text statistics
 */
export function classifyPdfScanState(
  totalPages: number,
  samples: PageTextStats[],
  minCharsThreshold = 50,
  emptyRatioThreshold = 0.75
): ScanDetectionResult {
  if (samples.length === 0) {
    return {
      isScanned: false,
      confidence: 0.5,
      totalPages,
      sampledPages: 0,
      totalCharsSampled: 0,
      avgCharsPerPage: 0,
      emptyPagesCount: 0,
      recommendation: "Không thể lấy mẫu trang để kiểm tra.",
    };
  }

  const totalCharsSampled = samples.reduce((acc, s) => acc + s.charCount, 0);
  const avgCharsPerPage = totalCharsSampled / samples.length;
  const emptyPagesCount = samples.filter((s) => s.charCount < 15).length;
  const emptyPagesRatio = emptyPagesCount / samples.length;

  const isScanned = avgCharsPerPage < minCharsThreshold || emptyPagesRatio >= emptyRatioThreshold;

  let confidence = 0.95;
  if (isScanned) {
    if (avgCharsPerPage < 10 && emptyPagesRatio > 0.9) {
      confidence = 0.99;
    } else {
      confidence = 0.85;
    }
  } else {
    if (avgCharsPerPage > 500 && emptyPagesRatio < 0.1) {
      confidence = 0.98;
    } else {
      confidence = 0.88;
    }
  }

  const recommendation = isScanned
    ? "Phát hiện file PDF dạng Scan (ảnh chụp/không có văn bản số). Khuyến nghị sử dụng công cụ OCR Scanned PDF."
    : "PDF văn bản số chuẩn (Digital Text) - Có thể chuyển đổi trực tiếp sang EPUB.";

  return {
    isScanned,
    confidence,
    totalPages,
    sampledPages: samples.length,
    totalCharsSampled,
    avgCharsPerPage: Math.round(avgCharsPerPage),
    emptyPagesCount,
    recommendation,
  };
}

/**
 * Samples page indices for quick inspection (e.g. first, middle, last pages)
 */
export function getSamplePageIndices(totalPages: number, maxSamples = 12): number[] {
  if (totalPages <= maxSamples) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const indices = new Set<number>();
  // First 4 pages
  for (let i = 1; i <= Math.min(4, totalPages); i++) indices.add(i);

  // Middle pages
  const mid = Math.floor(totalPages / 2);
  for (let i = Math.max(1, mid - 2); i <= Math.min(totalPages, mid + 2); i++) indices.add(i);

  // Last 4 pages
  for (let i = Math.max(1, totalPages - 3); i <= totalPages; i++) indices.add(i);

  return Array.from(indices).sort((a, b) => a - b);
}
