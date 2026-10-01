/**
 * Caveman Token Optimizer Core Engine
 * Inspired by https://github.com/JuliusBrussee/caveman by Julius Brussee
 *
 * "Why use many token when few token do trick"
 *
 * Implements prompt-level and observation-level token compression to reduce
 * LLM token consumption by ~30% (Lite) to ~75% (Ultra) without sacrificing
 * technical accuracy, tool schemas, code, or chapter translation quality.
 */

export type CavemanMode = "off" | "lite" | "full" | "ultra";

export interface CavemanDirectivesOptions {
  isAgent?: boolean;
  preserveCode?: boolean;
}

export class CavemanOptimizer {
  /**
   * Generates Caveman prompt compression directives based on selected mode.
   * Injects strict negative constraints and telegraphic response rules.
   */
  public static getDirectives(mode: CavemanMode, _options?: CavemanDirectivesOptions): string {
    if (mode === "off") {
      return "";
    }

    if (mode === "lite") {
      return `[CAVEMAN TOKEN OPTIMIZATION: LITE (-30% TOKENS)]:
- Bỏ các từ đệm và lời chào xã giao dư thừa (như "Dạ vâng", "Tôi rất sẵn lòng", "Như bạn đã biết", "Có thể xem xét").
- Trả lời thẳng vào trọng tâm vấn đề, súc tích và mạch lạc.
- GIỮ NGUYÊN VẸN 100%: Code, mã ID ("id"), số liệu, tên chương sách, đường dẫn file và cấu trúc JSON gọi công cụ.`;
    }

    if (mode === "ultra") {
      return `[CAVEMAN TOKEN OPTIMIZATION: ULTRA (-75% TOKENS)]:
Respond terse like ultra-smart caveman. Zero fluff. Max density.
- Drop all pleasantries, transitions, conversational filler, and apologies.
- Drop articles, redundant prepositions, and decorative descriptions.
- Use fragments, telegraphic phrases, bullet points.
- Never explain what tool you will call or narration before action.
- AUTO-CLARITY OVERRIDE: Security warnings and irreversible action confirmations MUST remain in clear, standard text.
- STRICT PRESERVATION: All JSON actions, parameters, code, numbers, chapter titles, IDs ("id") MUST remain 100% byte-for-byte exact.`;
    }

    // Default: "full" (~65% token reduction)
    return `[CAVEMAN TOKEN OPTIMIZATION: FULL (-65% TOKENS)]:
Nguyên tắc Caveman: "Why use many token when few token do trick".
- Cắt bỏ hoàn toàn lời chào hỏi, xã giao, rào đón (như "Chào bạn", "Tôi hiểu rồi", "Rất vui được hỗ trợ", "Dưới đây là kết quả").
- Không tường thuật thao tác ("Tôi đang chuẩn bị gọi công cụ...", "Sau đây tôi sẽ...").
- Dùng câu ngắn, cô đọng, gạch đầu dòng trực diện, tập trung 100% vào thông tin cốt lõi.
- TỰ ĐỘNG BỎ NÉN (AUTO-CLARITY): Các cảnh báo an toàn dữ liệu, xác nhận thao tác quan trọng giữ nguyên văn phong rõ ràng.
- BẢO TOÀN BẤT BIẾN: Code, khối JSON gọi công cụ ("action", "parameters"), số liệu, tên chương, mã ID khối ("id") PHẢI giữ chính xác 100%, tuyệt đối không sửa đổi bên trong mã code/JSON.`;
  }

  /**
   * Compresses verbose observation/tool output before feeding it into the LLM context.
   * Strips repeated whitespace, empty lines, and conversational filler while
   * preserving technical structures, IDs, and numbers byte-for-byte.
   */
  public static compressObservation(rawText: string, mode: CavemanMode): string {
    if (!rawText || mode === "off") {
      return rawText;
    }

    // Safety Gate: If text is valid JSON (e.g. tool output, parameter payloads),
    // NEVER alter it with regex text replacements — preserve 100% byte-for-byte exact!
    try {
      JSON.parse(rawText);
      return rawText;
    } catch {
      // Free-text prose observation: safe to condense whitespace
    }

    let compressed = rawText;

    // 1. Collapse multiple consecutive empty lines to a single newline
    compressed = compressed.replace(/\n{3,}/g, "\n\n");

    // 2. Collapse repetitive spaces and tabs
    compressed = compressed.replace(/[ \t]{2,}/g, " ");

    // 3. For Full and Ultra modes, strip common redundant filler phrases from free-text observations
    if (mode === "full" || mode === "ultra") {
      compressed = compressed.replace(/(?:vui lòng|xin vui lòng|hãy lưu ý rằng|như đã nêu trên)\s*/gi, "");
    }

    return compressed.trim();
  }

  /**
   * Estimates token savings for a given character count and mode.
   */
  public static getSavingsMetrics(mode: CavemanMode): { percent: number; label: string; description: string } {
    switch (mode) {
      case "lite":
        return {
          percent: 30,
          label: "Lite (-30%)",
          description: "Lược bỏ từ đệm và lời chào, giữ ngữ pháp tự nhiên.",
        };
      case "full":
        return {
          percent: 65,
          label: "Full (-65%)",
          description: "Chuẩn Caveman: cô đọng, tối đa mật độ thông tin, bảo toàn 100% code & JSON.",
        };
      case "ultra":
        return {
          percent: 75,
          label: "Ultra (-75%)",
          description: "Ngắn gọn tối đa, dùng câu điện báo, tối ưu cho agent loop tần suất cao.",
        };
      default:
        return {
          percent: 0,
          label: "Tắt (0%)",
          description: "Văn phong hội thoại đầy đủ chuẩn.",
        };
    }
  }
}
