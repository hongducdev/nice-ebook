import { describe, it, expect } from "vitest";
import {
  sanitizeHtmlForKindle,
  sanitizeCssForKindle,
  stripRemoteImports,
  buildKindleEdition,
  describeKindleReadiness,
  repairInternalLinks,
  contrastAgainstWhite,
  KINDLE_APPENDIX_HREF,
} from "./kindleExportService";
import { XRayEntityItem } from "./xrayService";
import { generateEpubCss } from "../../utils/cssGenerator";
import { STYLE_PRESETS } from "../../presets/styles";

describe("sanitizeHtmlForKindle — element removal", () => {
  it("removes script elements together with their content", () => {
    const input = `<div><p>Before</p><script>var x = "<p>fake</p>";</script><p>After</p></div>`;
    const out = sanitizeHtmlForKindle(input);
    expect(out).toBe(`<div><p>Before</p><p>After</p></div>`);
    expect(out).not.toContain("var x");
  });

  it("removes script regardless of letter casing", () => {
    const out = sanitizeHtmlForKindle(`<p>A</p><SCRIPT>bad()</SCRIPT><p>B</p>`);
    expect(out).toBe(`<p>A</p><p>B</p>`);
  });

  it("removes script with attributes on the opening tag", () => {
    const out = sanitizeHtmlForKindle(
      `<p>A</p><script type="text/javascript" src="x.js"></script><p>B</p>`
    );
    expect(out).toBe(`<p>A</p><p>B</p>`);
  });

  it("handles nested elements inside a removed script block", () => {
    const out = sanitizeHtmlForKindle(`<p>Keep</p><script><div><span>no</span></div></script>`);
    expect(out).toBe(`<p>Keep</p>`);
  });

  it("removes iframe, object, embed, form and interactive inputs", () => {
    const input =
      `<p>Text</p><iframe src="http://x"></iframe><object data="a"></object>` +
      `<embed src="b"/><form><input value="v"/><button>Go</button></form><p>End</p>`;
    const out = sanitizeHtmlForKindle(input);
    expect(out).toBe(`<p>Text</p><p>End</p>`);
  });

  it("keeps a stray closing tag from unbalancing output", () => {
    const out = sanitizeHtmlForKindle(`<p>A</p></script><p>B</p>`);
    expect(out).toBe(`<p>A</p><p>B</p>`);
  });
});

describe("sanitizeHtmlForKindle — does not mangle valid markup", () => {
  it("keeps Word Wise ruby annotations intact", () => {
    const input =
      `<p>The <ruby data-kindle-wordwise="1" data-difficulty="2">ephemeral<rt>phù du</rt></ruby> mist.</p>`;
    const out = sanitizeHtmlForKindle(input);
    expect(out).toBe(input);
  });

  it("does not terminate a tag early on a '>' inside a quoted attribute", () => {
    const input = `<p><img alt="a > b" src="x.png"/>after</p>`;
    const out = sanitizeHtmlForKindle(input);
    expect(out).toBe(input);
    expect(out).toContain(`alt="a > b"`);
  });

  it("preserves the book's own local stylesheet links", () => {
    const input = `<head><link rel="stylesheet" href="../Styles/style.css"/></head>`;
    expect(sanitizeHtmlForKindle(input)).toBe(input);
  });

  it("leaves comments, doctype and xml declarations untouched", () => {
    const input = `<?xml version="1.0"?><!DOCTYPE html><!-- note --><p>x</p>`;
    expect(sanitizeHtmlForKindle(input)).toBe(input);
  });
});

describe("sanitizeHtmlForKindle — remote stylesheet and handler removal", () => {
  it("drops remote stylesheet links but keeps the tag's siblings", () => {
    const input =
      `<head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X"/><title>T</title></head>`;
    const out = sanitizeHtmlForKindle(input);
    expect(out).toBe(`<head><title>T</title></head>`);
  });

  it("drops protocol-relative remote stylesheet links", () => {
    const input = `<head><link rel="stylesheet" href="//cdn.example.com/a.css"/></head>`;
    expect(sanitizeHtmlForKindle(input)).toBe(`<head></head>`);
  });

  it("strips inline event handlers without touching similarly named data attributes", () => {
    const input = `<p onclick="evil()" data-onclick="keep" class="c">Text</p>`;
    const out = sanitizeHtmlForKindle(input);
    expect(out).not.toContain("evil()");
    expect(out).toContain(`data-onclick="keep"`);
    expect(out).toContain(`class="c"`);
    expect(out).toContain(">Text</p>");
  });

  it("strips unquoted inline event handlers", () => {
    const input = `<img src="a.png" onerror=alert(1) alt="x"/>`;
    const out = sanitizeHtmlForKindle(input);
    expect(out).not.toContain("onerror");
    expect(out).toContain(`src="a.png"`);
  });

  it("sanitizes CSS inside <style> blocks", () => {
    const input = `<style>@import url('https://fonts.googleapis.com/css2?family=X'); p { color: red; }</style>`;
    const out = sanitizeHtmlForKindle(input);
    expect(out).not.toContain("fonts.googleapis.com");
    expect(out).toContain("p { color: red; }");
  });
});

describe("sanitizeCssForKindle", () => {
  it("removes remote @import in its common forms", () => {
    const css = [
      `@import url("https://fonts.googleapis.com/css2?family=Lora");`,
      `@import 'https://example.com/a.css';`,
      `@import url(https://example.com/b.css);`,
      `body { color: #111; }`,
    ].join("\n");
    const out = sanitizeCssForKindle(css);
    expect(out).not.toContain("@import");
    expect(out).toContain("body { color: #111; }");
  });

  it("keeps non-remote CSS untouched", () => {
    const css = `ruby rt { font-size: 0.58em; }\np { text-indent: 2em; }`;
    expect(sanitizeCssForKindle(css)).toBe(css);
  });
});

describe("buildKindleEdition", () => {
  const chapters = [
    {
      href: "OEBPS/ch1.xhtml",
      title: "Chương 1",
      html: `<html><head><title>C1</title></head><body><p>The ephemeral mist rose.</p><script>x()</script></body></html>`,
    },
    {
      href: "OEBPS/ch2.xhtml",
      title: "Chương 2",
      html: `<html><head><title>C2</title></head><body><p>Nothing advanced here.</p></body></html>`,
    },
  ];

  it("sanitizes every chapter even when no optional feature is enabled", () => {
    const result = buildKindleEdition(chapters, {});
    expect(Object.keys(result.chapterOverrides)).toHaveLength(2);
    expect(result.chapterOverrides["OEBPS/ch1.xhtml"]).not.toContain("<script>");
    expect(result.extraChapters).toEqual({});
    expect(result.hasAppendix).toBe(false);
    expect(result.wordWiseAnnotatedCount).toBe(0);
  });

  it("bakes Word Wise ruby into chapters and reports counts", () => {
    const result = buildKindleEdition(chapters, {
      applyWordWise: true,
      wordWiseOptions: { language: "en", maxDifficulty: 3 },
    });
    expect(result.wordWiseAnnotatedCount).toBeGreaterThan(0);
    expect(result.wordWiseAnnotatedChapters).toBe(1);
    expect(result.chapterOverrides["OEBPS/ch1.xhtml"]).toContain("<ruby");
    expect(result.chapterOverrides["OEBPS/ch1.xhtml"]).toContain("short-lived");
    // The chapter with no qualifying vocabulary must not gain annotations.
    expect(result.chapterOverrides["OEBPS/ch2.xhtml"]).not.toContain("<ruby");
  });

  it("keeps ruby markup through sanitization after annotation", () => {
    const result = buildKindleEdition(chapters, {
      applyWordWise: true,
      wordWiseOptions: { language: "vi", maxDifficulty: 3 },
    });
    const ch1 = result.chapterOverrides["OEBPS/ch1.xhtml"];
    expect(ch1).toContain("<ruby");
    expect(ch1).toContain("<rt>");
    expect(ch1).toContain("phù du");
    expect(ch1).not.toContain("<script>");
  });

  it("adds the appendix as an extra chapter rather than an override", () => {
    const people: XRayEntityItem[] = [
      {
        id: 1,
        name: "Sherlock Holmes",
        aliases: ["Holmes"],
        type: "person",
        role: "Thám tử",
        description: "Thám tử tư vấn tại phố Baker.",
        occurrencesCount: 12,
        excerpts: [
          { chapterHref: "OEBPS/ch1.xhtml", chapterTitle: "Chương 1", snippet: "Holmes nói..." },
        ],
      },
    ];

    const result = buildKindleEdition(chapters, {
      appendXRayAppendix: true,
      xray: { bookTitle: "Truyện Trinh Thám", people, terms: [] },
    });

    expect(result.hasAppendix).toBe(true);
    expect(result.extraChapters[KINDLE_APPENDIX_HREF]).toBeDefined();
    expect(result.extraChapters[KINDLE_APPENDIX_HREF]).toContain("Sherlock Holmes");
    // It must NOT be an override, or the writer would skip it (href absent from the archive).
    expect(result.chapterOverrides[KINDLE_APPENDIX_HREF]).toBeUndefined();
  });

  it("does not add the appendix when there is no X-Ray data", () => {
    const result = buildKindleEdition(chapters, { appendXRayAppendix: true, xray: null });
    expect(result.hasAppendix).toBe(false);
    expect(result.extraChapters).toEqual({});
  });
});

describe("describeKindleReadiness", () => {
  it("flags every missing capability honestly", () => {
    const r = describeKindleReadiness({
      chapterCount: 0,
      hasWordWise: false,
      hasXRayData: false,
    });
    expect(r.canExportEpub).toBe(false);
    expect(r.canExportAzw3).toBe(false);
    expect(r.warnings).toHaveLength(3);
  });

  it("always offers AZW3 because the converter is built in, with no external prerequisite", () => {
    const base = { chapterCount: 10, hasWordWise: true, hasXRayData: true };
    const readiness = describeKindleReadiness(base);
    expect(readiness.canExportEpub).toBe(true);
    expect(readiness.canExportAzw3).toBe(true);
    expect(readiness.warnings).toHaveLength(0);
  });

  it("still reports the qualitative gaps without blocking the conversion", () => {
    const readiness = describeKindleReadiness({
      chapterCount: 5,
      hasWordWise: false,
      hasXRayData: false,
    });
    expect(readiness.canExportAzw3).toBe(true);
    expect(readiness.warnings).toHaveLength(2);
    expect(readiness.warnings.join(" ")).toContain("chú thích từ vựng");
    expect(readiness.warnings.join(" ")).toContain("X-Ray");
  });
});

describe("repairInternalLinks — the dangling-link fix", () => {
  // Regression guard for the reported failure:
  // "KF8 build failed: internal link target does not resolve to a generated document:
  //  start_split9.xhtml#b7"
  const makeChapters = (chapterOneHtml: string) => [
    { href: "OEBPS/ch1.xhtml", title: "Chương 1", html: chapterOneHtml },
    {
      href: "OEBPS/ch2.xhtml",
      title: "Chương 2",
      html: `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>C2</title></head><body><p id="sec2">Nội dung</p></body></html>`,
    },
  ];

  const wrap = (body: string) =>
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>C1</title></head><body>${body}</body></html>`;

  it("unwraps a link to a document that does not exist, keeping the text", () => {
    const { chapters, report } = repairInternalLinks(
      makeChapters(wrap(`<p>Xem <a href="start_split9.xhtml#b7">phần bảy</a>.</p>`))
    );

    expect(chapters[0].html).not.toContain("start_split9.xhtml");
    expect(chapters[0].html).not.toContain("<a ");
    // The readable text must survive — we unwrap, we do not delete content.
    expect(chapters[0].html).toContain("phần bảy");
    expect(report.removedDanglingLinks).toBe(1);
    expect(report.missingTargets).toContain("start_split9.xhtml#b7");
  });

  it("leaves a valid cross-document link with a valid anchor untouched", () => {
    const original = wrap(`<p>Tới <a href="ch2.xhtml#sec2">chương hai</a>.</p>`);
    const { chapters, report } = repairInternalLinks(makeChapters(original));

    expect(chapters[0].html).toBe(original);
    expect(report.removedDanglingLinks).toBe(0);
    expect(report.strippedFragments).toBe(0);
  });

  it("keeps the document link but drops a missing anchor fragment", () => {
    const { chapters, report } = repairInternalLinks(
      makeChapters(wrap(`<p>Tới <a href="ch2.xhtml#nope">chương hai</a>.</p>`))
    );

    expect(chapters[0].html).toContain('href="ch2.xhtml"');
    expect(chapters[0].html).not.toContain("#nope");
    expect(report.strippedFragments).toBe(1);
    expect(report.removedDanglingLinks).toBe(0);
  });

  it("unwraps a same-document link whose anchor is gone", () => {
    const { chapters, report } = repairInternalLinks(
      makeChapters(wrap(`<p id="top">Đầu</p><p><a href="#gone">mục cũ</a></p>`))
    );

    expect(chapters[0].html).not.toContain("<a ");
    expect(chapters[0].html).toContain("mục cũ");
    expect(report.strippedFragments).toBe(1);
  });

  it("keeps a same-document link whose anchor exists", () => {
    const original = wrap(`<p id="top">Đầu</p><p><a href="#top">lên đầu</a></p>`);
    const { chapters, report } = repairInternalLinks(makeChapters(original));
    expect(chapters[0].html).toBe(original);
    expect(report.strippedFragments).toBe(0);
  });

  it("never touches external links", () => {
    const original = wrap(
      `<p><a href="https://example.com">web</a> <a href="mailto:a@b.c">mail</a> <a href="//cdn.x/y">cd</a></p>`
    );
    const { chapters, report } = repairInternalLinks(makeChapters(original));
    expect(chapters[0].html).toBe(original);
    expect(report.removedDanglingLinks).toBe(0);
  });

  it("resolves ../ and ./ paths against the containing document", () => {
    const chapters = [
      {
        href: "OEBPS/Text/ch1.xhtml",
        title: "C1",
        // ../Images/.. is a real sibling-tree reference; Text/ch2.xhtml is a valid sibling.
        html: wrap(
          `<p><a href="./ch2.xhtml#sec2">ok</a> <a href="../Text/ch2.xhtml#sec2">ok2</a> <a href="../Missing/x.xhtml">bad</a></p>`
        ),
      },
      {
        href: "OEBPS/Text/ch2.xhtml",
        title: "C2",
        html: `<html><body><p id="sec2">x</p></body></html>`,
      },
    ];

    const { chapters: out, report } = repairInternalLinks(chapters);
    expect(out[0].html).toContain('href="./ch2.xhtml#sec2"');
    expect(out[0].html).toContain('href="../Text/ch2.xhtml#sec2"');
    expect(out[0].html).not.toContain("../Missing/x.xhtml");
    expect(report.removedDanglingLinks).toBe(1);
  });

  it("resolves percent-encoded paths before comparing", () => {
    const chapters = [
      {
        href: "OEBPS/Text/ch1.xhtml",
        title: "C1",
        html: wrap(`<p><a href="ch%202.xhtml">spaced</a></p>`),
      },
      {
        href: "OEBPS/Text/ch 2.xhtml",
        title: "C2",
        html: `<html><body><p>x</p></body></html>`,
      },
    ];

    const { chapters: out, report } = repairInternalLinks(chapters);
    expect(report.removedDanglingLinks).toBe(0);
    expect(out[0].html).toContain('href="ch%202.xhtml"');
  });

  it("repairs every chapter independently and reports totals", () => {
    const chapters = [
      ...makeChapters(wrap(`<p><a href="ghost1.xhtml">a</a></p>`)),
      ...makeChapters(wrap(`<p><a href="ghost2.xhtml">b</a></p>`)),
    ].map((c, i) => ({ ...c, href: `OEBPS/ch${i + 1}.xhtml` }));

    const { report } = repairInternalLinks(chapters);
    expect(report.removedDanglingLinks).toBe(2);
    expect(report.missingTargets.sort()).toEqual(["ghost1.xhtml", "ghost2.xhtml"]);
  });
});

describe("buildKindleEdition wires the link repair in", () => {
  it("sanitises a book with a dangling link instead of leaving it to fail in KF8", () => {
    const result = buildKindleEdition(
      [
        {
          href: "OEBPS/ch1.xhtml",
          title: "Chương 1",
          html: `<html><head><title>C1</title></head><body><p><a href="start_split9.xhtml#b7">phần bảy</a></p></body></html>`,
        },
      ],
      {}
    );

    expect(result.chapterOverrides["OEBPS/ch1.xhtml"]).not.toContain("start_split9.xhtml");
    expect(result.linkReport.removedDanglingLinks).toBe(1);
  });
});

describe("sanitizeCssForKindle — legibility on a white Kindle page", () => {
  // Regression guard for the reported "blank white page": the presets are designed for a dark app
  // UI, so they emit near-white text. Kindle owns the page background and renders white, which made
  // the whole book — including the X-Ray appendix — invisible.

  it("removes page and block backgrounds so the reader owns them", () => {
    const css = `html, body { background-color: #161618; color: #f4f4f5; }
blockquote { background-color: #1c1c20; }`;
    const out = sanitizeCssForKindle(css);

    expect(out).not.toMatch(/background/i);
  });

  it("darkens near-white body text to a readable colour", () => {
    const out = sanitizeCssForKindle(`body { color: #f4f4f5; }`);
    const colour = out.match(/color:\s*(#[0-9a-fA-F]{3,6})/)?.[1];

    expect(colour).toBeDefined();
    expect(contrastAgainstWhite(colour!)).toBeGreaterThanOrEqual(4.5);
  });

  it("darkens bright accent colours while keeping them recognisable", () => {
    const out = sanitizeCssForKindle(`h1 { color: #eab308; }`); // preset yellow
    const colour = out.match(/color:\s*(#[0-9a-fA-F]{3,6})/)?.[1];

    expect(colour).toBeDefined();
    expect(contrastAgainstWhite(colour!)).toBeGreaterThanOrEqual(4.5);
    // Still warm rather than a flat grey/black: red channel dominates.
    const r = parseInt(colour!.slice(1, 3), 16);
    const b = parseInt(colour!.slice(5, 7), 16);
    expect(r).toBeGreaterThan(b);
  });

  it("leaves already-readable and non-hex colours untouched", () => {
    const css = `p { color: #111111; } em { color: inherit; } strong { color: red; }`;
    expect(sanitizeCssForKindle(css)).toBe(css);
  });

  it("strips remote @import and @charset", () => {
    const css = `@charset "utf-8";\n@import url('https://fonts.googleapis.com/css2?family=Lora');\nbody { color: #222; }`;
    const out = sanitizeCssForKindle(css);

    expect(out).not.toContain("@import");
    expect(out).not.toContain("@charset");
    expect(out).toContain("body { color: #222; }");
  });

  it("keeps the existing import-stripping behaviour", () => {
    expect(stripRemoteImports(`@import 'https://x.y/a.css'; p { color: #111; }`)).not.toContain(
      "@import"
    );
  });

  it("makes EVERY preset legible — the class-level prevention guard", () => {
    for (const preset of STYLE_PRESETS) {
      const generated = generateEpubCss({
        preset,
        fontSize: 16,
        lineHeight: 1.75,
        firstLineIndent: "2em",
        dropCaps: true,
        textAlign: "justify",
        sceneDivider: "♦ ♦ ♦",
        customOverrides: "",
        isVietnamese: true,
        fontFamily: preset.vietnameseFontFamily || preset.fontFamily,
      });

      const forKindle = sanitizeCssForKindle(generated);

      // 1. No background may survive, or dark-on-dark text traps appear.
      expect(forKindle, `preset ${preset.id} still has a background`).not.toMatch(/background/i);

      // 2. Every colour left in the sheet must be readable on white.
      const colours = [...forKindle.matchAll(/color\s*:\s*(#[0-9a-fA-F]{3,6})/g)].map(
        (m) => m[1]
      );
      expect(colours.length, `preset ${preset.id} produced no colours to check`).toBeGreaterThan(0);
      for (const colour of colours) {
        expect(
          contrastAgainstWhite(colour),
          `preset ${preset.id} colour ${colour} is unreadable on white`
        ).toBeGreaterThanOrEqual(4.5);
      }

      // 3. Unrelated styling must survive the colour pass.
      expect(forKindle).toContain("text-indent");
      expect(forKindle).toContain("ruby-position");
    }
  });
});
