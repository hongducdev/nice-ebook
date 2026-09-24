import { describe, it, expect } from "vitest";
import { generateEpubCss, injectCssIntoHtml } from "./cssGenerator";
import { STYLE_PRESETS } from "../presets/styles";

describe("cssGenerator", () => {
  it("generates valid CSS with custom options and drop caps", () => {
    const preset = STYLE_PRESETS[0]; // Wuxia preset
    const css = generateEpubCss({
      preset,
      fontSize: 18,
      lineHeight: 1.85,
      firstLineIndent: "2em",
      dropCaps: true,
      textAlign: "justify",
      sceneDivider: "☁ ☁ ☁",
    });

    expect(css).toContain("font-size: 18px;");
    expect(css).toContain("line-height: 1.85;");
    expect(css).toContain("text-indent: 2em;");
    expect(css).toContain("text-align: justify;");
    expect(css).toContain(".drop-cap");
    expect(css).toContain(preset.colors.bg);
    expect(css).toContain(preset.colors.accent);
  });

  it("injects CSS into <head> properly", () => {
    const html = "<html><head><title>Chương 1</title></head><body><p>Nội dung</p></body></html>";
    const css = "body { background: #000; }";
    const injected = injectCssIntoHtml(html, css);

    expect(injected).toContain('<style id="nice-ebook-dynamic-css">body { background: #000; }</style></head>');
  });

  it("falls back to inserting <head> before <body> when <head> is missing", () => {
    const html = "<html><body><p>No head</p></body></html>";
    const css = "body { color: #fff; }";
    const injected = injectCssIntoHtml(html, css);

    expect(injected).toContain("<head><style");
    expect(injected).toContain("</head><body");
  });

  it("injects Vietnamese Google Fonts @import and uses Vietnamese font family when isVietnamese is true", () => {
    const preset = STYLE_PRESETS[0]; // Wuxia preset
    const css = generateEpubCss({
      preset,
      fontSize: 16,
      lineHeight: 1.8,
      firstLineIndent: "2em",
      dropCaps: true,
      textAlign: "justify",
      sceneDivider: "☁ ☁ ☁",
      isVietnamese: true,
    });

    expect(css).toContain("Google Fonts for Full Vietnamese Diacritics Support");
    expect(css).toContain("family=Literata");
    expect(css).toContain("family=Be+Vietnam+Pro");
    expect(css).toContain("font-family: 'Literata', 'Noto Serif', 'Times New Roman', serif;");
  });

  it("allows custom fontFamily override", () => {
    const preset = STYLE_PRESETS[0];
    const css = generateEpubCss({
      preset,
      fontSize: 16,
      lineHeight: 1.8,
      firstLineIndent: "2em",
      dropCaps: false,
      textAlign: "justify",
      sceneDivider: "♦ ♦ ♦",
      fontFamily: "'Be Vietnam Pro', sans-serif",
    });

    expect(css).toContain("font-family: 'Be Vietnam Pro', sans-serif;");
  });
});
