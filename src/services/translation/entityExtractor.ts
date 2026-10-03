import { invoke } from "@tauri-apps/api/core";
import { extractEntityCandidates, ChapterTextSource } from "./entityHeuristic";

export interface ExtractedEntityCandidate {
  id: string;
  name: string;
  count: number;
  category: "person" | "place" | "term";
  suggestedTranslation: string;
  isExistingInGlossary: boolean;
}

export interface ProposeEntityOptions {
  bookTitle?: string;
  author?: string;
  sourceLang: string;
  targetLang: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  maxCandidates?: number;
}

export class EntityExtractor {
  /**
   * Scans chapters using the pure heuristic engine (honorific, dialogue, and phrase scanners)
   * plus CJK compound extraction if Chinese/Japanese characters are present.
   */
  public static extractCandidates(
    chapters: ChapterTextSource[],
    existingGlossary: Record<string, string> = {},
    maxCandidates = 25
  ): ExtractedEntityCandidate[] {
    const { people, terms } = extractEntityCandidates(chapters, maxCandidates * 2);

    const candidateMap = new Map<string, ExtractedEntityCandidate>();

    // Add people from the heuristic scanner
    for (const p of people) {
      const cleanName = p.name.trim();
      if (cleanName.length < 2) continue;
      const lowerKey = cleanName.toLowerCase();
      const existingTrans = existingGlossary[cleanName] || existingGlossary[lowerKey];
      const isPlace = /castle|palace|mountain|river|street|road|drive|avenue|lane|city|town|kingdom|empire/i.test(cleanName);

      candidateMap.set(lowerKey, {
        id: `ent_${cleanName}`,
        name: cleanName,
        count: p.occurrencesCount,
        category: isPlace ? "place" : "person",
        suggestedTranslation: existingTrans || cleanName,
        isExistingInGlossary: Boolean(existingTrans),
      });
    }

    // Add terms / locations from the heuristic scanner
    for (const t of terms) {
      const cleanTerm = t.name.trim();
      if (cleanTerm.length < 2) continue;
      const lowerKey = cleanTerm.toLowerCase();
      if (candidateMap.has(lowerKey)) continue;

      const existingTrans = existingGlossary[cleanTerm] || existingGlossary[lowerKey];
      const isPlace = /castle|palace|mountain|river|street|city|town|kingdom|empire|drive|avenue/i.test(cleanTerm);

      candidateMap.set(lowerKey, {
        id: `ent_${cleanTerm}`,
        name: cleanTerm,
        count: t.occurrencesCount,
        category: isPlace ? "place" : "term",
        suggestedTranslation: existingTrans || cleanTerm,
        isExistingInGlossary: Boolean(existingTrans),
      });
    }

    // Additional CJK compound scanning (for Wuxia/Light Novel recurring terms and names)
    for (const ch of chapters) {
      const cleanText = ch.html.replace(/<[^>]+>/g, " ");
      const cjkMatches = cleanText.match(/[\u4E00-\u9FFF]{2,4}/g);
      if (cjkMatches) {
        const freq: Record<string, number> = {};
        for (const m of cjkMatches) {
          freq[m] = (freq[m] || 0) + 1;
        }
        for (const [term, cnt] of Object.entries(freq)) {
          // Recurring >= 2 times, or single occurrence if matching key Wuxia/Xianxia titles/sects
          const isKeyTerm = /(?:宗|门|殿|阁|谷|城|帝|皇|王|仙|魔|剑|刀|丹|圣|尊|堂|堡|庄|帮|派)$/.test(term);
          if ((cnt >= 2 || isKeyTerm) && !candidateMap.has(term.toLowerCase())) {
            const existingTrans = existingGlossary[term];
            const isPlaceOrOrg = /(?:宗|门|殿|阁|谷|城|堂|堡|庄|帮|派)$/.test(term);
            candidateMap.set(term.toLowerCase(), {
              id: `ent_${term}`,
              name: term,
              count: cnt,
              category: isPlaceOrOrg ? "place" : "term",
              suggestedTranslation: existingTrans || term,
              isExistingInGlossary: Boolean(existingTrans),
            });
          }
        }
      }
    }

    // Sort by occurrence count descending and take top N
    return Array.from(candidateMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, maxCandidates);
  }

  /**
   * Directly asks AI to extract prominent character names, locations, and special terms
   * from an excerpt/sample of the book. Essential for non-English works or novels where
   * regex-based heuristic extraction might miss nuanced single-word or CJK names.
   */
  public static async extractDirectWithAi(
    sampleText: string,
    options: ProposeEntityOptions
  ): Promise<ExtractedEntityCandidate[]> {
    const {
      bookTitle,
      author,
      sourceLang,
      targetLang,
      baseUrl,
      apiKey,
      model,
      maxCandidates = 20,
    } = options;

    if (!sampleText || sampleText.trim().length === 0) {
      return [];
    }

    const boundedSample = sampleText.slice(0, 3500);

    const systemPrompt = `Bạn là chuyên gia thẩm định và dịch thuật sách từ ${sourceLang} sang ${targetLang}.
Nhiệm vụ: Trích xuất danh sách các nhân vật chính, địa danh và thuật ngữ quan trọng nhất từ đoạn trích của tác phẩm "${bookTitle || "Sách"}"${author ? ` (tác giả: ${author})` : ""}.
Đề xuất bản dịch / phiên âm Hán-Việt hoặc tên chuẩn sang ${targetLang}.

BẮT BUỘC TRẢ VỀ DUY NHẤT MẢNG JSON CÓ ĐỊNH DẠNG:
[
  { "name": "<tên gốc trong tác phẩm>", "translated": "<tên dịch sang ${targetLang}>", "category": "person" | "place" | "term" }
]
Tối đa ${maxCandidates} mục quan trọng nhất. Tuyệt đối không thêm lời chào, giải thích hoặc markdown.`;

    try {
      const rawOutput = await invoke<string>("call_ai_completion", {
        options: {
          base_url: baseUrl,
          api_key: apiKey,
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Đoạn trích mở đầu tác phẩm:\n${boundedSample}` },
          ],
          temperature: 0.2,
          timeout_secs: 35,
        },
      });

      let clean = rawOutput.trim();
      if (clean.startsWith("```json")) clean = clean.slice(7);
      if (clean.startsWith("```")) clean = clean.slice(3);
      if (clean.endsWith("```")) clean = clean.slice(0, -3);
      clean = clean.trim();

      const firstBracket = clean.indexOf("[");
      const lastBracket = clean.lastIndexOf("]");
      if (firstBracket !== -1 && lastBracket !== -1) {
        clean = clean.slice(firstBracket, lastBracket + 1);
      }

      const parsed: Array<{ name: string; translated: string; category?: string }> = JSON.parse(clean);
      const candidates: ExtractedEntityCandidate[] = [];

      for (const item of parsed) {
        if (item && item.name && item.translated) {
          const cleanName = item.name.trim();
          const cleanTrans = item.translated.trim();
          const validCat = item.category === "person" || item.category === "place" || item.category === "term"
            ? item.category
            : "term";
          if (cleanName.length > 0 && cleanTrans.length > 0) {
            candidates.push({
              id: `ai_${cleanName}`,
              name: cleanName,
              count: 1,
              category: validCat,
              suggestedTranslation: cleanTrans,
              isExistingInGlossary: false,
            });
          }
        }
      }

      return candidates;
    } catch (err) {
      console.warn("Direct AI entity extraction failed:", err);
      return [];
    }
  }

  /**
   * Prompts the AI Gateway to propose standard Vietnamese / Hán-Việt conventions
   * for the extracted candidates. Degrades gracefully if AI is unavailable.
   */
  public static async proposeTranslationsWithAi(
    candidates: ExtractedEntityCandidate[],
    options: ProposeEntityOptions
  ): Promise<ExtractedEntityCandidate[]> {
    const {
      bookTitle,
      author,
      sourceLang,
      targetLang,
      baseUrl,
      apiKey,
      model,
    } = options;

    if (candidates.length === 0) {
      return [];
    }

    // Filter out items that already have a user-defined glossary entry to save tokens
    const needsTranslation = candidates.filter((c) => !c.isExistingInGlossary);
    if (needsTranslation.length === 0) {
      return candidates;
    }

    const systemPrompt = `Bạn là một chuyên gia nghiên cứu văn học và dịch thuật sách từ ${sourceLang} sang ${targetLang}.
Nhiệm vụ của bạn là xem xét danh sách các tên nhân vật, địa danh và thuật ngữ được trích xuất từ tác phẩm "${bookTitle || "Sách"}"${author ? ` của tác giả ${author}` : ""}.
Hãy đề xuất bản dịch hoặc phiên âm Hán-Việt / danh xưng chuẩn mực nhất trong tiếng Việt (nếu tác phẩm đã có bản dịch chính thức được phát hành rộng rãi tại Việt Nam, hãy ưu tiên dùng bản dịch chuẩn đó).

BẮT BUỘC TRẢ VỀ DUY NHẤT MẢNG JSON CÓ CẤU TRÚC:
[
  { "name": "<tên gốc>", "translated": "<bản dịch tiếng Việt đề xuất>", "category": "person" | "place" | "term" }
]
Không bọc trong markdown và không thêm bất kỳ lời dẫn nào.`;

    const userPrompt = `Đề xuất bản dịch cho các thực thể sau:\n` +
      JSON.stringify(needsTranslation.map((c) => ({ name: c.name, category: c.category })), null, 2);

    try {
      const rawOutput = await invoke<string>("call_ai_completion", {
        options: {
          base_url: baseUrl,
          api_key: apiKey,
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          timeout_secs: 35,
        },
      });

      // Parse JSON
      let clean = rawOutput.trim();
      if (clean.startsWith("```json")) clean = clean.slice(7);
      if (clean.startsWith("```")) clean = clean.slice(3);
      if (clean.endsWith("```")) clean = clean.slice(0, -3);
      clean = clean.trim();

      const firstBracket = clean.indexOf("[");
      const lastBracket = clean.lastIndexOf("]");
      if (firstBracket !== -1 && lastBracket !== -1) {
        clean = clean.slice(firstBracket, lastBracket + 1);
      }

      const parsed: Array<{ name: string; translated: string; category?: string }> = JSON.parse(clean);
      const resultMap = new Map<string, { translated: string; category?: string }>();
      for (const item of parsed) {
        if (item && item.name && item.translated) {
          resultMap.set(item.name.toLowerCase().trim(), {
            translated: item.translated.trim(),
            category: item.category,
          });
        }
      }

      // Merge results with candidate list (respecting deterministic conflict policy)
      return candidates.map((c) => {
        if (c.isExistingInGlossary) {
          return c; // Existing user glossary entry always wins!
        }
        const aiHit = resultMap.get(c.name.toLowerCase().trim());
        if (aiHit && aiHit.translated) {
          return {
            ...c,
            suggestedTranslation: aiHit.translated,
            category: (aiHit.category as any) || c.category,
          };
        }
        return c;
      });
    } catch (err) {
      console.warn("AI entity proposal failed or offline, degrading gracefully to raw names:", err);
      // Graceful degradation: return candidates with original names
      return candidates;
    }
  }

  /**
   * Deterministic merge helper: Merges user-approved entities into the current glossary.
   * Existing user terms that are not in the approved list are preserved 100%.
   */
  public static mergeApprovedEntitiesIntoGlossary(
    currentGlossary: Record<string, string>,
    approvedEntities: Array<{ name: string; translation: string }>
  ): Record<string, string> {
    const updated = { ...currentGlossary };

    for (const ent of approvedEntities) {
      const k = ent.name.trim();
      const v = ent.translation.trim();
      if (k.length > 0 && v.length > 0) {
        updated[k] = v;
      }
    }

    return updated;
  }
}
