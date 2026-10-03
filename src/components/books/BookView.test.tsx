import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BookView, BookViewPresentation, BookViewPresentationProps } from "./BookView";
import { STYLE_PRESETS } from "../../presets/styles";
import { useAppStore } from "../../stores/useAppStore";

// Mock Tauri plugin APIs
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const classicPreset = STYLE_PRESETS.find((p) => p.id === "classic") || STYLE_PRESETS[0];

describe("BookView Container & Presentation Component", () => {
  const defaultProps: BookViewPresentationProps = {
    currentBook: null,
    projects: [],
    isVietnameseBook: true,
    jevDecision: null,
    isAnalyzingJev: false,
    activeGateway: null,
    activePreset: classicPreset,
    activeChapterIndex: 0,
    modifiedChapters: {},
    bookProfile: null,
    watermarkReport: null,
    searchQuery: "",
    onSearchQueryChange: vi.fn(),
    onOpenFileDialog: vi.fn(),
    onSelectChapter: vi.fn(),
    onOpenChapterReader: vi.fn(),
    onOpenChapterAiEditor: vi.fn(),
    onOpenTranslator: vi.fn(),
    onOpenEditor: vi.fn(),
    onOpenMetadataModal: vi.fn(),
    onRunJev: vi.fn(),
    onCleanWatermarks: vi.fn(),
    isCleaningWatermarks: false,
    onCloseActiveProject: vi.fn(),
    onOpenProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onZoomCover: vi.fn(),
    onDeepAiStyle: vi.fn(),
    isAiGenerating: false,
    onCloseBook: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      currentBook: null,
      projects: [],
    });
  });

  it("renders container <BookView /> with empty dropzone when store has no book", () => {
    const html = renderToStaticMarkup(<BookView />);
    expect(html).toContain("Chưa có sách nào được nạp vào Studio");
    expect(html).toContain("Chọn file .epub");
  });

  it("renders empty library dropzone when no book and no projects are loaded in presentation", () => {
    const html = renderToStaticMarkup(<BookViewPresentation {...defaultProps} />);
    expect(html).toContain("Chưa có sách nào được nạp vào Studio");
    expect(html).toContain("Chọn file .epub");
  });

  it("renders saved project cards when projects exist and no active book", () => {
    const propsWithProjects: BookViewPresentationProps = {
      ...defaultProps,
      projects: [
        {
          id: "proj_1",
          name: "Dự Án Tiên Hiệp 1",
          filePath: "/books/tien-hiep.epub",
          coverDataUrl: null,
          chapterCount: 42,
          fileSizeBytes: 2048000,
          activePresetId: "classic",
          customCss: "",
          fontFamily: "Geist",
          fontSize: 18,
          textAlign: "justify",
          dropCaps: true,
          lineHeight: 1.8,
          firstLineIndent: "2em",
          sceneDivider: "* * *",
          modifiedChapters: {},
          chapterEnhanceReports: {},
          createdAt: Date.now(),
          lastOpenedAt: Date.now(),
        },
      ],
    };

    const html = renderToStaticMarkup(<BookViewPresentation {...propsWithProjects} />);
    expect(html).toContain("Thư Viện Dự Án (Projects)");
    expect(html).toContain("Dự Án Tiên Hiệp 1");
    expect(html).toContain("42 chương");
  });

  it("renders loaded book with 2-column Studio Layout, cover, details, and chapters", () => {
    const propsWithBook: BookViewPresentationProps = {
      ...defaultProps,
      currentBook: {
        title: "Phàm Nhân Tu Tiên",
        author: "Vong Ngữ",
        language: "zh",
        publisher: "NXB Văn Học",
        published_year: "2024",
        description: "Truyện tu tiên kinh điển",
        cover_data_url: null,
        chapter_count: 2,
        file_size_bytes: 3500000,
        chapters: [
          { id: "ch1", href: "ch1.xhtml", title: "Chương 1: Sơn thôn thiếu niên", preview_text: "Hàn Lập ngồi trên tảng đá xanh..." },
          { id: "ch2", href: "ch2.xhtml", title: "Chương 2: Thất Huyền Môn", preview_text: "Thất Huyền Sơn cao vút giữa mây trời..." },
        ],
        sample_text: "Hàn Lập xuất thân nông dân...",
      },
      jevDecision: {
        genre: "wuxia",
        genre_label: "Tiên hiệp / Cổ phong",
        confidence: 0.98,
        dialogue_ratio: 0.35,
        recommended_preset: "wuxia",
        explanation: "Văn phong tu chân cổ điển",
        typography: {
          drop_caps: true,
          first_line_indent: "2em",
          line_height: 1.8,
          scene_divider: "* * *",
          palette: {
            name: "Wuxia",
            bg_color: "#fbfbf8",
            text_color: "#2c2b29",
            accent_color: "#ad5a17",
            border_color: "#e2e5e9",
            font_family: "Newsreader, serif",
          },
        },
      },
      activeGateway: {
        name: "9Router Proxy",
        base_url: "http://127.0.0.1:20128",
        port: 20128,
        latency_ms: 12,
        is_online: true,
        models: ["gemini-2.0-flash", "deepseek-chat"],
        gateway_type: "openai",
      },
    };

    const html = renderToStaticMarkup(<BookViewPresentation {...propsWithBook} />);

    // Assert Book details are displayed
    expect(html).toContain("Phàm Nhân Tu Tiên");
    expect(html).toContain("Vong Ngữ");
    expect(html).toContain("NXB: NXB Văn Học");
    expect(html).toContain("Tiên hiệp / Cổ phong");
    expect(html).toContain("98% tin cậy");

    // Assert AI Gateway indicator is rendered
    expect(html).toContain("9Router Proxy");
    expect(html).toContain("12ms");

    // Assert Chapter Explorer & Rows
    expect(html).toContain("Mục Lục &amp; Danh Sách Chương");
    expect(html).toContain("Chương 1: Sơn thôn thiếu niên");
    expect(html).toContain("Chương 2: Thất Huyền Môn");
    expect(html).toContain("Hàn Lập ngồi trên tảng đá xanh...");
  });

  it("filters chapters when search query is entered", () => {
    const propsWithSearch: BookViewPresentationProps = {
      ...defaultProps,
      currentBook: {
        title: "Phàm Nhân Tu Tiên",
        author: "Vong Ngữ",
        language: "zh",
        description: null,
        cover_data_url: null,
        chapter_count: 2,
        file_size_bytes: 1000,
        chapters: [
          { id: "ch1", href: "ch1.xhtml", title: "Chương 1: Sơn thôn thiếu niên", preview_text: "Hàn Lập ngồi trên tảng đá..." },
          { id: "ch2", href: "ch2.xhtml", title: "Chương 2: Thất Huyền Môn", preview_text: "Thất Huyền Sơn cao vút..." },
        ],
        sample_text: "",
      },
      searchQuery: "Thất Huyền",
    };

    const html = renderToStaticMarkup(<BookViewPresentation {...propsWithSearch} />);
    expect(html).toContain("Chương 2: Thất Huyền Môn");
    expect(html).not.toContain("Chương 1: Sơn thôn thiếu niên");
  });
});
