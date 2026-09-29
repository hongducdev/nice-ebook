import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAppStore } from "./useAppStore";

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("useAppStore - Book Loading & Drag-and-Drop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      currentBook: null,
      currentFilePath: null,
      currentFileBytes: null,
      isDraggingFile: false,
      isLoadingBook: false,
      activeTab: "books",
    });
  });

  it("updates isDraggingFile state accurately", () => {
    expect(useAppStore.getState().isDraggingFile).toBe(false);

    useAppStore.getState().setIsDraggingFile(true);
    expect(useAppStore.getState().isDraggingFile).toBe(true);

    useAppStore.getState().setIsDraggingFile(false);
    expect(useAppStore.getState().isDraggingFile).toBe(false);
  });

  it("loads book from path successfully", async () => {
    const mockMetadata = {
      title: "Test Book",
      author: "Test Author",
      language: "vi",
      description: "Test description",
      cover_data_url: null,
      chapter_count: 5,
      file_size_bytes: 10240,
      chapters: [
        { id: "c1", href: "c1.xhtml", title: "Chương 1", preview_text: "Preview 1" },
      ],
      sample_text: "Sample text for testing",
    };

    (invoke as any).mockResolvedValueOnce(mockMetadata);

    const ok = await useAppStore.getState().loadBookFromPath("C:\\books\\test.epub");

    expect(ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith("read_epub", { path: "C:\\books\\test.epub" });

    const state = useAppStore.getState();
    expect(state.currentBook?.title).toBe("Test Book");
    expect(state.currentFilePath).toBe("C:\\books\\test.epub");
    expect(state.currentFileBytes).toBeNull();
    expect(state.isLoadingBook).toBe(false);
  });

  it("loads book from bytes successfully and records bytes", async () => {
    const mockMetadata = {
      title: "Bytes Book",
      author: "Bytes Author",
      language: "en",
      description: null,
      cover_data_url: null,
      chapter_count: 2,
      file_size_bytes: 512,
      chapters: [],
      sample_text: "",
    };

    (invoke as any).mockResolvedValueOnce(mockMetadata);

    const testBytes = [0x50, 0x4b, 0x03, 0x04];
    const ok = await useAppStore.getState().loadBookFromBytes(testBytes);

    expect(ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith("read_epub_bytes", { bytes: testBytes });

    const state = useAppStore.getState();
    expect(state.currentBook?.title).toBe("Bytes Book");
    expect(state.currentFilePath).toBeNull();
    expect(state.currentFileBytes).toEqual(testBytes);
    expect(state.isLoadingBook).toBe(false);
  });

  it("handles loading failure gracefully without corrupting state", async () => {
    (invoke as any).mockRejectedValueOnce(new Error("Corrupted EPUB ZIP"));

    const ok = await useAppStore.getState().loadBookFromPath("C:\\books\\bad.epub");

    expect(ok).toBe(false);
    const state = useAppStore.getState();
    expect(state.currentBook).toBeNull();
    expect(state.isLoadingBook).toBe(false);
  });

  it("toggles theme and sidebar collapsed correctly", () => {
    const store = useAppStore.getState();
    expect(store.theme).toBeDefined();

    store.setTheme("light");
    expect(useAppStore.getState().theme).toBe("light");

    store.setTheme("dark");
    expect(useAppStore.getState().theme).toBe("dark");

    store.setTheme("system");
    expect(useAppStore.getState().theme).toBe("system");

    const initialCollapsed = useAppStore.getState().isSidebarCollapsed;
    store.toggleSidebar();
    expect(useAppStore.getState().isSidebarCollapsed).toBe(!initialCollapsed);
    store.toggleSidebar();
    expect(useAppStore.getState().isSidebarCollapsed).toBe(initialCollapsed);
  });

  it("detects Vietnamese book and automatically configures Vietnamese font", async () => {
    const mockViBook = {
      title: "Hạt Giống Tâm Hồn",
      author: "Nhiều tác giả",
      language: "vi",
      description: "Tuyển tập những câu chuyện ý nghĩa",
      cover_data_url: null,
      chapter_count: 10,
      file_size_bytes: 50000,
      chapters: [],
      sample_text: "Một buổi sáng đẹp trời, những hạt sương mai đọng trên lá cỏ.",
    };

    (invoke as any).mockResolvedValueOnce(mockViBook);

    await useAppStore.getState().loadBookFromPath("C:\\books\\hat-giong.epub");

    const state = useAppStore.getState();
    expect(state.isVietnameseBook).toBe(true);
    expect(state.fontFamily).toBeDefined();
    // Font family should contain Vietnamese font like Literata
    expect(state.fontFamily).toContain("Literata");
  });

  it("detects non-Vietnamese book and keeps standard preset font", async () => {
    const mockEnBook = {
      title: "Foundation",
      author: "Isaac Asimov",
      language: "en",
      description: "Galactic empire epic",
      cover_data_url: null,
      chapter_count: 8,
      file_size_bytes: 80000,
      chapters: [],
      sample_text: "The Galactic Empire was falling, but Hari Seldon knew the future.",
    };

    (invoke as any).mockResolvedValueOnce(mockEnBook);

    await useAppStore.getState().loadBookFromPath("C:\\books\\foundation.epub");

    const state = useAppStore.getState();
    expect(state.isVietnameseBook).toBe(false);
  });

  it("updates fontFamily via updateTypography", () => {
    useAppStore.getState().updateTypography({ fontFamily: "'Be Vietnam Pro', sans-serif" });
    expect(useAppStore.getState().fontFamily).toBe("'Be Vietnam Pro', sans-serif");
  });

  it("handles terminal logs correctly", () => {
    const store = useAppStore.getState();
    store.clearTerminalLogs();
    expect(useAppStore.getState().terminalLogs).toHaveLength(0);

    store.addTerminalLog({
      type: "info",
      text: "⌛ [1/1] Đang xử lý: text/part0001.html...",
    });
    expect(useAppStore.getState().terminalLogs).toHaveLength(1);
    expect(useAppStore.getState().terminalLogs[0].text).toContain("part0001.html");

    store.clearTerminalLogs();
    expect(useAppStore.getState().terminalLogs).toHaveLength(0);
  });

  it("resets chapter overrides when resetChapterOverrides is called and preserves sibling state", () => {
    useAppStore.setState({
      theme: "dark",
      fontSize: 18,
      modifiedChapters: { "c1.xhtml": "<p>modified</p>" },
      chapterEnhanceReports: {
        "c1.xhtml": {
          chapterHref: "c1.xhtml",
          chapterTitle: "Chương 1",
          cleanedTopIndices: [0],
          headingsCount: 2,
          typosFixedCount: 3,
          timestamp: Date.now(),
        },
      },
    });

    expect(Object.keys(useAppStore.getState().modifiedChapters)).toHaveLength(1);
    useAppStore.getState().resetChapterOverrides();
    expect(Object.keys(useAppStore.getState().modifiedChapters)).toHaveLength(0);
    expect(Object.keys(useAppStore.getState().chapterEnhanceReports)).toHaveLength(0);
    // Sibling state must be preserved
    expect(useAppStore.getState().theme).toBe("dark");
    expect(useAppStore.getState().fontSize).toBe(18);
  });

  describe("Ebook Project Persistence & Management", () => {
    it("creates a new project and records it in projects list", () => {
      const mockMeta = {
        title: "Dự Án Mới",
        author: "Tác Giả X",
        language: "vi",
        description: null,
        cover_data_url: null,
        chapter_count: 5,
        file_size_bytes: 120000,
        chapters: [],
        sample_text: "",
      };

      const projectId = useAppStore.getState().createProject(mockMeta, { filePath: "C:\\books\\du-an-moi.epub" });

      expect(projectId).toBeDefined();
      const state = useAppStore.getState();
      const project = state.projects.find((p) => p.id === projectId);
      expect(project).toBeDefined();
      expect(project?.name).toBe("Dự Án Mới");
      expect(project?.filePath).toBe("C:\\books\\du-an-moi.epub");
      expect(project?.chapterCount).toBe(5);
    });

    it("opens an existing project and restores modified chapters and styling", async () => {
      const mockMeta = {
        title: "Dự Án Khôi Phục",
        author: "Tác Giả Y",
        language: "vi",
        description: null,
        cover_data_url: null,
        chapter_count: 3,
        file_size_bytes: 50000,
        chapters: [{ id: "c1", href: "c1.xhtml", title: "C1", preview_text: "p1" }],
        sample_text: "",
      };

      (invoke as any).mockResolvedValueOnce(mockMeta);

      const savedProject = {
        id: "prj_test_123",
        name: "Dự Án Khôi Phục",
        filePath: "C:\\books\\restore.epub",
        coverDataUrl: null,
        chapterCount: 3,
        fileSizeBytes: 50000,
        activePresetId: "wuxia-ancient",
        customCss: "/* wuxia */",
        fontFamily: "'Literata', serif",
        fontSize: 18,
        textAlign: "justify" as const,
        dropCaps: true,
        lineHeight: 1.8,
        firstLineIndent: "2em",
        sceneDivider: "☁ ☁ ☁",
        modifiedChapters: { "c1.xhtml": "<h1>Khôi Phục</h1>" },
        chapterEnhanceReports: {},
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
      };

      useAppStore.setState({
        projects: [savedProject],
        activeProjectId: null,
      });

      const ok = await useAppStore.getState().openProject("prj_test_123");

      expect(ok).toBe(true);
      const state = useAppStore.getState();
      expect(state.activeProjectId).toBe("prj_test_123");
      expect(state.activePresetId).toBe("wuxia-ancient");
      expect(state.fontSize).toBe(18);
      expect(state.modifiedChapters["c1.xhtml"]).toBe("<h1>Khôi Phục</h1>");
      expect(state.currentFilePath).toBe("C:\\books\\restore.epub");
    });

    it("closes active project, saving modifications and clearing workspace state", () => {
      useAppStore.setState({
        activeProjectId: "prj_active_456",
        currentBook: {
          title: "Sách Đang Đọc",
          author: "Tác Giả",
          language: "vi",
          description: null,
          cover_data_url: null,
          chapter_count: 2,
          file_size_bytes: 3000,
          chapters: [],
          sample_text: "",
        },
        modifiedChapters: { "ch1.html": "<p>chỉnh sửa</p>" },
        projects: [
          {
            id: "prj_active_456",
            name: "Sách Đang Đọc",
            filePath: "C:\\test.epub",
            coverDataUrl: null,
            chapterCount: 2,
            fileSizeBytes: 3000,
            activePresetId: "classic-hardcover",
            customCss: "",
            fontFamily: "serif",
            fontSize: 16,
            textAlign: "justify",
            dropCaps: true,
            lineHeight: 1.75,
            firstLineIndent: "2em",
            sceneDivider: "♦",
            modifiedChapters: {},
            chapterEnhanceReports: {},
            createdAt: Date.now(),
            lastOpenedAt: Date.now(),
          },
        ],
      });

      useAppStore.getState().closeActiveProject();

      const state = useAppStore.getState();
      expect(state.activeProjectId).toBeNull();
      expect(state.currentBook).toBeNull();
      expect(Object.keys(state.modifiedChapters)).toHaveLength(0);

      // Verify that changes were saved into the project list
      const prj = state.projects.find((p) => p.id === "prj_active_456");
      expect(prj?.modifiedChapters["ch1.html"]).toBe("<p>chỉnh sửa</p>");
    });

    it("deletes a project cleanly from the registry", () => {
      useAppStore.setState({
        projects: [
          {
            id: "prj_to_delete",
            name: "Xóa Tôi Đi",
            filePath: null,
            coverDataUrl: null,
            chapterCount: 1,
            fileSizeBytes: 100,
            activePresetId: "classic-hardcover",
            customCss: "",
            fontFamily: "serif",
            fontSize: 16,
            textAlign: "justify",
            dropCaps: true,
            lineHeight: 1.75,
            firstLineIndent: "2em",
            sceneDivider: "♦",
            modifiedChapters: {},
            chapterEnhanceReports: {},
            createdAt: Date.now(),
            lastOpenedAt: Date.now(),
          },
        ],
      });

      expect(useAppStore.getState().projects).toHaveLength(1);
      useAppStore.getState().deleteProject("prj_to_delete");
      expect(useAppStore.getState().projects).toHaveLength(0);
    });

    it("handles missing/moved file gracefully without corrupting state when opening", async () => {
      (invoke as any).mockRejectedValueOnce(new Error("File not found on disk"));

      useAppStore.setState({
        projects: [
          {
            id: "prj_missing_file",
            name: "Sách Đã Bị Xóa",
            filePath: "C:\\nonexistent\\deleted.epub",
            coverDataUrl: null,
            chapterCount: 5,
            fileSizeBytes: 100,
            activePresetId: "classic-hardcover",
            customCss: "",
            fontFamily: "serif",
            fontSize: 16,
            textAlign: "justify",
            dropCaps: true,
            lineHeight: 1.75,
            firstLineIndent: "2em",
            sceneDivider: "♦",
            modifiedChapters: {},
            chapterEnhanceReports: {},
            createdAt: Date.now(),
            lastOpenedAt: Date.now(),
          },
        ],
        currentBook: null,
      });

      const ok = await useAppStore.getState().openProject("prj_missing_file");

      expect(ok).toBe(false);
      const state = useAppStore.getState();
      expect(state.isLoadingBook).toBe(false);
      expect(state.currentBook).toBeNull();
    });
  });

  describe("Gateway Adaptation & Error-Checked Fallback Mechanism", () => {
    it("dynamically adapts fallback models when selecting a gateway", () => {
      const mockOllamaGateway = {
        name: "Ollama Local",
        base_url: "http://127.0.0.1:11434",
        port: 11434,
        is_online: true,
        models: ["llama3.2:latest", "qwen2.5:latest", "mistral:latest", "gemma2:latest"],
        gateway_type: "ollama",
        latency_ms: 20,
      };

      useAppStore.getState().selectGateway(mockOllamaGateway);

      const state = useAppStore.getState();
      expect(state.selectedModel).toBe("llama3.2:latest");
      // Fallback chain must adapt to this gateway's other models and include offline Jev Verdict
      expect(state.fallbackModels).toContain("qwen2.5:latest");
      expect(state.fallbackModels).toContain("mistral:latest");
      expect(state.fallbackModels).toContain("jev-verdict-2.0");
      // Must not contain primary model
      expect(state.fallbackModels).not.toContain("llama3.2:latest");
    });

    it("resets to offline jev-verdict when gateway is deselected (null)", () => {
      useAppStore.getState().selectGateway(null);

      const state = useAppStore.getState();
      expect(state.activeGateway).toBeNull();
      expect(state.selectedModel).toBe("jev-verdict-2.0");
      expect(state.fallbackModels).toEqual(["jev-verdict-2.0"]);
    });

    it("filters out errored models during validateAndFilterFallbackModels", async () => {
      useAppStore.setState({
        fallbackModels: ["opencode/working-model", "opencode/broken-model", "jev-verdict-2.0"],
      });

      (invoke as any).mockImplementation((cmd: string, args: any) => {
        if (cmd === "test_opencode_model") {
          if (args.model === "opencode/broken-model") {
            return Promise.reject(new Error("Connection refused (503)"));
          }
          return Promise.resolve(80);
        }
        return Promise.resolve({});
      });

      const verified = await useAppStore.getState().validateAndFilterFallbackModels();

      expect(verified).toContain("opencode/working-model");
      expect(verified).toContain("jev-verdict-2.0");
      // Broken model must be removed from fallbackModels
      expect(verified).not.toContain("opencode/broken-model");
      expect(useAppStore.getState().fallbackModels).toEqual(verified);
    });
  });

  describe("Project Completed Parts Checking & Resumption", () => {
    it("checks and skips already-completed chapters in batchEnhanceChapters", async () => {
      const mockMeta = {
        title: "Sách Dự Án",
        author: "Tác Giả",
        language: "vi",
        description: null,
        cover_data_url: null,
        chapter_count: 3,
        file_size_bytes: 1000,
        chapters: [
          { id: "c1", href: "c1.xhtml", title: "Chương 1", preview_text: "" },
          { id: "c2", href: "c2.xhtml", title: "Chương 2", preview_text: "" },
          { id: "c3", href: "c3.xhtml", title: "Chương 3", preview_text: "" },
        ],
        sample_text: "",
      };

      // Set state where c1 and c2 are ALREADY enhanced in the project
      useAppStore.setState({
        currentBook: mockMeta,
        currentFilePath: "C:\\test.epub",
        activeProjectId: "prj_existing",
        modifiedChapters: {
          "c1.xhtml": "<h1>Chương 1 Đã Làm</h1>",
          "c2.xhtml": "<h1>Chương 2 Đã Làm</h1>",
        },
        terminalLogs: [],
      });

      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === "read_chapter") {
          return Promise.resolve("<p>Nội dung gốc chương 3.</p>");
        }
        if (cmd === "run_jev_verdict_chapter") {
          return Promise.resolve({
            h1_title: "Chương 3 Hoàn Thành",
            top_junk_indices: [],
            headings: [],
            spelling_corrections: [],
            confidence: 0.95,
            concentration: 0.9,
            latency_ms: 10,
            engine: "jev",
            needs_cloud_escalation: false,
            ambiguous_paragraphs: [],
          });
        }
        return Promise.resolve({});
      });

      const completed = await useAppStore.getState().batchEnhanceChapters(
        [0, 1, 2],
        {},
        { skipAlreadyEnhanced: true }
      );

      expect(completed).toBe(true);

      const logs = useAppStore.getState().terminalLogs.map((l) => l.text);
      // Verify that it detected already completed chapters and skipped them
      expect(logs.some((l) => l.includes("Đã phát hiện 2/3 chương đã hoàn thành"))).toBe(true);
      // c1 and c2 content should be unchanged
      expect(useAppStore.getState().modifiedChapters["c1.xhtml"]).toBe("<h1>Chương 1 Đã Làm</h1>");
      expect(useAppStore.getState().modifiedChapters["c2.xhtml"]).toBe("<h1>Chương 2 Đã Làm</h1>");
      // c3 should be enhanced
      expect(useAppStore.getState().modifiedChapters["c3.xhtml"]).toContain("Chương 3 Hoàn Thành");
    });
  });

  describe("updateBookMetadata", () => {
    it("updates currentBook and active project metadata properly", () => {
      const initialBook = {
        title: "Tựa Cũ",
        author: "Tác Giả Cũ",
        language: "en",
        description: null,
        cover_data_url: null,
        chapter_count: 3,
        file_size_bytes: 5000,
        chapters: [],
        sample_text: "",
      };

      useAppStore.setState({
        currentBook: initialBook,
        projects: [
          {
            id: "proj-1",
            name: "Tựa Cũ",
            filePath: "/test.epub",
            coverDataUrl: null,
            chapterCount: 3,
            fileSizeBytes: 5000,
            activePresetId: "classic-hardcover",
            customCss: "",
            fontFamily: "serif",
            fontSize: 16,
            textAlign: "justify",
            dropCaps: true,
            lineHeight: 1.75,
            firstLineIndent: "2em",
            sceneDivider: "♦ ♦ ♦",
            modifiedChapters: {},
            chapterEnhanceReports: {},
            createdAt: 100,
            lastOpenedAt: 100,
          },
        ],
        activeProjectId: "proj-1",
      });

      useAppStore.getState().updateBookMetadata({
        title: "Đắc Nhân Tâm",
        author: "Dale Carnegie",
        language: "vi",
        description: "Học cách đối nhân xử thế",
        publisher: "NXB Tổng Hợp",
        published_year: "2020",
        cover_data_url: "data:image/jpeg;base64,mock",
      });

      const state = useAppStore.getState();
      expect(state.currentBook?.title).toBe("Đắc Nhân Tâm");
      expect(state.currentBook?.author).toBe("Dale Carnegie");
      expect(state.currentBook?.language).toBe("vi");
      expect(state.currentBook?.description).toBe("Học cách đối nhân xử thế");
      expect(state.currentBook?.publisher).toBe("NXB Tổng Hợp");
      expect(state.currentBook?.cover_data_url).toBe("data:image/jpeg;base64,mock");
      expect(state.isVietnameseBook).toBe(true);

      const updatedProj = state.projects.find((p) => p.id === "proj-1");
      expect(updatedProj?.name).toBe("Đắc Nhân Tâm");
      expect(updatedProj?.author).toBe("Dale Carnegie");
      expect(updatedProj?.coverDataUrl).toBe("data:image/jpeg;base64,mock");
    });
  });

  describe("cleanWatermarksInBook & Auto-Save", () => {
    it("cleans watermarks from HTML and titles, auto-saves to project and file, and hydrates on reopen", async () => {
      const rawDirtyMeta = {
        title: "Dac Nhan Tam",
        author: "Dale Carnegie",
        language: "vi",
        description: null,
        cover_data_url: null,
        chapter_count: 1,
        file_size_bytes: 1000,
        chapters: [
          {
            id: "c1",
            href: "c1.xhtml",
            title: "Chương 1 [dtv-ebook.com]",
            preview_text: "dtv-ebook.com chúc bạn đọc vui vẻ",
          },
        ],
        sample_text: "",
      };

      const projectId = "proj-wm-test";
      useAppStore.setState({
        currentBook: rawDirtyMeta,
        currentFilePath: "C:\\books\\dirty.epub",
        activeProjectId: projectId,
        projects: [
          {
            id: projectId,
            name: "Dac Nhan Tam",
            filePath: "C:\\books\\dirty.epub",
            coverDataUrl: null,
            chapterCount: 1,
            fileSizeBytes: 1000,
            activePresetId: "classic-hardcover",
            customCss: "",
            fontFamily: "serif",
            fontSize: 16,
            textAlign: "justify",
            dropCaps: true,
            lineHeight: 1.75,
            firstLineIndent: "2em",
            sceneDivider: "♦ ♦ ♦",
            modifiedChapters: {},
            chapterEnhanceReports: {},
            createdAt: 100,
            lastOpenedAt: 100,
          },
        ],
        modifiedChapters: {},
      });

      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === "read_chapter") {
          return Promise.resolve(
            "<div><h1>Chương 1</h1><p>dtv-ebook.com xin trân trọng giới thiệu</p><p>Nội dung tác phẩm chính thức.</p></div>"
          );
        }
        if (cmd === "export_epub") {
          return Promise.resolve(1500);
        }
        if (cmd === "read_epub") {
          return Promise.resolve(rawDirtyMeta);
        }
        return Promise.resolve({});
      });

      // 1. Run cleanWatermarksInBook
      const res = await useAppStore.getState().cleanWatermarksInBook();
      expect(res.affectedChapters).toBe(1);
      expect(res.removedCount).toBeGreaterThan(0);

      // Verify in-memory state
      const state = useAppStore.getState();
      expect(state.currentBook?.chapters[0].title).toBe("Chương 1");
      expect(state.currentBook?.chapters[0].preview_text).not.toContain("dtv-ebook.com");
      expect(state.modifiedChapters["c1.xhtml"]).not.toContain("dtv-ebook.com");

      // Verify in-place auto-save was called
      expect(invoke).toHaveBeenCalledWith(
        "export_epub",
        expect.objectContaining({
          inputPath: "C:\\books\\dirty.epub",
          outputPath: "C:\\books\\dirty.epub",
        })
      );

      // 2. Re-open project simulation to verify watermarks are not resurrected
      const reopened = await useAppStore.getState().openProject(projectId);
      expect(reopened).toBe(true);

      const reopenedState = useAppStore.getState();
      expect(reopenedState.currentBook?.chapters[0].title).toBe("Chương 1");
      expect(reopenedState.currentBook?.chapters[0].preview_text).not.toContain("dtv-ebook.com");
    });
  });

  describe("Book Translation Actions", () => {
    it("updates translationConfig correctly", () => {
      useAppStore.getState().setTranslationConfig({
        sourceLang: "Tiếng Trung (Chinese)",
        tone: "wuxia",
        mode: "bilingual",
      });

      const config = useAppStore.getState().translationConfig;
      expect(config.sourceLang).toBe("Tiếng Trung (Chinese)");
      expect(config.tone).toBe("wuxia");
      expect(config.mode).toBe("bilingual");
    });

    it("resets a translated chapter back to original", () => {
      useAppStore.setState({
        modifiedChapters: {
          "ch1.xhtml": "<html><body>Translated</body></html>",
          "ch2.xhtml": "<html><body>Keep this</body></html>",
        },
      });

      useAppStore.getState().resetChapterTranslation("ch1.xhtml");

      const mod = useAppStore.getState().modifiedChapters;
      expect(mod["ch1.xhtml"]).toBeUndefined();
      expect(mod["ch2.xhtml"]).toBe("<html><body>Keep this</body></html>");
    });

    it("auto-detects source language from current book sample text", () => {
      useAppStore.setState({
        currentBook: {
          title: "Le Petit Prince",
          author: "Antoine de Saint-Exupéry",
          language: "fr",
          description: "Un livre pour les enfants et les grands",
          cover_data_url: null,
          chapter_count: 1,
          file_size_bytes: 100,
          chapters: [],
          sample_text: "C'est ainsi que j'ai abandonné, à l'âge de six ans, une magnifique carrière de peintre.",
        },
      });

      const res = useAppStore.getState().autoDetectSourceLanguage();
      expect(res).toBeDefined();
      expect(res?.languageCode).toBe("fr");
      expect(useAppStore.getState().translationConfig.sourceLang).toBe("Tiếng Pháp (French)");
    });

    it("applies approved entities to glossary without overwriting unapproved terms", () => {
      useAppStore.getState().setTranslationConfig({
        glossary: {
          "Original Term": "Bản dịch gốc",
        },
      });

      useAppStore.getState().applyApprovedEntitiesToGlossary([
        { name: "Harry", translation: "Harry" },
        { name: "Dumbledore", translation: "Cụ Dumbledore" },
      ]);

      const updated = useAppStore.getState().translationConfig.glossary;
      expect(updated["Original Term"]).toBe("Bản dịch gốc");
      expect(updated["Harry"]).toBe("Harry");
      expect(updated["Dumbledore"]).toBe("Cụ Dumbledore");
    });
  });

  describe("Book Chat Agent Actions", () => {
    it("toggles agent drawer open and closed", () => {
      expect(useAppStore.getState().isAgentDrawerOpen).toBe(false);
      useAppStore.getState().toggleAgentDrawer();
      expect(useAppStore.getState().isAgentDrawerOpen).toBe(true);
      useAppStore.getState().toggleAgentDrawer();
      expect(useAppStore.getState().isAgentDrawerOpen).toBe(false);
    });

    it("clears agent chat messages", () => {
      useAppStore.setState({
        agentMessages: [
          { id: "1", role: "user", content: "Hi", timestamp: 100 },
        ],
      });

      useAppStore.getState().clearAgentChat();
      expect(useAppStore.getState().agentMessages.length).toBe(0);
    });

    it("handles proposal confirmation: approving applies mutating changes", async () => {
      useAppStore.setState({
        activePresetId: "classic-hardcover",
        fontSize: 16,
        agentMessages: [
          {
            id: "msg_proposal_1",
            role: "assistant",
            content: "Tôi đề xuất đổi preset",
            actionStatus: "pending",
            actionProposal: {
              id: "act_123",
              toolName: "apply_style_preset",
              title: "Đổi phong cách",
              description: "Đổi sang lightnovel-clean",
              parameters: { presetId: "lightnovel-clean", fontSize: 19 },
              createdAt: 100,
            },
            timestamp: 100,
          },
        ],
      });

      await useAppStore.getState().confirmAgentAction("msg_proposal_1", true);

      const state = useAppStore.getState();
      expect(state.activePresetId).toBe("lightnovel-clean");
      expect(state.fontSize).toBe(19);

      const targetMsg = state.agentMessages.find((m) => m.id === "msg_proposal_1");
      expect(targetMsg?.actionStatus).toBe("executed");

      const followUp = state.agentMessages[state.agentMessages.length - 1];
      expect(followUp.content).toContain("Thực thi thành công");
    });

    it("handles proposal rejection: marks rejected without mutating state", async () => {
      useAppStore.setState({
        activePresetId: "classic-hardcover",
        agentMessages: [
          {
            id: "msg_proposal_2",
            role: "assistant",
            content: "Đề xuất",
            actionStatus: "pending",
            actionProposal: {
              id: "act_456",
              toolName: "apply_style_preset",
              title: "Đổi phong cách",
              description: "Đổi sang poetry-elegance",
              parameters: { presetId: "poetry-elegance" },
              createdAt: 100,
            },
            timestamp: 100,
          },
        ],
      });

      await useAppStore.getState().confirmAgentAction("msg_proposal_2", false);

      const state = useAppStore.getState();
      expect(state.activePresetId).toBe("classic-hardcover"); // Not changed!
      const targetMsg = state.agentMessages.find((m) => m.id === "msg_proposal_2");
      expect(targetMsg?.actionStatus).toBe("rejected");
    });
  });
});


