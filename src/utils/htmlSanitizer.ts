/**
 * Jev Guardrail - Canonical HTML Sanitizer & Tokenizer
 *
 * Single source of truth for HTML tokenization, structural tag parsing,
 * executable element filtering, and XSS sanitization.
 *
 * Used by `EpubReaderViewer.tsx` (Live Reader Preview).
 */

export const READER_BLOCKED_ELEMENTS: ReadonlySet<string> = new Set([
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
]);

export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
  "track", "wbr",
]);

export type Token =
  | { kind: "text"; raw: string }
  | { kind: "markup"; raw: string }
  | { kind: "tag"; raw: string };

/**
 * Splits markup into tags and text without regex-matching element bodies.
 * Quoted attribute values are respected, preventing angle bracket breakouts.
 */
export function tokenize(html: string): Token[] {
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

export interface TagInfo {
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
export function parseTag(raw: string): TagInfo | null {
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
      i++;
      continue;
    }

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
      i = beforeEq;
      valueStart = beforeEq;
      valueEnd = beforeEq;
    }

    const lowerAttr = attrName.toLowerCase();
    const lowerValue = value.toLowerCase().trim();
    attributes[lowerAttr] = value;
    attributeSpans[lowerAttr] = {
      spanStart: wsStart,
      spanEnd: attrEnd,
      valueStart,
      valueEnd,
      quoted,
    };

    // Drop inline event handlers (onload, onerror, onclick, etc.)
    if (/^on[a-z]+$/i.test(lowerAttr)) {
      removableAttrSpans.push({ start: wsStart, end: attrEnd });
    } else if (
      (lowerAttr === "href" || lowerAttr === "src" || lowerAttr === "action") &&
      /^(?:javascript|vbscript|data:text\/html)\s*:/i.test(lowerValue)
    ) {
      // Drop dangerous URI schemes
      removableAttrSpans.push({ start: wsStart, end: attrEnd });
    }
  }

  return { name, isClosing, isSelfClosing, removableAttrSpans, attributes, attributeSpans };
}

export function spliceOut(raw: string, spans: { start: number; end: number }[]): string {
  if (spans.length === 0) return raw;
  const ordered = [...spans].sort((a, b) => b.start - a.start);
  let result = raw;
  for (const span of ordered) {
    result = result.slice(0, span.start) + result.slice(span.end);
  }
  return result;
}

/**
 * Sanitizes chapter XHTML string for live preview and generic EPUB reading.
 * Strips executable tags (<script>, <iframe>, <object>, etc.), inline event handlers,
 * and dangerous URI schemes. Leaves CSS styles and colors intact (faithful to the book).
 */
export function sanitizeEpubHtml(html: string): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  const tokens = tokenize(html);
  const output: string[] = [];

  let blockedDepth = 0;
  let blockedName = "";

  for (const token of tokens) {
    if (token.kind === "markup") {
      if (blockedDepth === 0) output.push(token.raw);
      continue;
    }

    if (token.kind === "text") {
      if (blockedDepth > 0) continue;
      output.push(token.raw);
      continue;
    }

    const tag = parseTag(token.raw);
    if (!tag) {
      if (blockedDepth === 0) output.push(token.raw);
      continue;
    }

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

    if (READER_BLOCKED_ELEMENTS.has(tag.name)) {
      if (!tag.isSelfClosing && !VOID_ELEMENTS.has(tag.name)) {
        blockedDepth = 1;
        blockedName = tag.name;
      }
      continue;
    }

    // Drop remote stylesheet links
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
