import { describe, it, expect } from "vitest";
import {
  filterGlossaryForBatch,
  buildSystemPrompt,
  buildUserPrompt,
  buildCorrectionPrompt,
  cleanTranslatedText,
  parseTranslationResponse,
  isUntranslatedEcho,
  extractUntranslatedFragments,
  isTranslationTruncated,
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

    it("detects PARTIAL untranslated Chinese fragments within Vietnamese text", () => {
      // Screenshot bug: Vietnamese text with Chinese sentence fragment at the end
      const partialTranslation = "Tiểu Nặc và Đường Tĩnh chơi với nhau từ nhỏ đến lớn, tình cảm thân thiết như chị em ruột, không có chuyện gì là không nói. Mẹ của Đường Tĩnh lại đặc biệt quý mến Tiểu Nặc, thế nên công việc gia sư này cũng vô cùng nhẹ nhàng, không chút áp lực. Nói là phụ đạo gia đình,倒不如说是两个女生凑到一起学习更合适。";
      const original = "小诺和唐静从小玩到大,感情亲密如姐妹,没有什么事情是不说的。唐静的妈妈又特别喜欢小诺,所以这份家教工作也十分轻松,没有压力。说是辅导家庭,倒不如说是两个女生凑到一起学习更合适。";
      expect(isUntranslatedEcho(partialTranslation, original, "zh", "vi")).toBe(true);
    });

    it("detects consecutive CJK characters (>=2) as untranslated names or terms", () => {
      // 2+ consecutive Chinese chars = untranslated fragment (catches 2-char and 3-char Chinese names)
      expect(isUntranslatedEcho("Hắn nói rằng 修炼功法 rất quan trọng", "他说修炼功法很重要", "zh", "vi")).toBe(true);
      expect(isUntranslatedEcho("Hắn nhìn thấy 唐静 đứng ở cổng", "他看到唐静站在门口", "zh", "vi")).toBe(true);
      expect(isUntranslatedEcho("Người đó chính là 萧炎 trong truyền thuyết", "那人正是传说中的萧炎", "zh", "vi")).toBe(true);
      // Single isolated Hanzi in a longer sentence with < 20% ratio is not flagged
      expect(isUntranslatedEcho("Hắn luyện tập 功 rất chăm chỉ mỗi ngày", "他练功很努力", "zh", "vi")).toBe(false);
    });

    it("detects scattered CJK characters (>=4 total) as untranslated", () => {
      // 4+ total scattered CJK chars across the text
      expect(isUntranslatedEcho("Nàng 静 rất 美 và 聪 cũng rất 明", "她静美聪明", "zh", "vi")).toBe(true);
    });

    it("does not false-positive on normal Vietnamese text", () => {
      expect(isUntranslatedEcho("Đây là một câu bình thường", "This is a normal sentence")).toBe(false);
      expect(isUntranslatedEcho("Tiểu Nặc và Đường Tĩnh chơi với nhau", "小诺和唐静从小玩到大", "zh", "vi")).toBe(false);
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

  describe("extractUntranslatedFragments", () => {
    it("returns empty array for text without CJK fragments", () => {
      expect(extractUntranslatedFragments("Đây là câu tiếng Việt hoàn chỉnh.")).toEqual([]);
      expect(extractUntranslatedFragments("")).toEqual([]);
    });

    it("extracts Chinese sentence fragments from Vietnamese text", () => {
      const mixedText = "Nói là phụ đạo gia đình,倒不如说是两个女生凑到一起学习更合适。";
      const fragments = extractUntranslatedFragments(mixedText, "zh");
      expect(fragments.length).toBeGreaterThan(0);
      expect(fragments[0]).toContain("倒不如说是两个女生凑到一起学习更合适。");
    });

    it("extracts Japanese fragments from text", () => {
      const mixedText = "Cô ấy chào một câu おはようございます rồi rời đi.";
      const fragments = extractUntranslatedFragments(mixedText, "ja");
      expect(fragments.length).toBeGreaterThan(0);
      expect(fragments[0]).toContain("おはようございます");
    });
  });

  describe("isTranslationTruncated - LinguaGacha style length ratio validation", () => {
    const originalChinese = "小诺和唐静从小玩到大,感情亲密如姐妹,没有什么事情是不说的。唐静的妈妈又特别喜欢小诺,所以这份家教工作也十分轻松,没有压力。说是辅导家庭,倒不如说是两个女生凑到一起学习更合适。";

    it("flags severely truncated or summarized translations (< 65% length for CJK -> VI)", () => {
      // Original has 97 Chinese chars. A 30-char Vietnamese translation is a massive omission
      const truncatedVi = "Tiểu Nặc và Đường Tĩnh là bạn thân.";
      expect(isTranslationTruncated(truncatedVi, originalChinese, "zh", "vi")).toBe(true);
      // isUntranslatedEcho also integrates this check
      expect(isUntranslatedEcho(truncatedVi, originalChinese, "zh", "vi")).toBe(true);
    });

    it("passes full and complete translations", () => {
      // Natural Vietnamese translation is ~210 chars (> 2x original)
      const completeVi = "Tiểu Nặc và Đường Tĩnh chơi với nhau từ nhỏ đến lớn, tình cảm thân thiết như chị em ruột, không có chuyện gì là không nói. Mẹ của Đường Tĩnh lại đặc biệt quý mến Tiểu Nặc, thế nên công việc gia sư này cũng vô cùng nhẹ nhàng, không chút áp lực. Nói là dạy kèm tại nhà, chi bằng nói là hai cô gái tụ tập lại học bài cùng nhau thì đúng hơn.";
      expect(isTranslationTruncated(completeVi, originalChinese, "zh", "vi")).toBe(false);
      expect(isUntranslatedEcho(completeVi, originalChinese, "zh", "vi")).toBe(false);
    });

    it("does not trigger on short dialogue or headings (< 40 chars)", () => {
      // Short text like headings or quick dialogue should not be falsely flagged
      expect(isTranslationTruncated("Được thôi", "好吧", "zh", "vi")).toBe(false);
      expect(isTranslationTruncated("Chương 1", "第一章", "zh", "vi")).toBe(false);
    });
  });

  describe("buildCorrectionPrompt", () => {
    it("builds standard user prompt when no blocks have prior partial translations", () => {
      const prompt = buildCorrectionPrompt({
        sourceLangName: "zh",
        targetLangName: "vi",
        tone: "literary",
        blocks: [{ id: "p_0", originalText: "你好世界" }],
      });

      expect(prompt).toContain("你好世界");
      expect(prompt).not.toContain("[CẢNH BÁO QUAN TRỌNG - SỬA LỖI DỊCH THIẾU]");
    });

    it("appends correction warning and prior attempt when partial translation exists", () => {
      const prompt = buildCorrectionPrompt({
        sourceLangName: "zh",
        targetLangName: "vi",
        tone: "literary",
        blocks: [
          {
            id: "p_0",
            originalText: "说是辅导家庭,倒不如说是两个女生凑到一起学习更合适。",
            priorTranslation: "Nói là phụ đạo gia đình,倒不如说是两个女生凑到一起学习更合适。",
          },
        ],
      });

      expect(prompt).toContain("[CẢNH BÁO QUAN TRỌNG - SỬA LỖI DỊCH THIẾU]");
      expect(prompt).toContain("BẢN DỊCH CŨ (LỖI)");
      expect(prompt).toContain("Ký tự/cụm từ sót cần dịch");
      expect(prompt).toContain("倒不如说是两个女生凑到一起学习更合适。");
    });

    it("appends truncation warning when previous translation was cut short", () => {
      const prompt = buildCorrectionPrompt({
        sourceLangName: "zh",
        targetLangName: "vi",
        tone: "literary",
        blocks: [
          {
            id: "p_0",
            originalText: "小诺和唐静从小玩到大,感情亲密如姐妹,没有什么事情是不说的。唐静的妈妈又特别喜欢小诺,所以这份家教工作也十分轻松,没有压力。说是辅导家庭,倒不如说是两个女生凑到一起学习更合适。",
            priorTranslation: "Tiểu Nặc và Đường Tĩnh thân nhau.",
          },
        ],
      });

      expect(prompt).toContain("[CẢNH BÁO QUAN TRỌNG - SỬA LỖI DỊCH THIẾU]");
      expect(prompt).toContain("Bản dịch cũ bị cắt ngắn/tóm tắt bất thường");
    });
  });
});
