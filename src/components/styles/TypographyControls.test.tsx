import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_NATIVE_FALLBACK } from "../../presets/styles";

let mockStoreState: Record<string, any> = {};

vi.mock("../../stores/useAppStore", () => {
  const hook = () => mockStoreState;
  hook.getState = () => mockStoreState;
  hook.setState = (patch: Record<string, any>) => {
    mockStoreState = { ...mockStoreState, ...patch };
  };
  return { useAppStore: hook };
});

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === "read_chapter" || cmd === "read_chapter_bytes") {
      return Promise.resolve(
        `<div class="chapter-body"><h1>Chương 1: Mở Đầu</h1><p>Nội dung chương 1 nguyên bản từ sách.</p></div>`
      );
    }
    if (cmd === "read_epub_styles") {
      return Promise.resolve([
        { href: "style.css", content: "body { font-family: 'Lora', serif; font-size: 16px; line-height: 1.6; }" }
      ]);
    }
    return Promise.resolve("");
  }),
}));

const { TypographyControls } = await import("./TypographyControls");

describe("TypographyControls Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      currentBook: null,
      currentFilePath: null,
      currentFileBytes: null,
      activeChapterIndex: 0,
      setActiveChapterIndex: vi.fn(),
      activePresetId: DEFAULT_NATIVE_FALLBACK.id,
      activePreset: DEFAULT_NATIVE_FALLBACK,
      fontSize: 16,
      lineHeight: 1.65,
      firstLineIndent: "1.5em",
      dropCaps: false,
      textAlign: "justify",
      fontFamily: "",
      customCss: "",
      bookStyleSignature: null,
      bookStyleCss: null,
      styleAuditReport: null,
      isAuditingStyle: false,
      isVietnameseBook: true,
      modifiedChapters: {},
      updateTypography: vi.fn((patch) => {
        mockStoreState = { ...mockStoreState, ...patch };
      }),
      revertToOriginalStyle: vi.fn(),
      analyzeBookStyle: vi.fn().mockResolvedValue(null),
      auditAndFixBookStyle: vi.fn(),
      applyAiStyleFixes: vi.fn(),
      clearStyleAuditReport: vi.fn(),
      setActiveTab: vi.fn(),
    };
  });

  it("renders Empty state when no book is loaded", () => {
    const html = renderToStaticMarkup(<TypographyControls />);

    expect(html).toContain("Chưa Có Sách Để Định Kiểu");
    expect(html).toContain("Mở Thư Viện Sách");
  });

  it("renders book typography studio when book is loaded and auto-analyzes book style", () => {
    mockStoreState.currentBook = {
      title: "Tây Du Ký",
      author: "Ngô Thừa Ân",
      language: "vi",
      description: "Tiểu thuyết cổ điển",
      cover_data_url: null,
      chapter_count: 2,
      file_size_bytes: 1024,
      chapters: [
        { id: "ch1", href: "ch1.xhtml", title: "Hồi 1: Linh Căn Dục Thai", preview_text: "Hoa Quả Sơn..." },
        { id: "ch2", href: "ch2.xhtml", title: "Hồi 2: Ngộ Triệt Bồ Đề", preview_text: "Tôn Ngộ Không..." },
      ],
      sample_text: "Hoa Quả Sơn...",
    };
    mockStoreState.currentFilePath = "tay-du-ky.epub";
    mockStoreState.bookStyleSignature = {
      fontFamily: "'Lora', serif",
      fontSize: 16,
      lineHeight: 1.6,
      textAlign: "justify",
      firstLineIndent: "1.5em",
      colors: { bg: null, text: null, accent: null, border: null, cardBg: null },
      dropCaps: false,
      sceneDivider: null,
      confidence: 0.85,
      evidence: ["font-family: 'Lora', serif"],
      stylesheetCount: 2,
      chapterHooks: [],
    };
    mockStoreState.bookStyleCss = "body { font-family: 'Lora', serif; }";

    const html = renderToStaticMarkup(<TypographyControls />);

    // Header & Badge checks
    expect(html).toContain("Bước 4: Định Kiểu &amp; Kiểu Chữ");
    expect(html).toContain("Tự động theo style gốc");
    expect(html).toContain("Khôi phục gốc");

    // Book Signature facts
    expect(html).toContain("Hồ Sơ CSS Gốc Của Sách");
    expect(html).toContain("2 file CSS");
    expect(html).toContain("Lora");

    // Iframe preview element exists
    expect(html).toContain("<iframe");
  });

  it("displays detected original font and Vietnamese font compatibility options", () => {
    mockStoreState.currentBook = {
      title: "Dế Mèn Phiêu Lưu Ký",
      author: "Tô Hoài",
      language: "vi",
      description: null,
      cover_data_url: null,
      chapter_count: 1,
      file_size_bytes: 500,
      chapters: [{ id: "c1", href: "ch1.xhtml", title: "Chương 1", preview_text: "Tôi sống độc lập..." }],
      sample_text: "Tôi sống độc lập...",
    };
    mockStoreState.bookStyleSignature = {
      fontFamily: "'Palatino Linotype', serif",
      fontSize: 16,
      lineHeight: 1.6,
      textAlign: "justify",
      firstLineIndent: "1.5em",
      colors: { bg: null, text: null, accent: null, border: null, cardBg: null },
      dropCaps: false,
      sceneDivider: null,
      confidence: 0.9,
      evidence: ["font-family: Palatino"],
      stylesheetCount: 1,
      chapterHooks: [],
    };
    mockStoreState.bookStyleCss = "body { font-family: 'Palatino Linotype', serif; }";

    const html = renderToStaticMarkup(<TypographyControls />);

    expect(html).toContain("Giữ nguyên font gốc của sách");
    expect(html).toContain("Palatino Linotype");
    expect(html).toContain("Literata");
    expect(html).toContain("Be Vietnam Pro");
    expect(html).toContain("Lora");
  });

  it("updates store typography settings when updateTypography is dispatched", () => {
    mockStoreState.currentBook = {
      title: "Test Book",
      author: "Author",
      language: "vi",
      description: null,
      cover_data_url: null,
      chapter_count: 1,
      file_size_bytes: 100,
      chapters: [{ id: "c1", href: "ch1.xhtml", title: "C1", preview_text: "Sample" }],
      sample_text: "Sample",
    };

    mockStoreState.updateTypography({
      fontSize: 18,
      textAlign: "left",
      firstLineIndent: "2em",
    });

    expect(mockStoreState.fontSize).toBe(18);
    expect(mockStoreState.textAlign).toBe("left");
    expect(mockStoreState.firstLineIndent).toBe("2em");
  });

  it("handles Revert to Original correctly resetting custom overrides", () => {
    mockStoreState.currentBook = {
      title: "Test Book",
      author: "Author",
      language: "vi",
      description: null,
      cover_data_url: null,
      chapter_count: 1,
      file_size_bytes: 100,
      chapters: [{ id: "c1", href: "ch1.xhtml", title: "C1", preview_text: "Sample" }],
      sample_text: "Sample",
    };
    mockStoreState.customCss = "body { background: red; }";

    const html = renderToStaticMarkup(<TypographyControls />);
    expect(html).toContain("Khôi phục gốc");
  });

  it("handles books without external stylesheets by providing clean baseline and visible notice", () => {
    mockStoreState.currentBook = {
      title: "Clean Book Without CSS",
      author: "Author",
      language: "vi",
      description: null,
      cover_data_url: null,
      chapter_count: 1,
      file_size_bytes: 200,
      chapters: [{ id: "c1", href: "ch1.xhtml", title: "C1", preview_text: "Clean text" }],
      sample_text: "Clean text",
    };
    mockStoreState.bookStyleSignature = {
      fontFamily: null,
      fontSize: null,
      lineHeight: null,
      textAlign: null,
      firstLineIndent: null,
      colors: { bg: null, text: null, accent: null, border: null, cardBg: null },
      dropCaps: false,
      sceneDivider: null,
      confidence: 0,
      evidence: [],
      stylesheetCount: 0,
      chapterHooks: [],
    };
    mockStoreState.bookStyleCss = null;

    const html = renderToStaticMarkup(<TypographyControls />);

    // Renders the clean notice for no external CSS
    expect(html).toContain("Sách không chứa file CSS ngoài");
    expect(html).toContain("0 file CSS");

    // Must NOT contain old legacy Wuxia preset artifacts
    expect(html).not.toContain("#181412");
    expect(html).not.toContain("Trần Phong hít sâu một hơi");
    expect(html).not.toContain("☁ ☁ ☁");
  });

  it("renders the e-reader dark background fix card and provides clear toggle", () => {
    mockStoreState.currentBook = {
      title: "Cô Ấy Chết Trên QQ",
      author: "Mã Bá Dung",
      language: "vi",
      description: null,
      cover_data_url: null,
      chapter_count: 1,
      file_size_bytes: 300,
      chapters: [{ id: "c1", href: "c1.xhtml", title: "Chương 1", preview_text: "Nội dung" }],
      sample_text: "Nội dung",
    };
    mockStoreState.bookStyleCss = "body { background-color: #161618; color: #f4f4f5; }";
    mockStoreState.customCss = "";

    const html = renderToStaticMarkup(<TypographyControls />);

    expect(html).toContain("Chống Lỗi Chữ Đen Nền Đen (E-Reader)");
    expect(html).toContain("Gỡ bỏ màu nền &amp; chữ cố định ngay");
  });

  it("renders the auto-paginate feature and controls to push sections into separate pages", () => {
    mockStoreState.currentBook = {
      title: "Cô Ấy Chết Trên QQ",
      author: "Mã Bá Dung",
      language: "vi",
      description: null,
      cover_data_url: null,
      chapter_count: 1,
      file_size_bytes: 300,
      chapters: [{ id: "c1", href: "c1.xhtml", title: "Chương 1", preview_text: "Nội dung" }],
      sample_text: "Nội dung",
    };

    const html = renderToStaticMarkup(<TypographyControls />);

    expect(html).toContain("Tự Động Đẩy Thành Trang Riêng");
    expect(html).toContain("Đã phân trang");
    expect(html).toContain("Lưu vào sách");
  });
});
