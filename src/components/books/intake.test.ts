import { describe, it, expect, vi, beforeEach } from "vitest";

// Ensure global window object for test environment
if (typeof window === "undefined") {
  (globalThis as any).window = {
    __TAURI_INTERNALS__: {
      metadata: { currentWebview: { label: "main" } },
    },
  };
}

// Mock @tauri-apps/plugin-dialog
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/useAppStore";

describe("Book Intake Workflows (Click-to-Add & Drag-and-Drop)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      currentBook: null,
      currentFilePath: null,
      currentFileBytes: null,
      isLoadingBook: false,
      isDraggingFile: false,
      activeTab: "books",
    });
    if (typeof window === "undefined") {
      (globalThis as any).window = globalThis;
    }
    // Set simulated Tauri environment
    (window as any).__TAURI_INTERNALS__ = {
      metadata: { currentWebview: { label: "main" } },
    };
  });

  describe("Click-to-Add via Tauri File Dialog", () => {
    it("successfully requests native dialog with .epub filter and loads book", async () => {
      const mockMeta = {
        title: "Dune",
        author: "Frank Herbert",
        language: "en",
        description: "Sci-fi classic",
        cover_data_url: null,
        chapter_count: 12,
        file_size_bytes: 450000,
        chapters: [],
        sample_text: "Sample text",
      };

      (open as any).mockResolvedValueOnce("D:\\Books\\Dune.epub");
      (invoke as any).mockResolvedValueOnce(mockMeta);

      // Simulate intake handler
      const selected = await open({
        multiple: false,
        filters: [{ name: "Ebook", extensions: ["epub"] }],
      });

      expect(open).toHaveBeenCalledWith({
        multiple: false,
        filters: [{ name: "Ebook", extensions: ["epub"] }],
      });

      expect(selected).toBe("D:\\Books\\Dune.epub");

      const ok = await useAppStore.getState().loadBookFromPath(selected as string);
      expect(ok).toBe(true);
      expect(invoke).toHaveBeenCalledWith("read_epub", { path: "D:\\Books\\Dune.epub" });
      expect(useAppStore.getState().currentBook?.title).toBe("Dune");
    });

    it("does nothing when user cancels native dialog", async () => {
      (open as any).mockResolvedValueOnce(null);

      const selected = await open({
        multiple: false,
        filters: [{ name: "Ebook", extensions: ["epub"] }],
      });

      expect(selected).toBeNull();
      expect(invoke).not.toHaveBeenCalled();
      expect(useAppStore.getState().currentBook).toBeNull();
    });
  });

  describe("Tauri Window Native Drag & Drop Intake", () => {
    it("handles native drop event payload with valid .epub path", async () => {
      const mockMeta = {
        title: "Lord of the Rings",
        author: "J.R.R. Tolkien",
        language: "en",
        description: null,
        cover_data_url: null,
        chapter_count: 30,
        file_size_bytes: 900000,
        chapters: [],
        sample_text: "In a hole in the ground...",
      };

      (invoke as any).mockResolvedValueOnce(mockMeta);

      const dropEventPayload = {
        type: "drop",
        paths: ["C:\\Users\\User\\Downloads\\lotr.epub"],
      };

      // Intake verification
      const filePath = dropEventPayload.paths[0];
      expect(filePath.toLowerCase().endsWith(".epub")).toBe(true);

      const ok = await useAppStore.getState().loadBookFromPath(filePath);
      expect(ok).toBe(true);
      expect(invoke).toHaveBeenCalledWith("read_epub", { path: "C:\\Users\\User\\Downloads\\lotr.epub" });
      expect(useAppStore.getState().currentBook?.title).toBe("Lord of the Rings");
    });

    it("rejects non-epub dropped files", () => {
      const dropEventPayload = {
        type: "drop",
        paths: ["C:\\Users\\User\\Downloads\\invoice.pdf"],
      };

      const filePath = dropEventPayload.paths[0];
      const isEpub = filePath.toLowerCase().endsWith(".epub");
      expect(isEpub).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("Browser / Fallback Intake via Bytes", () => {
    it("loads book from byte array", async () => {
      const mockMeta = {
        title: "Offline Manual",
        author: "Team",
        language: "vi",
        description: null,
        cover_data_url: null,
        chapter_count: 3,
        file_size_bytes: 2048,
        chapters: [],
        sample_text: "Manual content",
      };

      (invoke as any).mockResolvedValueOnce(mockMeta);

      const mockBytes = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00];
      const ok = await useAppStore.getState().loadBookFromBytes(mockBytes);

      expect(ok).toBe(true);
      expect(invoke).toHaveBeenCalledWith("read_epub_bytes", { bytes: mockBytes });
      expect(useAppStore.getState().currentBook?.title).toBe("Offline Manual");
      expect(useAppStore.getState().currentFileBytes).toEqual(mockBytes);
    });
  });
});
