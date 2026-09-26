import { invoke } from "@tauri-apps/api/core";
import { ChapterChunk } from "./textCleaner";

export interface CreateEpubPayload {
  title: string;
  author: string;
  language?: string;
  description?: string;
  coverBase64?: string;
  customCss?: string;
  chapters: ChapterChunk[];
  outputPath?: string;
}

export async function createNewEpub(payload: CreateEpubPayload): Promise<Uint8Array> {
  // SAFETY: Check presence of Tauri internals on global window object
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const rustChapters = payload.chapters.map((ch) => ({
    title: ch.title,
    content_html: ch.content,
  }));

  const rustOptions = {
    title: payload.title,
    author: payload.author,
    language: payload.language || "vi",
    description: payload.description || null,
    cover_base64: payload.coverBase64 || null,
    custom_css: payload.customCss || null,
    chapters: rustChapters,
    output_path: payload.outputPath || null,
  };

  if (isTauri) {
    const bytes = await invoke<number[]>("create_new_epub", { options: rustOptions });
    return new Uint8Array(bytes);
  }

  throw new Error("Môi trường không hỗ trợ tạo EPUB (yêu cầu Tauri runtime).");
}
