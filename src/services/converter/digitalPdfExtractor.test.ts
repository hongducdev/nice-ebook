import { describe, it, expect, vi } from "vitest";
import { extractPageText, quickScanInspectPdf } from "./digitalPdfExtractor";

describe("digitalPdfExtractor", () => {
  it("sorts text items top-to-bottom and left-to-right correctly", async () => {
    const mockPage = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          // Bottom line items
          { str: "Thế.", transform: [1, 0, 0, 1, 100, 500] },
          { str: "Xuất", transform: [1, 0, 0, 1, 50, 500] },
          { str: "Hầu", transform: [1, 0, 0, 1, 10, 500] },
          // Top line items (higher Y in PDF coordinates)
          { str: "1:", transform: [1, 0, 0, 1, 70, 700] },
          { str: "Chương", transform: [1, 0, 0, 1, 10, 700] },
        ],
      }),
    };

    const text = await extractPageText(mockPage as any);
    const lines = text.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe("Chương 1:");
    expect(lines[1]).toBe("Hầu Xuất Thế.");
  });

  it("inspects sampled pages to identify digital vs scanned", async () => {
    const mockPdfDoc = {
      numPages: 20,
      getPage: vi.fn().mockImplementation((idx: number) => {
        return Promise.resolve({
          getTextContent: vi.fn().mockResolvedValue({
            items: [
              {
                str: `Đây là nội dung đầy đủ của trang ${idx}. Cuốn sách này được biên soạn rất kỹ lưỡng với đầy đủ các chương hồi, đoạn văn, phân tích và trích dẫn phong phú từ nhiều nguồn tài liệu quý báu. Người đọc có thể dễ dàng theo dõi cốt truyện liền mạch mà không gặp bất kỳ sự gián đoạn nào. Hệ thống trích xuất văn bản số hoạt động hiệu quả và phân loại chính xác các đoạn văn bản.`,
                transform: [1, 0, 0, 1, 10, 700],
              },
            ],
          }),
        });
      }),
    };

    const scanResult = await quickScanInspectPdf(mockPdfDoc as any);
    expect(scanResult.totalPages).toBe(20);
    expect(scanResult.isScanned).toBe(false);
  });
});
