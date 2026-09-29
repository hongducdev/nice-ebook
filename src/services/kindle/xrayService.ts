export interface XRayExcerpt {
  chapterHref: string;
  chapterTitle: string;
  snippet: string;
  startOffset?: number;
}

export interface XRayEntityItem {
  id: number;
  name: string;
  aliases: string[];
  type: "person" | "term";
  role?: string;
  description: string;
  occurrencesCount: number;
  excerpts: XRayExcerpt[];
}

export interface XRayBookData {
  bookTitle: string;
  asin: string;
  people: XRayEntityItem[];
  terms: XRayEntityItem[];
  totalOccurrences: number;
}

export interface ChapterTextSource {
  href: string;
  title: string;
  html: string;
}

interface CandidateData {
  count: number;
  isPersonHeuristic: boolean;
}

// Common words that start sentences with capitals but are not names
const COMMON_STOP_WORDS = new Set([
  "The", "A", "An", "And", "But", "Or", "Nor", "For", "Yet", "So",
  "In", "On", "At", "To", "From", "With", "By", "About", "Against",
  "Between", "Into", "Through", "During", "Before", "After", "Above",
  "Below", "Under", "There", "Here", "Where", "When", "Why", "How",
  "All", "Any", "Both", "Each", "Few", "More", "Most", "Other",
  "Some", "Such", "No", "Not", "Only", "Own", "Same", "Than", "Too",
  "Very", "Can", "Will", "Just", "Should", "Now", "Then", "This",
  "That", "These", "Those", "It", "Its", "He", "His", "Him", "She",
  "Her", "Hers", "They", "Them", "Their", "We", "Us", "Our", "You",
  "Your", "What", "Who", "Which", "One", "Two", "First", "Once",
  "Chapter", "Book", "Part", "Section"
]);

// Static honorific titles regex indicating a person's name follows
const HONORIFICS_REGEX = /\b(?:Mr\.|Mrs\.|Miss|Ms\.|Dr\.|Prof\.|Professor|Sir|Lady|Lord|Count|Countess|Duke|Duchess|King|Queen|Prince|Princess|Captain|Major|Colonel|General|Inspector|Detective|Father|Brother|Sister|Ông|Bà|Anh|Chị|Cô|Chú|Bác|Thám tử|Giáo sư|Đại úy)\s+([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+)?)/g;

// Dialogue attribution verbs: e.g. "said Holmes", "asked Alice"
const DIALOGUE_ATTRIBUTION_REGEX = /\b(?:said|asked|replied|whispered|cried|shouted|murmured|muttered|answered|laughed)\s+([A-ZÀ-Ỹ][a-zà-ỹ]+)/g;

// Capitalized multi-word phrase regex
const PHRASE_REGEX = /\b([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+))\b/g;

// Location indicator words
const LOCATION_INDICATOR_REGEX = /\b(?:Street|Road|Avenue|Lane|Square|Park|Palace|Castle|Tower|River|Lake|Sea|Ocean|Forest|Mountain|City|Town|Village|Hospital|Hotel|Church|Temple|Kingdom|Empire|Guild|House|Room|Hall)\b/i;

function scanHonorificCandidates(text: string, map: Map<string, CandidateData>): void {
  let match: RegExpExecArray | null;
  while ((match = HONORIFICS_REGEX.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 2 && !COMMON_STOP_WORDS.has(name)) {
      const existing = map.get(name) || { count: 0, isPersonHeuristic: true };
      existing.count += 3;
      existing.isPersonHeuristic = true;
      map.set(name, existing);
    }
  }
}

function scanDialogueCandidates(text: string, map: Map<string, CandidateData>): void {
  let match: RegExpExecArray | null;
  while ((match = DIALOGUE_ATTRIBUTION_REGEX.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 2 && !COMMON_STOP_WORDS.has(name)) {
      const existing = map.get(name) || { count: 0, isPersonHeuristic: true };
      existing.count += 3;
      existing.isPersonHeuristic = true;
      map.set(name, existing);
    }
  }
}

function scanPhraseCandidates(text: string, map: Map<string, CandidateData>): void {
  let match: RegExpExecArray | null;
  while ((match = PHRASE_REGEX.exec(text)) !== null) {
    const phrase = match[1].trim();
    const firstWord = phrase.split(/\s+/)[0];
    if (!COMMON_STOP_WORDS.has(firstWord) && phrase.length > 3) {
      const existing = map.get(phrase) || { count: 0, isPersonHeuristic: false };
      existing.count += 1;
      map.set(phrase, existing);
    }
  }
}

function resolveEntityType(name: string, isPersonHeuristic: boolean): boolean {
  if (isPersonHeuristic) return true;
  if (LOCATION_INDICATOR_REGEX.test(name)) return false;
  return name.split(/\s+/).length <= 2;
}

/**
 * Heuristically extracts recurring characters and terms from book chapters without requiring an external AI API.
 */
export function extractXRayHeuristic(
  chapters: ChapterTextSource[],
  maxEntities = 30
): { people: XRayEntityItem[]; terms: XRayEntityItem[] } {
  const candidateMap = new Map<string, CandidateData>();

  for (const ch of chapters) {
    const text = ch.html.replace(/<[^>]+>/g, " ");
    scanHonorificCandidates(text, candidateMap);
    scanDialogueCandidates(text, candidateMap);
    scanPhraseCandidates(text, candidateMap);
  }

  const sorted = Array.from(candidateMap.entries())
    .filter(([, data]) => data.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, maxEntities);

  let nextId = 1;
  const people: XRayEntityItem[] = [];
  const terms: XRayEntityItem[] = [];

  for (const [name, data] of sorted) {
    const isPerson = resolveEntityType(name, data.isPersonHeuristic);

    const role = isPerson ? "Nhân vật xuất hiện thường xuyên" : "Địa danh / Khái niệm";
    const description = isPerson 
      ? `Nhân vật xuất hiện xuyên suốt tác phẩm (tần suất ghi nhận: ${data.count} lần).`
      : `Địa danh hoặc khái niệm đáng chú ý trong tác phẩm.`;

    const entity: XRayEntityItem = {
      id: nextId++,
      name,
      aliases: [],
      type: isPerson ? "person" : "term",
      role,
      description,
      occurrencesCount: 0,
      excerpts: [],
    };

    if (isPerson) {
      people.push(entity);
    } else {
      terms.push(entity);
    }
  }

  mapEntityOccurrences(people.concat(terms), chapters);

  return { people, terms };
}

/**
 * Searches and maps exact occurrences and context excerpts for a given list of entities across chapters.
 */
export function mapEntityOccurrences(
  entities: XRayEntityItem[],
  chapters: ChapterTextSource[],
  maxExcerptsPerEntity = 4
): void {
  for (const entity of entities) {
    entity.occurrencesCount = 0;
    entity.excerpts = [];

    const namesToSearch = [entity.name, ...(entity.aliases || [])].filter(Boolean);
    const escapedNames = namesToSearch.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (escapedNames.length === 0) continue;

    const regex = new RegExp(`\\b(?:${escapedNames.join("|")})\\b`, "gi");

    for (const ch of chapters) {
      const cleanText = ch.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      let match: RegExpExecArray | null;

      while ((match = regex.exec(cleanText)) !== null) {
        entity.occurrencesCount++;

        if (entity.excerpts.length < maxExcerptsPerEntity) {
          const matchIndex = match.index;
          const snippetStart = Math.max(0, matchIndex - 60);
          const snippetEnd = Math.min(cleanText.length, matchIndex + match[0].length + 60);
          
          let snippet = cleanText.slice(snippetStart, snippetEnd).trim();
          if (snippetStart > 0) snippet = "..." + snippet;
          if (snippetEnd < cleanText.length) snippet = snippet + "...";

          entity.excerpts.push({
            chapterHref: ch.href,
            chapterTitle: ch.title,
            snippet,
            startOffset: matchIndex,
          });
        }
      }
    }
  }
}

function renderPersonCard(p: XRayEntityItem): string {
  const initials = p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const aliasBadges = p.aliases && p.aliases.length > 0
    ? `<div class="xray-card__aliases">Tên gọi khác: ${p.aliases.map((a) => `<span class="xray-badge">${a}</span>`).join(" ")}</div>`
    : "";

  let excerptList = "";
  if (p.excerpts && p.excerpts.length > 0) {
    const listItems = p.excerpts
      .map((ex) => `<li><span class="xray-excerpt__chapter">${ex.chapterTitle}:</span> <em>"${ex.snippet}"</em></li>`)
      .join("\n");
    excerptList = `<div class="xray-card__excerpts"><strong>Trích đoạn tiêu biểu:</strong><ul>${listItems}</ul></div>`;
  }

  const roleHtml = p.role ? `<div class="xray-card__role">${p.role}</div>` : "";

  return `
    <div class="xray-card" id="xray-person-${p.id}">
      <div class="xray-card__header">
        <div class="xray-card__avatar">${initials}</div>
        <div class="xray-card__titles">
          <h3 class="xray-card__name">${p.name}</h3>
          ${roleHtml}
        </div>
        <div class="xray-card__meta">${p.occurrencesCount} lần xuất hiện</div>
      </div>
      ${aliasBadges}
      <div class="xray-card__description">${p.description}</div>
      ${excerptList}
    </div>
  `;
}

function renderTermItem(t: XRayEntityItem): string {
  const roleBadge = t.role ? `<span class="xray-badge">${t.role}</span>` : "";
  return `
    <div class="xray-term-item" id="xray-term-${t.id}">
      <dt class="xray-term-title">
        <strong>${t.name}</strong>
        ${roleBadge}
        <span class="xray-card__meta">(${t.occurrencesCount} lần)</span>
      </dt>
      <dd class="xray-term-desc">${t.description}</dd>
    </div>
  `;
}

/**
 * Generates a clean, beautifully formatted EPUB appendix XHTML document:
 * "Dramatis Personae & World Guide" containing character cards, roles, aliases, and term definitions.
 */
export function generateXRayAppendixHtml(xray: {
  bookTitle: string;
  people: XRayEntityItem[];
  terms: XRayEntityItem[];
}): string {
  const { bookTitle, people, terms } = xray;

  const peopleHtml = people.length === 0 
    ? "<p><i>Chưa có dữ liệu nhân vật.</i></p>"
    : people.map(renderPersonCard).join("\n");

  const termsHtml = terms.length === 0
    ? "<p><i>Chưa có dữ liệu thuật ngữ.</i></p>"
    : terms.map(renderTermItem).join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi">
<head>
  <meta charset="utf-8" />
  <title>X-Ray: Nhân vật &amp; Bối cảnh - ${bookTitle}</title>
  <style type="text/css">
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      line-height: 1.6;
      padding: 2rem 2.5rem;
      color: #25272c;
      background-color: #fbfcfd;
    }
    .xray-header {
      text-align: center;
      margin-bottom: 2.5rem;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 1.5rem;
    }
    .xray-header h1 {
      font-size: 2rem;
      margin-bottom: 0.3rem;
      color: #ad5a17;
    }
    .xray-header p {
      font-size: 0.95rem;
      color: #6b7280;
      margin: 0;
    }
    .xray-section-title {
      font-size: 1.4rem;
      color: #ad5a17;
      border-bottom: 1px solid #d1d5db;
      padding-bottom: 0.4rem;
      margin-top: 2rem;
      margin-bottom: 1.2rem;
    }
    .xray-card {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 1.2rem;
      margin-bottom: 1.2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .xray-card__header {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      margin-bottom: 0.6rem;
    }
    .xray-card__avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #ad5a17;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 1rem;
      flex-shrink: 0;
    }
    .xray-card__titles {
      flex: 1;
    }
    .xray-card__name {
      margin: 0;
      font-size: 1.15rem;
      color: #111827;
    }
    .xray-card__role {
      font-size: 0.85rem;
      color: #6b7280;
      font-weight: 500;
    }
    .xray-card__meta {
      font-size: 0.8rem;
      color: #9ca3af;
      font-family: monospace;
    }
    .xray-badge {
      display: inline-block;
      font-size: 0.75rem;
      background: #f3f4f6;
      color: #374151;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #e5e7eb;
      margin-right: 4px;
    }
    .xray-card__aliases {
      font-size: 0.85rem;
      color: #4b5563;
      margin-bottom: 0.6rem;
    }
    .xray-card__description {
      font-size: 0.95rem;
      color: #374151;
      margin-bottom: 0.8rem;
    }
    .xray-card__excerpts {
      background: #f9fafb;
      border-left: 3px solid #ad5a17;
      padding: 0.6rem 0.8rem;
      border-radius: 0 4px 4px 0;
      font-size: 0.88rem;
    }
    .xray-card__excerpts ul {
      margin: 0.4rem 0 0 0;
      padding-left: 1.2rem;
    }
    .xray-card__excerpts li {
      margin-bottom: 0.4rem;
    }
    .xray-excerpt__chapter {
      font-weight: 600;
      color: #4b5563;
    }
    .xray-term-item {
      margin-bottom: 1.2rem;
      padding-bottom: 0.8rem;
      border-bottom: 1px dashed #e5e7eb;
    }
    .xray-term-title {
      font-size: 1.05rem;
      color: #111827;
      margin-bottom: 0.3rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .xray-term-desc {
      margin-left: 0;
      font-size: 0.92rem;
      color: #4b5563;
    }
  </style>
</head>
<body>
  <div class="xray-header">
    <h1>Dramatis Personae &amp; World Guide</h1>
    <p>Bách khoa toàn thư nhân vật và thuật ngữ tác phẩm "${bookTitle}"</p>
  </div>

  <h2 class="xray-section-title">Nhân Vật (People &amp; Characters)</h2>
  <div class="xray-people-list">
    ${peopleHtml}
  </div>

  <h2 class="xray-section-title">Địa Danh &amp; Thuật Ngữ (Terms &amp; Lore)</h2>
  <dl class="xray-terms-list">
    ${termsHtml}
  </dl>
</body>
</html>`;
}
