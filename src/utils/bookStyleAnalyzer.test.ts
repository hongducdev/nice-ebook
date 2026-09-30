import { describe, it, expect } from "vitest";
import {
  MIN_NATIVE_STYLE_CONFIDENCE,
  NATIVE_PRESET_ID,
  analyzeChapterHtml,
  buildNativePreset,
  combinePreviewCss,
  deriveBookStyleSignature,
  emptySignature,
  fontSizeToPx,
  isVietnameseSafeFont,
  normalizeColor,
  parseCssRules,
  parseFontShorthand,
  sanitizeCssForPreview,
} from "./bookStyleAnalyzer";
import { STYLE_PRESETS } from "../presets/styles";

const FALLBACK = STYLE_PRESETS[0];

/** CSS kiểu EPUB nhà xuất bản: khai báo đủ token trên body/p/h1. */
const PUBLISHER_CSS = `
/* Nhà xuất bản */
body {
  font-family: "Lora", Georgia, serif;
  font-size: 1.05em;
  line-height: 1.6;
  color: #2b2b2b;
  background-color: #fdfdf7;
  text-align: justify;
}
p { text-indent: 1.5em; margin: 0 0 0.4em 0; }
h1 { color: #8b2f2f; border-bottom: 1px solid #d8c9a8; text-align: center; }
blockquote { background-color: #f3efe4; }
p.drop-cap::first-letter { float: left; font-size: 3em; }
.scene-divider { content: "❦ ❦ ❦"; }
@media screen and (max-width: 600px) {
  body { font-size: 0.95em; }
}
@font-face { font-family: "Lora"; src: url("fonts/lora.woff2"); }
`;

describe("bookStyleAnalyzer", () => {
  describe("parseCssRules", () => {
    it("parses rules, recurses into @media and skips @font-face", () => {
      const rules = parseCssRules(PUBLISHER_CSS);
      const selectors = rules.map((r) => r.selector);

      expect(selectors).toContain("body");
      expect(selectors).toContain("p.drop-cap::first-letter");
      // @font-face body must not become a rule
      expect(selectors.some((s) => s.includes("@font-face"))).toBe(false);
      // @media inner rules are collected (two `body` rules: top level + media)
      expect(selectors.filter((s) => s === "body").length).toBe(2);
    });
  });

  describe("normalizeColor", () => {
    it("normalises hex/names and rejects non-colors", () => {
      expect(normalizeColor("#abc")).toBe("#aabbcc");
      expect(normalizeColor("#AABBCC")).toBe("#aabbcc");
      expect(normalizeColor("white")).toBe("#ffffff");
      expect(normalizeColor("rgb(10, 20, 30)")).toBe("rgb(10, 20, 30)");
      expect(normalizeColor("#11223300")).toBeNull();
      expect(normalizeColor("transparent")).toBeNull();
      expect(normalizeColor("inherit")).toBeNull();
      expect(normalizeColor("rgba(0,0,0,0)")).toBeNull();
      expect(normalizeColor("var(--text)")).toBeNull();
    });
  });

  describe("fontSizeToPx", () => {
    it("converts units and rejects absurd sizes", () => {
      expect(fontSizeToPx("18px")).toBe(18);
      expect(fontSizeToPx("1em")).toBe(16);
      expect(fontSizeToPx("12pt")).toBe(16);
      expect(fontSizeToPx("120%")).toBe(19);
      expect(fontSizeToPx("0.2em")).toBeNull();
      expect(fontSizeToPx("120px")).toBeNull();
      expect(fontSizeToPx(undefined)).toBeNull();
    });
  });

  describe("parseFontShorthand", () => {
    it("extracts size/line-height/family", () => {
      expect(parseFontShorthand("italic 400 16px/1.5 'Lora', serif")).toEqual({
        size: "16px",
        lineHeight: "1.5",
        family: "'Lora', serif",
      });
    });

    it("treats a family-only declaration as family", () => {
      expect(parseFontShorthand("'Lora', serif")).toEqual({ family: "'Lora', serif" });
    });
  });

  describe("deriveBookStyleSignature", () => {
    it("derives the book's own typography and palette", () => {
      const signature = deriveBookStyleSignature({
        stylesheets: [{ href: "OEBPS/style.css", content: PUBLISHER_CSS }],
      });

      expect(signature.fontFamily).toBe('"Lora", Georgia, serif');
      expect(signature.fontSize).toBe(17); // 1.05em
      expect(signature.lineHeight).toBe(1.6);
      expect(signature.textAlign).toBe("justify");
      expect(signature.firstLineIndent).toBe("1.5em");
      expect(signature.colors.text).toBe("#2b2b2b");
      expect(signature.colors.bg).toBe("#fdfdf7");
      expect(signature.colors.accent).toBe("#8b2f2f");
      expect(signature.colors.cardBg).toBe("#f3efe4");
      expect(signature.dropCaps).toBe(true);
      expect(signature.sceneDivider).toBe("❦ ❦ ❦");
      expect(signature.stylesheetCount).toBe(1);
      expect(signature.confidence).toBeGreaterThan(MIN_NATIVE_STYLE_CONFIDENCE);
    });

    it("returns zero confidence when the book ships no stylesheet", () => {
      const signature = deriveBookStyleSignature({ stylesheets: [] });
      expect(signature.confidence).toBe(0);
      expect(signature.fontFamily).toBeNull();
      expect(signature.colors.bg).toBeNull();
    });

    it("stays low-confidence for books that only use class selectors", () => {
      onClassOnlyBook((signature) => {
        expect(signature.confidence).toBeLessThan(MIN_NATIVE_STYLE_CONFIDENCE);
        expect(signature.colors.bg).toBeNull();
      });
    });

    it("đọc được typography của sách Calibre qua class gắn trên body/p", () => {
      // Rút từ một EPUB thật do Calibre sinh ra: KHÔNG có rule `body {}` hay `p {}`
      // nào, toàn bộ định dạng nằm trong `.calibre` (gắn trên <body>) và
      // `.calibre_16` (gắn trên <p>).
      const signature = deriveBookStyleSignature({
        stylesheets: [{ href: "stylesheet.css", content: CALIBRE_CSS }],
        chapterHtml: CALIBRE_CHAPTER_HTML,
      });

      expect(signature.fontSize).toBe(16); // .calibre { font-size: 1em }
      expect(signature.textAlign).toBe("justify"); // .calibre { text-align: justify }
      expect(signature.firstLineIndent).toBe("1.5em"); // .calibre_16 { text-indent: 1.5em }
      // Sách không khai báo font/màu nào ⇒ không được bịa ra
      expect(signature.fontFamily).toBeNull();
      expect(signature.colors.bg).toBeNull();
      expect(signature.colors.text).toBeNull();
      expect(signature.colors.accent).toBeNull();
      expect(signature.colors.cardBg).toBeNull();
      expect(signature.stylesheetCount).toBe(1);
      expect(signature.confidence).toBeGreaterThanOrEqual(MIN_NATIVE_STYLE_CONFIDENCE);
    });

    it("không nhận nhầm class cùng tiền tố (.calibre vs .calibre_16)", () => {
      const signature = deriveBookStyleSignature({
        stylesheets: [{ href: "s.css", content: CALIBRE_CSS }],
        // body chỉ mang `calibre`; nếu so khớp thiếu boundary thì .calibre_10
        // (color: #0b4085) sẽ bị gán nhầm làm màu chữ của cả cuốn sách.
        chapterHtml: `<html><body class="calibre"><p class="calibre_16">x</p></body></html>`,
      });

      expect(signature.colors.text).toBeNull();
    });
  });

  describe("analyzeChapterHtml", () => {
    it("collects inline CSS and recognised hooks", () => {
      const analysis = analyzeChapterHtml(
        `<html><head><style>body { color: #111; }</style></head>
         <body><p class="drop-cap scene-break">x</p><hr/><blockquote>q</blockquote></body></html>`
      );

      expect(analysis.inlineCss).toContain("color: #111");
      expect(analysis.hooks).toContain("drop-cap");
      expect(analysis.hooks).toContain("scene-break");
      expect(analysis.hasHr).toBe(true);
    });
  });

  describe("buildNativePreset", () => {
    it("marks the preset as derived from the book and borrows its tokens", () => {
      const signature = deriveBookStyleSignature({
        stylesheets: [{ href: "s.css", content: PUBLISHER_CSS }],
      });
      const preset = buildNativePreset(signature, FALLBACK);

      expect(preset.id).toBe(NATIVE_PRESET_ID);
      expect(preset.derivedFromBook).toBe(true);
      expect(preset.cssTemplate).toBe("");
      expect(preset.fontFamily).toBe('"Lora", Georgia, serif');
      expect(preset.colors.bg).toBe("#fdfdf7");
      expect(preset.lineHeight).toBe(1.6);
    });

    it("keeps the fallback Vietnamese font when the book font is not VN-safe", () => {
      // Không có generic family ⇒ không thể tin là font này phủ đủ dấu tiếng Việt.
      const signature = { ...emptySignature(), fontFamily: "'Some Obscure Face', 'Another Face'" };
      const preset = buildNativePreset(signature, FALLBACK, true);

      expect(isVietnameseSafeFont(signature.fontFamily)).toBe(false);
      expect(preset.fontFamily).toBe(FALLBACK.vietnameseFontFamily ?? FALLBACK.fontFamily);
    });

    it("coi font gốc là an toàn khi có generic family dự phòng", () => {
      const signature = { ...emptySignature(), fontFamily: "'Some Obscure Face', serif" };
      const preset = buildNativePreset(signature, FALLBACK, true);

      expect(isVietnameseSafeFont(signature.fontFamily)).toBe(true);
      expect(preset.fontFamily).toBe("'Some Obscure Face', serif");
    });

    it("falls back to the current preset when nothing was derived", () => {
      const preset = buildNativePreset(emptySignature(), FALLBACK);
      expect(preset.lineHeight).toBe(FALLBACK.lineHeight);
      expect(preset.colors.accent).toBe(FALLBACK.colors.accent);
      expect(preset.dropCaps).toBe(false);
    });
  });

  describe("sanitizeCssForPreview", () => {
    it("strips remote @import/@font-face and neutralises url()", () => {
      const cleaned = sanitizeCssForPreview(
        `@import url("https://fonts.example/x.css");
         @font-face { font-family: X; src: url("x.woff2"); }
         body { background-image: url("paper.png"); color: #111; }`
      );

      expect(cleaned).not.toContain("@import");
      expect(cleaned).not.toContain("@font-face");
      expect(cleaned).not.toContain("url(");
      expect(cleaned).toContain("background-image: none");
      expect(cleaned).toContain("color: #111");
    });

    it("vô hiệu hoá mọi dạng url() hiểm", () => {
      const cases = [
        `body { background: url(https://evil.example/track.gif); }`,
        `body { background: url('http://evil.example/x.png'); }`,
        `body { background: url(//evil.example/x.png); }`,
        `body { background: url("data:image/gif;base64,R0lGOD"); }`,
        `body { background: url(javascript:alert(1)); }`,
        `body { background: url(  'https://evil.example/x.png'  ); }`,
        `.x { list-style-image: url(vbscript:msgbox); }`,
        `.y { cursor: url("https://evil.example/c.cur"), auto; }`,
      ];

      for (const css of cases) {
        const cleaned = sanitizeCssForPreview(css);
        expect(cleaned).not.toContain("url(");
        expect(cleaned.toLowerCase()).not.toContain("evil.example");
        expect(cleaned.toLowerCase()).not.toContain("javascript:");
        expect(cleaned.toLowerCase()).not.toContain("vbscript:");
        expect(cleaned.toLowerCase()).not.toContain("data:");
      }
    });
  });

  describe("combinePreviewCss", () => {
    it("puts the book CSS first so the adaptive layer wins in the cascade", () => {
      const combined = combinePreviewCss("body { color: #111; }", "body { color: #222; }");
      expect(combined.indexOf("#111")).toBeLessThan(combined.indexOf("#222"));
    });

    it("returns the app CSS untouched when there is no book CSS", () => {
      expect(combinePreviewCss(null, "body { color: #222; }")).toBe("body { color: #222; }");
    });
  });
});

/** Sách chỉ dùng class selector — trường hợp phổ biến của file convert từ Calibre. */
function onClassOnlyBook(assert: (signature: ReturnType<typeof deriveBookStyleSignature>) => void) {
  const signature = deriveBookStyleSignature({
    stylesheets: [
      {
        href: "s.css",
        content: `.calibre1 { margin-bottom: 0; } .calibre2 { text-indent: 1em; } .calibre3 { font-style: italic; }`,
      },
    ],
  });
  assert(signature);
}

/**
 * Trích NGUYÊN VĂN `stylesheet.css` của một EPUB thật do Calibre sinh ra (3.3KB,
 * mã định dạng do máy sinh nên dùng được làm fixture).
 *
 * Giữ đủ file — không lượt bớt — vì đây là regression lock duy nhất cho parser CSS
 * tự viết: sách Calibre không có rule `body { }` / `p { }` nào, toàn bộ typography
 * nằm trong `.calibre` (gắn trên <body>) và `.calibre_16` (gắn trên <p>).
 */
const CALIBRE_CSS = `
.bold {
    font-weight: bold
    }
.calibre {
    display: block;
    font-size: 1em;
    padding-left: 0;
    padding-right: 0;
    text-align: justify;
    margin: 0 5pt
    }
.calibre_ {
    border-bottom: 0;
    border-top: 0;
    display: block;
    padding-bottom: 0;
    padding-top: 0;
    text-indent: 1.5em;
    margin: 0
    }
.calibre_1 {
    display: block;
    text-align: justify;
    text-indent: 2em;
    margin: 0 0 0 2em
    }
.calibre_2 {
    display: block;
    text-align: left;
    text-indent: 2em;
    margin: 1em 0 0 2em
    }
.calibre_3 {
    display: block;
    text-align: justify;
    text-indent: 2em;
    margin: 2em 0 0 2em
    }
.calibre_4 {
    display: block;
    text-align: center;
    text-indent: 2em;
    margin: 0 0 0 2em
    }
.calibre_5 {
    border-bottom: 0;
    border-top: 0;
    display: block;
    padding-bottom: 0;
    padding-top: 0;
    text-align: right;
    text-indent: 2em;
    margin: 0
    }
.calibre_6 {
    border-bottom: 0;
    border-top: 0;
    display: block;
    padding-bottom: 0;
    padding-top: 0;
    text-align: right;
    text-indent: 0;
    margin: 0
    }
.calibre_7 {
    display: block;
    margin: 0 0 0 2em
    }
.calibre_8 {
    display: block;
    text-align: right;
    text-indent: 2em;
    margin: 0 0 0 2em
    }
.calibre_9 {
    height: 669px;
    vertical-align: baseline;
    width: 658px
    }
.calibre_10 {
    color: #0b4085
    }
.calibre_11 {
    border-bottom: 0;
    border-top: 0;
    display: block;
    padding-bottom: 0;
    padding-top: 0;
    text-align: center;
    text-indent: 2em;
    margin: 0
    }
.calibre_12 {
    display: block;
    text-align: left;
    text-indent: 1em;
    margin: 2em 0 0 2em
    }
.calibre_13 {
    display: block;
    text-align: left;
    text-indent: 1em;
    margin: 0 0 0 2em
    }
.calibre_14 {
    display: block;
    text-align: left;
    text-indent: 2em;
    margin: 0 0 0 2em
    }
.calibre_15 {
    display: block;
    text-align: left;
    text-indent: 2em;
    margin: 3em 0 0 2em
    }
.calibre_16 {
    border-bottom: 0;
    border-top: 0;
    display: block;
    padding-bottom: 0;
    padding-top: 0;
    text-align: justify;
    text-indent: 1.5em;
    margin: 0
    }
.calibre_17 {
    border-bottom: 0;
    border-top: 0;
    display: block;
    padding-bottom: 0;
    padding-top: 0;
    text-align: center;
    text-indent: 0;
    margin: 0
    }
.calibre_18 {
    display: block;
    text-align: center;
    text-indent: 0;
    margin: 0 0 0 2em
    }
.calibre_19 {
    display: block;
    text-align: center;
    text-indent: 0;
    margin: 1em 0 0 2em
    }
.calibre_20 {
    display: block;
    text-align: justify;
    text-indent: 1em;
    margin: 10pt 0 0 2em
    }
.calibre_21 {
    display: block;
    text-align: justify;
    text-indent: 1em;
    margin: 0 0 0 2em
    }
.calibre1 {
    font-size: 1.83333em;
    line-height: 1.2
    }
.calibre2 {
    font-size: 0.75em
    }
.calibre3 {
    font-size: 1.29167em;
    line-height: 1.2
    }
.calibre4 {
    color: gray;
    display: block;
    height: 2px;
    border: currentColor inset 1px;
    margin: 0.5em auto
    }
.italic {
    font-style: italic
    }
.mbp_pagebreak {
    border-bottom: 0;
    border-top: 0;
    display: block;
    padding-bottom: 0;
    padding-top: 0;
    text-indent: 1.5em;
    margin: 0
    }
`;

/**
 * Chương cùng sách đó: giữ nguyên cấu trúc class thật, chỉ thay lời văn bằng text
 * trung tính (nội dung sách không thuộc phạm vi repo này).
 */
const CALIBRE_CHAPTER_HTML = `<?xml version='1.0' encoding='utf-8'?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Sample</title><link href="stylesheet.css" rel="stylesheet" type="text/css"/></head>
  <body class="calibre">
    <hr class="calibre4"/>
    <p class="calibre_17">—</p>
    <p class="calibre_16">Đoạn văn thứ nhất của chương, dài vài câu để giống phân bố class thật.</p>
    <p class="calibre_16">Đoạn văn thứ hai, vẫn là đoạn văn thân chương.</p>
    <p class="calibre_16">Đoạn văn thứ ba, vẫn là đoạn văn thân chương.</p>
    <p class="calibre_">Một dòng thoại ngắn dùng class đuôi.</p>
    <p class="calibre_16">Đoạn văn thứ năm, kết thúc chương.</p>
  </body>
</html>`;
