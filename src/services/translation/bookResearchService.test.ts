import { describe, it, expect, vi, beforeEach } from "vitest";
import { BookResearchService } from "./bookResearchService";
import { buildUserPrompt } from "../prompts/bookTranslator";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("BookResearchService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enforces hard character cap and cuts at sentence boundary", () => {
    const longText = "Sentence one. Sentence two is very interesting. Sentence three provides important details. Sentence four continues the explanation of the characters and their relationships in great detail.";
    
    // Cap at 70 chars
    const capped = BookResearchService.enforceHardCap(longText, 70);
    expect(capped.length).toBeLessThanOrEqual(70);
    // Should end at a sentence boundary
    expect(capped.endsWith(".")).toBe(true);
    expect(capped).toBe("Sentence one. Sentence two is very interesting.");
  });

  it("adds ellipsis if text cannot be cleanly cut at punctuation", () => {
    const wordy = "A".repeat(150);
    const capped = BookResearchService.enforceHardCap(wordy, 50);
    expect(capped.length).toBeLessThanOrEqual(53);
    expect(capped.endsWith("...")).toBe(true);
  });

  it("generates research brief using AI and respects default hard cap", async () => {
    const mockInvoke = vi.mocked(invoke);
    const mockBrief = `
# Bối cảnh & Thời đại:
Thế giới phù thủy nước Anh thập niên 1990. Không khí kỳ ảo, huyền bí pha lẫn ấm áp học đường.

# Quy tắc xưng hô:
- Harry và Ron/Hermione: bạn - mình / bồ - mình.
- Học sinh với giáo viên: con/em - Thầy/Cô.
- Dượng Vernon với Harry: tao - mày.

# Thuật ngữ:
Hogwarts, Muggle, Quidditch, Đũa phép.
    `.trim();

    mockInvoke.mockResolvedValueOnce(mockBrief);

    const brief = await BookResearchService.generateResearchBrief({
      bookTitle: "Harry Potter and the Philosopher's Stone",
      author: "J.K. Rowling",
      genre: "Fantasy",
      sourceLang: "Tiếng Anh",
      targetLang: "Tiếng Việt",
      tone: "literary",
      sampleText: "Mr. and Mrs. Dursley lived at number four Privet Drive.",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(brief.length).toBeLessThanOrEqual(BookResearchService.DEFAULT_HARD_CAP);
    expect(brief).toContain("Thế giới phù thủy nước Anh");
    expect(brief).toContain("Hogwarts, Muggle");
  });

  it("returns clean fallback brief when AI call throws", async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockRejectedValueOnce(new Error("Network timeout"));

    const brief = await BookResearchService.generateResearchBrief({
      bookTitle: "Tác Phẩm Thử Nghiệm",
      author: "Tác Giả A",
      sourceLang: "Tiếng Anh",
      targetLang: "Tiếng Việt",
      tone: "wuxia",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });

    expect(brief).toContain('Tác phẩm "Tác Phẩm Thử Nghiệm"');
    expect(brief).toContain("wuxia");
    expect(brief.length).toBeLessThanOrEqual(BookResearchService.DEFAULT_HARD_CAP);
  });

  it("injects research brief with tagged boundary delimiters into user prompt", () => {
    const prompt = buildUserPrompt({
      sourceLangName: "English",
      targetLangName: "Vietnamese",
      tone: "literary",
      blocks: [{ id: "p_0", text: "Hello world" }],
      researchBrief: "Setting: Victorian London. Tone: formal and respectful.",
    });

    expect(prompt).toContain("<<<CONTEXT_BRIEF_START>>>");
    expect(prompt).toContain("Setting: Victorian London");
    expect(prompt).toContain("<<<CONTEXT_BRIEF_END>>>");
    expect(prompt).toContain("Lưu ý: Chỉ áp dụng");
  });
});
