import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseTranslationResponse,
  cleanTranslatedText,
  isUntranslatedEcho,
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

  it("normalizes diverse ID formats (numeric 0, 'p0', 'P_0', '0') to canonical 'p_0'", () => {
    const raw = JSON.stringify([
      { id: 0, text: "Đoạn 0" },
      { id: "p1", text: "Đoạn 1" },
      { id: "P_2", text: "Đoạn 2" },
      { id: "3", text: "Đoạn 3" },
    ]);

    const parsed = parseTranslationResponse(raw);
    expect(parsed["p_0"]).toBe("Đoạn 0");
    expect(parsed["p_1"]).toBe("Đoạn 1");
    expect(parsed["p_2"]).toBe("Đoạn 2");
    expect(parsed["p_3"]).toBe("Đoạn 3");
  });

  it("safely applies positional fallback when IDs are mislabeled but total count matches expected 1:1", () => {
    const raw = JSON.stringify([
      { id: "block_a", text: "Đoạn thứ nhất" },
      { id: "block_b", text: "Đoạn thứ hai" },
    ]);

    const parsed = parseTranslationResponse(raw, ["p_0", "p_1"]);
    expect(parsed["p_0"]).toBe("Đoạn thứ nhất");
    expect(parsed["p_1"]).toBe("Đoạn thứ hai");
  });

  it("guards against ID collisions when multiple raw IDs normalize to the same key", () => {
    const raw = JSON.stringify([
      { id: "p_0", text: "Bản dịch gốc của p_0" },
      { id: "p0", text: "Trùng lặp p0 không được đè lên p_0" },
      { id: 0, text: "Trùng lặp số 0 không được đè lên p_0" },
    ]);

    const parsed = parseTranslationResponse(raw);
    expect(parsed["p_0"]).toBe("Bản dịch gốc của p_0");
  });

  it("cleans reasoning tokens, ID prefixes, prompt echoes, and leaked HTML wrappers", () => {
    const dirty1 = "<think>Tôi đang suy nghĩ cách dịch đoạn này...</think>Đây là nội dung sách sạch sẽ.";
    expect(cleanTranslatedText(dirty1)).toBe("Đây là nội dung sách sạch sẽ.");

    const dirty2 = "p_0: Lời thoại của nhân vật chính.";
    expect(cleanTranslatedText(dirty2)).toBe("Lời thoại của nhân vật chính.");

    const dirty3 = "[p_12] - Đoạn văn bản tiếp theo.";
    expect(cleanTranslatedText(dirty3)).toBe("Đoạn văn bản tiếp theo.");

    const dirty4 = "Bản dịch: Gió bắc rít gào qua khe núi.";
    expect(cleanTranslatedText(dirty4)).toBe("Gió bắc rít gào qua khe núi.");

    const dirty5 = "<p>Đoạn văn bị bọc thẻ p thừa.</p>";
    expect(cleanTranslatedText(dirty5)).toBe("Đoạn văn bị bọc thẻ p thừa.");

    const dirty6 = "Hắn bước tới trước cửa phòng.\n\nLưu ý: Từ phòng ở đây chỉ tẩm cung.";
    expect(cleanTranslatedText(dirty6)).toBe("Hắn bước tới trước cửa phòng.");
  });

  it("detects untranslated source echoes and Chinese text leakage accurately", () => {
    // Chinese text remaining when translating to Vietnamese
    const chineseEcho = isUntranslatedEcho("这正是玄天斩灵剑的威力", "这正是玄天斩灵剑的威力", "zh", "vi");
    expect(chineseEcho).toBe(true);

    // English verbatim echo
    const englishEcho = isUntranslatedEcho(
      "The cold wind was howling across the mountain.",
      "The cold wind was howling across the mountain.",
      "en",
      "vi"
    );
    expect(englishEcho).toBe(true);

    // Properly translated Vietnamese
    const validVietnamese = isUntranslatedEcho(
      "Gió lạnh rít gào qua đỉnh núi hiểm trở.",
      "The cold wind was howling across the mountain.",
      "en",
      "vi"
    );
    expect(validVietnamese).toBe(false);
  });

  it("handles 1-based index shift when model returns 1..N instead of p_0..p_N-1", () => {
    const rawOneBased = JSON.stringify([
      { id: 1, text: "Bản dịch của khối đầu tiên (index 0)" },
      { id: 2, text: "Bản dịch của khối thứ hai (index 1)" },
    ]);

    const parsed = parseTranslationResponse(rawOneBased, ["p_0", "p_1"]);
    expect(parsed["p_0"]).toBe("Bản dịch của khối đầu tiên (index 0)");
    expect(parsed["p_1"]).toBe("Bản dịch của khối thứ hai (index 1)");
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

  it("translates a book or chapter title cleanly", async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockResolvedValueOnce('"Harry Potter và Hòn đá Phù thủy"');

    const title = await TranslationService.translateTitle({
      title: "Harry Potter and the Sorcerer's Stone",
      sourceLang: "English",
      targetLang: "Vietnamese",
      tone: "literary",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });

    expect(title).toBe("Harry Potter và Hòn đá Phù thủy");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("returns translatedChapterTitle from translated h1 block", async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify([
        { id: "p_0", text: "Chương 1: Cậu bé sống sót" },
        { id: "p_1", text: "Nội dung mở đầu..." },
      ])
    );

    const chapterHtml = `<html><body><h1>Chapter 1: The Boy Who Lived</h1><p>Opening...</p></body></html>`;

    const result = await TranslationService.translateChapter({
      chapterHtml,
      chapterTitle: "Chapter 1: The Boy Who Lived",
      sourceLang: "English",
      targetLang: "Vietnamese",
      tone: "literary",
      mode: "replace",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });

    expect(result.translatedChapterTitle).toBe("Chương 1: Cậu bé sống sót");
  });

  it("translates chapterTitle using translateTitle if no heading block exists in HTML", async () => {
    const mockInvoke = vi.mocked(invoke);
    // 1. Chunk completion call
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify([{ id: "p_0", text: "Đoạn văn thường." }])
    );
    // 2. translateTitle call
    mockInvoke.mockResolvedValueOnce('"Chương 1: Khởi đầu mới"');

    const chapterHtml = `<html><body><p>Regular paragraph only.</p></body></html>`;

    const result = await TranslationService.translateChapter({
      chapterHtml,
      chapterTitle: "Chapter 1: A New Beginning",
      sourceLang: "English",
      targetLang: "Vietnamese",
      tone: "literary",
      mode: "replace",
      translateChapterTitle: true,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });

    expect(result.translatedChapterTitle).toBe("Chương 1: Khởi đầu mới");
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it("recovers missing block automatically via targeted sub-pass", async () => {
    const mockInvoke = vi.mocked(invoke);
    // Primary chunk response omits p_1
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify([
        { id: "p_0", text: "Đoạn số không" },
        // p_1 omitted
      ])
    );
    // Missing block recovery pass returns p_1
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify([{ id: "p_1", text: "Đoạn số một được bù" }])
    );

    const chapterHtml = `<html><body><p>Paragraph 0</p><p>Paragraph 1</p></body></html>`;

    const result = await TranslationService.translateChapter({
      chapterHtml,
      chapterTitle: "Chapter 1",
      sourceLang: "English",
      targetLang: "Vietnamese",
      tone: "literary",
      mode: "replace",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });

    expect(result.translatedHtml).toContain("Đoạn số không");
    expect(result.translatedHtml).toContain("Đoạn số một được bù");
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it("guarantees 100% block recovery via Chapter-Wide Zero-Gap Pass when chunks leave missing blocks", async () => {
    const mockInvoke = vi.mocked(invoke);
    // Primary chunk response omits p_2
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify([
        { id: "p_0", text: "Đoạn 0 đã dịch." },
        { id: "p_1", text: "Đoạn 1 đã dịch." },
        // p_2 omitted
      ])
    );
    // In-chunk recovery call fails/returns empty
    mockInvoke.mockResolvedValueOnce(JSON.stringify([]));
    // Chapter-Wide Zero-Gap Pass sweeps p_2 and successfully recovers it
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify([{ id: "p_2", text: "Đoạn 2 được quét vét bù thành công ở Zero-Gap Pass." }])
    );

    const chapterHtml = `<html><body><p>Paragraph 0</p><p>Paragraph 1</p><p>Paragraph 2</p></body></html>`;

    const result = await TranslationService.translateChapter({
      chapterHtml,
      chapterTitle: "Chapter Zero Gap",
      sourceLang: "English",
      targetLang: "Vietnamese",
      tone: "literary",
      mode: "replace",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });

    expect(result.totalBlocks).toBe(3);
    expect(result.translatedBlocksCount).toBe(3);
    expect(result.translatedHtml).toContain("Đoạn 0 đã dịch.");
    expect(result.translatedHtml).toContain("Đoạn 1 đã dịch.");
    expect(result.translatedHtml).toContain("Đoạn 2 được quét vét bù thành công ở Zero-Gap Pass.");
  });

  describe("LinguaGacha-style Adaptive Downsizing, Sliding Context & Concurrency", () => {
    it("successfully down-sizes a failing 2-block chunk into sub-chunks (1-by-1) to salvage translation", async () => {
      const mockInvoke = vi.mocked(invoke);
      // 1. Initial 2-block chunk call fails across candidate model
      mockInvoke.mockRejectedValueOnce(new Error("Context length exceeded or JSON parsing exploded"));
      // 2. Adaptive Downsizing splits into 1st half (p_0) -> succeeds
      mockInvoke.mockResolvedValueOnce(
        JSON.stringify([{ id: "p_0", text: "Đoạn 0 được cứu nhờ downsizing." }])
      );
      // 3. 2nd half (p_1) -> succeeds
      mockInvoke.mockResolvedValueOnce(
        JSON.stringify([{ id: "p_1", text: "Đoạn 1 được cứu nhờ downsizing." }])
      );

      const chapterHtml = `<html><body><p>Sentence 0</p><p>Sentence 1</p></body></html>`;

      const result = await TranslationService.translateChapter({
        chapterHtml,
        chapterTitle: "Downsizing Test",
        sourceLang: "English",
        targetLang: "Vietnamese",
        tone: "literary",
        mode: "replace",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
        enableAdaptiveDownsizing: true,
      });

      expect(result.translatedBlocksCount).toBe(2);
      expect(result.translatedHtml).toContain("Đoạn 0 được cứu nhờ downsizing.");
      expect(result.translatedHtml).toContain("Đoạn 1 được cứu nhờ downsizing.");
      expect(mockInvoke).toHaveBeenCalledTimes(3);
    });

    it("fails loudly when sub-chunks suffer terminal failure down to single blocks without hiding errors", async () => {
      const mockInvoke = vi.mocked(invoke);
      // 1. Combined chunk fails
      mockInvoke.mockRejectedValueOnce(new Error("API outage"));
      // 2. 1st sub-block fails terminally
      mockInvoke.mockRejectedValueOnce(new Error("Terminal unrecoverable error"));

      const chapterHtml = `<html><body><p>Block 0</p><p>Block 1</p></body></html>`;

      await expect(
        TranslationService.translateChapter({
          chapterHtml,
          chapterTitle: "Terminal Downsizing Fail",
          sourceLang: "English",
          targetLang: "Vietnamese",
          tone: "literary",
          mode: "replace",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o",
          enableAdaptiveDownsizing: true,
        })
      ).rejects.toThrow();
    });

    it("injects ordered sliding context into subsequent chunks to maintain narrative flow", async () => {
      const mockInvoke = vi.mocked(invoke);
      // Chunk 0 call
      mockInvoke.mockResolvedValueOnce(
        JSON.stringify([{ id: "p_0", text: "Anh nhìn cô một cách trìu mến." }])
      );
      // Chunk 1 call
      mockInvoke.mockResolvedValueOnce(
        JSON.stringify([{ id: "p_1", text: "Cô mỉm cười đáp lại anh." }])
      );

      const chapterHtml = `<html><body><p>He looked at her affectionately.</p><p>She smiled back at him.</p></body></html>`;

      const result = await TranslationService.translateChapter({
        chapterHtml,
        chapterTitle: "Sliding Context Test",
        sourceLang: "English",
        targetLang: "Vietnamese",
        tone: "literary",
        mode: "replace",
        maxBlocksPerChunk: 1, // force 1 block per chunk -> 2 chunks
        enableSlidingContext: true,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
      });

      expect(result.totalBlocks).toBe(2);
      expect(mockInvoke).toHaveBeenCalledTimes(2);

      // Verify the 2nd invocation received <previous_context> containing the translated preceding block
      const secondCallArgs = (mockInvoke.mock.calls[1][1] as any).options;
      const userMessage = secondCallArgs.messages.find((m: any) => m.role === "user");
      expect(userMessage.content).toContain("<previous_context>");
      expect(userMessage.content).toContain("Anh nhìn cô một cách trìu mến.");
    });

    it("runs multi-chunk chapters concurrently (concurrency=2) without dropping or reordering blocks", async () => {
      const mockInvoke = vi.mocked(invoke);
      // 2 chunks executed in concurrent pool
      mockInvoke.mockImplementation(async (_cmd: string, args: any) => {
        const options = args?.options;
        const userMsg = options?.messages?.find((m: any) => m.role === "user")?.content || "";
        if (userMsg.includes('"id": "p_0"')) {
          return JSON.stringify([{ id: "p_0", text: "Phần thứ nhất song song." }]);
        } else if (userMsg.includes('"id": "p_1"')) {
          return JSON.stringify([{ id: "p_1", text: "Phần thứ hai song song." }]);
        }
        return JSON.stringify([]);
      });

      const chapterHtml = `<html><body><p>First part content.</p><p>Second part content.</p></body></html>`;

      const result = await TranslationService.translateChapter({
        chapterHtml,
        chapterTitle: "Concurrent Translation Test",
        sourceLang: "English",
        targetLang: "Vietnamese",
        tone: "literary",
        mode: "replace",
        maxBlocksPerChunk: 1, // 2 chunks
        concurrency: 2, // run both chunks in parallel pool
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
      });

      expect(result.totalBlocks).toBe(2);
      expect(result.translatedBlocksCount).toBe(2);
      expect(result.translatedHtml).toContain("Phần thứ nhất song song.");
      expect(result.translatedHtml).toContain("Phần thứ hai song song.");
    });

    it("propagates error cleanly without emitting partial/dropped data when a worker encounters terminal failure in concurrency pool", async () => {
      const mockInvoke = vi.mocked(invoke);
      // Worker for chunk 1 fails terminally across all candidate models
      mockInvoke.mockImplementation(async (_cmd: string, args: any) => {
        const options = args?.options;
        const userMsg = options?.messages?.find((m: any) => m.role === "user")?.content || "";
        if (userMsg.includes('"id": "p_0"')) {
          return JSON.stringify([{ id: "p_0", text: "Chunk 0 ok" }]);
        } else if (userMsg.includes('"id": "p_1"')) {
          throw new Error("Fatal network error in worker");
        }
        return JSON.stringify([]);
      });

      const chapterHtml = `<html><body><p>Chunk 0 text</p><p>Chunk 1 text</p></body></html>`;

      await expect(
        TranslationService.translateChapter({
          chapterHtml,
          chapterTitle: "Concurrency Terminal Fail",
          sourceLang: "English",
          targetLang: "Vietnamese",
          tone: "literary",
          mode: "replace",
          maxBlocksPerChunk: 1,
          concurrency: 2,
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o",
        })
      ).rejects.toThrow("Fatal network error in worker");
    });

    it("handles rate limit 429 errors by backing off and successfully falling back to secondary model", async () => {
      const mockInvoke = vi.mocked(invoke);
      // Primary model hits 429
      mockInvoke.mockRejectedValueOnce(new Error("HTTP 429: Too Many Requests (Rate limit reached)"));
      // Secondary fallback model succeeds
      mockInvoke.mockResolvedValueOnce(
        JSON.stringify([{ id: "p_0", text: "Dịch thành công qua model phụ sau 429." }])
      );

      const chapterHtml = `<html><body><p>Testing 429 rate limit backoff.</p></body></html>`;

      const result = await TranslationService.translateChapter({
        chapterHtml,
        chapterTitle: "Rate Limit Test",
        sourceLang: "English",
        targetLang: "Vietnamese",
        tone: "literary",
        mode: "replace",
        baseUrl: "https://api.openai.com/v1",
        model: "primary-tier",
        fallbackModels: ["secondary-tier"],
      });

      expect(result.translatedBlocksCount).toBe(1);
      expect(result.translatedHtml).toContain("Dịch thành công qua model phụ sau 429.");
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });

    it("emits real-time onPartialUpdate callbacks with incremental HTML as each chunk completes", async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockResolvedValueOnce(
        JSON.stringify([{ id: "p_0", text: "Đoạn một dịch xong theo thời gian thực." }])
      );
      mockInvoke.mockResolvedValueOnce(
        JSON.stringify([{ id: "p_1", text: "Đoạn hai tiếp nối thời gian thực." }])
      );

      const chapterHtml = `<html><body><p>Chunk 1</p><p>Chunk 2</p></body></html>`;
      const partialUpdates: Array<{ html: string; count: number }> = [];

      const result = await TranslationService.translateChapter({
        chapterHtml,
        chapterTitle: "Real-time Stream Test",
        sourceLang: "English",
        targetLang: "Vietnamese",
        tone: "literary",
        mode: "replace",
        maxBlocksPerChunk: 1, // 2 chunks to trigger 2 incremental updates
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
        onPartialUpdate: (data) => {
          partialUpdates.push({ html: data.partialHtml, count: data.resolvedCount });
        },
      });

      // 2 incremental real-time updates emitted
      expect(partialUpdates.length).toBe(2);
      expect(partialUpdates[0].count).toBe(1);
      expect(partialUpdates[0].html).toContain("Đoạn một dịch xong theo thời gian thực.");
      expect(partialUpdates[0].html).toContain("Chunk 2"); // Chunk 2 not translated yet

      expect(partialUpdates[1].count).toBe(2);
      expect(partialUpdates[1].html).toContain("Đoạn một dịch xong theo thời gian thực.");
      expect(partialUpdates[1].html).toContain("Đoạn hai tiếp nối thời gian thực.");

      expect(result.translatedBlocksCount).toBe(2);
    });
  });
});
