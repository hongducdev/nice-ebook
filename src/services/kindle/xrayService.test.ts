import { describe, it, expect } from "vitest";
import { 
  extractXRayHeuristic, 
  mapEntityOccurrences, 
  generateXRayAppendixHtml,
  ChapterTextSource,
  XRayEntityItem
} from "./xrayService";

describe("X-Ray Heuristic Entity Extractor", () => {
  const sampleChapters: ChapterTextSource[] = [
    {
      href: "ch1.xhtml",
      title: "Chương 1",
      html: `
        <div>
          <h1>Chapter 1: The Encounter</h1>
          <p>Mr. Sherlock Holmes sat in his study at Baker Street.</p>
          <p>"A curious case, indeed," said Holmes as Dr. Watson entered the room.</p>
          <p>Professor Moriarty was scheming in London, while Irene Adler watched quietly.</p>
        </div>
      `,
    },
    {
      href: "ch2.xhtml",
      title: "Chương 2",
      html: `
        <div>
          <h1>Chapter 2: The Investigation</h1>
          <p>Dr. Watson examined the strange envelope received from Irene Adler.</p>
          <p>"We must be wary of Professor Moriarty," warned Sherlock Holmes.</p>
          <p>They traveled through Baker Street towards the foggy banks of the Thames River.</p>
        </div>
      `,
    },
  ];

  it("extracts characters with honorifics, dialogue attributions, and frequency", () => {
    const { people, terms } = extractXRayHeuristic(sampleChapters);

    const peopleNames = people.map((p) => p.name);
    // Sherlock Holmes, Watson, Moriarty, Irene Adler
    expect(peopleNames.some((n) => n.includes("Holmes"))).toBe(true);
    expect(peopleNames.some((n) => n.includes("Watson"))).toBe(true);

    const termNames = terms.map((t) => t.name);
    // Baker Street
    expect(termNames.some((t) => t.includes("Street"))).toBe(true);
  });

  it("maps occurrences and context excerpts across chapters", () => {
    const entities: XRayEntityItem[] = [
      {
        id: 1,
        name: "Sherlock Holmes",
        aliases: ["Holmes"],
        type: "person",
        description: "Consulting detective",
        occurrencesCount: 0,
        excerpts: [],
      },
    ];

    mapEntityOccurrences(entities, sampleChapters);

    expect(entities[0].occurrencesCount).toBeGreaterThanOrEqual(3);
    expect(entities[0].excerpts.length).toBeGreaterThanOrEqual(1);
    expect(entities[0].excerpts[0].chapterTitle).toBe("Chương 1");
    expect(entities[0].excerpts[0].snippet).toContain("Holmes");
  });
});

describe("X-Ray Appendix HTML Generator", () => {
  it("generates valid and styled XHTML appendix document", () => {
    const people: XRayEntityItem[] = [
      {
        id: 1,
        name: "Sherlock Holmes",
        aliases: ["Holmes"],
        type: "person",
        role: "Thám tử tư vấn",
        description: "Thám tử nổi tiếng sống tại 221B phố Baker.",
        occurrencesCount: 15,
        excerpts: [
          {
            chapterHref: "ch1.xhtml",
            chapterTitle: "Chương 1",
            snippet: "Mr. Sherlock Holmes sat in his study...",
          },
        ],
      },
    ];

    const terms: XRayEntityItem[] = [
      {
        id: 2,
        name: "Baker Street",
        aliases: [],
        type: "term",
        role: "Địa danh",
        description: "Khu phố trung tâm Luân Đôn.",
        occurrencesCount: 8,
        excerpts: [],
      },
    ];

    const html = generateXRayAppendixHtml({
      bookTitle: "A Study in Scarlet",
      people,
      terms,
    });

    expect(html).toContain("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
    expect(html).toContain("Dramatis Personae &amp; World Guide");
    expect(html).toContain("Sherlock Holmes");
    expect(html).toContain("Thám tử tư vấn");
    expect(html).toContain("Baker Street");
    expect(html).toContain("Mr. Sherlock Holmes sat in his study");
    expect(html).toContain("15 lần xuất hiện");
  });
});
