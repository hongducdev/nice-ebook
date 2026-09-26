/**
 * NiceEbook Studio - OCR Post-Processor
 * Cleans scanning artifacts, fixes Vietnamese diacritic OCR glitches,
 * normalizes whitespace and punctuation, and merges broken lines.
 */

import { dehyphenateAndMergeLines } from "./textCleaner";

export function cleanOcrText(rawText: string): string {
  if (!rawText) return "";

  let text = rawText;

  // 1. Normalize line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Remove common scanner speckles and solitary artifact lines
  text = text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      // Remove lines that are just random isolated symbols (e.g. "|", "_", "~", ".", "..", "---", ";")
      if (/^[|_\-~.`'"^;:*•·]{1,3}$/.test(trimmed)) {
        return "";
      }
      return line;
    })
    .join('\n');

  // 3. Fix disconnected Vietnamese accents caused by optical recognition gaps
  // Acute (sắc)
  text = text.replace(/([aAeEoOuUiIyY])\s*[''´`]\s*/g, (match, char) => {
    const map: Record<string, string> = {
      a: 'á', A: 'Á',
      e: 'é', E: 'É',
      o: 'ó', O: 'Ó',
      u: 'ú', U: 'Ú',
      i: 'í', I: 'Í',
      y: 'ý', Y: 'Ý',
    };
    return map[char] || match;
  });

  // Tilde (ngã)
  text = text.replace(/([aAeEoOuUiIyY])\s*~\s*/g, (match, char) => {
    const map: Record<string, string> = {
      a: 'ã', A: 'Ã',
      e: 'ẽ', E: 'Ẽ',
      o: 'õ', O: 'Õ',
      u: 'ũ', U: 'Ũ',
      i: 'ĩ', I: 'Ĩ',
      y: 'ỹ', Y: 'Ỹ',
    };
    return map[char] || match;
  });

  // Circumflex (mũ)
  text = text.replace(/([aAeEoO])\s*\^\s*/g, (match, char) => {
    const map: Record<string, string> = {
      a: 'â', A: 'Â',
      e: 'ê', E: 'Ê',
      o: 'ô', O: 'Ô',
    };
    return map[char] || match;
  });

  // Horn (móc)
  text = text.replace(/([oOuU])\s*[\+\*]\s*/g, (match, char) => {
    const map: Record<string, string> = {
      o: 'ơ', O: 'Ơ',
      u: 'ư', U: 'Ư',
    };
    return map[char] || match;
  });

  // 4. Fix common OCR character swaps in Vietnamese words (e.g. 0 -> o, 1 -> l)
  text = text.replace(/\b([a-zA-Zà-ỹÀ-Ỹ]+)0([a-zA-Zà-ỹÀ-Ỹ]*)\b/g, '$1o$2');
  text = text.replace(/\b0([a-zA-Zà-ỹÀ-Ỹ]+)\b/g, 'o$1');

  // 5. Normalize multiple consecutive spaces within a line
  text = text.replace(/[ \t]{2,}/g, ' ');

  // 6. Normalize quotes
  text = text.replace(/[""]/g, '"').replace(/['']/g, "'");

  // 7. De-hyphenate and merge soft line wraps
  return dehyphenateAndMergeLines(text);
}
