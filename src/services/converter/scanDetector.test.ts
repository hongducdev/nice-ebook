import { describe, it, expect } from "vitest";
import { classifyPdfScanState, getSamplePageIndices, PageTextStats } from "./scanDetector";

describe("scanDetector", () => {
  it("classifies pure scanned PDF as scanned with high confidence", () => {
    const samples: PageTextStats[] = [
      { pageIndex: 1, charCount: 0, hasText: false },
      { pageIndex: 2, charCount: 0, hasText: false },
      { pageIndex: 3, charCount: 4, hasText: true }, // stray speckle
      { pageIndex: 4, charCount: 0, hasText: false },
      { pageIndex: 5, charCount: 0, hasText: false },
    ];

    const result = classifyPdfScanState(100, samples);
    expect(result.isScanned).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.emptyPagesCount).toBe(5);
    expect(result.avgCharsPerPage).toBeLessThan(10);
    expect(result.recommendation).toContain("PDF dạng Scan");
  });

  it("classifies digital text PDF as digital", () => {
    const samples: PageTextStats[] = [
      { pageIndex: 1, charCount: 850, hasText: true },
      { pageIndex: 2, charCount: 1420, hasText: true },
      { pageIndex: 3, charCount: 1680, hasText: true },
      { pageIndex: 4, charCount: 1510, hasText: true },
    ];

    const result = classifyPdfScanState(50, samples);
    expect(result.isScanned).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.emptyPagesCount).toBe(0);
    expect(result.avgCharsPerPage).toBeGreaterThan(1000);
    expect(result.recommendation).toContain("PDF văn bản số");
  });

  it("samples head, middle, and tail pages evenly", () => {
    const indices = getSamplePageIndices(200, 12);
    expect(indices.length).toBeLessThanOrEqual(14);
    expect(indices).toContain(1);
    expect(indices).toContain(2);
    expect(indices).toContain(100);
    expect(indices).toContain(200);
  });
});
