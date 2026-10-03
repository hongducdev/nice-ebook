import { describe, it, expect } from "vitest";
import {
  extractEntityCandidates,
  mapEntityOccurrences,
  type ChapterTextSource,
} from "./entityHeuristic";

const chapters: ChapterTextSource[] = [
  {
    href: "c1.xhtml",
    title: "Chương 1",
    html: `
      <h1>Chương 1</h1>
      <p>Mr. Dursley sống ở Privet Drive. Ông Dursley ghét phép thuật.</p>
      <p>"Dumbledore sẽ tới tối nay," said Professor McGonagall.</p>
      <p>Mr. Dursley quay lại Privet Drive lần nữa. Ông Dursley im lặng.</p>
      <p>"Elementary," said Watson. "Quite elementary," said Watson.</p>
      <p>The garden was quiet. The garden was cold.</p>
    `,
  },
  {
    href: "c2.xhtml",
    title: "Chương 2",
    html: `<p>Professor McGonagall chờ Mr. Dursley ở Privet Drive.</p>`,
  },
];

describe("entityHeuristic (relocated out of the removed packaging feature)", () => {
  it("extracts recurring honorific and dialogue-attribution names", () => {
    const { people } = extractEntityCandidates(chapters);
    const names = people.map((p) => p.name);

    // Honorific scan ("Mr. Dursley", "Ông Dursley").
    expect(names).toContain("Dursley");
    // Dialogue attribution scan ("said Watson").
    expect(names).toContain("Watson");
  });

  it("drops sentence-initial stop words even when they recur", () => {
    // "The garden" appears twice, so the count filter alone would keep it:
    // only the stop-word filter can reject it.
    const { people, terms } = extractEntityCandidates(chapters);
    const names = [...people, ...terms].map((e) => e.name);

    expect(names).not.toContain("The");
    expect(names).not.toContain("The garden");
  });

  it("keeps the translation-facing fields (occurrences + chapter excerpts)", () => {
    const { people } = extractEntityCandidates(chapters);
    const dursley = people.find((p) => p.name === "Dursley");

    expect(dursley).toBeDefined();
    expect(dursley!.type).toBe("person");
    expect(dursley!.occurrencesCount).toBeGreaterThan(0);
    expect(dursley!.excerpts.length).toBeGreaterThan(0);
    expect(dursley!.excerpts[0].chapterHref).toBe("c1.xhtml");
  });

  it("caps the number of returned candidates", () => {
    const { people, terms } = extractEntityCandidates(chapters, 1);
    expect(people.length + terms.length).toBe(1);
  });

  it("maps occurrences and excerpts on demand for a given entity list", () => {
    const entities = [
      {
        id: 1,
        name: "Privet Drive",
        aliases: [],
        type: "term" as const,
        description: "",
        occurrencesCount: 0,
        excerpts: [],
      },
    ];

    mapEntityOccurrences(entities, chapters, 2);

    expect(entities[0].occurrencesCount).toBe(3);
    expect(entities[0].excerpts).toHaveLength(2);
  });
});
