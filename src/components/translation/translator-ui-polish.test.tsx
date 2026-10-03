import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let mockStoreState: Record<string, unknown> = {};

vi.mock("../../stores/useAppStore", () => {
  const hook = () => mockStoreState;
  hook.getState = () => mockStoreState;
  hook.setState = (patch: Record<string, unknown>) => {
    mockStoreState = { ...mockStoreState, ...patch };
  };
  return { useAppStore: hook };
});

const { EpubReaderViewer } = await import("../preview/EpubReaderViewer");
const { BookTranslatorView } = await import("./BookTranslatorView");
const { categorizeGatewayModels } = await import("../../utils/gatewayModelCategorizer");

describe("UI Polish & Parity Checks", () => {
  beforeEach(() => {
    mockStoreState = {
      currentBook: null,
      activePreset: {
        id: "classic",
        name: "Cổ Điển",
        fontFamily: "serif",
        colors: { bg: "#ffffff", text: "#000000" },
      },
      translationConfig: {
        sourceLang: "Tiếng Anh (English)",
        targetLang: "Tiếng Việt (Vietnamese)",
        tone: "literary",
        mode: "replace",
        glossary: { "Harry": "Harry", "Hogwarts": "Hogwarts" },
      },
      modifiedChapters: {},
      translatedChapters: {},
      extractedCandidates: [],
      terminalLogs: [],
      workflowCompletedSteps: [],
      activeChapterIndex: 0,
      cavemanMode: "off",
      activeGateway: null,
      selectedModel: "deepseek-chat",
      setActiveTab: vi.fn(),
      setTranslationConfig: vi.fn(),
      getTranslationCoverage: () => ({ total: 1, translated: 0 }),
      autoDetectSourceLanguage: vi.fn(),
      extractBookEntities: vi.fn(),
      applyApprovedEntitiesToGlossary: vi.fn(),
      generateBookResearchBrief: vi.fn(),
      autoConfigureAllTranslationSettings: vi.fn(),
    };
  });

  it("renders the Empty card structure and button in the reader when no book is loaded", () => {
    mockStoreState.currentBook = null;

    const readerHtml = renderToStaticMarkup(<EpubReaderViewer />);

    // Shared Empty card shell
    expect(readerHtml).toContain("max-w-lg border border-border bg-card");

    // Circular icon container with size-16 rounded-full bg-muted
    expect(readerHtml).toContain("size-16 rounded-full bg-muted text-muted-foreground");

    // EmptyTitle font size
    expect(readerHtml).toContain("text-lg font-semibold text-foreground");

    // Library button label
    expect(readerHtml).toContain("Đến Thư Viện Sách");
  });

  it("renders Language Pairs and Glossary sections with bounded width and responsive layout in BookTranslatorView", () => {
    mockStoreState.currentBook = {
      title: "Test Book",
      author: "Author",
      language: "en",
      description: null,
      cover_data_url: null,
      chapter_count: 1,
      file_size_bytes: 1024,
      chapters: [{ id: "c1", href: "c1.xhtml", title: "Chapter 1", preview_text: "Hello world" }],
      sample_text: "Hello world sample",
    };

    const html = renderToStaticMarkup(<BookTranslatorView />);

    // Section 1: Cặp ngôn ngữ contains min-w-0 on flex containers and SelectTrigger
    expect(html).toContain("translator-source-lang");
    expect(html).toContain("translator-target-lang");
    expect(html).toContain("w-full min-w-0");

    // Section 5: Glossary has "Quét AI" in the section header
    expect(html).toContain("5. Thuật ngữ &amp; Tên riêng (Glossary)");
    expect(html).toContain("Quét AI");
    expect(html).toContain("Danh mục thuật ngữ");
  });

  it("categorizes models properly for Google Gemini API configured provider", () => {
    const geminiGateway: any = {
      name: "Google Gemini API",
      base_url: "https://gcli.ggchan.dev",
      port: 0,
      is_online: true,
      models: ["gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro"],
      gateway_type: "openai",
      latency_ms: 10,
      configured_providers: [
        {
          provider: "gemini",
          name: "Google Gemini API",
          is_active: true,
          test_status: "active",
        },
      ],
    };

    const categories = categorizeGatewayModels(geminiGateway);
    expect(categories.length).toBeGreaterThan(0);
    expect(categories[0].id).toBe("gemini");
    expect(categories[0].models).toContain("gemini-2.5-pro");
  });

  it("displays live translation progress indicator and active chapter title in the preview header during translation", () => {
    mockStoreState.currentBook = {
      title: "Test Book",
      author: "Author",
      language: "en",
      description: null,
      cover_data_url: null,
      chapter_count: 3,
      file_size_bytes: 1024,
      chapters: [
        { id: "c1", href: "c1.xhtml", title: "Chapter 1", preview_text: "Text 1" },
        { id: "c2", href: "c2.xhtml", title: "Chapter 2 - The Voyage", preview_text: "Text 2" },
        { id: "c3", href: "c3.xhtml", title: "Chapter 3", preview_text: "Text 3" },
      ],
      sample_text: "Sample",
    };
    mockStoreState.activeChapterIndex = 1; // Chapter 2
    mockStoreState.isTranslating = true;
    mockStoreState.translationProgress = {
      currentChapterIndex: 2,
      totalChapters: 3,
      currentChapterHref: "c2.xhtml",
      currentChapterTitle: "Chapter 2 - The Voyage",
      currentBlock: 5,
      totalBlocks: 20,
      percent: 25,
    };

    const html = renderToStaticMarkup(<BookTranslatorView />);

    // Must display Chapter 2 title in preview header
    expect(html).toContain("Chapter 2 - The Voyage");
    // Must display live percent badge
    expect(html).toContain("25%");
    // Must display Real-time Stream badge
    expect(html).toContain("Real-time Stream");
  });
});
