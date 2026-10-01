import { describe, it, expect } from "vitest";
import {
  filterGlossaryForBatch,
  buildSystemPrompt,
  buildUserPrompt,
  cleanTranslatedText,
  parseTranslationResponse,
  isUntranslatedEcho,
  normalizeBlockId,
} from "./bookTranslator";

describe("bookTranslator - LinguaGacha style prompt & glossary engine", () => {
  describe("filterGlossaryForBatch", () => {
    const mockGlossary: Record<string, string> = {
      "Harry Potter": "Harry Potter",
      "Hogwarts": "Hogwarts",
      "Voldemort": "Kẻ-mà-ai-cũng-biết-là-ai",
      "静叶": "Tĩnh Diệp",
      "学长": "Tiền bối",
      "Quidditch": "Quidditch",
    };

    it("returns empty object when glossary or text is empty/undefined", () => {
      expect(filterGlossaryForBatch("", mockGlossary)).toEqual({});
      expect(filterGlossaryForBatch("Some text here", undefined)).toEqual({});
      expect(filterGlossaryForBatch("Some text here", {})).toEqual({});
    });

    it("only extracts terms that actually appear in the batch text", () => {
      const text = "Harry Potter walked into Hogwarts great hall with his friends.";
      const filtered = filterGlossaryForBatch(text, mockGlossary);

      expect(filtered).toEqual({
        "Harry Potter": "Harry Potter",
        "Hogwarts": "Hogwarts",
      });
      // Voldemort, Quidditch, Japanese terms should NOT be included
      expect(filtered["Voldemort"]).toBeUndefined();
      expect(filtered["Quidditch"]).toBeUndefined();
      expect(filtered["静叶"]).toBeUndefined();
    });

    it("supports case-insensitive matching", () => {
      const text = "They talked about hogwarts and playing quidditch tomorrow.";
      const filtered = filterGlossaryForBatch(text, mockGlossary);

      expect(filtered["Hogwarts"]).toBe("Hogwarts");
      expect(filtered["Quidditch"]).toBe("Quidditch");
      expect(filtered["Voldemort"]).toBeUndefined();
    });

    it("accurately matches CJK (Chinese/Japanese) terms", () => {
      const text = "今天静叶遇到了学长，两人一起去图书馆。";
      const filtered = filterGlossaryForBatch(text, mockGlossary);

      expect(filtered).toEqual({
        "静叶": "Tĩnh Diệp",
        "学长": "Tiền bối",
      });
      expect(filtered["Harry Potter"]).toBeUndefined();
    });
  });

  describe("buildUserPrompt with Sliding Context", () => {
    it("includes <previous_context> tag when previousContextBlocks are provided", () => {
      const prompt = buildUserPrompt({
        sourceLangName: "English",
        targetLangName: "Vietnamese",
        tone: "literary",
        blocks: [{ id: "p_5", text: "He opened the door slowly." }],
        previousContextBlocks: [
          { id: "p_3", text: "The rain was pouring outside." },
          { id: "p_4", text: "Arthur looked at the clock." },
        ],
        glossary: { Arthur: "Arthur", Merlin: "Merlin" },
      });

      expect(prompt).toContain("<previous_context>");
      expect(prompt).toContain("The rain was pouring outside.");
      expect(prompt).toContain("Arthur looked at the clock.");
      expect(prompt).toContain("</previous_context>");
      expect(prompt).toContain("[NGỮ CẢNH LIỀN TRƯỚC - THAM KHẢO XƯNG HÔ & MẠCH TRUYỆN, KHÔNG DỊCH LẠI]");

      // Dynamic glossary: "Arthur" is in context, but "Merlin" is not
      expect(prompt).toContain('"Arthur" => "Arthur"');
      expect(prompt).not.toContain('"Merlin" => "Merlin"');
    });

    it("omits <previous_context> if previousContextBlocks is empty or all blank", () => {
      const prompt = buildUserPrompt({
        sourceLangName: "English",
        targetLangName: "Vietnamese",
        tone: "literary",
        blocks: [{ id: "p_0", text: "Call me Ishmael." }],
        previousContextBlocks: [],
      });

      expect(prompt).not.toContain("<previous_context>");
    });

    it("bounds previous context to max 600 characters to prevent prompt bloat", () => {
      const longText1 = "A".repeat(400);
      const longText2 = "B".repeat(300);
      const prompt = buildUserPrompt({
        sourceLangName: "English",
        targetLangName: "Vietnamese",
        tone: "literary",
        blocks: [{ id: "p_2", text: "Short text." }],
        previousContextBlocks: [
          { id: "p_0", text: longText1 },
          { id: "p_1", text: longText2 },
        ],
      });

      expect(prompt).toContain("<previous_context>");
      expect(prompt).toContain(longText1);
      // longText2 would exceed 600 chars, so it should be truncated/stopped
      expect(prompt).not.toContain(longText2);
    });
  });

  describe("buildSystemPrompt", () => {
    it("includes strict rule 8 commanding model not to translate previous_context", () => {
      const sysPrompt = buildSystemPrompt("literary", "English", "Vietnamese");
      expect(sysPrompt).toContain("NGUYÊN TẮC NGỮ CẢNH TRƯỢT (<previous_context>)");
      expect(sysPrompt).toContain("Tuyệt đối KHÔNG dịch lại");
    });

    it("includes rule 9 commanding model to flexibly translate embedded English inside Chinese or other source text", () => {
      const sysPrompt = buildSystemPrompt("literary", "Tiếng Trung (Chinese)", "Tiếng Việt (Vietnamese)");
      expect(sysPrompt).toContain("NGUYÊN TẮC XỬ LÝ ĐA NGÔN NGỮ XEN LẪN (HYBRID / CODE-SWITCHING)");
      expect(sysPrompt).toContain("BẠN PHẢI LINH HOẠT DỊCH CẢ CÂU/CỤM TỪ TIẾNG ANH ĐÓ SANG TIẾNG VIỆT");
    });
  });

  describe("cleanTranslatedText & parseTranslationResponse", () => {
    it("strips reasoning <think>...</think> tags", () => {
      const raw = "<think>Analyzing tone and characters...</think>Hắn bước vào căn phòng.";
      expect(cleanTranslatedText(raw)).toBe("Hắn bước vào căn phòng.");
    });

    it("strips outer paragraph tags and ID prefixes", () => {
      expect(cleanTranslatedText("<p>p_0: Trời bắt đầu đổ mưa.</p>")).toBe("Trời bắt đầu đổ mưa.");
      expect(cleanTranslatedText("Bản dịch: Ánh trăng chiếu sáng.")).toBe("Ánh trăng chiếu sáng.");
      expect(cleanTranslatedText("Đêm nay trăng tròn.\n\nLưu ý: Đoạn này thơ mộng.")).toBe("Đêm nay trăng tròn.");
    });

    it("parses valid JSON response", () => {
      const raw = `\`\`\`json
[
  {"id": "p_0", "text": "Đoạn một."},
  {"id": "p_1", "text": "Đoạn hai."}
]
\`\`\``;
      const parsed = parseTranslationResponse(raw, ["p_0", "p_1"]);
      expect(parsed).toEqual({
        "p_0": "Đoạn một.",
        "p_1": "Đoạn hai.",
      });
    });

    it("recovers 1-based index shift when model outputs p_1, p_2 instead of p_0, p_1", () => {
      const raw = JSON.stringify([
        { id: "p_1", text: "Dịch đoạn 0." },
        { id: "p_2", text: "Dịch đoạn 1." },
      ]);
      const parsed = parseTranslationResponse(raw, ["p_0", "p_1"]);
      expect(parsed["p_0"]).toBe("Dịch đoạn 0.");
      expect(parsed["p_1"]).toBe("Dịch đoạn 1.");
    });

    it("normalizes block IDs correctly", () => {
      expect(normalizeBlockId(0)).toBe("p_0");
      expect(normalizeBlockId("12")).toBe("p_12");
      expect(normalizeBlockId("P_3")).toBe("p_3");
      expect(normalizeBlockId("p4")).toBe("p_4");
    });

    it("detects untranslated echoes", () => {
      expect(isUntranslatedEcho("Hello world this is a long text", "Hello world this is a long text")).toBe(true);
      expect(isUntranslatedEcho("Chào thế giới đây là một câu dài", "Hello world this is a long text")).toBe(false);
      // Chinese echo to Vietnamese
      expect(isUntranslatedEcho("今天天气很好这是一个中文句子", "今天天气很好这是一个中文句子", "zh", "vi")).toBe(true);
    });
  });

  describe("Currency Conversion Prompts", () => {
    it("injects currency conversion rule into system prompt when target is Vietnamese", () => {
      const prompt = buildSystemPrompt("literary", "Tiếng Trung (Chinese)", "Tiếng Việt (Vietnamese)", {
        convertCurrency: true,
      });

      expect(prompt).toContain("NGUYÊN TẮC QUY ĐỔI TIỀN TỆ SANG VNĐ");
      expect(prompt).toContain("5000 NDT");
      expect(prompt).toContain("19.3 triệu VND");
    });

    it("omits currency conversion rule when convertCurrency is explicitly false", () => {
      const prompt = buildSystemPrompt("literary", "Tiếng Trung (Chinese)", "Tiếng Việt (Vietnamese)", {
        convertCurrency: false,
      });

      expect(prompt).not.toContain("NGUYÊN TẮC QUY ĐỔI TIỀN TỆ SANG VNĐ");
    });

    it("omits currency conversion rule when target language is not Vietnamese", () => {
      const prompt = buildSystemPrompt("literary", "Tiếng Trung (Chinese)", "Tiếng Anh (English)", {
        convertCurrency: true,
      });

      expect(prompt).not.toContain("NGUYÊN TẮC QUY ĐỔI TIỀN TỆ SANG VNĐ");
    });

    it("injects currency conversion note into user prompt when convertCurrency is enabled", () => {
      const prompt = buildUserPrompt({
        sourceLangName: "Tiếng Trung (Chinese)",
        targetLangName: "Tiếng Việt (Vietnamese)",
        tone: "literary",
        blocks: [{ id: "p_0", text: "他拿出五千块钱。" }],
        convertCurrency: true,
      });

      expect(prompt).toContain("[Lưu ý quy đổi tiền tệ]");
      expect(prompt).toContain("5000 NDT (19.3 triệu VND)");
    });
  });
});
