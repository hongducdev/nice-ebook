import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntityExtractor, ExtractedEntityCandidate } from "./entityExtractor";
import { ChapterTextSource } from "../kindle/xrayService";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const SAMPLE_CHAPTERS: ChapterTextSource[] = [
  {
    href: "c1.xhtml",
    title: "Chapter 1",
    html: `
      <div>
        <h1>Chapter 1: The Boy Who Lived</h1>
        <p>Mr. Dursley lived at Privet Drive. Uncle Vernon hated magic.</p>
        <p>"Dumbledore will arrive tonight," said Professor McGonagall.</p>
        <p>Mr. Dursley walked down Privet Drive again.</p>
        <p>Hogwarts Castle stood tall in the distance.</p>
      </div>
    `,
  },
];

describe("EntityExtractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts candidates from chapters and categorizes people and places", () => {
    const existingGlossary = {
      Dursley: "Ông Dursley",
    };

    const candidates = EntityExtractor.extractCandidates(SAMPLE_CHAPTERS, existingGlossary);

    expect(candidates.length).toBeGreaterThan(0);

    const dursley = candidates.find((c) => c.name.toLowerCase().includes("dursley"));
    expect(dursley).toBeDefined();
    expect(dursley?.isExistingInGlossary).toBe(true);
    expect(dursley?.suggestedTranslation).toBe("Ông Dursley");

    const privetDrive = candidates.find((c) => c.name.toLowerCase().includes("privet"));
    expect(privetDrive).toBeDefined();
    expect(privetDrive?.category).toBe("place");
  });

  it("proposes AI translations for new candidates while preserving existing glossary entries", async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify([
        { name: "Uncle Vernon", translated: "Dượng Vernon", category: "person" },
        { name: "Privet Drive", translated: "Đường Privet", category: "place" },
      ])
    );

    const candidates: ExtractedEntityCandidate[] = [
      {
        id: "ent_vernon",
        name: "Uncle Vernon",
        count: 5,
        category: "person",
        suggestedTranslation: "Uncle Vernon",
        isExistingInGlossary: false,
      },
      {
        id: "ent_harry",
        name: "Harry Potter",
        count: 10,
        category: "person",
        suggestedTranslation: "Harry Potter (Bản dịch tùy chỉnh)",
        isExistingInGlossary: true, // User already defined this!
      },
    ];

    const result = await EntityExtractor.proposeTranslationsWithAi(candidates, {
      sourceLang: "English",
      targetLang: "Vietnamese",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });

    // Uncle Vernon gets AI translation
    const vernon = result.find((c) => c.name === "Uncle Vernon");
    expect(vernon?.suggestedTranslation).toBe("Dượng Vernon");

    // Harry Potter remains untouched because isExistingInGlossary = true
    const harry = result.find((c) => c.name === "Harry Potter");
    expect(harry?.suggestedTranslation).toBe("Harry Potter (Bản dịch tùy chỉnh)");
  });

  it("degrades gracefully to original names when AI proposal fails or is offline", async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockRejectedValueOnce(new Error("Connection refused"));

    const candidates: ExtractedEntityCandidate[] = [
      {
        id: "ent_mcgonagall",
        name: "Professor McGonagall",
        count: 3,
        category: "person",
        suggestedTranslation: "Professor McGonagall",
        isExistingInGlossary: false,
      },
    ];

    const result = await EntityExtractor.proposeTranslationsWithAi(candidates, {
      sourceLang: "English",
      targetLang: "Vietnamese",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });

    expect(result.length).toBe(1);
    expect(result[0].suggestedTranslation).toBe("Professor McGonagall");
  });

  it("merges approved entities into glossary deterministically", () => {
    const currentGlossary = {
      "Existing Term": "Thuật ngữ có sẵn",
    };

    const approvedList = [
      { name: "Uncle Vernon", translation: "Dượng Vernon" },
      { name: "Privet Drive", translation: "Đường Privet Drive" },
    ];

    const merged = EntityExtractor.mergeApprovedEntitiesIntoGlossary(
      currentGlossary,
      approvedList
    );

    expect(merged["Existing Term"]).toBe("Thuật ngữ có sẵn");
    expect(merged["Uncle Vernon"]).toBe("Dượng Vernon");
    expect(merged["Privet Drive"]).toBe("Đường Privet Drive");
  });
});
