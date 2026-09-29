import { describe, it, expect } from "vitest";
import { 
  injectWordWiseRuby, 
  stripWordWiseRuby, 
  analyzeChapterDifficulty 
} from "./wordWiseService";
import { findWordWiseLemma } from "./wordWiseDict";

describe("Word Wise Dictionary & Lemma Lookup", () => {
  it("finds exact lemma matches", () => {
    const res1 = findWordWiseLemma("ephemeral");
    expect(res1).not.toBeNull();
    expect(res1?.lemma).toBe("ephemeral");
    expect(res1?.level).toBe("C1");
    expect(res1?.difficulty).toBe(2);
    expect(res1?.en).toBe("short-lived");
    expect(res1?.vi).toContain("phù du");

    const res2 = findWordWiseLemma("ubiquitous");
    expect(res2).not.toBeNull();
    expect(res2?.lemma).toBe("ubiquitous");
    expect(res2?.en).toBe("present everywhere");
  });

  it("handles inflections such as plurals, past tense, and adverbs", () => {
    // Adverb -ly -> adjective
    const adv = findWordWiseLemma("surreptitiously");
    expect(adv).not.toBeNull();
    expect(adv?.lemma).toBe("surreptitious");

    // Plural -s / -es
    const plural = findWordWiseLemma("aberrations");
    expect(plural).not.toBeNull();
    expect(plural?.lemma).toBe("aberration");

    // Past tense -ed
    const past = findWordWiseLemma("diminished");
    expect(past).not.toBeNull();
    expect(past?.lemma).toBe("diminish");

    // Gerund -ing
    const gerund = findWordWiseLemma("obfuscating");
    expect(gerund).not.toBeNull();
    expect(gerund?.lemma).toBe("obfuscate");
  });

  it("returns null for common or short words", () => {
    expect(findWordWiseLemma("the")).toBeNull();
    expect(findWordWiseLemma("book")).toBeNull();
    expect(findWordWiseLemma("walked")).toBeNull();
    expect(findWordWiseLemma("hi")).toBeNull();
  });
});

describe("Word Wise HTML Ruby Injector", () => {
  it("injects ruby tags into text nodes with Vietnamese glosses by default", () => {
    const input = `<p>The ephemeral morning mist vanished with nostalgic poignancy.</p>`;
    const result = injectWordWiseRuby(input, { language: "vi", maxDifficulty: 3 });

    expect(result.annotatedCount).toBeGreaterThanOrEqual(1);
    expect(result.html).toContain('<ruby class="kindle-wordwise"');
    expect(result.html).toContain('data-lemma="ephemeral"');
    expect(result.html).toContain("<rt>phù du, ngắn ngủi</rt>");
    expect(result.html).toContain("</ruby>");
  });

  it("injects English glosses when language='en'", () => {
    const input = `<p>He made an audacious attempt with tenaciously firm resolve.</p>`;
    const result = injectWordWiseRuby(input, { language: "en", maxDifficulty: 3 });

    expect(result.html).toContain("<rt>bold, daring</rt>");
    expect(result.html).toContain("<rt>holding firm, persistent</rt>");
  });

  it("respects difficulty thresholds", () => {
    // "quixotic" is difficulty 1 (C2)
    // "meticulous" is difficulty 3 (C1)
    // "anticipate" is difficulty 5 (B2)
    const input = `<p>A quixotic knight was meticulous and could anticipate obstacles.</p>`;

    // Only difficulty 1 (C2)
    const resLvl1 = injectWordWiseRuby(input, { maxDifficulty: 1, language: "en" });
    expect(resLvl1.html).toContain("quixotic<rt>idealistic but impractical</rt>");
    expect(resLvl1.html).not.toContain("meticulous<rt>");
    expect(resLvl1.html).not.toContain("anticipate<rt>");

    // Difficulty up to 3
    const resLvl3 = injectWordWiseRuby(input, { maxDifficulty: 3, language: "en" });
    expect(resLvl3.html).toContain("quixotic<rt>");
    expect(resLvl3.html).toContain("meticulous<rt>");
    expect(resLvl3.html).not.toContain("anticipate<rt>");

    // Difficulty up to 5
    const resLvl5 = injectWordWiseRuby(input, { maxDifficulty: 5, language: "en" });
    expect(resLvl5.html).toContain("quixotic<rt>");
    expect(resLvl5.html).toContain("meticulous<rt>");
    expect(resLvl5.html).toContain("anticipate<rt>");
  });

  it("preserves HTML attributes and never annotates inside tags or attribute values", () => {
    const input = `<div class="ephemeral-wrapper" id="melancholy-section"><p title="superfluous note">Normal text with ubiquitous presence.</p></div>`;
    const result = injectWordWiseRuby(input, { language: "en", maxDifficulty: 3 });

    // Attributes should remain completely unchanged
    expect(result.html).toContain('class="ephemeral-wrapper"');
    expect(result.html).toContain('id="melancholy-section"');
    expect(result.html).toContain('title="superfluous note"');

    // Only the word in the text node should be annotated
    expect(result.html).toContain('<ruby class="kindle-wordwise" data-kindle-wordwise="1" data-lemma="ubiquitous" data-difficulty="2">ubiquitous<rt>present everywhere</rt></ruby>');
  });

  it("skips <code>, <pre>, <script>, and <style> blocks", () => {
    const input = `<p>Text with <code>let ephemeral = false;</code> and <pre>obfuscate(x);</pre> but an ephemeral rose outside.</p>`;
    const result = injectWordWiseRuby(input, { language: "en", maxDifficulty: 3 });

    // Inside code and pre should NOT be annotated
    expect(result.html).toContain("<code>let ephemeral = false;</code>");
    expect(result.html).toContain("<pre>obfuscate(x);</pre>");

    // Outside should be annotated
    expect(result.html).toContain('<ruby class="kindle-wordwise" data-kindle-wordwise="1" data-lemma="ephemeral" data-difficulty="2">ephemeral<rt>short-lived</rt></ruby>');
    expect(result.annotatedCount).toBe(1);
  });

  it("respects ignoredWords option", () => {
    const input = `<p>An ephemeral and ubiquitous phenomenon.</p>`;
    const result = injectWordWiseRuby(input, {
      language: "en",
      maxDifficulty: 3,
      ignoredWords: ["ephemeral"],
    });

    expect(result.html).not.toContain("ephemeral<rt>");
    expect(result.html).toContain("ubiquitous<rt>");
  });

  it("respects maxOccurrencesPerWord to prevent clutter", () => {
    const input = `<p>Ephemeral morning, ephemeral dusk, ephemeral night, ephemeral dawn.</p>`;
    const result = injectWordWiseRuby(input, {
      language: "en",
      maxDifficulty: 3,
      maxOccurrencesPerWord: 2,
    });

    // Should only annotate the first 2 occurrences
    expect(result.annotatedCount).toBe(2);
    const matches = result.html.match(/<ruby class="kindle-wordwise"/g);
    expect(matches?.length).toBe(2);
  });
});

describe("Word Wise Stripper / Reversibility", () => {
  it("losslessly strips ruby tags back to original text", () => {
    const original = `<h1>Chapter 1</h1><p class="intro">The <b>ephemeral</b> beauty was <i>poignant</i> and ubiquitous.</p>`;
    const annotated = injectWordWiseRuby(original, { language: "vi", maxDifficulty: 3 });

    expect(annotated.html).not.toBe(original);
    expect(annotated.html).toContain("<ruby");

    const stripped = stripWordWiseRuby(annotated.html);
    expect(stripped).toBe(original);
  });

  it("handles re-annotating without creating nested ruby tags", () => {
    const original = `<p>An ephemeral flower.</p>`;
    const firstPass = injectWordWiseRuby(original, { language: "en", maxDifficulty: 3 });
    const secondPass = injectWordWiseRuby(firstPass.html, { language: "vi", maxDifficulty: 3 });

    // Should NOT have nested ruby tags like <ruby><ruby>
    expect(secondPass.html).not.toContain("<ruby><ruby");
    expect(secondPass.html).toContain('<ruby class="kindle-wordwise" data-kindle-wordwise="1" data-lemma="ephemeral" data-difficulty="2">ephemeral<rt>phù du, ngắn ngủi</rt></ruby>');
  });
});

describe("Chapter Difficulty Analysis", () => {
  it("accurately analyzes vocabulary metrics in a chapter", () => {
    const html = `<div><p>A quixotic traveler faced ephemeral moments with benevolent equanimity and profound consequences.</p></div>`;
    const analysis = analyzeChapterDifficulty(html);

    expect(analysis.totalWords).toBeGreaterThan(10);
    expect(analysis.difficultWordsFound).toBeGreaterThanOrEqual(4);
    expect(analysis.difficultyBreakdown[1]).toBeGreaterThanOrEqual(1); // quixotic, equanimity
    expect(analysis.topDifficultWords.length).toBeGreaterThan(0);
  });
});
