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
});

