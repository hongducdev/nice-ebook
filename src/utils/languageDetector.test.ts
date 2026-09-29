import { describe, it, expect } from "vitest";
import { LanguageDetector } from "./languageDetector";

describe("LanguageDetector", () => {
  it("normalizes ISO language codes accurately", () => {
    expect(LanguageDetector.normalizeMetadataCode("en-US")).toBe("en");
    expect(LanguageDetector.normalizeMetadataCode("eng")).toBe("en");
    expect(LanguageDetector.normalizeMetadataCode("zh-CN")).toBe("zh");
    expect(LanguageDetector.normalizeMetadataCode("chi")).toBe("zh");
    expect(LanguageDetector.normalizeMetadataCode("ja-JP")).toBe("ja");
    expect(LanguageDetector.normalizeMetadataCode("jpn")).toBe("ja");
    expect(LanguageDetector.normalizeMetadataCode("vie")).toBe("vi");
    expect(LanguageDetector.normalizeMetadataCode("fr")).toBe("fr");
    expect(LanguageDetector.normalizeMetadataCode("unknown")).toBeNull();
  });

  it("detects Vietnamese via strict diacritics", () => {
    const text = "Tôi muốn đọc một cuốn sách hay về khoa học và công nghệ.";
    const res = LanguageDetector.detectLanguage(text, "en"); // metadata might be falsely "en"
    expect(res.languageCode).toBe("vi");
    expect(res.confidence).toBeGreaterThanOrEqual(0.95);
    expect(res.source).toBe("heuristic");
  });

  it("detects Japanese via Hiragana and Katakana", () => {
    const text = "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。";
    const res = LanguageDetector.detectLanguage(text, "ja");
    expect(res.languageCode).toBe("ja");
    expect(res.confidence).toBe(0.99);
    expect(res.source).toBe("combined");
  });

  it("detects Korean via Hangul", () => {
    const text = "모든 인간은 태어날 때부터 자유로우며 그 존엄과 권리에 있어 동등하다.";
    const res = LanguageDetector.detectLanguage(text);
    expect(res.languageCode).toBe("ko");
    expect(res.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("detects Chinese via CJK ideographs without Japanese kana", () => {
    const text = "道可道，非常道；名可名，非常名。無名天地之始，有名萬物之母。";
    const res = LanguageDetector.detectLanguage(text, "zh");
    expect(res.languageCode).toBe("zh");
    expect(res.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("detects Russian via Cyrillic", () => {
    const text = "Все счастливые семьи похожи друг на друга, каждая несчастливая семья несчастлива по-своему.";
    const res = LanguageDetector.detectLanguage(text);
    expect(res.languageCode).toBe("ru");
    expect(res.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("detects English via stop words", () => {
    const text = "Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much. They were the last people you would expect.";
    const res = LanguageDetector.detectLanguage(text, "en");
    expect(res.languageCode).toBe("en");
    expect(res.confidence).toBeGreaterThanOrEqual(0.9);
    expect(res.source).toBe("combined");
  });

  it("detects French via stop words", () => {
    const text = "Longtemps, je me suis couché de bonne heure. Parfois, à peine ma bougie éteinte, mes yeux se fermaient si vite que je n'avais pas le temps de me dire : « Je m'endors. »";
    const res = LanguageDetector.detectLanguage(text, "fr");
    expect(res.languageCode).toBe("fr");
    expect(res.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("detects German via stop words", () => {
    const text = "Als Gregor Samsa eines Morgens aus unruhigen Träumen erwachte, fand er sich in seinem Bett zu einem ungeheuren Ungeziefer verwandelt.";
    const res = LanguageDetector.detectLanguage(text, "de");
    expect(res.languageCode).toBe("de");
    expect(res.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("detects Spanish via stop words", () => {
    const text = "Muchos años después, frente al pelotón de fusilamiento, el coronel Aureliano Buendía había de recordar aquella tarde remota en que su padre lo llevó a conocer el hielo.";
    const res = LanguageDetector.detectLanguage(text, "es");
    expect(res.languageCode).toBe("es");
    expect(res.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("falls back to metadata when sample text is very short or ambiguous", () => {
    const shortText = "Chapter 1";
    const res = LanguageDetector.detectLanguage(shortText, "fr-FR");
    expect(res.languageCode).toBe("fr");
    expect(res.source).toBe("metadata");
  });
});
