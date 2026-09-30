/**
 * BookStyleAnalyzer: đọc CSS *gốc* của cuốn sách đang mở và suy ra một bộ
 * typography + bảng màu để app phủ lên trên, thay vì thay thế toàn bộ.
 *
 * Vấn đề trước đây
 * ----------------
 * `selectPreset()` gán `customCss = preset.cssTemplate` và `generateEpubCss()`
 * phát ra nguyên một stylesheet (nền, màu chữ, font, canh lề...). CSS này được
 * chèn SAU cùng trong EPUB nên thắng toàn bộ CSS gốc: mở sách ra là mất hết
 * định dạng của nhà xuất bản.
 *
 * Cách tiếp cận ở đây
 * -------------------
 *   1. `read_epub_styles` (Rust) trả về mọi file `.css` trong EPUB.
 *   2. Module này parse ra một `BookStyleSignature` — CHỈ những token thực sự
 *      đọc được từ CSS của sách (font, cỡ chữ, giãn dòng, canh lề, thụt đầu
 *      dòng, màu chữ/nền/tiêu đề/khối trích dẫn) + `confidence`.
 *   3. `generateEpubCss(..., mode: "adaptive")` chỉ phát ra những khai báo có
 *      token tương ứng. Không đọc được thì KHÔNG ghi đè, để CSS gốc của sách
 *      tiếp tục quyết định.
 *
 * Module thuần: không `invoke`, không React, không `localStorage`.
 */

import type { StylePreset } from "../presets/styles";

// ---------------------------------------------------------------------------
// Hằng số & kiểu dữ liệu
// ---------------------------------------------------------------------------

/** Id của preset "theo sách hiện tại". Không nằm trong STYLE_PRESETS. */
export const NATIVE_PRESET_ID = "book-native";

/**
 * Dưới ngưỡng này, việc "áp dụng tự động" sẽ bị chặn: CSS gốc quá ít thông tin
 * (thường là sách chỉ dùng class selectors) nên suy diễn sẽ là đoán mò.
 */
export const MIN_NATIVE_STYLE_CONFIDENCE = 0.3;

export interface StylesheetSource {
  href: string;
  content: string;
}

export interface BookStyleSignature {
  /** Danh sách font-family gốc, giữ nguyên thứ tự fallback của sách. */
  fontFamily: string | null;
  /** Cỡ chữ gốc, quy đổi về px. */
  fontSize: number | null;
  /** Giãn dòng gốc (số không đơn vị). */
  lineHeight: number | null;
  textAlign: "justify" | "left" | null;
  firstLineIndent: string | null;
  colors: {
    bg: string | null;
    text: string | null;
    accent: string | null;
    border: string | null;
    cardBg: string | null;
  };
  /** Sách có tự tạo drop-cap cho ký tự đầu chương hay không. */
  dropCaps: boolean;
  /** Ký tự phân cách cảnh nếu CSS gốc có khai báo. */
  sceneDivider: string | null;
  /** 0..1 — tỷ lệ token cốt lõi đọc được. */
  confidence: number;
  /** Mô tả ngắn để hiển thị cho người dùng. */
  evidence: string[];
  stylesheetCount: number;
  /** Class/hook nhận ra trong HTML chương (drop-cap, scene-break, blockquote...). */
  chapterHooks: string[];
}

export function emptySignature(): BookStyleSignature {
  return {
    fontFamily: null,
    fontSize: null,
    lineHeight: null,
    textAlign: null,
    firstLineIndent: null,
    colors: { bg: null, text: null, accent: null, border: null, cardBg: null },
    dropCaps: false,
    sceneDivider: null,
    confidence: 0,
    evidence: [],
    stylesheetCount: 0,
    chapterHooks: [],
  };
}

// ---------------------------------------------------------------------------
// Parser CSS tối giản
// ---------------------------------------------------------------------------

export interface CssRule {
  selector: string;
  decls: Array<[string, string]>;
  /** Rule nằm trong @media/@supports — chỉ áp dụng có điều kiện. */
  conditional?: boolean;
}

const BUCKET_BY_TAG: Record<string, string> = {
  html: "html",
  body: "body",
  p: "p",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  blockquote: "blockquote",
  div: "block",
  section: "block",
  article: "block",
  main: "block",
  td: "block",
};

/** Bỏ comment CSS nhưng giữ nguyên độ dài dòng để không làm lệch vị trí. */
export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

function parseDeclarations(body: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const chunk of body.split(";")) {
    const idx = chunk.indexOf(":");
    if (idx <= 0) continue;
    const prop = chunk.slice(0, idx).trim().toLowerCase();
    const value = chunk
      .slice(idx + 1)
      .replace(/!important/gi, "")
      .trim();
    if (!prop || !value || value.includes("{")) continue;
    out.push([prop, value]);
  }
  return out;
}

/** Quét CSS thành danh sách rule, có đệ quy vào @media/@supports/@layer. */
export function parseCssRules(css: string, depth = 0, conditional = false): CssRule[] {
  const rules: CssRule[] = [];
  if (depth > 3) return rules;
  const src = stripCssComments(css);
  let buffer = "";
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (ch === "{") {
      const selector = buffer.trim();
      let level = 1;
      let j = i + 1;
      while (j < src.length && level > 0) {
        if (src[j] === "{") level++;
        else if (src[j] === "}") level--;
        j++;
      }
      const bodyEnd = level === 0 ? j - 1 : src.length;
      const body = src.slice(i + 1, bodyEnd);

      if (selector.startsWith("@")) {
        const name = selector.slice(1).split(/[\s(]/)[0].toLowerCase();
        if (name === "media" || name === "supports" || name === "layer" || name === "container") {
          rules.push(...parseCssRules(body, depth + 1, true));
        }
        // @font-face / @keyframes / @page: không mang token typography của sách.
      } else if (selector.length > 0) {
        rules.push({ selector, decls: parseDeclarations(body), conditional });
      }

      i = bodyEnd + 1;
      buffer = "";
      continue;
    }

    if (ch === "}" || ch === ";") {
      buffer = "";
      i++;
      continue;
    }

    buffer += ch;
    i++;
  }

  return rules;
}

interface TargetInfo {
  tags: string[];
  hasFirstLetter: boolean;
  weight: number;
}

function targetsForSelector(selector: string): TargetInfo {
  const lower = selector.trim().toLowerCase();
  const ids = (lower.match(/#[\w-]+/g) || []).length;
  const classes = (lower.match(/\.[\w-]+/g) || []).length;
  const hasFirstLetter = /::?first-letter/.test(lower);

  const stripped = lower
    .replace(/#[\w-]+/g, " ")
    .replace(/\.[\w-]+/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/::?[\w-]+(\([^)]*\))?/g, " ");

  const tags = stripped
    .split(/[\s>+~,()]+/)
    .filter((t) => /^[a-z][a-z0-9]*$/.test(t));

  return { tags, hasFirstLetter, weight: ids * 100 + classes * 10 + tags.length };
}

export interface CollectedDecls {
  buckets: Map<string, Map<string, string>>;
  hasFirstLetterRule: boolean;
  hasDropCapClass: boolean;
  sceneDivider: string | null;
}

/**
 * Class gắn trên một thẻ trong HTML chương, ví dụ `<body class="calibre">`.
 *
 * Đây là mảnh ghép quyết định với sách do Calibre sinh ra: CSS của chúng chỉ có
 * `.calibre`, `.calibre_16`... và không hề có rule `body { }` hay `p { }` nào.
 */
export interface ClassTarget {
  className: string;
  bucket: string;
  /** Số lần class xuất hiện trong HTML chương — class chủ đạo phải thắng class lẻ. */
  usage?: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Gộp rule thành "giá trị thắng" cho từng nhóm phần tử (body/p/heading...). */
export function collectDecls(rules: CssRule[], classTargets: ClassTarget[] = []): CollectedDecls {
  const winners = new Map<string, Map<string, { value: string; score: number }>>();
  let hasFirstLetterRule = false;
  let hasDropCapClass = false;
  let sceneDivider: string | null = null;

  // Chuẩn bị regex khớp class một lần thay vì mỗi rule.
  const classMatchers = classTargets.map((target) => ({
    ...target,
    regex: new RegExp(`\\.${escapeRegex(target.className)}(?![\\w-])`),
  }));

  function write(bucket: string, decls: Array<[string, string]>, score: number) {
    let bucketMap = winners.get(bucket);
    if (!bucketMap) {
      bucketMap = new Map();
      winners.set(bucket, bucketMap);
    }
    for (const [prop, value] of decls) {
      const current = bucketMap.get(prop);
      if (!current || score >= current.score) {
        bucketMap.set(prop, { value, score });
      }
    }
  }

  rules.forEach((rule, index) => {
    const selectorList = rule.selector.toLowerCase();

    if (/\.drop-?cap\b/.test(selectorList)) hasDropCapClass = true;

    // Ký tự phân cách cảnh: rule có selector kiểu divider/scene/separator/ornament
    if (/(divider|scene|separator|ornament|decorat)/.test(selectorList)) {
      for (const [prop, value] of rule.decls) {
        if (prop !== "content" && prop !== "background-image") continue;
        const match = value.match(/"([^"]{1,12})"/) || value.match(/'([^']{1,12})'/);
        if (match && !sceneDivider) sceneDivider = match[1];
      }
    }

    for (const part of rule.selector.split(",")) {
      const { tags, hasFirstLetter, weight } = targetsForSelector(part);
      // Rule trong @media là áp dụng CÓ ĐIỀU KIỆN: hạ ưu tiên để typography cơ bản
      // của sách (khai báo ngoài @media) vẫn là chuẩn suy diễn.
      const conditionalPenalty = rule.conditional ? 5 : 0;
      // Nhân 1000 để độ đặc hiệu (specificity) luôn thắng thứ tự tài liệu — đúng
      // như cascade thật, nơi `.calibre` thắng `body`.
      const score = weight * 1000 + index / 1000 - conditionalPenalty;

      if (hasFirstLetter) {
        for (const [prop] of rule.decls) {
          if (prop === "float" || prop === "font-size" || prop === "initial-letter") {
            hasFirstLetterRule = true;
          }
        }
      }

      for (const tag of tags) {
        const bucket = BUCKET_BY_TAG[tag];
        if (bucket) write(bucket, rule.decls, score);
      }

      // Class mà sách thực sự đang dùng (lấy từ HTML chương) — phần lớn sách
      // Calibre chỉ có cách này mới đọc được typography.
      // Tần suất dùng phá thế bằng trước thứ tự tài liệu, nên `.calibre_16`
      // (mọi đoạn văn) không bị `.calibre_17` (một dòng trống) ghi đè.
      for (const matcher of classMatchers) {
        if (matcher.regex.test(part)) {
          write(
            matcher.bucket,
            rule.decls,
            weight * 1000 + (matcher.usage ?? 1) * 10 + index / 1000 - conditionalPenalty
          );
        }
      }
    }
  });

  const buckets = new Map<string, Map<string, string>>();
  for (const [bucket, map] of winners) {
    const flat = new Map<string, string>();
    for (const [prop, entry] of map) flat.set(prop, entry.value);
    buckets.set(bucket, flat);
  }

  return { buckets, hasFirstLetterRule, hasDropCapClass, sceneDivider };
}

// ---------------------------------------------------------------------------
// Chuẩn hoá giá trị CSS
// ---------------------------------------------------------------------------

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  navy: "#000080",
  olive: "#808000",
  teal: "#008080",
  purple: "#800080",
  orange: "#ffa500",
  yellow: "#ffff00",
  brown: "#a52a2a",
  ivory: "#fffff0",
  beige: "#f5f5dc",
  cream: "#fffdd0",
};

const INVALID_COLOR_WORDS = /^(inherit|initial|unset|currentcolor|transparent|none|auto|revert)$/i;

/** Trả về màu ở dạng dùng được trong CSS, hoặc null khi không chắc chắn. */
export function normalizeColor(raw?: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value || INVALID_COLOR_WORDS.test(value)) return null;
  if (value.includes("var(")) return null;

  // rgba()/hsla() với alpha = 0 là "trong suốt", không phải màu nền của sách.
  const alphaMatch = value.match(/^rgba?\([^)]*,\s*([\d.]+)\s*\)$/);
  if (alphaMatch && Number(alphaMatch[1]) === 0) return null;

  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{8}$/.test(value)) {
    // #RRGGBBAA — alpha nằm ở hai ký tự cuối.
    return value.slice(7) === "00" ? null : value.slice(0, 7);
  }
  if (/^(rgb|hsl)a?\(/.test(value)) return value;
  if (NAMED_COLORS[value]) return NAMED_COLORS[value];

  return null;
}

/** Lấy màu nền từ shorthand `background: #fff url(...) no-repeat`. */
function colorFromBackgroundShorthand(value?: string | null): string | null {
  if (!value) return null;
  for (const token of value.split(/\s+/)) {
    const color = normalizeColor(token);
    if (color) return color;
  }
  return null;
}

/** Lấy màu từ shorthand `border: 1px solid #333` / `border-bottom: ...`. */
function colorFromBorderShorthand(value?: string | null): string | null {
  if (!value) return null;
  for (const token of value.split(/\s+/)) {
    const color = normalizeColor(token);
    if (color) return color;
  }
  return null;
}

/** Quy đổi cỡ chữ bất kỳ về px để so sánh với slider của app. */
export function fontSizeToPx(raw?: string | null): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)(px|pt|pc|em|rem|%)?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;

  const unit = (match[2] || "px").toLowerCase();
  let px: number;
  switch (unit) {
    case "px":
      px = n;
      break;
    case "pt":
      px = (n * 96) / 72;
      break;
    case "pc":
      px = n * 16;
      break;
    case "em":
    case "rem":
      px = n * 16;
      break;
    case "%":
      px = (n / 100) * 16;
      break;
    default:
      px = n;
  }

  const rounded = Math.round(px);
  if (rounded < 8 || rounded > 48) return null;
  return rounded;
}

function lineHeightValue(raw?: string | null, basePx?: number | null): number | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value === "normal" || value.includes("var(")) return null;

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric < 0.8 || numeric > 3) return null;
    return Math.round(numeric * 100) / 100;
  }

  const px = fontSizeToPx(value);
  if (px && basePx) {
    const ratio = Math.round((px / basePx) * 100) / 100;
    if (ratio < 0.8 || ratio > 3) return null;
    return ratio;
  }
  return null;
}

interface FontShorthand {
  family?: string;
  size?: string;
  lineHeight?: string;
}

/** Bóc shorthand `font: italic 400 16px/1.5 "Lora", serif`. */
export function parseFontShorthand(value?: string | null): FontShorthand {
  const out: FontShorthand = {};
  if (!value) return out;
  const tokens = value.trim().split(/\s+/);
  // Trong shorthand `font`, cỡ chữ BẮT BUỘC có đơn vị — nếu không thì `400` (font-weight)
  // sẽ bị nhận nhầm thành cỡ chữ.
  const sizeIdx = tokens.findIndex((t) => /^\d+(?:\.\d+)?(px|pt|pc|em|rem|%)(\/\S+)?$/i.test(t));

  if (sizeIdx === -1) {
    // Không có cỡ chữ ⇒ nhiều khả năng chỉ là danh sách font.
    if (tokens.length > 0) out.family = tokens.join(" ");
    return out;
  }

  const sizeToken = tokens[sizeIdx];
  const [size, lh] = sizeToken.split("/");
  out.size = size;
  if (lh) out.lineHeight = lh;

  const family = tokens.slice(sizeIdx + 1).join(" ").trim();
  if (family) out.family = family;

  return out;
}

// ---------------------------------------------------------------------------
// Phân tích HTML chương
// ---------------------------------------------------------------------------

const HOOK_PATTERNS: Array<[RegExp, string]> = [
  [/drop-?cap|lettrine|initial-?letter/i, "drop-cap"],
  [/scene|divider|separator|ornament/i, "scene-break"],
  [/epigraph|quote|blockquote|trich-dan/i, "blockquote"],
  [/chapter|heading|title|chuong/i, "chapter-heading"],
  [/first-?para|noindent|first-?line/i, "first-para"],
];

export interface ChapterHtmlAnalysis {
  inlineCss: string;
  hooks: string[];
  hasHr: boolean;
  /** Class đặt trên `<body>` — quyết định typography nền của sách. */
  bodyClasses: string[];
  /** Class phổ biến nhất trên `<p>` — quyết định thụt đầu dòng, canh lề đoạn. */
  paragraphClasses: string[];
  headingClasses: string[];
  /** Tần suất từng class trong toàn bộ chương. */
  classUsage: Record<string, number>;
}

/** Lấy class gắn trên một thẻ, theo thứ tự xuất hiện. */
function classesOnTag(html: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}\\b[^>]*?class\\s*=\\s*["']([^"']*)["']`, "gi");
  const out: string[] = [];
  for (const match of html.matchAll(regex)) {
    for (const token of match[1].split(/\s+/)) {
      if (token) out.push(token);
    }
  }
  return out;
}

/** Đếm tần suất rồi trả về các class dùng nhiều nhất (bỏ class chỉ xuất hiện lẻ tẻ). */
function topClasses(classes: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const token of classes) counts.set(token, (counts.get(token) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}

export function analyzeChapterHtml(html: string): ChapterHtmlAnalysis {
  if (!html) {
    return {
      inlineCss: "",
      hooks: [],
      hasHr: false,
      bodyClasses: [],
      paragraphClasses: [],
      headingClasses: [],
      classUsage: {},
    };
  }

  const inlineCss = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
    .map((m) => m[1])
    .join("\n");

  const classTokens = new Set<string>();
  const classUsage: Record<string, number> = {};
  for (const match of html.matchAll(/class\s*=\s*["']([^"']*)["']/gi)) {
    for (const token of match[1].split(/\s+/)) {
      if (!token) continue;
      classTokens.add(token);
      classUsage[token] = (classUsage[token] || 0) + 1;
    }
  }

  const hooks = new Set<string>();
  for (const token of classTokens) {
    for (const [pattern, label] of HOOK_PATTERNS) {
      if (pattern.test(token)) hooks.add(label);
    }
  }

  const headingClasses = topClasses(
    ["h1", "h2", "h3", "h4", "h5", "h6"].flatMap((tag) => classesOnTag(html, tag)),
    2
  );

  return {
    inlineCss,
    hooks: Array.from(hooks),
    hasHr: /<hr[\s/>]/i.test(html),
    bodyClasses: topClasses(classesOnTag(html, "body"), 2),
    paragraphClasses: topClasses(classesOnTag(html, "p"), 3),
    headingClasses,
    classUsage,
  };
}

// ---------------------------------------------------------------------------
// Suy diễn signature
// ---------------------------------------------------------------------------

export interface DeriveSignatureInput {
  stylesheets: StylesheetSource[];
  chapterHtml?: string;
  isVietnamese?: boolean;
}

function firstValue(
  buckets: CollectedDecls["buckets"],
  bucketNames: string[],
  props: string[]
): string | null {
  for (const bucket of bucketNames) {
    const map = buckets.get(bucket);
    if (!map) continue;
    for (const prop of props) {
      const value = map.get(prop);
      if (value) return value;
    }
  }
  return null;
}

export function deriveBookStyleSignature(input: DeriveSignatureInput): BookStyleSignature {
  const sheets = (input.stylesheets || []).filter((s) => s && s.content);
  const chapter = analyzeChapterHtml(input.chapterHtml || "");

  const rules = [
    ...sheets.flatMap((sheet) => parseCssRules(sheet.content)),
    // CSS nhúng trong chương đứng sau nên thắng khi cùng độ ưu tiên — đúng thứ tự cascade.
    ...parseCssRules(chapter.inlineCss),
  ];

  const collected = collectDecls(rules, buildClassTargets(chapter));
  const { buckets } = collected;

  // --- Font ---------------------------------------------------------------
  const bodyFontShorthand = parseFontShorthand(firstValue(buckets, ["body"], ["font"]));
  const pFontShorthand = parseFontShorthand(firstValue(buckets, ["p"], ["font"]));
  const bodyFontFamily = firstValue(buckets, ["body", "html", "p", "block"], ["font-family"]);
  const fontFamily =
    (bodyFontFamily && bodyFontFamily.trim()) ||
    bodyFontShorthand.family ||
    pFontShorthand.family ||
    null;

  // --- Cỡ chữ / giãn dòng --------------------------------------------------
  const fontSizeRaw =
    firstValue(buckets, ["body", "html"], ["font-size"]) || bodyFontShorthand.size || undefined;
  const fontSize = fontSizeToPx(fontSizeRaw);

  const lineHeight =
    lineHeightValue(firstValue(buckets, ["body"], ["line-height"]), fontSize) ??
    lineHeightValue(bodyFontShorthand.lineHeight, fontSize) ??
    lineHeightValue(firstValue(buckets, ["p"], ["line-height"]), fontSize);

  // --- Canh lề / thụt đầu dòng --------------------------------------------
  const alignRaw = firstValue(buckets, ["body"], ["text-align"]) || firstValue(buckets, ["p"], ["text-align"]);
  const textAlign = normalizeTextAlign(alignRaw);

  const indentRaw = firstValue(buckets, ["p"], ["text-indent", "margin-left"]);
  const firstLineIndent =
    indentRaw && !/^(0|0px|0em|0rem|0%)$/i.test(indentRaw.trim()) ? indentRaw.trim() : null;

  // --- Màu ----------------------------------------------------------------
  const bg =
    normalizeColor(firstValue(buckets, ["body", "html"], ["background-color"])) ||
    colorFromBackgroundShorthand(firstValue(buckets, ["body", "html"], ["background"])) ||
    null;

  const text =
    normalizeColor(firstValue(buckets, ["body", "html", "p"], ["color"])) || null;

  const accent =
    normalizeColor(firstValue(buckets, ["heading"], ["color"])) ||
    normalizeColor(firstValue(buckets, ["block"], ["color"])) ||
    null;

  const border =
    normalizeColor(firstValue(buckets, ["heading"], ["border-bottom-color", "border-color"])) ||
    colorFromBorderShorthand(firstValue(buckets, ["heading"], ["border-bottom", "border"])) ||
    null;

  const cardBg =
    normalizeColor(firstValue(buckets, ["blockquote"], ["background-color", "background"])) ||
    colorFromBackgroundShorthand(firstValue(buckets, ["blockquote"], ["background"])) ||
    null;

  // --- Drop cap / phân cảnh ----------------------------------------------
  const dropCaps = collected.hasFirstLetterRule || collected.hasDropCapClass || chapter.hooks.includes("drop-cap");
  const sceneDivider = collected.sceneDivider;

  // --- Độ tin cậy ---------------------------------------------------------
  const coreTokens = [
    fontFamily,
    fontSize,
    lineHeight,
    textAlign,
    firstLineIndent,
    text,
    bg,
    accent,
  ];
  const found = coreTokens.filter((token) => token !== null && token !== undefined).length;
  const confidence = sheets.length === 0 ? 0 : Math.round((found / coreTokens.length) * 100) / 100;

  // --- Mô tả cho UI -------------------------------------------------------
  const evidence: string[] = [];
  const sheetLabel = sheetCountLabel(sheets.length);
  if (sheetLabel) evidence.push(sheetLabel);
  if (fontFamily) evidence.push(`Font gốc: ${shortFontName(fontFamily)}`);
  if (fontSize) evidence.push(`Cỡ chữ ${fontSize}px`);
  if (lineHeight) evidence.push(`Giãn dòng ${lineHeight}`);
  if (textAlign) evidence.push(textAlign === "justify" ? "Canh đều hai bên" : "Canh trái");
  if (firstLineIndent) evidence.push(`Thụt đầu dòng ${firstLineIndent}`);
  if (text) evidence.push(`Màu chữ ${text}`);
  if (bg) evidence.push(`Màu nền ${bg}`);
  if (accent) evidence.push(`Màu tiêu đề ${accent}`);
  if (cardBg) evidence.push(`Nền trích dẫn ${cardBg}`);
  if (border) evidence.push(`Đường kẻ ${border}`);
  if (dropCaps) evidence.push("Sách có drop-cap");
  if (chapter.hooks.length > 0) evidence.push(`Hook: ${chapter.hooks.join(", ")}`);
  const usedClasses = [
    ...chapter.bodyClasses,
    ...chapter.paragraphClasses,
    ...chapter.headingClasses,
  ];
  if (usedClasses.length > 0) evidence.push(`Class gốc: ${usedClasses.join(", ")}`);

  return {
    fontFamily,
    fontSize,
    lineHeight,
    textAlign,
    firstLineIndent,
    colors: { bg, text, accent, border, cardBg },
    dropCaps,
    sceneDivider,
    confidence,
    evidence,
    stylesheetCount: sheets.length,
    chapterHooks: chapter.hooks,
  };
}

function sheetCountLabel(count: number): string | null {
  return count > 0 ? `${count} stylesheet gốc` : null;
}

/**
 * Dịch class gắn trên `<body>/<p>/<h*>` thành đích suy diễn tương ứng.
 *
 * Với sách Calibre, `body class="calibre"` giữ toàn bộ typography nền và mọi
 * đoạn văn dùng `.calibre_16`; nếu bỏ qua bước này thì CSS gốc trông như "rỗng".
 */
function buildClassTargets(chapter: ChapterHtmlAnalysis): ClassTarget[] {
  const usage = (className: string) => chapter.classUsage[className] ?? 1;
  return [
    ...chapter.bodyClasses.map((className) => ({ className, bucket: "body", usage: usage(className) })),
    ...chapter.paragraphClasses.map((className) => ({ className, bucket: "p", usage: usage(className) })),
    ...chapter.headingClasses.map((className) => ({ className, bucket: "heading", usage: usage(className) })),
  ];
}

/** "justify"/"left" là hai giá trị app hỗ trợ; canh giữa/phải để nguyên cho CSS gốc. */
function normalizeTextAlign(raw?: string | null): BookStyleSignature["textAlign"] {
  const value = (raw || "").toLowerCase();
  if (value.includes("justify")) return "justify";
  if (value.includes("left") || value.includes("start")) return "left";
  return null;
}

/** Rút gọn danh sách font để hiển thị trên chip UI. */
export function shortFontName(fontFamily: string): string {
  const first = fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
  return first || fontFamily.trim();
}

/** Font gốc có an toàn với dấu tiếng Việt hay không. */
const VIETNAMESE_SAFE_FONTS = [
  "literata",
  "lora",
  "merriweather",
  "inter",
  "be vietnam pro",
  "noto serif",
  "noto sans",
  "source serif",
  "ibm plex",
  "roboto",
  "segoe ui",
  "times new roman",
  "palatino",
  "open sans",
  "arial",
  "helvetica",
  "verdana",
  "tahoma",
];

const GENERIC_FAMILIES = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif)$/i;

export function isVietnameseSafeFont(fontFamily?: string | null): boolean {
  if (!fontFamily) return false;
  return fontFamily
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .some((f) => GENERIC_FAMILIES.test(f) || VIETNAMESE_SAFE_FONTS.some((safe) => f.toLowerCase().includes(safe)));
}

// ---------------------------------------------------------------------------
// Preset "theo sách hiện tại"
// ---------------------------------------------------------------------------

/**
 * Dựng preset từ signature. Token nào không đọc được sẽ lấy từ `fallback`
 * (preset đang dùng), nhưng `generateEpubCss` ở chế độ adaptive sẽ KHÔNG phát
 * ra khai báo màu nền/màu chữ nếu signature không khai báo chúng.
 */
export function buildNativePreset(
  signature: BookStyleSignature,
  fallback: StylePreset,
  isVietnamese = false
): StylePreset {
  const derivedFont = signature.fontFamily;
  const useFallbackFont = isVietnamese && !isVietnameseSafeFont(derivedFont);
  // Khi phải thay font gốc (không phủ dấu tiếng Việt), dùng luôn font Việt an toàn cho
  // cả hai trường để tránh trường hợp latin/VN lệch nhau.
  const safeFallbackFont = fallback.vietnameseFontFamily ?? fallback.fontFamily;
  const fontFamily = derivedFont && !useFallbackFont ? derivedFont : safeFallbackFont;
  const vietnameseFontFamily =
    derivedFont && !useFallbackFont ? derivedFont : safeFallbackFont;

  return {
    id: NATIVE_PRESET_ID,
    name: "Theo sách hiện tại",
    genre: "book-native",
    genreLabel: "Bản Gốc",
    description:
      signature.evidence.length > 0
        ? `Kế thừa định dạng gốc: ${signature.evidence.filter((e) => !e.endsWith("stylesheet gốc")).slice(0, 4).join(" · ")}`
        : "Chưa đọc được định dạng gốc của sách — đang dùng thông số an toàn.",
    fontFamily,
    vietnameseFontFamily,
    lineHeight: signature.lineHeight ?? fallback.lineHeight,
    firstLineIndent: signature.firstLineIndent ?? fallback.firstLineIndent,
    dropCaps: signature.dropCaps,
    sceneDivider: signature.sceneDivider ?? fallback.sceneDivider,
    colors: {
      bg: signature.colors.bg ?? fallback.colors.bg,
      text: signature.colors.text ?? fallback.colors.text,
      accent: signature.colors.accent ?? fallback.colors.accent,
      border: signature.colors.border ?? fallback.colors.border,
      cardBg: signature.colors.cardBg ?? fallback.colors.cardBg,
    },
    // CSS thủ công luôn rỗng: lớp phủ thích ứng do generateEpubCss sinh ra.
    cssTemplate: "",
    derivedFromBook: true,
  };
}

// ---------------------------------------------------------------------------
// CSS gốc dùng cho trình đọc thử
// ---------------------------------------------------------------------------

/**
 * CSS gốc của sách được nhúng vào iframe xem trước. Iframe không có base URL
 * của EPUB nên `url(...)` sẽ trỏ sai chỗ (thậm chí gọi ra mạng), vì vậy các
 * tham chiếu tài nguyên bị vô hiệu hoá trước khi nhúng.
 */
export function sanitizeCssForPreview(css: string): string {
  if (!css) return "";
  return stripCssComments(css)
    .replace(/@import[^;]*;/gi, "")
    .replace(/@charset[^;]*;/gi, "")
    .replace(/@namespace[^;]*;/gi, "")
    .replace(/@font-face\s*\{[^{}]*\}/gi, "")
    .replace(/url\(\s*(?:'[^']*'|"[^"]*"|[^)]*)\s*\)/gi, "none")
    .trim();
}

/** Ghép CSS gốc + lớp phủ thích ứng, theo đúng thứ tự cascade của file EPUB đã xuất. */
export function combinePreviewCss(rawBookCss: string | null | undefined, appCss: string): string {
  const base = sanitizeCssForPreview(rawBookCss || "");
  if (!base) return appCss;
  return `/* === CSS gốc của sách === */\n${base}\n\n/* === Lớp phủ thích ứng của NiceEbook === */\n${appCss}`;
}
