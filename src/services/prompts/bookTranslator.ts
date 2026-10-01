/**
 * Specialized prompts and JSON contract parser for AI Book Translator.
 */

export type TranslationTone = "literary" | "wuxia" | "academic" | "light_novel";

export interface BuildTranslationPromptOptions {
  sourceLangName: string;
  targetLangName: string;
  tone: TranslationTone;
  blocks: Array<{ id: string; text: string }>;
  previousContextBlocks?: Array<{ id?: string; text: string }>;
  glossary?: Record<string, string>;
  bookTitle?: string;
  chapterTitle?: string;
  researchBrief?: string;
  convertCurrency?: boolean;
}

/**
 * Dynamic Glossary Filter (LinguaGacha style):
 * Scans text and only retains glossary terms that actually appear in the current batch.
 * Saves input tokens, keeps model attention sharp, and eliminates hallucination.
 */
export function filterGlossaryForBatch(
  textToScan: string,
  fullGlossary?: Record<string, string>
): Record<string, string> {
  if (!fullGlossary || Object.keys(fullGlossary).length === 0) return {};
  if (!textToScan || textToScan.trim().length === 0) return {};

  const matched: Record<string, string> = {};
  const lowerText = textToScan.toLowerCase();

  for (const [sourceTerm, targetTerm] of Object.entries(fullGlossary)) {
    if (!sourceTerm || !targetTerm) continue;
    const trimmedSource = sourceTerm.trim();
    if (!trimmedSource) continue;

    // Fast check: exact substring or case-insensitive match
    if (textToScan.includes(trimmedSource) || lowerText.includes(trimmedSource.toLowerCase())) {
      matched[trimmedSource] = targetTerm.trim();
    }
  }

  return matched;
}

export const TONE_DESCRIPTIONS: Record<TranslationTone, { name: string; description: string; instructions: string }> = {
  literary: {
    name: "Văn học & Tiểu thuyết",
    description: "Văn phong trau chuốt, giàu hình tượng, mượt mà và tự nhiên theo lối hành văn văn học hiện đại.",
    instructions: "Dịch theo phong cách văn học nghệ thuật sâu sắc, giàu hình tượng, câu cú trôi chảy, chuyển tải trọn vẹn ngữ cảnh và cảm xúc nhân vật. Tránh dịch thô vụng theo từng từ (word-by-word).",
  },
  wuxia: {
    name: "Tiên hiệp & Kiếm hiệp",
    description: "Sử dụng chuẩn xác hệ thống từ ngữ Hán Việt, danh xưng sư đồ/huynh đệ, cảnh giới và chiêu thức.",
    instructions: "Dịch theo đúng chuẩn văn phong Tiên hiệp / Kiếm hiệp / Huyền huyễn. Sử dụng chuẩn từ ngữ Hán Việt cho danh xưng (Huynh, Muội, Trưởng lão, Tông chủ, Tiền bối), địa danh, chiêu thức, công pháp, cảnh giới tu vi. Giữ khí phách hào sảng, uy nghiêm hoặc tao nhã.",
  },
  academic: {
    name: "Phi hư cấu & Khoa học",
    description: "Khách quan, chính xác, mạch lạc, thuật ngữ chuyên ngành chuẩn hóa.",
    instructions: "Dịch theo phong cách phi hư cấu, học thuật, báo chí hoặc sách kỹ năng/khoa học. Văn phong gãy gọn, logic, chính xác, sử dụng thuật ngữ chuyên ngành chuẩn xác.",
  },
  light_novel: {
    name: "Light Novel & Đời thường",
    description: "Trẻ trung, sinh động, ngôn ngữ đối thoại tự nhiên, gần gũi với giới trẻ.",
    instructions: "Dịch theo phong cách Light Novel Nhật Bản / truyện hiện đại. Lời thoại tự nhiên, dí dỏm, giữ nguyên sắc thái biểu cảm và xưng hô thân mật của các nhân vật.",
  },
};

export function buildSystemPrompt(
  tone: TranslationTone,
  sourceLang: string,
  targetLang: string,
  options?: { convertCurrency?: boolean }
): string {
  const toneInfo = TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.literary;
  const isTargetVietnamese = targetLang.toLowerCase().includes("việt") || targetLang.toLowerCase() === "vi";
  const shouldConvertCurrency = options?.convertCurrency !== false && isTargetVietnamese;

  const currencyRule = shouldConvertCurrency
    ? `\n11. NGUYÊN TẮC QUY ĐỔI TIỀN TỆ SANG VNĐ (CURRENCY CONVERSION):
- Khi văn bản xuất hiện các số tiền ngoại tệ (như Nhân Dân Tệ / NDT / RMB / 元 / 块, Đô la Mỹ / USD / $, Yên Nhật / JPY / 円, Won Hàn Quốc / KRW / 원, Bảng Anh / GBP / £, Euro / EUR / €...):
- BẠN HÃY GIỮ NGUYÊN mệnh giá tiền gốc và mở ngoặc đơn ghi kèm ước lượng quy đổi sang tiền Việt Nam (VND) để độc giả dễ hình dung giá trị thực tế.
- Định dạng chuẩn: "<Số tiền gốc> (khoảng <Số tiền quy đổi> VND)" hoặc "<Số tiền gốc> (<Số tiền quy đổi> VND)".
- Tỷ giá ước lượng thực tế phổ biến:
  * 1 NDT (Nhân Dân Tệ / 元 / 块) ≈ 3.500 - 3.860 VND (Ví dụ: "5000 NDT" hoặc "5000元" ➔ "5000 NDT (19.3 triệu VND)" hoặc "5.000 NDT (khoảng 19,3 triệu VND)", "10万" ➔ "100.000 NDT (khoảng 380 triệu VND)").
  * 1 USD ($) ≈ 25.400 VND (Ví dụ: "1000 USD" hoặc "$1000" ➔ "1.000 USD (khoảng 25,4 triệu VND)").
  * 1 JPY (Yên / 円) ≈ 170 VND (Ví dụ: "100万日元" ➔ "1 triệu Yên (khoảng 170 triệu VND)").
  * 1 KRW (Won / 원) ≈ 18,5 VND (Ví dụ: "1000万韩元" ➔ "10 triệu Won (khoảng 185 triệu VND)").
- Dùng các đơn vị tiền Việt quen thuộc: "nghìn VND", "triệu VND", "tỷ VND".
- Đảm bảo diễn đạt tự nhiên, giữ nguyên ngữ cảnh và không làm ngắt quãng câu thoại.`
    : "";

  return `Bạn là một dịch giả sách xuất sắc, chuyên nghiệp và giàu kinh nghiệm, chuyên dịch các tác phẩm sách điện tử từ ${sourceLang} sang ${targetLang}.
Nhiệm vụ của bạn là dịch danh sách các đoạn văn bản (blocks) được cung cấp sang ${targetLang} với chất lượng xuất bản cao cấp.

YÊU CẦU VĂN PHONG (${toneInfo.name.toUpperCase()}):
${toneInfo.instructions}

QUY TẮC CỐT LÕI BẮT BUỘC:
1. Bạn sẽ nhận một mảng JSON các đoạn văn: [{"id": "p_0", "text": "..."}, {"id": "p_1", "text": "..."}].
2. Bạn PHẢI trả về một mảng JSON có đúng cấu trúc: [{"id": "p_0", "text": "<bản dịch>"}, ...].
3. DỊCH TRIỆT ĐỂ 100%: Dịch toàn bộ mọi đoạn văn và mọi tiêu đề, tuyệt đối KHÔNG bỏ sót bất kỳ đoạn nào. Không để sót chữ Hán hoặc ngôn ngữ nguồn chưa dịch trong văn bản tiếng Việt.
4. Giữ NGUYÊN VẸN các mã ID ("id"), KHÔNG ĐƯỢC gộp, tách, xóa bỏ hay tự ý sinh thêm bất kỳ đoạn nào. Mỗi đoạn văn có mã 'id' riêng phải có một bản dịch tương ứng. Số lượng phần tử trả về phải khớp đúng số lượng phần tử đầu vào.
5. Giữ nguyên các ký tự đặc biệt, dấu ngoặc kép, dấu chấm lửng (...), dấu gạch ngang thoại nếu có trong văn bản gốc. Nếu đoạn văn có dấu xuống dòng thơ ca, hãy giữ nguyên vị trí xuống dòng.
6. DỊCH SẠCH HOÀN TOÀN: Tuyệt đối KHÔNG tự ý thêm lời dẫn (preamble), không thêm chú thích người dịch (translator's note), không thêm lời cảm ơn, không chèn watermark quảng cáo.
7. CHỈ TRẢ VỀ DUY NHẤT MÃ RAW JSON dạng mảng [...]. Tuyệt đối KHÔNG bọc trong \`\`\`json hoặc thêm bất kỳ lời chào/lời dẫn nào.
8. NGUYÊN TẮC NGỮ CẢNH TRƯỢT (<previous_context>): Nếu có thẻ <previous_context>, đó chỉ là các đoạn văn liền trước để bạn tham khảo xưng hô và mạch truyện. Tuyệt đối KHÔNG dịch lại và KHÔNG đưa bất kỳ đoạn nào trong thẻ đó vào kết quả JSON.
9. NGUYÊN TẮC XỬ LÝ ĐA NGÔN NGỮ XEN LẪN (HYBRID / CODE-SWITCHING):
- Nếu văn bản nguồn (ví dụ tiếng Trung hoặc tiếng Nhật) có xuất hiện các câu thoại, đoạn văn, câu cảm thán hoặc thuật ngữ TIẾNG ANH (hoặc ngôn ngữ phụ khác):
- BẠN PHẢI LINH HOẠT DỊCH CẢ CÂU/CỤM TỪ TIẾNG ANH ĐÓ SANG ${targetLang.toUpperCase()} để bản dịch liền mạch và độc giả hiểu trọn vẹn ngữ cảnh (Ví dụ: "I love you" ➔ "Anh yêu em" / "Tôi yêu cậu", "Game Over" ➔ "Trò chơi kết thúc", "Target eliminated" ➔ "Mục tiêu đã bị tiêu diệt").
- CHỈ GIỮ NGUYÊN: các từ viết tắt phổ thông chuẩn quốc tế (CEO, VIP, FBI, DNA, AI, CPU...), tên thương hiệu quốc tế (Apple, Google...), tên riêng người phương Tây hoặc mã placeholder giữ chỗ.
- Tuyệt đối KHÔNG bỏ sót câu thoại tiếng Anh chưa dịch trong bản dịch.
10. NGUYÊN TẮC DỊCH VĂN BẢN TRONG ĐƯỜNG LINK & CẶP THẺ (⟦TAG_N⟧...⟦/TAG_N⟧):
- Nếu văn bản có chứa các cặp thẻ giữ chỗ dạng ⟦TAG_N⟧văn bản⟦/TAG_N⟧ (đại diện cho đường link hoặc thẻ trang trí đặc biệt):
- BẠN BẮT BUỘC PHẢI DỊCH NỘI DUNG VĂN BẢN NẰM BÊN TRONG CẶP THẺ ĐÓ SANG ${targetLang.toUpperCase()}.
- Giữ nguyên cặp mã mở ⟦TAG_N⟧ và mã đóng ⟦/TAG_N⟧ bao bọc xung quanh văn bản vừa dịch (Ví dụ: "Read ⟦TAG_0⟧Chapter Two: The Vanishing Glass⟦/TAG_0⟧" ➔ "Đọc ⟦TAG_0⟧Chương 2: Chiếc gương biến mất⟦/TAG_0⟧" hoặc "⟦TAG_1⟧第一章 降临⟦/TAG_1⟧" ➔ "⟦TAG_1⟧Chương 1: Giáng lâm⟦/TAG_1⟧").
- Tuyệt đối KHÔNG bỏ sót văn bản bên trong các thẻ link hay thẻ trang trí.${currencyRule}`;
}

export function buildUserPrompt(options: BuildTranslationPromptOptions): string {
  const {
    sourceLangName,
    targetLangName,
    tone,
    blocks,
    previousContextBlocks,
    glossary,
    bookTitle,
    chapterTitle,
    researchBrief,
  } = options;
  const toneInfo = TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.literary;

  let prompt = `Hãy dịch ${blocks.length} đoạn văn bản sau từ ${sourceLangName} sang ${targetLangName} theo văn phong ${toneInfo.name}.\n`;

  if (bookTitle || chapterTitle) {
    prompt += `\n[Bối cảnh]:`;
    if (bookTitle) prompt += ` Tác phẩm: "${bookTitle}".`;
    if (chapterTitle) prompt += ` Tiêu đề chương: "${chapterTitle}".`;
    prompt += `\n`;
  }

  if (options.convertCurrency !== false && (targetLangName.toLowerCase().includes("việt") || targetLangName.toLowerCase() === "vi")) {
    prompt += `\n[Lưu ý quy đổi tiền tệ]: Các số tiền ngoại tệ (như NDT/元/块, USD, Yên, Won...) hãy giữ nguyên giá trị gốc kèm ước lượng quy đổi sang VND trong ngoặc đơn (Ví dụ: "5000 NDT" ➔ "5000 NDT (19.3 triệu VND)").\n`;
  }

  // 1. Sliding Context Window (LinguaGacha style: bounded to last 3-4 blocks, max 600 chars)
  if (previousContextBlocks && previousContextBlocks.length > 0) {
    const validContext = previousContextBlocks
      .map((b) => b.text.trim())
      .filter((t) => t.length > 0)
      .slice(-4);

    if (validContext.length > 0) {
      prompt += `\n[NGỮ CẢNH LIỀN TRƯỚC - THAM KHẢO XƯNG HÔ & MẠCH TRUYỆN, KHÔNG DỊCH LẠI]:\n<previous_context>\n`;
      let currentLen = 0;
      for (const line of validContext) {
        if (currentLen + line.length > 600) break;
        prompt += `${line}\n`;
        currentLen += line.length;
      }
      prompt += `</previous_context>\n`;
    }
  }

  // 2. Dynamic Glossary Filtering (LinguaGacha style: scan current batch + context)
  if (glossary && Object.keys(glossary).length > 0) {
    const batchCombinedText = blocks.map((b) => b.text).join(" ");
    const contextCombinedText = (previousContextBlocks || []).map((b) => b.text).join(" ");
    const textToMatch = `${batchCombinedText} ${contextCombinedText}`;
    const dynamicGlossary = filterGlossaryForBatch(textToMatch, glossary);

    if (Object.keys(dynamicGlossary).length > 0) {
      prompt += `\n[BẢNG THUẬT NGỮ & TÊN NHÂN VẬT ÁP DỤNG CHO ĐOẠN NÀY]:\n`;
      for (const [k, v] of Object.entries(dynamicGlossary)) {
        prompt += `- "${k}" => "${v}"\n`;
      }
    }
  }

  if (researchBrief && researchBrief.trim().length > 0) {
    prompt += `\n[TÀI LIỆU THAM KHẢO NGỮ CẢNH TÁC PHẨM & QUY TẮC XƯNG HÔ]:\n<<<CONTEXT_BRIEF_START>>>\n${researchBrief.trim()}\n<<<CONTEXT_BRIEF_END>>>\n*Lưu ý: Chỉ áp dụng thông tin trên để thống nhất xưng hô và thuật ngữ, không dịch đoạn tài liệu này.*\n`;
  }

  // Multilingual & paired tag translation guidance
  prompt += `\n*Lưu ý quan trọng: Nếu trong văn bản có câu thoại/thuật ngữ tiếng Anh xen lẫn, hãy dịch linh hoạt sang ${targetLangName}. Nếu có các cặp thẻ dạng ⟦TAG_N⟧văn bản⟦/TAG_N⟧ (đường link, trích dẫn), BẮT BUỘC dịch phần văn bản bên trong sang ${targetLangName} và giữ nguyên cặp thẻ bao quanh, không bỏ sót.*\n`;

  prompt += `\n[DANH SÁCH ĐOẠN VĂN CẦN DỊCH]:\n`;
  prompt += JSON.stringify(
    blocks.map((b) => ({ id: b.id, text: b.text })),
    null,
    2
  );

  return prompt;
}

/**
 * Strips AI artifacts, thinking tokens, leaked block IDs, and conversational filler
 * to ensure pristine, clean translated book text.
 */
export function cleanTranslatedText(rawText: string): string {
  if (!rawText) return "";
  let text = rawText.trim();

  // 1. Strip <think>...</think> reasoning tags (e.g. DeepSeek R1, Qwen reasoning models)
  text = text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();

  // 2. Strip leaked outer <p>...</p>, <h1>...</h1>, or <div>...</div> tags inside the JSON string
  text = text.replace(/^<([a-z0-9]+)\b[^>]*>([\s\S]*?)<\/\1>$/i, "$2").trim();

  // 3. Strip block ID prefixes: "p_0:", "[p_0]", "p0 -", "p_12. ", "(p_3)"
  text = text.replace(/^(?:\[?p_?\d+\]?|[pP]\d+)\s*[:.\-–—]\s*/, "");

  // 4. Strip prompt echo prefixes: "Bản dịch:", "[Dịch]:", "Dịch nghĩa:", "Translation:"
  text = text.replace(/^(?:\[?(?:Bản dịch|Dịch nghĩa|Dịch|Translation)\]?\s*[:：\-–—]\s*)/i, "");

  // 5. Strip trailing translator notes at the end of block: "Note: ...", "Lưu ý: ..."
  text = text.replace(/\n+\s*(?:\[?(?:Lưu ý|Ghi chú|Note|Lời dịch giả)\]?\s*[:：\-–—][\s\S]*)$/i, "");

  return text.trim();
}

/**
 * Detects if a translated block is an untranslated echo of the source language.
 */
export function isUntranslatedEcho(
  translatedText: string,
  originalText: string,
  sourceLang?: string,
  targetLang?: string
): boolean {
  const trans = translatedText.trim();
  const orig = originalText.trim();
  if (!trans) return true;
  if (orig.length < 5) return false;

  const isTargetVi = !targetLang || targetLang.toLowerCase().includes("vi");

  // 1. Source contains Chinese/Japanese Hanzi, target is Vietnamese
  const hasChineseSource =
    Boolean(sourceLang && (sourceLang.toLowerCase().includes("zh") || sourceLang.toLowerCase().includes("trung") || sourceLang.toLowerCase().includes("chinese"))) ||
    /[\u4e00-\u9fff]/.test(orig);

  if (hasChineseSource && isTargetVi) {
    const hanziMatches = trans.match(/[\u4e00-\u9fff]/g);
    const hanziCount = hanziMatches?.length || 0;
    // If output still contains > 20% Chinese characters, it is an untranslated echo
    if (hanziCount > 0 && hanziCount / trans.length > 0.2) {
      return true;
    }
  }

  // 2. Exact verbatim echo for Latin source languages (> 15 chars)
  if (trans.toLowerCase() === orig.toLowerCase() && orig.length > 15) {
    return true;
  }

  return false;
}

/**
 * Normalizes an ID key like "p0", 0, "0", "P_0" to standard "p_0" format.
 */
export function normalizeBlockId(rawId: unknown): string {
  if (typeof rawId === "number") {
    return `p_${rawId}`;
  }
  if (typeof rawId === "string") {
    const trimmed = rawId.trim();
    if (/^p_\d+$/i.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    const matchP = /^p(\d+)$/i.exec(trimmed);
    if (matchP) {
      return `p_${matchP[1]}`;
    }
    if (/^\d+$/.test(trimmed)) {
      return `p_${trimmed}`;
    }
    return trimmed;
  }
  return "";
}

/**
 * Safely parses the LLM output into a dictionary of { [blockId]: translatedText }.
 * Handles code fences, loose JSON arrays, safe ID normalization, and strict positional fallback.
 */
export function parseTranslationResponse(
  rawOutput: string,
  expectedBlockIds?: string[]
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!rawOutput || rawOutput.trim().length === 0) {
    return result;
  }

  // Strip <think>...</think> reasoning tags first
  let clean = rawOutput.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();

  // Clean markdown code blocks if the model wrapped output in ```json ... ```
  if (clean.startsWith("```json")) {
    clean = clean.slice(7);
  } else if (clean.startsWith("```")) {
    clean = clean.slice(3);
  }
  if (clean.endsWith("```")) {
    clean = clean.slice(0, -3);
  }
  clean = clean.trim();

  // Attempt to locate JSON array bounds if surrounded by conversational filler
  const firstBracket = clean.indexOf("[");
  const lastBracket = clean.lastIndexOf("]");

  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    clean = clean.slice(firstBracket, lastBracket + 1);
  }

  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) {
      const itemsWithText: Array<{ id: string; text: string }> = [];
      for (const item of parsed) {
        if (item && typeof item === "object") {
          const rawId = (item as any).id;
          const rawVal = typeof (item as any).text === "string" ? (item as any).text : "";
          const text = cleanTranslatedText(rawVal);
          const normId = normalizeBlockId(rawId);
          // Collision Guard: Do not overwrite an existing ID with a collision
          if (normId && text.length > 0 && !result[normId]) {
            result[normId] = text;
          }
          if (text.length > 0) {
            itemsWithText.push({ id: normId, text });
          }
        }
      }

      // Check for 1-based index shift:
      // If expectedBlockIds starts with "p_0", but result has no "p_0" and has "p_{len}",
      // it means the model output 1-based indices (1..N). Shift them by 1 to match 0-based IDs!
      if (
        expectedBlockIds &&
        expectedBlockIds.length > 0 &&
        expectedBlockIds[0] === "p_0" &&
        !result["p_0"] &&
        Boolean(result[`p_${expectedBlockIds.length}`])
      ) {
        for (let i = 0; i < expectedBlockIds.length; i++) {
          const shiftedKey = `p_${i + 1}`;
          if (result[shiftedKey]) {
            result[`p_${i}`] = result[shiftedKey];
            delete result[shiftedKey];
          }
        }
      }

      // STRICT POSITIONAL FALLBACK (Guarded against misalignments):
      // Only when expectedBlockIds is passed AND items count matches expectedBlockIds exactly 1:1,
      // and some IDs were missing or misformatted, map the missing ones strictly by ordinal position.
      if (
        expectedBlockIds &&
        expectedBlockIds.length > 0 &&
        itemsWithText.length === expectedBlockIds.length
      ) {
        const hasMissing = expectedBlockIds.some((bId) => !result[bId]);
        if (hasMissing) {
          for (let i = 0; i < expectedBlockIds.length; i++) {
            const expId = expectedBlockIds[i];
            if (!result[expId] && itemsWithText[i]?.text) {
              result[expId] = itemsWithText[i].text;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("Could not parse LLM output as strict JSON array, attempting regex recovery:", err);

    // Fallback regex parser for malformed JSON elements: {"id": "p_0", "text": "..."}
    const itemRegex = /"id"\s*:\s*(?:"([^"]+)"|(\d+))\s*,\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    let match: RegExpExecArray | null;
    const itemsWithText: Array<{ id: string; text: string }> = [];

    while ((match = itemRegex.exec(clean)) !== null) {
      const rawId = match[1] || match[2];
      const rawText = match[3];
      const normId = normalizeBlockId(rawId);
      try {
        const text = cleanTranslatedText(JSON.parse(`"${rawText}"`));
        if (normId && text) {
          if (!result[normId]) {
            result[normId] = text;
          }
          itemsWithText.push({ id: normId, text });
        }
      } catch {
        const cleanedRaw = cleanTranslatedText(rawText);
        if (normId && cleanedRaw) {
          if (!result[normId]) {
            result[normId] = cleanedRaw;
          }
          itemsWithText.push({ id: normId, text: cleanedRaw });
        }
      }
    }

    // 1-based index shift check in regex fallback
    if (
      expectedBlockIds &&
      expectedBlockIds.length > 0 &&
      expectedBlockIds[0] === "p_0" &&
      !result["p_0"] &&
      Boolean(result[`p_${expectedBlockIds.length}`])
    ) {
      for (let i = 0; i < expectedBlockIds.length; i++) {
        const shiftedKey = `p_${i + 1}`;
        if (result[shiftedKey]) {
          result[`p_${i}`] = result[shiftedKey];
          delete result[shiftedKey];
        }
      }
    }

    if (
      expectedBlockIds &&
      expectedBlockIds.length > 0 &&
      itemsWithText.length === expectedBlockIds.length
    ) {
      for (let i = 0; i < expectedBlockIds.length; i++) {
        const expId = expectedBlockIds[i];
        if (!result[expId] && itemsWithText[i]?.text) {
          result[expId] = itemsWithText[i].text;
        }
      }
    }
  }

  return result;
}
