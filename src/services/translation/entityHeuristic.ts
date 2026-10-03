/**
 * Pure heuristic entity scanner used by the translation pipeline
 * (`EntityExtractor.extractCandidates`).
 *
 * It previously lived in a removed packaging module; the glossary entity research
 * still needs this scanner, so the code moved here with neutral naming.
 * Behaviour is unchanged.
 */

export interface EntityExcerpt {
  chapterHref: string;
  chapterTitle: string;
  snippet: string;
  startOffset?: number;
}

export interface EntityCandidate {
  id: number;
  name: string;
  aliases: string[];
  type: "person" | "term";
  role?: string;
  description: string;
  occurrencesCount: number;
  excerpts: EntityExcerpt[];
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
export function extractEntityCandidates(
  chapters: ChapterTextSource[],
  maxEntities = 30
): { people: EntityCandidate[]; terms: EntityCandidate[] } {
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
  const people: EntityCandidate[] = [];
  const terms: EntityCandidate[] = [];

  for (const [name, data] of sorted) {
    const isPerson = resolveEntityType(name, data.isPersonHeuristic);

    const role = isPerson ? "Nhân vật xuất hiện thường xuyên" : "Địa danh / Khái niệm";
    const description = isPerson 
      ? `Nhân vật xuất hiện xuyên suốt tác phẩm (tần suất ghi nhận: ${data.count} lần).`
      : `Địa danh hoặc khái niệm đáng chú ý trong tác phẩm.`;

    const entity: EntityCandidate = {
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
  entities: EntityCandidate[],
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
