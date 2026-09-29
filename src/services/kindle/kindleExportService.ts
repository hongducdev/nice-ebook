import { injectWordWiseRuby, WordWiseOptions } from "./wordWiseService";
import { generateXRayAppendixHtml, XRayEntityItem } from "./xrayService";

/** Archive path of the generated appendix chapter, relative to the OPF directory. */
export const KINDLE_APPENDIX_HREF = "xray_appendix.xhtml";

/**
 * Elements that must never reach a Kindle build. Scripts and interactive widgets are unsupported
 * by the Kindle renderer and are the main source of conversion failures.
 */
const BLOCKED_ELEMENTS = new Set([
  "script",
  "noscript",
  "iframe",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "video",
  "audio",
  "canvas",
]);

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
  "track", "wbr",
]);

type Token =
  | { kind: "text"; raw: string }
  | { kind: "markup"; raw: string }
  | { kind: "tag"; raw: string };

/**
 * Splits markup into tags and text without regex-matching element bodies.
 *
 * Quoted attribute values are respected, so a `>` inside `alt="a > b"` cannot terminate a tag
 * early — the failure mode a naive regex sanitizer has.
 */
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const lt = html.indexOf("<", cursor);
    if (lt === -1) {
      tokens.push({ kind: "text", raw: html.slice(cursor) });
      break;
    }
    if (lt > cursor) {
      tokens.push({ kind: "text", raw: html.slice(cursor, lt) });
    }

    // Comments, CDATA, doctype and processing instructions are passed through untouched.
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      const stop = end === -1 ? html.length : end + 3;
      tokens.push({ kind: "markup", raw: html.slice(lt, stop) });
      cursor = stop;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const close = html.indexOf(">", lt);
      const stop = close === -1 ? html.length : close + 1;
      tokens.push({ kind: "markup", raw: html.slice(lt, stop) });
      cursor = stop;
      continue;
    }

    // Scan to the terminating ">", skipping over quoted attribute values.
    let i = lt + 1;
    let quote: string | null = null;
    while (i < html.length) {
      const ch = html[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      i++;
    }

    const stop = i >= html.length ? html.length : i + 1;
    tokens.push({ kind: "tag", raw: html.slice(lt, stop) });
    cursor = stop;
  }

  return tokens;
}

interface TagInfo {
  name: string;
  isClosing: boolean;
  isSelfClosing: boolean;
  /** Byte ranges of offending attributes, removed by splicing them out of the raw tag. */
  removableAttrSpans: { start: number; end: number }[];
  attributes: Record<string, string>;
  /**
   * Raw extents of each attribute, so a value can be rewritten or the whole attribute dropped.
   * Offsets are relative to the raw tag string.
   */
  attributeSpans: Record<
    string,
    { spanStart: number; spanEnd: number; valueStart: number; valueEnd: number; quoted: boolean }
  >;
}

/** Parses a single start/end tag. Returns null for anything that is not a well-formed tag. */
function parseTag(raw: string): TagInfo | null {
  if (!raw.startsWith("<")) return null;

  let i = 1;
  let isClosing = false;
  if (raw[i] === "/") {
    isClosing = true;
    i++;
  }

  const nameStart = i;
  while (i < raw.length && !/[\s/>]/.test(raw[i])) i++;
  const name = raw.slice(nameStart, i).toLowerCase();
  if (!name) return null;

  const attributes: Record<string, string> = {};
  const attributeSpans: TagInfo["attributeSpans"] = {};
  const removableAttrSpans: { start: number; end: number }[] = [];
  let isSelfClosing = false;

  while (i < raw.length) {
    // Skip whitespace between attributes.
    const wsStart = i;
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (i >= raw.length) break;

    if (raw[i] === "/" && raw[i + 1] === ">") {
      isSelfClosing = true;
      break;
    }
    if (raw[i] === ">") break;

    const attrNameStart = i;
    while (i < raw.length && !/[\s=/>]/.test(raw[i])) i++;
    const attrName = raw.slice(attrNameStart, i);
    if (!attrName) {
      // Unexpected character; skip it so the loop always makes progress.
      i++;
      continue;
    }

    // Optional "= value" part.
    let attrEnd = i;
    let value = "";
    let valueStart = i;
    let valueEnd = i;
    let quoted = false;
    const beforeEq = i;
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (raw[i] === "=") {
      i++;
      while (i < raw.length && /\s/.test(raw[i])) i++;
      if (raw[i] === '"' || raw[i] === "'") {
        const q = raw[i];
        i++;
        valueStart = i;
        while (i < raw.length && raw[i] !== q) i++;
        value = raw.slice(valueStart, i);
        valueEnd = i;
        quoted = true;
        if (i < raw.length) i++;
      } else {
        valueStart = i;
        while (i < raw.length && !/[\s>]/.test(raw[i])) i++;
        value = raw.slice(valueStart, i);
        valueEnd = i;
      }
      attrEnd = i;
    } else {
      // Attribute without a value (e.g. `disabled`); rewind to just after the name.
      i = beforeEq;
      valueStart = beforeEq;
      valueEnd = beforeEq;
    }

    const lowerAttr = attrName.toLowerCase();
    attributes[lowerAttr] = value;
    attributeSpans[lowerAttr] = {
      spanStart: wsStart,
      spanEnd: attrEnd,
      valueStart,
      valueEnd,
      quoted,
    };

    // Drop inline event handlers: they are dead weight in a Kindle build.
    if (/^on[a-z]+$/.test(lowerAttr)) {
      removableAttrSpans.push({ start: wsStart, end: attrEnd });
    }
  }

  return { name, isClosing, isSelfClosing, removableAttrSpans, attributes, attributeSpans };
}

function spliceOut(raw: string, spans: { start: number; end: number }[]): string {
  if (spans.length === 0) return raw;
  // Remove from the end so earlier offsets stay valid.
  const ordered = [...spans].sort((a, b) => b.start - a.start);
  let result = raw;
  for (const span of ordered) {
    result = result.slice(0, span.start) + result.slice(span.end);
  }
  return result;
}

/**
 * Removes remote stylesheet imports. `@import` is render-blocking: a Kindle conversion that keeps
 * a remote import will hang or drop all styling, so it is stripped rather than left to fail.
 */
export function stripRemoteImports(css: string): string {
  return css
    .replace(/@import\s+(?:url\(\s*)?["']?\s*https?:\/\/[^;]*;/gi, "")
    .replace(/@import\s+["']\s*\/\/[^;]*;/gi, "");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.trim().replace(/^#/, "");
  if (value.length === 3 && /^[0-9a-f]{3}$/i.test(value)) {
    return {
      r: parseInt(value[0] + value[0], 16),
      g: parseInt(value[1] + value[1], 16),
      b: parseInt(value[2] + value[2], 16),
    };
  }
  if (value.length === 6 && /^[0-9a-f]{6}$/i.test(value)) {
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }
  return null;
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** WCAG relative luminance. */
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio of a colour against the white page a Kindle reader actually renders on. */
export function contrastAgainstWhite(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 21;
  return 1.05 / (relativeLuminance(rgb) + 0.05);
}

/**
 * Darkens a colour until it is readable on a white page, preserving its hue where possible.
 *
 * Kindle reserves the page background, so a preset designed for a dark app UI (light text on a
 * dark page) would otherwise render as near-white text on white — an apparently blank page.
 */
export function ensureReadableOnWhite(hex: string, minRatio = 4.5): string {
  const start = hexToRgb(hex);
  if (!start) return hex;

  let { r, g, b } = start;
  for (let step = 0; step < 60; step++) {
    const current = { r, g, b };
    if (contrastAgainstWhite(toHex(current)) >= minRatio) {
      return toHex(current);
    }
    r *= 0.88;
    g *= 0.88;
    b *= 0.88;
  }

  // Fall back to a near-black neutral when a colour cannot reach the target (e.g. pure white).
  return "#111111";
}

/**
 * Makes a stylesheet safe for a Kindle reader.
 *
 * Three transformations, all required for the book to be legible on a light page:
 * 1. Remote `@import` is removed (render-blocking, and useless without a network).
 * 2. Every `background-color` / `background` declaration is removed: the reader owns the page
 *    background, and a surviving dark background would trap dark text in other rules
 *    (e.g. `blockquote`), producing invisible text.
 * 3. Every `color` declaration is darkened until it meets a 4.5:1 contrast ratio on white.
 */
export function sanitizeCssForKindle(css: string): string {
  // `@charset` is only valid as the very first bytes of a stylesheet. Once this sheet is inlined
  // into a KF8 flow it is no longer first, and an invalid at-rule can make a parser drop the sheet.
  const withoutCharset = stripRemoteImports(css).replace(/@charset\s+[^;]+;/gi, "");

  const withoutBackgrounds = withoutCharset.replace(
    /(^|[;{\s])background(?:-color)?\s*:\s*[^;}]+;?/gi,
    "$1"
  );

  return withoutBackgrounds.replace(
    /(^|[;{\s])color\s*:\s*([^;}]+?)\s*(;|})/gi,
    (_match, prefix: string, value: string, suffix: string) => {
      const trimmed = value.trim();
      // Only rewrite literal hex colours; leave `inherit`, named colours and functions alone.
      if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(trimmed)) {
        return `${prefix}color: ${trimmed}${suffix}`;
      }
      // Leave already-readable colours byte-identical; only fix what would be illegible.
      if (contrastAgainstWhite(trimmed) >= 4.5) {
        return `${prefix}color: ${trimmed}${suffix}`;
      }
      return `${prefix}color: ${ensureReadableOnWhite(trimmed)}${suffix}`;
    }
  );
}

/**
 * Rewrites chapter XHTML so it survives conversion to Kindle formats.
 *
 * Removes unsupported/interactive elements (keeping their content where it is meaningful drops),
 * strips inline event handlers and remote stylesheets, and leaves everything else byte-identical.
 */
export function sanitizeHtmlForKindle(html: string): string {
  const tokens = tokenize(html);
  const output: string[] = [];

  /** Depth of the blocked subtree currently being discarded. */
  let blockedDepth = 0;
  let blockedName = "";
  let styleDepth = 0;

  for (const token of tokens) {
    if (token.kind === "markup") {
      if (blockedDepth === 0) output.push(token.raw);
      continue;
    }

    if (token.kind === "text") {
      if (blockedDepth > 0) continue;
      output.push(styleDepth > 0 ? sanitizeCssForKindle(token.raw) : token.raw);
      continue;
    }

    const tag = parseTag(token.raw);
    if (!tag) {
      if (blockedDepth === 0) output.push(token.raw);
      continue;
    }

    // --- Inside a discarded subtree: only track nesting to find the matching close. ---
    if (blockedDepth > 0) {
      if (tag.name === blockedName) {
        if (tag.isClosing) {
          blockedDepth--;
          if (blockedDepth === 0) blockedName = "";
        } else if (!tag.isSelfClosing && !VOID_ELEMENTS.has(tag.name)) {
          blockedDepth++;
        }
      }
      continue;
    }

    if (BLOCKED_ELEMENTS.has(tag.name)) {
      if (tag.isClosing) continue; // Stray closing tag for an element we never emitted.
      if (!tag.isSelfClosing && !VOID_ELEMENTS.has(tag.name)) {
        blockedDepth = 1;
        blockedName = tag.name;
      }
      continue;
    }

    if (tag.name === "style") {
      if (tag.isClosing) {
        styleDepth = Math.max(0, styleDepth - 1);
      } else if (!tag.isSelfClosing) {
        styleDepth++;
      }
    }

    // Drop remote stylesheet links; keep local ones (relative paths are rewritten by the writer).
    if (!tag.isClosing && tag.name === "link") {
      const rel = (tag.attributes["rel"] || "").toLowerCase();
      const href = tag.attributes["href"] || "";
      if (rel.includes("stylesheet") && /^(https?:)?\/\//i.test(href)) {
        continue;
      }
    }

    output.push(tag.removableAttrSpans.length > 0 ? spliceOut(token.raw, tag.removableAttrSpans) : token.raw);
  }

  return output.join("");
}

export interface KindleEditionChapterSource {
  href: string;
  title: string;
  html: string;
}

/** Outcome of repairing internal links before a Kindle conversion. */
export interface InternalLinkFixReport {
  /** Links whose target document does not exist; the link was unwrapped to plain text. */
  removedDanglingLinks: number;
  /** Links kept, but with a fragment that points at a missing anchor removed. */
  strippedFragments: number;
  /** The distinct missing targets encountered, for surfacing to the user. */
  missingTargets: string[];
}

/** True for absolute URLs, protocol-relative URLs and non-http schemes we must not touch. */
function isExternalHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.startsWith("//")) return true;
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Collapses `.` and `..` segments in an already-split archive-relative path. */
function normalizeSegments(segments: string[]): string {
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}

function normalizeArchivePath(path: string): string {
  return normalizeSegments(decodePath(path).split("/"));
}

/** Resolves a relative reference against the document that contains it. */
function resolveTargetPath(currentDocPath: string, reference: string): string {
  if (reference.startsWith("/")) {
    return normalizeSegments(reference.split("/"));
  }
  const lastSlash = currentDocPath.lastIndexOf("/");
  const dir = lastSlash === -1 ? "" : currentDocPath.slice(0, lastSlash);
  const base = dir === "" ? [] : dir.split("/");
  return normalizeSegments([...base, ...reference.split("/")]);
}

/** Collects the anchor names a document defines, via `id` or legacy `<a name>`. */
function collectAnchors(html: string): Set<string> {
  const anchors = new Set<string>();
  for (const token of tokenize(html)) {
    if (token.kind !== "tag") continue;
    const tag = parseTag(token.raw);
    if (!tag || tag.isClosing) continue;
    const id = tag.attributes["id"];
    if (id) anchors.add(id);
    const name = tag.attributes["name"];
    if (name && tag.name === "a") anchors.add(name);
  }
  return anchors;
}

/**
 * Repairs internal links that the Kindle KF8 builder refuses to accept.
 *
 * The builder is strict: every internal link must resolve to a document it actually generated.
 * Books in the wild often link to documents that are absent from the spine (or missing entirely),
 * which aborts the whole conversion with
 * `internal link target does not resolve to a generated document`.
 *
 * Damaged links are unwrapped to plain text rather than deleted, so no readable content is lost.
 */
export function repairInternalLinks(
  chapters: KindleEditionChapterSource[]
): { chapters: KindleEditionChapterSource[]; report: InternalLinkFixReport } {
  const knownDocs = new Set(chapters.map((chapter) => normalizeArchivePath(chapter.href)));
  const anchorsByDoc = new Map<string, Set<string>>();
  for (const chapter of chapters) {
    anchorsByDoc.set(normalizeArchivePath(chapter.href), collectAnchors(chapter.html));
  }

  const report: InternalLinkFixReport = {
    removedDanglingLinks: 0,
    strippedFragments: 0,
    missingTargets: [],
  };
  const missing = new Set<string>();

  const repaired = chapters.map((chapter) => {
    const currentDoc = normalizeArchivePath(chapter.href);
    const currentAnchors = anchorsByDoc.get(currentDoc) ?? new Set<string>();

    const html = tokenize(chapter.html)
      .map((token) => {
        if (token.kind !== "tag") return token.raw;
        const tag = parseTag(token.raw);
        if (!tag || tag.isClosing) return token.raw;
        if (tag.name !== "a" && tag.name !== "area") return token.raw;

        const rawHref = tag.attributes["href"];
        if (rawHref === undefined || rawHref.trim() === "") return token.raw;
        if (isExternalHref(rawHref)) return token.raw;

        const hashIndex = rawHref.indexOf("#");
        const pathPart = hashIndex === -1 ? rawHref : rawHref.slice(0, hashIndex);
        const fragment = hashIndex === -1 ? "" : rawHref.slice(hashIndex + 1);

        const isSameDocument = pathPart.trim() === "";
        const targetDoc = isSameDocument
          ? currentDoc
          : resolveTargetPath(currentDoc, decodePath(pathPart));
        const targetAnchors = isSameDocument ? currentAnchors : anchorsByDoc.get(targetDoc);

        // Case 1: the linked document is not generated at all -> unwrap the link.
        if (!knownDocs.has(targetDoc)) {
          const span = tag.attributeSpans["href"];
          report.removedDanglingLinks++;
          missing.add(decodePath(rawHref));
          return token.raw.slice(0, span.spanStart) + token.raw.slice(span.spanEnd);
        }

        // Case 2: the document exists but the anchor does not -> keep the link, drop the fragment.
        if (fragment !== "" && targetAnchors && !targetAnchors.has(decodePath(fragment))) {
          const span = tag.attributeSpans["href"];
          report.strippedFragments++;
          if (pathPart.trim() === "") {
            // A same-document anchor that no longer exists has nothing left to point at.
            return token.raw.slice(0, span.spanStart) + token.raw.slice(span.spanEnd);
          }
          return (
            token.raw.slice(0, span.valueStart) +
            pathPart +
            token.raw.slice(span.valueEnd)
          );
        }

        return token.raw;
      })
      .join("");

    return { ...chapter, html };
  });

  report.missingTargets = Array.from(missing);
  return { chapters: repaired, report };
}

export interface KindleEditionOptions {
  /** Bake vocabulary glosses into the text as HTML5 `<ruby>` annotations. */
  applyWordWise?: boolean;
  wordWiseOptions?: WordWiseOptions;
  /** Append the character/term reference chapter to the book. */
  appendXRayAppendix?: boolean;
  xray?: {
    bookTitle: string;
    people: XRayEntityItem[];
    terms: XRayEntityItem[];
  } | null;
}

export interface KindleEditionResult {
  /** Replacement content for chapters that already exist in the archive. */
  chapterOverrides: Record<string, string>;
  /** Brand new chapter files that must be registered in the OPF manifest/spine. */
  extraChapters: Record<string, string>;
  wordWiseAnnotatedCount: number;
  wordWiseAnnotatedChapters: number;
  hasAppendix: boolean;
  /** What was changed to make the book acceptable to the KF8 builder. */
  linkReport: InternalLinkFixReport;
}

/**
 * Builds the chapter payload for a Kindle-targeted export.
 *
 * Pure and side-effect free: it never touches the store, so the caller decides what to persist.
 */
export function buildKindleEdition(
  chapters: KindleEditionChapterSource[],
  options: KindleEditionOptions = {}
): KindleEditionResult {
  const {
    applyWordWise = false,
    wordWiseOptions,
    appendXRayAppendix = false,
    xray = null,
  } = options;

  const chapterOverrides: Record<string, string> = {};
  const extraChapters: Record<string, string> = {};

  let wordWiseAnnotatedCount = 0;
  let wordWiseAnnotatedChapters = 0;

  // Repair internal links BEFORE anything else. The KF8 builder aborts the entire conversion when a
  // link points at a document it did not generate, so dangling links must be neutralised first.
  const { chapters: repairedChapters, report: linkReport } = repairInternalLinks(chapters);

  for (const chapter of repairedChapters) {
    let html = chapter.html;

    if (applyWordWise) {
      const result = injectWordWiseRuby(html, wordWiseOptions);
      html = result.html;
      if (result.annotatedCount > 0) {
        wordWiseAnnotatedCount += result.annotatedCount;
        wordWiseAnnotatedChapters++;
      }
    }

    chapterOverrides[chapter.href] = sanitizeHtmlForKindle(html);
  }

  let hasAppendix = false;
  if (appendXRayAppendix && xray) {
    const appendixHtml = generateXRayAppendixHtml({
      bookTitle: xray.bookTitle,
      people: xray.people,
      terms: xray.terms,
    });
    extraChapters[KINDLE_APPENDIX_HREF] = sanitizeHtmlForKindle(appendixHtml);
    hasAppendix = true;
  }

  return {
    chapterOverrides,
    extraChapters,
    wordWiseAnnotatedCount,
    wordWiseAnnotatedChapters,
    hasAppendix,
    linkReport,
  };
}

export interface KindleExportReadiness {
  canExportEpub: boolean;
  canExportAzw3: boolean;
  warnings: string[];
}

/**
 * Describes what the current book can actually produce, and states the honest limits of each path.
 *
 * Conversion to Kindle formats is performed by the in-app Rust core, so it has no external
 * prerequisite and is always available.
 */
export function describeKindleReadiness(input: {
  chapterCount: number;
  hasWordWise: boolean;
  hasXRayData: boolean;
}): KindleExportReadiness {
  const warnings: string[] = [];

  if (input.chapterCount === 0) {
    warnings.push("Sách chưa có chương nào để xuất.");
  }
  if (!input.hasWordWise) {
    warnings.push(
      "Chưa bật chú thích từ vựng: file Kindle sẽ không có gợi ý nghĩa từ trên đầu chữ."
    );
  }
  if (!input.hasXRayData) {
    warnings.push(
      "Chưa có dữ liệu nhân vật/thuật ngữ: phụ lục tra cứu kiểu X-Ray sẽ không được thêm vào."
    );
  }

  return {
    canExportEpub: input.chapterCount > 0,
    canExportAzw3: input.chapterCount > 0,
    warnings,
  };
}
