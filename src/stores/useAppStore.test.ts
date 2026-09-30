import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAppStore } from "./useAppStore";
import { AiService } from "../services/aiService";

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

    it("preserves 9router configured_providers and api_key and passes api_key to testModel", async () => {
      const mock9RouterGateway = {
        name: "9Router (Chính)",
        base_url: "http://127.0.0.1:20128/v1",
        port: 20128,
        is_online: true,
        models: ["ag/gemini-3.8-flash", "cx/gpt-5.6-sol", "cl/openai/gpt-4o"],
        gateway_type: "9router",
        latency_ms: 15,
        api_key: "sk-mock-key-123",
        configured_providers: [
          { provider: "antigravity", name: "hongducyb123@gmail.com", is_active: true },
          { provider: "codex", name: "hongducyb123@gmail.com", is_active: true },
          { provider: "cline", name: "hongducyb123@gmail.com", is_active: true },
        ],
      };

      useAppStore.getState().selectGateway(mock9RouterGateway);

      const state = useAppStore.getState();
      expect(state.activeGateway).toEqual(mock9RouterGateway);
      expect(state.activeGateway?.api_key).toBe("sk-mock-key-123");
      expect(state.activeGateway?.configured_providers).toHaveLength(3);
      expect(state.selectedModel).toBe("ag/gemini-3.8-flash");

      const spyTest = vi.spyOn(AiService, "testModel").mockResolvedValueOnce({
        success: true,
        latencyMs: 12,
        message: "OK",
      });

      await useAppStore.getState().testModel("ag/gemini-3.8-flash");

      expect(spyTest).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "http://127.0.0.1:20128/v1",
          apiKey: "sk-mock-key-123",
          model: "ag/gemini-3.8-flash",
          gatewayType: "9router",
        })
      );
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

    it("auto-saves metadata to project storage, preserves all fields and hydrates on reopen", async () => {
      const initialBook = {
        title: "Tựa Cũ Trên Đĩa",
        author: "Tác Giả Cũ",
        language: "en",
        description: "Mô tả cũ",
        cover_data_url: null,
        chapter_count: 1,
        file_size_bytes: 5000,
        chapters: [{ id: "c1", href: "c1.xhtml", title: "C1", preview_text: "" }],
        sample_text: "",
      };

      const projId = "proj-meta-autosave";
      useAppStore.setState({
        currentBook: initialBook,
        currentFilePath: "C:\\books\\book.epub",
        activeProjectId: projId,
        projects: [
          {
            id: projId,
            name: "Tựa Cũ Trên Đĩa",
            author: "Tác Giả Cũ",
            filePath: "C:\\books\\book.epub",
            coverDataUrl: null,
            chapterCount: 1,
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
      });

      // Update metadata
      useAppStore.getState().updateBookMetadata({
        title: "Tiếng Chim Hót Trong Bụi Mận Gai",
        author: "Colleen McCullough",
        publisher: "NXB Văn Học",
        published_year: "1977",
        isbn: "978-604-001",
        genre: "Kinh Điển, Lãng Mạn",
        description: "Thiên tình sử nước Úc",
        language: "vi",
      });

      // Verify project in storage was updated
      const projectInStore = useAppStore.getState().projects.find((p) => p.id === projId);
      expect(projectInStore?.name).toBe("Tiếng Chim Hót Trong Bụi Mận Gai");
      expect(projectInStore?.author).toBe("Colleen McCullough");
      expect(projectInStore?.publisher).toBe("NXB Văn Học");
      expect(projectInStore?.publishedYear).toBe("1977");
      expect(projectInStore?.isbn).toBe("978-604-001");
      expect(projectInStore?.genre).toBe("Kinh Điển, Lãng Mạn");
      expect(projectInStore?.description).toBe("Thiên tình sử nước Úc");
      expect(projectInStore?.language).toBe("vi");

      // Mock invoke for read_epub returning original raw disk data
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === "read_epub") {
          return Promise.resolve(initialBook);
        }
        return Promise.resolve({});
      });

      // Reopen project: should hydrate the auto-saved metadata overrides
      const reopened = await useAppStore.getState().openProject(projId);
      expect(reopened).toBe(true);

      const stateAfterReopen = useAppStore.getState();
      expect(stateAfterReopen.currentBook?.title).toBe("Tiếng Chim Hót Trong Bụi Mận Gai");
      expect(stateAfterReopen.currentBook?.author).toBe("Colleen McCullough");
      expect(stateAfterReopen.currentBook?.publisher).toBe("NXB Văn Học");
      expect(stateAfterReopen.currentBook?.published_year).toBe("1977");
      expect(stateAfterReopen.currentBook?.isbn).toBe("978-604-001");
      expect(stateAfterReopen.currentBook?.genre).toBe("Kinh Điển, Lãng Mạn");
      expect(stateAfterReopen.currentBook?.description).toBe("Thiên tình sử nước Úc");
      expect(stateAfterReopen.currentBook?.language).toBe("vi");
    });

    it("auto-saves metadata directly to file on disk via autoSaveMetadataToFile", async () => {
      useAppStore.setState({
        currentBook: {
          title: "Sách Mới",
          author: "Tác Giả Mới",
          language: "vi",
          description: "Mô tả sách",
          cover_data_url: null,
          chapter_count: 1,
          file_size_bytes: 1000,
          chapters: [],
          sample_text: "",
        },
        currentFilePath: "C:\\books\\target.epub",
        modifiedChapters: {},
      });

      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === "export_epub") {
          return Promise.resolve(2000);
        }
        return Promise.resolve({});
      });

      const saved = await useAppStore.getState().autoSaveMetadataToFile();
      expect(saved).toBe(true);

      expect(invoke).toHaveBeenCalledWith(
        "export_epub",
        expect.objectContaining({
          inputPath: "C:\\books\\target.epub",
          outputPath: "C:\\books\\target.epub",
          metadataOverrides: expect.objectContaining({
            title: "Sách Mới",
            author: "Tác Giả Mới",
            language: "vi",
            description: "Mô tả sách",
          }),
        })
      );
    });

    it("auto-saves metadata and project when executed through chat agent action confirmation", async () => {
      const projId = "proj-agent-test";
      useAppStore.setState({
        currentBook: {
          title: "Tựa Cũ",
          author: "Tác Giả Cũ",
          language: "vi",
          description: null,
          cover_data_url: null,
          chapter_count: 1,
          file_size_bytes: 1000,
          chapters: [],
          sample_text: "",
        },
        currentFilePath: "C:\\books\\agent_book.epub",
        activeProjectId: projId,
        projects: [
          {
            id: projId,
            name: "Tựa Cũ",
            filePath: "C:\\books\\agent_book.epub",
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
        agentMessages: [
          {
            id: "msg-prop-1",
            role: "assistant",
            content: "Đề xuất đổi tên sách",
            timestamp: 100,
            actionProposal: {
              id: "prop-1",
              toolName: "update_metadata",
              title: "Cập nhật metadata sách",
              description: "Đổi tên sách thành Nhà Giả Kim",
              parameters: {
                title: "Nhà Giả Kim",
                author: "Paulo Coelho",
              },
              createdAt: 100,
            },
            actionStatus: "pending",
          },
        ],
      });

      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === "export_epub") {
          return Promise.resolve(3000);
        }
        return Promise.resolve({});
      });

      // Confirm action via chat agent
      await useAppStore.getState().confirmAgentAction("msg-prop-1", true);

      // In-memory state updated
      const state = useAppStore.getState();
      expect(state.currentBook?.title).toBe("Nhà Giả Kim");
      expect(state.currentBook?.author).toBe("Paulo Coelho");

      // Project in storage auto-saved
      const updatedProj = state.projects.find((p) => p.id === projId);
      expect(updatedProj?.name).toBe("Nhà Giả Kim");
      expect(updatedProj?.author).toBe("Paulo Coelho");

      // Chat agent status marked as executed
      const updatedMsg = state.agentMessages.find((m) => m.id === "msg-prop-1");
      expect(updatedMsg?.actionStatus).toBe("executed");

      // Auto-saved to physical file
      expect(invoke).toHaveBeenCalledWith(
        "export_epub",
        expect.objectContaining({
          inputPath: "C:\\books\\agent_book.epub",
          outputPath: "C:\\books\\agent_book.epub",
          metadataOverrides: expect.objectContaining({
            title: "Nhà Giả Kim",
            author: "Paulo Coelho",
          }),
        })
      );
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

  describe("Auto-Configure All Translation Settings", () => {
    it("auto-configures language, tone, titles, and preserves pre-existing user glossary", async () => {
      useAppStore.setState({
        currentBook: {
          title: "Phàm Nhân Tu Tiên",
          author: "Vong Ngữ",
          language: "zh",
          description: "Truyện tu tiên kinh điển",
          cover_data_url: null,
          chapter_count: 1,
          file_size_bytes: 100,
          chapters: [],
          sample_text: "韩立拿着神秘小瓶，开始了他的修仙宗门之旅。", // Chinese CJK cultivation keywords
        },
        translationConfig: {
          sourceLang: "Tiếng Anh (English)",
          targetLang: "Tiếng Việt (Vietnamese)",
          mode: "replace",
          tone: "literary",
          glossary: {
            "Custom Term": "Bản dịch của người dùng",
          },
          maxBlocksPerChunk: 12,
          useResearchBrief: false,
          translateTitles: false,
        },
      });

      const res = await useAppStore.getState().autoConfigureAllTranslationSettings();

      expect(res).toBeDefined();
      expect(res?.recommendedTone).toBe("wuxia"); // Recognized wuxia cultivation!
      expect(res?.detectedLanguage?.languageCode).toBe("zh"); // Recognized Chinese!

      const updated = useAppStore.getState().translationConfig;
      expect(updated.tone).toBe("wuxia");
      expect(updated.sourceLang).toBe("Tiếng Trung (Chinese)");
      expect(updated.targetLang).toBe("Tiếng Việt (Vietnamese)");
      expect(updated.translateTitles).toBe(true);
      // Pre-existing user term must be strictly preserved!
      expect(updated.glossary["Custom Term"]).toBe("Bản dịch của người dùng");
      // New result fields are always present (no entities scanned for this book).
      expect(res?.entitiesExtractedCount).toBe(0);
      expect(res?.properNamesCount).toBe(0);
      expect(res?.termsCount).toBe(0);
      expect(res?.addedProperNames).toEqual([]);
      expect(res?.addedTerms).toEqual([]);
      expect(typeof res?.activeEngineLabel).toBe("string");
    });

    it("seeds EVERY detected proper name and term — including low-frequency ones", async () => {
      const originalExtract = useAppStore.getState().extractBookEntities;
      const originalBrief = useAppStore.getState().generateBookResearchBrief;

      // Deterministic scan: one rare person name, one rare place, one rare term,
      // plus one entity already in the user glossary. `count: 1` proves the old
      // `count >= 3` threshold is gone.
      useAppStore.setState({
        currentBook: {
          title: "A Mortal's Journey",
          author: "Wang Yu",
          language: "en",
          description: "Cultivation novel",
          cover_data_url: null,
          chapter_count: 1,
          file_size_bytes: 500,
          chapters: [],
          sample_text: "Han Li climbed the mountain and cultivated his Spirit Root.",
        },
        activeProjectId: null,
        translationConfig: {
          sourceLang: "Tiếng Anh (English)",
          targetLang: "Tiếng Việt (Vietnamese)",
          mode: "replace",
          tone: "literary",
          glossary: { "Custom Term": "Bản dịch của người dùng" },
          maxBlocksPerChunk: 12,
        },
        extractBookEntities: async () => [
          { id: "e1", name: "Han Li", count: 1, category: "person", suggestedTranslation: "Hàn Lập", isExistingInGlossary: false },
          { id: "e2", name: "Qing Yuan Peak", count: 1, category: "place", suggestedTranslation: "Thanh Nguyên Phong", isExistingInGlossary: false },
          { id: "e3", name: "Spirit Root", count: 1, category: "term", suggestedTranslation: "Linh căn", isExistingInGlossary: false },
          { id: "e4", name: "Custom Term", count: 9, category: "term", suggestedTranslation: "Bản dịch của người dùng", isExistingInGlossary: true },
          { id: "e5", name: "Untranslated Term", count: 1, category: "term", suggestedTranslation: "Untranslated Term", isExistingInGlossary: false },
          // Unknown category the AI could emit through its loose `category` cast.
          { id: "e6", name: "Mystic Art", count: 1, category: "organization" as never, suggestedTranslation: "Mystic Art", isExistingInGlossary: false },
          { id: "e7", name: "Azure Sect", count: 1, category: "organization" as never, suggestedTranslation: "Thanh Vân Tông", isExistingInGlossary: false },
        ],
        generateBookResearchBrief: async () => "",
      });

      try {
        const res = await useAppStore.getState().autoConfigureAllTranslationSettings();

        expect(res?.entitiesExtractedCount).toBe(7);
        expect(res?.properNamesCount).toBe(2); // Han Li + Qing Yuan Peak
        expect(res?.termsCount).toBe(2); // Spirit Root + Azure Sect (Custom Term already existed)
        expect(res?.addedProperNames).toEqual(["Han Li", "Qing Yuan Peak"]);
        expect(res?.addedTerms).toEqual(["Spirit Root", "Azure Sect"]);

        const glossary = useAppStore.getState().translationConfig.glossary;
        expect(glossary["Han Li"]).toBe("Hàn Lập");
        expect(glossary["Qing Yuan Peak"]).toBe("Thanh Nguyên Phong");
        expect(glossary["Spirit Root"]).toBe("Linh căn");
        expect(glossary["Azure Sect"]).toBe("Thanh Vân Tông");
        // A term with no AI proposal must NOT be pinned source => source.
        expect(glossary["Untranslated Term"]).toBeUndefined();
        // Nor may an unknown category without a proposal be identity-pinned.
        expect(glossary["Mystic Art"]).toBeUndefined();
        // Existing user entry is never overwritten and never re-counted as new.
        expect(glossary["Custom Term"]).toBe("Bản dịch của người dùng");
        expect(Object.keys(glossary)).toHaveLength(5);
      } finally {
        useAppStore.setState({
          extractBookEntities: originalExtract,
          generateBookResearchBrief: originalBrief,
        });
      }
    });
  });
});



// ---------------------------------------------------------------------------
// Ingest Workflow Router
// ---------------------------------------------------------------------------

const ROUTER_EN_SAMPLE =
  "The wind was rising and the old man knew that this would be the last time they would ever see " +
  "the shore of that land. He had come here with nothing and he would leave with nothing.";

const ROUTER_VI_SAMPLE =
  "Gió đang nổi lên và ông lão biết rằng đây sẽ là lần cuối cùng họ còn nhìn thấy bờ biển của " +
  "vùng đất ấy. Ông đã đến đây với hai bàn tay trắng và rồi ông cũng sẽ ra đi như thế.";

function routerChapter(index: number, title: string, preview: string) {
  return { id: `ch-${index}`, href: `chapter-${index}.xhtml`, title, preview_text: preview };
}

function routerBook(overrides: Record<string, unknown> = {}) {
  return {
    title: "Untitled",
    author: "Anonymous",
    language: "en",
    description: null,
    cover_data_url: null,
    chapter_count: 3,
    file_size_bytes: 1024,
    chapters: [
      routerChapter(1, "Chapter One", ROUTER_EN_SAMPLE),
      routerChapter(2, "Chapter Two", ROUTER_EN_SAMPLE),
      routerChapter(3, "Chapter Three", ROUTER_EN_SAMPLE),
    ],
    sample_text: ROUTER_EN_SAMPLE,
    ...overrides,
  };
}

function routerVietnameseBook(overrides: Record<string, unknown> = {}) {
  return routerBook({
    title: "Người Lái Đò Sông Đà",
    language: "vi",
    sample_text: ROUTER_VI_SAMPLE,
    chapters: [
      routerChapter(1, "Chương Một", ROUTER_VI_SAMPLE),
      routerChapter(2, "Chương Hai", ROUTER_VI_SAMPLE),
      routerChapter(3, "Chương Ba", ROUTER_VI_SAMPLE),
    ],
    ...overrides,
  });
}

describe("useAppStore - Ingest Workflow Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      currentBook: null,
      currentFilePath: null,
      currentFileBytes: null,
      activeTab: "books",
      activeProjectId: null,
      projects: [],
      bookProfile: null,
      lastIngestRoute: null,
      workflowSource: null,
      workflowCompletedSteps: [],
      dismissedWorkflowFor: null,
      autoRouteOnIngest: true,
      translatedChapters: {},
    });
  });

  it("auto-switches a foreign-language EPUB to the Translator", async () => {
    (invoke as any).mockResolvedValueOnce(routerBook());

    const ok = await useAppStore.getState().loadBookFromPath("C:\\books\\foundation.epub");

    expect(ok).toBe(true);
    const state = useAppStore.getState();
    expect(state.activeTab).toBe("translator");
    expect(state.bookProfile?.workflow).toBe("translate");
    expect(state.bookProfile?.languageCode).toBe("en");
    expect(state.lastIngestRoute?.switched).toBe(true);
    expect(state.lastIngestRoute?.reason).toBe("auto");
    // Source language was pre-filled offline, without any AI call.
    expect(state.translationConfig.sourceLang).toContain("English");
    expect(state.translationConfig.targetLang).toContain("Việt");
  });

  it("keeps a Vietnamese EPUB in the library", async () => {
    (invoke as any).mockResolvedValueOnce(routerVietnameseBook());

    const ok = await useAppStore.getState().loadBookFromPath("C:\\books\\sach-viet.epub");

    expect(ok).toBe(true);
    const state = useAppStore.getState();
    expect(state.activeTab).toBe("books");
    expect(state.bookProfile?.workflow).toBe("polish");
    expect(state.lastIngestRoute?.switched).toBe(false);
    expect(state.lastIngestRoute?.reason).toBe("native-vietnamese");
  });

  it("honours the autoRouteOnIngest preference", async () => {
    useAppStore.getState().setAutoRouteOnIngest(false);
    (invoke as any).mockResolvedValueOnce(routerBook());

    await useAppStore.getState().loadBookFromPath("C:\\books\\foundation.epub");

    const state = useAppStore.getState();
    expect(state.activeTab).toBe("books");
    expect(state.bookProfile?.workflow).toBe("translate");
    expect(state.lastIngestRoute?.switched).toBe(false);
    expect(state.lastIngestRoute?.reason).toBe("preference-off");

    useAppStore.getState().setAutoRouteOnIngest(true);
  });

  it("refuses to auto-switch when the detection has no real evidence", async () => {
    (invoke as any).mockResolvedValueOnce(
      routerBook({
        title: "",
        language: "",
        description: null,
        sample_text: "",
        chapter_count: 1,
        chapters: [routerChapter(1, "", "")],
      })
    );

    await useAppStore.getState().loadBookFromPath("C:\\books\\unknown.epub");

    const state = useAppStore.getState();
    expect(state.activeTab).toBe("books");
    expect(state.bookProfile?.detectionSource).toBe("unknown");
    expect(state.lastIngestRoute?.switched).toBe(false);
    expect(state.lastIngestRoute?.reason).toBe("low-confidence");
  });

  it("never switches tabs when told not to (library project open)", () => {
    const route = useAppStore.getState().routeAfterBookLoad(routerBook(), {
      autoSwitch: false,
    });

    expect(route?.switched).toBe(false);
    expect(route?.reason).toBe("auto-switch-disabled");
    expect(useAppStore.getState().activeTab).toBe("books");
    expect(useAppStore.getState().bookProfile?.workflow).toBe("translate");
  });

  it("locks routing once the user starts a workflow manually", () => {
    useAppStore.getState().routeAfterBookLoad(routerBook(), { autoSwitch: false });
    const tab = useAppStore.getState().startRecommendedWorkflow();

    expect(tab).toBe("translator");
    expect(useAppStore.getState().activeTab).toBe("translator");
    expect(useAppStore.getState().workflowSource).toBe("manual");

    useAppStore.getState().setActiveTab("books");
    const route = useAppStore.getState().routeAfterBookLoad(routerBook(), { autoSwitch: true });

    expect(route?.switched).toBe(false);
    expect(route?.reason).toBe("manual-locked");
    expect(useAppStore.getState().activeTab).toBe("books");
  });

  it("dismisses the banner per book and re-shows it for another book", () => {
    useAppStore.getState().routeAfterBookLoad(routerBook(), { autoSwitch: false });
    useAppStore.getState().dismissWorkflow();

    const dismissed = useAppStore.getState().dismissedWorkflowFor;
    expect(dismissed).toBe(useAppStore.getState().bookProfile?.bookIdentity);

    useAppStore.getState().routeAfterBookLoad(routerBook(), { autoSwitch: false });
    expect(useAppStore.getState().dismissedWorkflowFor).toBe(dismissed);

    useAppStore
      .getState()
      .routeAfterBookLoad(routerVietnameseBook(), { autoSwitch: false });
    expect(useAppStore.getState().dismissedWorkflowFor).toBeNull();
  });

  it("resets per-book progress when a different book is loaded", () => {
    useAppStore.getState().routeAfterBookLoad(routerBook(), { autoSwitch: false });
    useAppStore.getState().markWorkflowStepComplete("style");
    expect(useAppStore.getState().workflowCompletedSteps).toEqual(["style"]);

    useAppStore.getState().routeAfterBookLoad(routerVietnameseBook(), { autoSwitch: false });
    expect(useAppStore.getState().workflowCompletedSteps).toEqual([]);
  });

  it("does not duplicate completed steps", () => {
    useAppStore.getState().routeAfterBookLoad(routerBook(), { autoSwitch: false });
    useAppStore.getState().markWorkflowStepComplete("translate");
    useAppStore.getState().markWorkflowStepComplete("translate");
    expect(useAppStore.getState().workflowCompletedSteps).toEqual(["translate"]);
  });

  it("counts untranslated chapters in O(1) from translatedChapters", () => {
    useAppStore.setState({
      currentBook: routerBook() as never,
      translatedChapters: { "chapter-1.xhtml": 1, "chapter-2.xhtml": 2 },
    });

    expect(useAppStore.getState().getUntranslatedChapterCount()).toBe(1);

    useAppStore.setState({ translatedChapters: {} });
    expect(useAppStore.getState().getUntranslatedChapterCount()).toBe(3);
  });

  it("marks convert-translate for a Chinese scanned PDF", () => {
    const profile = useAppStore.getState().routeAfterBookLoad(
      routerBook({
        language: "zh",
        title: "海边故事",
        sample_text: "风吹起，老人知道这将是他们最后一次看到那片土地的海岸。他来时一无所有。",
        chapters: [
          routerChapter(1, "第一章", "风吹起，老人知道这将是他们最后一次看到那片土地的海岸。"),
        ],
      }) as never,
      { autoSwitch: false, kind: "pdf-digital", isScannedPdf: true }
    );

    expect(profile?.profile.kind).toBe("pdf-scanned");
    expect(profile?.profile.workflow).toBe("ocr-translate");
  });

  it("round-trips workflow progress through save -> close -> reopen", async () => {
    // (a) from the completion review: `openProject` used to restore progress in
    // a separate statement after routing, so a future reorder could silently
    // reset it. `restoreProjectWorkflow` now owns that ordering; this test pins
    // the round trip end to end.
    (invoke as any).mockResolvedValueOnce(routerBook());
    await useAppStore.getState().loadBookFromPath("C:\\books\\foundation.epub");

    const projectId = useAppStore.getState().activeProjectId!;
    expect(projectId).toBeTruthy();

    useAppStore.getState().markWorkflowStepComplete("translate");
    useAppStore.setState({
      workflowSource: "manual",
      translatedChapters: { "chapter-1.xhtml": 1, "chapter-2.xhtml": 2 },
    });
    useAppStore.getState().saveActiveProject();

    useAppStore.getState().closeActiveProject();
    expect(useAppStore.getState().workflowCompletedSteps).toEqual([]);
    expect(useAppStore.getState().translatedChapters).toEqual({});
    expect(useAppStore.getState().bookProfile).toBeNull();

    (invoke as any).mockResolvedValueOnce(routerBook());
    const reopened = await useAppStore.getState().openProject(projectId);

    expect(reopened).toBe(true);
    const state = useAppStore.getState();
    expect(state.activeTab).toBe("books");
    expect(state.workflowCompletedSteps).toEqual(["translate"]);
    expect(state.workflowSource).toBe("manual");
    expect(Object.keys(state.translatedChapters)).toEqual([
      "chapter-1.xhtml",
      "chapter-2.xhtml",
    ]);
  });

  it("reports one translation coverage semantic for every reader", () => {
    // (b) from the completion review: the sidebar badge, the stepper and the
    // translator panel must not disagree about what "translated" means.
    useAppStore.setState({
      currentBook: routerBook() as never,
      translatedChapters: { "chapter-1.xhtml": 1 },
      modifiedChapters: { "chapter-1.xhtml": "<p>a</p>", "chapter-2.xhtml": "<p>b</p>" },
    });

    const tracked = useAppStore.getState().getTranslationCoverage();
    expect(tracked).toEqual({ translated: 1, total: 3, isLegacyFallback: false });
    expect(useAppStore.getState().getUntranslatedChapterCount()).toBe(2);

    // A legacy project (translated before per-chapter tracking) has no map, so
    // the coverage falls back to `modifiedChapters` and says so.
    useAppStore.setState({ translatedChapters: {} });
    const legacy = useAppStore.getState().getTranslationCoverage();
    expect(legacy).toEqual({ translated: 2, total: 3, isLegacyFallback: true });
    expect(useAppStore.getState().getUntranslatedChapterCount()).toBe(1);
  });

  it("opens a legacy project that lacks the workflow fields", async () => {
    const legacyProject = {
      id: "legacy-1",
      name: "Sách Cũ",
      author: "Tác giả",
      filePath: "C:\\books\\legacy.epub",
      coverDataUrl: null,
      chapterCount: 3,
      fileSizeBytes: 2048,
      activePresetId: "classic-hardcover",
      customCss: "",
      fontFamily: "serif",
      fontSize: 16,
      textAlign: "justify" as const,
      dropCaps: true,
      lineHeight: 1.75,
      firstLineIndent: "2em",
      sceneDivider: "♦ ♦ ♦",
      modifiedChapters: {},
      chapterEnhanceReports: {},
      createdAt: 1,
      lastOpenedAt: 1,
      // NOTE: deliberately no workflowId / workflowCompletedSteps /
      // translatedChapters / detectedLanguageCode / workflowSource.
    };

    useAppStore.setState({ projects: [legacyProject] as never });
    (invoke as any).mockResolvedValueOnce(routerVietnameseBook());

    const ok = await useAppStore.getState().openProject("legacy-1");

    expect(ok).toBe(true);
    const state = useAppStore.getState();
    expect(state.activeTab).toBe("books");
    expect(state.workflowCompletedSteps).toEqual([]);
    expect(state.translatedChapters).toEqual({});
    expect(state.workflowSource).toBe("auto");
    expect(state.bookProfile?.workflow).toBe("polish");
  });
});
