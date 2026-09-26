import { describe, it, expect } from "vitest";
import { loadPdfDocument, quickScanInspectPdf, extractDigitalPdf } from "./digitalPdfExtractor";
import { cleanOcrText } from "./ocrPostProcessor";
import { parseTxtOrMarkdown } from "./txtMarkdownExtractor";
import { detectChapterMarkers } from "./textCleaner";

/**
 * Creates a minimal valid PDF 1.4 byte sequence with digital text
 */
function createMinimalDigitalPdfBytes(): Uint8Array {
  const contentStream = `
BT
/F1 14 Tf
50 750 Td
(Chapter 1: The Great Beginning) Tj
0 -25 Td
(This digital text is extracted directly from a real PDF file.) Tj
0 -20 Td
(The journey of ten thousand miles begins with a single step.) Tj
ET
`.trim();

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${contentStream.length} >>
stream
${contentStream}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000234 00000 n 
0000000300 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
380
%%EOF`;

  return new TextEncoder().encode(pdf);
}

/**
 * Creates a minimal valid PDF 1.4 byte sequence with NO text stream (simulating a scanned image page)
 */
function createMinimalScannedPdfBytes(): Uint8Array {
  // Empty stream content - simulates page containing only rasterized scan
  const contentStream = `q 10 0 0 10 50 50 cm Q`;

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << >> >>
endobj
4 0 obj
<< /Length ${contentStream.length} >>
stream
${contentStream}
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000207 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
280
%%EOF`;

  return new TextEncoder().encode(pdf);
}

describe("E2E Ebook Conversion Workflow", () => {
  it("processes a real digital PDF document end-to-end", async () => {
    const pdfBytes = createMinimalDigitalPdfBytes();
    expect(pdfBytes.length).toBeGreaterThan(100);

    // 1. Load PDF with pdfjs-dist
    const pdfDoc = await loadPdfDocument(pdfBytes);
    expect(pdfDoc.numPages).toBe(1);

    // 2. Inspect with scan detector
    const scanInfo = await quickScanInspectPdf(pdfDoc);
    expect(scanInfo.totalPages).toBe(1);
    expect(scanInfo.isScanned).toBe(false);

    // 3. Extract text and detect chapters
    const extracted = await extractDigitalPdf(pdfDoc, "The Journey");
    expect(extracted.title).toBe("The Journey");
    expect(extracted.chapters.length).toBeGreaterThanOrEqual(1);
    expect(extracted.chapters[0].title).toContain("Chapter 1");
    expect(extracted.chapters[0].content).toContain("This digital text is extracted directly from a real PDF file.");
  });

  it("identifies a scanned PDF with empty text layer and routes to OCR", async () => {
    const pdfBytes = createMinimalScannedPdfBytes();
    const pdfDoc = await loadPdfDocument(pdfBytes);
    expect(pdfDoc.numPages).toBe(1);

    const scanInfo = await quickScanInspectPdf(pdfDoc);
    expect(scanInfo.isScanned).toBe(true);
    expect(scanInfo.avgCharsPerPage).toBeLessThan(10);
    expect(scanInfo.recommendation).toContain("PDF dạng Scan");
  });

  it("cleans OCR text and parses chapters from raw scanned text", () => {
    const rawOcrOutput = `
Chương 1: Khởi Sự Đan Đạo
|
Đan đạo vô cùng huyền diệu, đòi hỏi tâm tính kiên-
trì bền bỉ.
.
~
Lửa tam muội bốc lên ngùn ngụt.
`;

    const cleaned = cleanOcrText(rawOcrOutput);
    expect(cleaned).not.toMatch(/^\|$/m);
    expect(cleaned).not.toMatch(/^\.$/m);
    expect(cleaned).toContain("kiêntrì");

    const chapters = detectChapterMarkers(cleaned);
    expect(chapters.length).toBe(1);
    expect(chapters[0].title).toBe("Chương 1: Khởi Sự Đan Đạo");
    expect(chapters[0].content).toContain("Lửa tam muội bốc lên ngùn ngụt.");
  });

  it("converts markdown and txt files with chapter detection", () => {
    const rawMd = `# Tuyệt Phẩm Tu Chân

Chương 1: Tụ Khí Kỳ
Luyện khí tầng thứ nhất.

Chương 2: Trúc Cơ Kỳ
Ngưng tụ kim đan.
`;

    const doc = parseTxtOrMarkdown(rawMd, "tuyet-pham.md");
    expect(doc.title).toBe("Tuyệt Phẩm Tu Chân");
    expect(doc.chapters.length).toBe(2);
    expect(doc.chapters[0].title).toBe("Chương 1: Tụ Khí Kỳ");
    expect(doc.chapters[1].title).toBe("Chương 2: Trúc Cơ Kỳ");
  });
});
