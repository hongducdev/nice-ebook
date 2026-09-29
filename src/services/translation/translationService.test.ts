import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseTranslationResponse,
} from "../prompts/bookTranslator";
import { TranslationService } from "./translationService";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("bookTranslator prompts & parser", () => {
  it("builds user prompt containing blocks and glossary", () => {
    const prompt = buildUserPrompt({
      sourceLangName: "Tiếng Anh",
      targetLangName: "Tiếng Việt",
      tone: "wuxia",
      blocks: [
        { id: "p_0", text: "Senior brother, watch out for that demon sword!" },
        { id: "p_1", text: "The Sect Master has arrived." },
      ],
      glossary: {
        "Senior brother": "Sư huynh",
        "demon sword": "Ma kiếm",
      },
      bookTitle: "Legend of the Sword",
      chapterTitle: "Chapter 1",
    });

    expect(prompt).toContain("Tiếng Anh sang Tiếng Việt");
    expect(prompt).toContain("Tiên hiệp & Kiếm hiệp");
    expect(prompt).toContain('"Senior brother" => "Sư huynh"');
    expect(prompt).toContain('"demon sword" => "Ma kiếm"');
    expect(prompt).toContain("p_0");
    expect(prompt).toContain("p_1");
  });

  it("builds system prompt with strict JSON formatting instructions", () => {
    const sysPrompt = buildSystemPrompt("literary", "English", "Vietnamese");
    expect(sysPrompt).toContain("English sang Vietnamese");
    expect(sysPrompt).toContain('{"id": "p_0", "text":');
    expect(sysPrompt).toContain("CHỈ TRẢ VỀ DUY NHẤT MÃ RAW JSON");
  });

  it("parses clean JSON array response correctly", () => {
    const raw = JSON.stringify([
      { id: "p_0", text: "Xin chào thế giới" },
      { id: "p_1", text: "Hôm nay là một ngày tuyệt vời" },
    ]);

    const parsed = parseTranslationResponse(raw);
    expect(parsed["p_0"]).toBe("Xin chào thế giới");
    expect(parsed["p_1"]).toBe("Hôm nay là một ngày tuyệt vời");
  });

  it("parses response wrapped in markdown code fence", () => {
    const raw = `Here is the translation:
\`\`\`json
[
  {"id": "p_0", "text": "Đoạn số không"},
  {"id": "p_1", "text": "Đoạn số một"}
]
\`\`\`
Hope this helps!`;

    const parsed = parseTranslationResponse(raw);
    expect(parsed["p_0"]).toBe("Đoạn số không");
    expect(parsed["p_1"]).toBe("Đoạn số một");
  });

  it("recovers via regex if JSON array is slightly malformed", () => {
    const raw = `[
      {"id": "p_0", "text": "Câu đầu tiên"},
      {"id": "p_1", "text": "Câu thứ hai", trailing_broken
    ]`;

    const parsed = parseTranslationResponse(raw);
    expect(parsed["p_0"]).toBe("Câu đầu tiên");
    expect(parsed["p_1"]).toBe("Câu thứ hai");
  });
});

describe("TranslationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("translates a chapter chunk and returns transformed HTML", async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify([
        { id: "p_0", text: "Tiêu đề chương 1" },
        { id: "p_1", text: "Đoạn văn mở đầu được dịch." },
      ])
    );

    const chapterHtml = `<html><body><h1>Chapter 1 Title</h1><p>Opening paragraph.</p></body></html>`;

    const result = await TranslationService.translateChapter({
      chapterHtml,
      chapterTitle: "Chapter 1",
      sourceLang: "English",
      targetLang: "Vietnamese",
      tone: "literary",
      mode: "replace",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o",
    });

    expect(result.totalBlocks).toBe(2);
    expect(result.translatedBlocksCount).toBe(2);
    expect(result.translatedHtml).toContain("Tiêu đề chương 1");
    expect(result.translatedHtml).toContain("Đoạn văn mở đầu được dịch.");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("tries fallback models if primary model fails", async () => {
    const mockInvoke = vi.mocked(invoke);
    // Primary model fails
    mockInvoke.mockRejectedValueOnce(new Error("Rate limit exceeded 429"));
    // Fallback model succeeds
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify([{ id: "p_0", text: "Bản dịch từ model phụ" }])
    );

    const chapterHtml = `<html><body><p>Test paragraph</p></body></html>`;

    const result = await TranslationService.translateChapter({
      chapterHtml,
      chapterTitle: "Ch 1",
      sourceLang: "English",
      targetLang: "Vietnamese",
      tone: "literary",
      mode: "replace",
      baseUrl: "https://api.openai.com/v1",
      model: "primary-model",
      fallbackModels: ["backup-model"],
    });

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(result.usedModel).toBe("backup-model");
    expect(result.translatedHtml).toContain("Bản dịch từ model phụ");
  });

  it("aborts cleanly when AbortSignal is triggered without modifying HTML", async () => {
    const controller = new AbortController();
    controller.abort();

    const chapterHtml = `<html><body><p>Paragraph</p></body></html>`;

    await expect(
      TranslationService.translateChapter({
        chapterHtml,
        chapterTitle: "Ch 1",
        sourceLang: "English",
        targetLang: "Vietnamese",
        tone: "literary",
        mode: "replace",
        baseUrl: "https://api.openai.com/v1",
        model: "test-model",
        abortSignal: controller.signal,
      })
    ).rejects.toThrow("Thao tác dịch đã bị hủy bởi người dùng");
  });

  it("throws clear error when model returns unparseable garbage", async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockResolvedValueOnce("I cannot translate this because I am an AI.");

    const chapterHtml = `<html><body><p>Paragraph</p></body></html>`;

    await expect(
      TranslationService.translateChapter({
        chapterHtml,
        chapterTitle: "Ch 1",
        sourceLang: "English",
        targetLang: "Vietnamese",
        tone: "literary",
        mode: "replace",
        baseUrl: "https://api.openai.com/v1",
        model: "test-model",
      })
    ).rejects.toThrow("không trả về mảng JSON bản dịch hợp lệ");
  });
});
