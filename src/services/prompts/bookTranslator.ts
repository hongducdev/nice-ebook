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
3. Giữ NGUYÊN VẸN các mã ID ("id"), KHÔNG ĐƯỢC gộp, tách, xóa bỏ hay tự ý sinh thêm bất kỳ đoạn nào. Số lượng phần tử trả về phải khớp đúng số lượng phần tử đầu vào.
4. Giữ nguyên các ký tự đặc biệt, dấu ngoặc kép, dấu chấm lửng (...), dấu gạch ngang thoại nếu có trong văn bản gốc.
5. CHỈ TRẢ VỀ DUY NHẤT MÃ RAW JSON dạng mảng [...]. Tuyệt đối KHÔNG bọc trong \`\`\`json hoặc thêm bất kỳ lời chào/lời dẫn nào.`;
}

export function buildUserPrompt(options: BuildTranslationPromptOptions): string {
  const { sourceLangName, targetLangName, tone, blocks, glossary, bookTitle, chapterTitle } = options;
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

  prompt += `\n[DANH SÁCH ĐOẠN VĂN CẦN DỊCH]:\n`;
  prompt += JSON.stringify(
    blocks.map((b) => ({ id: b.id, text: b.text })),
    null,
    2
  );

  return prompt;
}

/**
 * Safely parses the LLM output into a dictionary of { [blockId]: translatedText }.
 * Handles code fences, loose JSON arrays, and ensures invalid entries fall back safely.
 */
export function parseTranslationResponse(rawOutput: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!rawOutput || rawOutput.trim().length === 0) {
    return result;
  }

  // Clean markdown code blocks if the model wrapped output in ```json ... ```
  let clean = rawOutput.trim();
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
      for (const item of parsed) {
        if (item && typeof item === "object" && typeof item.id === "string") {
          const text = typeof item.text === "string" ? item.text.trim() : "";
          if (text.length > 0) {
            result[item.id] = text;
          }
        }
      }
    }
  } catch (err) {
    console.warn("Could not parse LLM output as strict JSON array, attempting regex recovery:", err);

    // Fallback regex parser for malformed JSON elements: {"id": "p_0", "text": "..."}
    const itemRegex = /"id"\s*:\s*"([^"]+)"\s*,\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(clean)) !== null) {
      const id = match[1];
      const rawText = match[2];
      try {
        const text = JSON.parse(`"${rawText}"`);
        if (id && text) {
          result[id] = text;
        }
      } catch {
        result[id] = rawText;
      }
    }
  }

  return result;
}
