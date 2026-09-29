/**
 * Kindle Companion - Leveled Vocabulary Dictionary
 * 
 * Curated list of advanced English words classified by CEFR level and Kindle difficulty (1-5),
 * with concise definitions in English (Kindle Word Wise style) and Vietnamese.
 * 
 * Difficulty scale:
 * 1: C2 Rare / Highly literary (e.g., perspicacious, surreptitious, obfuscate)
 * 2: C1 Advanced / Formal (e.g., ephemeral, ubiquitous, ubiquitous, pernicious)
 * 3: C1 Upper-intermediate (e.g., meticulous, reluctant, melancholy, poignant)
 * 4: B2 Intermediate / Literary (e.g., resilient, diminish, obsolete, profound)
 * 5: B2 Accessible (e.g., anticipate, comprehensive, encounter, subtle)
 */

export interface WordWiseDefinition {
  lemma: string;
  level: "B2" | "C1" | "C2";
  difficulty: 1 | 2 | 3 | 4 | 5;
  en: string; // Concise English definition / synonym
  vi: string; // Concise Vietnamese definition
}

export const WORD_WISE_DICT: Record<string, WordWiseDefinition> = {
  // --- Difficulty 1 (C2 Rare / Literary) ---
  "aberration": { lemma: "aberration", level: "C2", difficulty: 1, en: "deviation", vi: "sự lệch lạc, bất thường" },
  "anachronism": { lemma: "anachronism", level: "C2", difficulty: 1, en: "wrong time period", vi: "sự lỗi thời, sai thời đại" },
  "cacophony": { lemma: "cacophony", level: "C2", difficulty: 1, en: "harsh sound", vi: "âm thanh chói tai, hỗn tạp" },
  "chicanery": { lemma: "chicanery", level: "C2", difficulty: 1, en: "trickery", vi: "mánh khóe, xảo quyệt" },
  "deleterious": { lemma: "deleterious", level: "C2", difficulty: 1, en: "harmful", vi: "có hại, độc hại" },
  "ebullient": { lemma: "ebullient", level: "C2", difficulty: 1, en: "cheerful, full of energy", vi: "sôi nổi, hào hứng" },
  "equanimity": { lemma: "equanimity", level: "C2", difficulty: 1, en: "calmness", vi: "sự điềm tĩnh, bình thản" },
  "fastidious": { lemma: "fastidious", level: "C2", difficulty: 1, en: "very attentive to detail", vi: "kỹ tính, cầu toàn" },
  "garrulous": { lemma: "garrulous", level: "C2", difficulty: 1, en: "excessively talkative", vi: "nói nhiều, ba hoa" },
  "hegemony": { lemma: "hegemony", level: "C2", difficulty: 1, en: "dominance", vi: "quyền bá chủ, thống trị" },
  "iconoclast": { lemma: "iconoclast", level: "C2", difficulty: 1, en: "rebel against tradition", vi: "người bài trừ truyền thống" },
  "intransigent": { lemma: "intransigent", level: "C2", difficulty: 1, en: "uncompromising", vi: "cố chấp, không thỏa hiệp" },
  "loquacious": { lemma: "loquacious", level: "C2", difficulty: 1, en: "talkative", vi: "nói nhiều, hoạt ngôn" },
  "mendacious": { lemma: "mendacious", level: "C2", difficulty: 1, en: "untruthful, lying", vi: "dối trá, sai sự thật" },
  "obfuscate": { lemma: "obfuscate", level: "C2", difficulty: 1, en: "make unclear, confuse", vi: "làm rối trí, làm khó hiểu" },
  "panacea": { lemma: "panacea", level: "C2", difficulty: 1, en: "cure-all remedy", vi: "thuốc vạn năng, giải pháp toàn diện" },
  "perspicacious": { lemma: "perspicacious", level: "C2", difficulty: 1, en: "keenly perceptive", vi: "nhạy bén, sắc sảo" },
  "pugnacious": { lemma: "pugnacious", level: "C2", difficulty: 1, en: "eager to argue or fight", vi: "hung hăng, hiếu chiến" },
  "quixotic": { lemma: "quixotic", level: "C2", difficulty: 1, en: "idealistic but impractical", vi: "viển vông, hảo huyền" },
  "surreptitious": { lemma: "surreptitious", level: "C2", difficulty: 1, en: "kept secret, sneaky", vi: "lén lút, vụng trộm" },
  "taciturn": { lemma: "taciturn", level: "C2", difficulty: 1, en: "reserved, saying little", vi: "trầm mặc, ít nói" },
  "vicissitude": { lemma: "vicissitude", level: "C2", difficulty: 1, en: "change of circumstances", vi: "thăng trầm, biến thiên" },

  // --- Difficulty 2 (C1 Advanced) ---
  "alacrity": { lemma: "alacrity", level: "C1", difficulty: 2, en: "cheerful readiness", vi: "sự sốt sắng, hăng hái" },
  "anomalous": { lemma: "anomalous", level: "C1", difficulty: 2, en: "abnormal, unusual", vi: "bất thường, dị thường" },
  "audacious": { lemma: "audacious", level: "C1", difficulty: 2, en: "bold, daring", vi: "táo bạo, liều lĩnh" },
  "capricious": { lemma: "capricious", level: "C1", difficulty: 2, en: "unpredictable, fickle", vi: "thất thường, tùy hứng" },
  "connoisseur": { lemma: "connoisseur", level: "C1", difficulty: 2, en: "expert judge in art/taste", vi: "người sành sỏi, chuyên gia" },
  "disingenuous": { lemma: "disingenuous", level: "C1", difficulty: 2, en: "not candid or sincere", vi: "gian xảo, thiếu chân thật" },
  "elucidate": { lemma: "elucidate", level: "C1", difficulty: 2, en: "explain, clarify", vi: "làm sáng tỏ, giải thích" },
  "ephemeral": { lemma: "ephemeral", level: "C1", difficulty: 2, en: "short-lived", vi: "phù du, ngắn ngủi" },
  "esoteric": { lemma: "esoteric", level: "C1", difficulty: 2, en: "intended for few, obscure", vi: "huyền bí, kén người hiểu" },
  "exacerbate": { lemma: "exacerbate", level: "C1", difficulty: 2, en: "worsen, make worse", vi: "làm trầm trọng hơn" },
  "implacable": { lemma: "implacable", level: "C1", difficulty: 2, en: "unstoppable, relentless", vi: "không thể nguôi ngoai, tàn nhẫn" },
  "incongruous": { lemma: "incongruous", level: "C1", difficulty: 2, en: "out of place", vi: "lạc điệu, không tương thích" },
  "indolent": { lemma: "indolent", level: "C1", difficulty: 2, en: "lazy, avoiding activity", vi: "lười biếng, uể oải" },
  "insidious": { lemma: "insidious", level: "C1", difficulty: 2, en: "subtly harmful", vi: "ngấm ngầm độc hại" },
  "juxtapose": { lemma: "juxtapose", level: "C1", difficulty: 2, en: "place side by side", vi: "đặt cạnh nhau để đối chiếu" },
  "magnanimous": { lemma: "magnanimous", level: "C1", difficulty: 2, en: "generous, forgiving", vi: "hào hiệp, độ lượng" },
  "nefarious": { lemma: "nefarious", level: "C1", difficulty: 2, en: "wicked, criminal", vi: "hung ác, tà ác" },
  "pernicious": { lemma: "pernicious", level: "C1", difficulty: 2, en: "harmful, destructive", vi: "tai hại, nguy hiểm" },
  "precocious": { lemma: "precocious", level: "C1", difficulty: 2, en: "talented at early age", vi: "sớm phát triển, sớm khôn" },
  "proclivity": { lemma: "proclivity", level: "C1", difficulty: 2, en: "natural inclination", vi: "khuynh hướng, thiên hướng" },
  "superfluous": { lemma: "superfluous", level: "C1", difficulty: 2, en: "unnecessary, excess", vi: "thừa thãi, không cần thiết" },
  "ubiquitous": { lemma: "ubiquitous", level: "C1", difficulty: 2, en: "present everywhere", vi: "phổ biến khắp nơi" },
  "venerable": { lemma: "venerable", level: "C1", difficulty: 2, en: "respected due to age", vi: "đáng kính, tôn kính" },

  // --- Difficulty 3 (C1 Intermediate / Literary) ---
  "ambivalent": { lemma: "ambivalent", level: "C1", difficulty: 3, en: "having mixed feelings", vi: "nửa muốn nửa không, mâu thuẫn" },
  "austere": { lemma: "austere", level: "C1", difficulty: 3, en: "strict, simple, plain", vi: "nghiêm khắc, mộc mạc" },
  "benevolent": { lemma: "benevolent", level: "C1", difficulty: 3, en: "kind and helpful", vi: "nhân từ, tốt bụng" },
  "candid": { lemma: "candid", level: "C1", difficulty: 3, en: "honest and direct", vi: "thẳng thắn, bộc trực" },
  "circumspect": { lemma: "circumspect", level: "C1", difficulty: 3, en: "wary, cautious", vi: "thận trọng, dè dặt" },
  "complacent": { lemma: "complacent", level: "C1", difficulty: 3, en: "self-satisfied", vi: "tự mãn, chủ quan" },
  "conspicuous": { lemma: "conspicuous", level: "C1", difficulty: 3, en: "clearly visible, noticeable", vi: "dễ thấy, nổi bật" },
  "disdain": { lemma: "disdain", level: "C1", difficulty: 3, en: "feeling of contempt", vi: "sự khinh thường, coi rẻ" },
  "disparate": { lemma: "disparate", level: "C1", difficulty: 3, en: "fundamentally different", vi: "khác biệt hoàn toàn" },
  "dubious": { lemma: "dubious", level: "C1", difficulty: 3, en: "doubtful, questionable", vi: "đáng ngờ, không chắc chắn" },
  "eloquent": { lemma: "eloquent", level: "C1", difficulty: 3, en: "fluent, expressive", vi: "hùng biện, truyền cảm" },
  "inadvertent": { lemma: "inadvertent", level: "C1", difficulty: 3, en: "unintentional", vi: "vô ý, không chủ định" },
  "indifferent": { lemma: "indifferent", level: "C1", difficulty: 3, en: "unconcerned, uncaring", vi: "thờ ơ, lãnh đạm" },
  "lucid": { lemma: "lucid", level: "C1", difficulty: 3, en: "clear and easy to understand", vi: "rõ ràng, minh bạch" },
  "melancholy": { lemma: "melancholy", level: "C1", difficulty: 3, en: "deep sadness", vi: "u sầu, buồn bã" },
  "meticulous": { lemma: "meticulous", level: "C1", difficulty: 3, en: "very careful, precise", vi: "tỉ mỉ, cẩn trọng" },
  "nostalgia": { lemma: "nostalgia", level: "C1", difficulty: 3, en: "longing for the past", vi: "nỗi hoài niệm, nhớ nhung" },
  "poignant": { lemma: "poignant", level: "C1", difficulty: 3, en: "deeply touching, painful", vi: "chua xót, thấm thía" },
  "pragmatic": { lemma: "pragmatic", level: "C1", difficulty: 3, en: "practical and realistic", vi: "thực tế, thực dụng" },
  "reluctant": { lemma: "reluctant", level: "C1", difficulty: 3, en: "unwilling, hesitant", vi: "ngập ngừng, miễn cưỡng" },
  "serendipity": { lemma: "serendipity", level: "C1", difficulty: 3, en: "lucky chance finding", vi: "sự tình cờ may mắn" },
  "tenacious": { lemma: "tenacious", level: "C1", difficulty: 3, en: "holding firm, persistent", vi: "kiên trì, dai dẳng" },

  // --- Difficulty 4 (B2 Advanced / Upper-Intermediate) ---
  "advocate": { lemma: "advocate", level: "B2", difficulty: 4, en: "publicly support", vi: "ủng hộ, tán thành" },
  "ambiguous": { lemma: "ambiguous", level: "B2", difficulty: 4, en: "open to more than one meaning", vi: "mơ hồ, đa nghĩa" },
  "coherent": { lemma: "coherent", level: "B2", difficulty: 4, en: "logical and consistent", vi: "mạch lạc, chặt chẽ" },
  "diminish": { lemma: "diminish", level: "B2", difficulty: 4, en: "make or become less", vi: "giảm bớt, suy giảm" },
  "feasible": { lemma: "feasible", level: "B2", difficulty: 4, en: "possible to do easily", vi: "khả thi, có thể thực hiện" },
  "inevitable": { lemma: "inevitable", level: "B2", difficulty: 4, en: "certain to happen", vi: "không thể tránh khỏi" },
  "inherent": { lemma: "inherent", level: "B2", difficulty: 4, en: "existing as a natural part", vi: "vốn có, cố hữu" },
  "legitimate": { lemma: "legitimate", level: "B2", difficulty: 4, en: "lawful, reasonable", vi: "hợp pháp, chính đáng" },
  "obsolete": { lemma: "obsolete", level: "B2", difficulty: 4, en: "outdated, no longer used", vi: "lỗi thời, không còn dùng" },
  "plausible": { lemma: "plausible", level: "B2", difficulty: 4, en: "reasonable, probable", vi: "hợp lý, đáng tin" },
  "profound": { lemma: "profound", level: "B2", difficulty: 4, en: "very deep or intense", vi: "sâu sắc, thâm thúy" },
  "resilient": { lemma: "resilient", level: "B2", difficulty: 4, en: "able to recover quickly", vi: "kiên cường, đàn hồi" },
  "scrutinize": { lemma: "scrutinize", level: "B2", difficulty: 4, en: "examine very closely", vi: "xem xét kỹ lưỡng" },
  "spontaneous": { lemma: "spontaneous", level: "B2", difficulty: 4, en: "unplanned, impulsive", vi: "tự phát, ngẫu hứng" },
  "subtle": { lemma: "subtle", level: "B2", difficulty: 4, en: "delicate, not obvious", vi: "tinh tế, phảng phất" },
  "tangible": { lemma: "tangible", level: "B2", difficulty: 4, en: "perceptible by touch, real", vi: "hữu hình, rõ ràng" },

  // --- Difficulty 5 (B2 Accessible) ---
  "anticipate": { lemma: "anticipate", level: "B2", difficulty: 5, en: "expect, look forward to", vi: "dự đoán, mong chờ" },
  "comprehensive": { lemma: "comprehensive", level: "B2", difficulty: 5, en: "complete, including all", vi: "toàn diện, bao quát" },
  "consequence": { lemma: "consequence", level: "B2", difficulty: 5, en: "result or effect", vi: "hệ quả, kết quả" },
  "crucial": { lemma: "crucial", level: "B2", difficulty: 5, en: "decisive or critical", vi: "then chốt, cốt yếu" },
  "encounter": { lemma: "encounter", level: "B2", difficulty: 5, en: "meet unexpectedly", vi: "chạm trán, bắt gặp" },
  "generate": { lemma: "generate", level: "B2", difficulty: 5, en: "produce or create", vi: "tạo ra, phát sinh" },
  "indicate": { lemma: "indicate", level: "B2", difficulty: 5, en: "point out or show", vi: "chỉ ra, biểu thị" },
  "perceive": { lemma: "perceive", level: "B2", difficulty: 5, en: "become aware of, interpret", vi: "nhận thức, cảm thụ" },
  "reluctantly": { lemma: "reluctant", level: "C1", difficulty: 3, en: "unwillingly", vi: "một cách miễn cưỡng" },
  "ephemerality": { lemma: "ephemeral", level: "C1", difficulty: 2, en: "short-lived nature", vi: "tính phù du, ngắn ngủi" },
  "meticulously": { lemma: "meticulous", level: "C1", difficulty: 3, en: "very carefully", vi: "một cách tỉ mỉ" }
};

function generateLemmaCandidates(clean: string): string[] {
  const candidates: string[] = [];

  // Adverb -ly -> adjective
  if (clean.endsWith("ly")) {
    candidates.push(clean.slice(0, -2));
    if (clean.endsWith("ically")) {
      candidates.push(clean.slice(0, -4));
    }
  }

  // Plurals and 3rd person -s, -es, -ies
  if (clean.endsWith("ies") && clean.length > 4) {
    candidates.push(clean.slice(0, -3) + "y");
  } else if (clean.endsWith("es") && clean.length > 4) {
    candidates.push(clean.slice(0, -2));
  } else if (clean.endsWith("s") && !clean.endsWith("ss") && clean.length > 3) {
    candidates.push(clean.slice(0, -1));
  }

  // Past tense / participle -ed
  if (clean.endsWith("ed")) {
    candidates.push(clean.slice(0, -2));
    candidates.push(clean.slice(0, -1));
    if (clean.endsWith("ied")) {
      candidates.push(clean.slice(0, -3) + "y");
    }
  }

  // Gerund -ing
  if (clean.endsWith("ing")) {
    candidates.push(clean.slice(0, -3));
    candidates.push(clean.slice(0, -3) + "e");
  }

  // Noun suffixes: -ness
  if (clean.endsWith("ness")) {
    candidates.push(clean.slice(0, -4));
  }

  return candidates;
}

/**
 * Normalizes an English word (strips punctuation, lowercases)
 * and attempts lemmatization (removes plurals, verb endings, adverbs)
 * to find the matching entry in the Word Wise dictionary.
 */
export function findWordWiseLemma(word: string): WordWiseDefinition | null {
  const clean = word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (!clean || clean.length < 3) return null;

  // Direct exact match
  if (WORD_WISE_DICT[clean]) {
    return WORD_WISE_DICT[clean];
  }

  const candidates = generateLemmaCandidates(clean);
  for (const candidate of candidates) {
    if (WORD_WISE_DICT[candidate]) {
      return WORD_WISE_DICT[candidate];
    }
  }

  return null;
}
