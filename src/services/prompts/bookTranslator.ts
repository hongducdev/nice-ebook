/**
 * Specialized prompts and JSON contract parser for AI Book Translator.
 */

export type TranslationTone = "literary" | "wuxia" | "academic" | "light_novel";

export interface BuildTranslationPromptOptions {
  sourceLangName: string;
  targetLangName: string;
  tone: TranslationTone;
  blocks: Array<{ id: string; text: string }>;
  glossary?: Record<string, string>;
  bookTitle?: string;
  chapterTitle?: string;
  researchBrief?: string;
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

export function buildSystemPrompt(tone: TranslationTone, sourceLang: string, targetLang: string): string {
  const toneInfo = TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.literary;

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
7. CHỈ TRẢ VỀ DUY NHẤT MÃ RAW JSON dạng mảng [...]. Tuyệt đối KHÔNG bọc trong \`\`\`json hoặc thêm bất kỳ lời chào/lời dẫn nào.`;
}

export function buildUserPrompt(options: BuildTranslationPromptOptions): string {
  const { sourceLangName, targetLangName, tone, blocks, glossary, bookTitle, chapterTitle, researchBrief } = options;
  const toneInfo = TONE_DESCRIPTIONS[tone] || TONE_DESCRIPTIONS.literary;

  let prompt = `Hãy dịch ${blocks.length} đoạn văn bản sau từ ${sourceLangName} sang ${targetLangName} theo văn phong ${toneInfo.name}.\n`;

  if (bookTitle || chapterTitle) {
    prompt += `\n[Bối cảnh]:`;
    if (bookTitle) prompt += ` Tác phẩm: "${bookTitle}".`;
    if (chapterTitle) prompt += ` Tiêu đề chương: "${chapterTitle}".`;
    prompt += `\n`;
  }

  if (glossary && Object.keys(glossary).length > 0) {
    prompt += `\n[BẢNG THUẬT NGỮ & TÊN NHÂN VẬT BẮT BUỘC SỬ DỤNG]:\n`;
    for (const [k, v] of Object.entries(glossary)) {
      if (k && v) {
        prompt += `- "${k}" => "${v}"\n`;
      }
    }
  }

  if (researchBrief && researchBrief.trim().length > 0) {
    prompt += `\n[TÀI LIỆU THAM KHẢO NGỮ CẢNH TÁC PHẨM & QUY TẮC XƯNG HÔ]:\n<<<CONTEXT_BRIEF_START>>>\n${researchBrief.trim()}\n<<<CONTEXT_BRIEF_END>>>\n*Lưu ý: Chỉ áp dụng thông tin trên để thống nhất xưng hô và thuật ngữ, không dịch đoạn tài liệu này.*\n`;
  }

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
