import { invoke } from "@tauri-apps/api/core";

export interface AiMetadataEnrichmentInput {
  title: string;
  author?: string;
  sampleText?: string;
  language?: string;
}

export interface AiMetadataEnrichmentResult {
  title: string;
  author: string;
  genre: string;
  description: string;
  language: string;
  tags: string[];
}

export const AI_METADATA_SYSTEM_PROMPT = `Bạn là Chuyên gia Biên tập & Thư mục Sách Ebook Chuyên Nghiệp (Senior Ebook Cataloger & Editor).
Nhiệm vụ của bạn là phân tích tựa sách/tên truyện, tác giả (nếu có) và trích đoạn nội dung sách (bao gồm cả sách xuất bản lẫn truyện mạng, webnovel, truyện Wattpad, light novel, truyện dịch/convert):
1. Nhận diện tác phẩm: Phân biệt sách xuất bản truyền thống hay truyện mạng/webnovel/Wattpad.
2. Chuẩn hóa tựa đề chính xác, viết hoa đúng quy tắc chính tả tiếng Việt, loại bỏ tên rác hay watermark (ví dụ: "[DTV] Dac Nhan Tam Full.epub" -> "Đắc Nhân Tâm", "[Wattpad] Hon Trom 55 Lan.epub" -> "Hôn Trộm 55 Lần").
3. Chuẩn hóa tên tác giả chuẩn mực (nếu trích đoạn có nhắc tới tác giả gốc, dịch giả hoặc editor thì ghi nhận rõ).
4. Xác định thể loại phù hợp (với truyện mạng: Ngôn tình, Đam mỹ, Tiên hiệp, Huyền huyễn, Trọng sinh, Xuyên không, Hệ thống, Đoản văn, Đồng nhân...; với sách xuất bản: Tiểu thuyết, Kỹ năng sống, Kinh tế, Trinh thám, Lịch sử...).
5. Trích xuất hoặc viết lại Văn án / Lời giới thiệu tóm tắt nội dung sách (Book Synopsis / Blurb) hấp dẫn, sâu sắc bằng tiếng Việt (khoảng 100 - 250 từ) để nhúng vào metadata sách điện tử. Với truyện mạng, giữ đúng văn phong văn án lôi cuốn của tác phẩm.

BẮT BUỘC TRẢ VỀ DUY NHẤT MỘT ĐỐI TƯỢNG JSON (KHÔNG CÓ LỜI DẪN NGOÀI):
{
  "title": "Tựa sách/Tên truyện đã chuẩn hóa",
  "author": "Tên tác giả chuẩn",
  "genre": "Thể loại chính (VD: Ngôn tình, Tiên hiệp, Tiểu thuyết...)",
  "description": "Văn án / Tóm tắt nội dung sách chuẩn mực tiếng Việt...",
  "language": "vi",
  "tags": ["Tag 1", "Tag 2", "Tag 3"]
}`;

export class AiMetadataEnricher {
  public static async enrichMetadata(
    input: AiMetadataEnrichmentInput,
    options: {
      baseUrl: string;
      model: string;
      apiKey?: string;
      gatewayType?: string;
    }
  ): Promise<AiMetadataEnrichmentResult> {
    const { title, author, sampleText } = input;
    const { baseUrl, model, apiKey, gatewayType } = options;

    const sampleExcerpt = sampleText ? sampleText.slice(0, 3000) : "Không có trích đoạn.";

    const userPrompt = `Dữ liệu sách cần làm giàu:
- Tựa sách thô: ${title}
- Tác giả hiện tại: ${author || "Chưa rõ"}
- Trích đoạn chương đầu:
"""
${sampleExcerpt}
"""

Hãy phân tích và trả về đối tượng JSON theo định dạng đã yêu cầu.`;

    // Use OpenCode CLI if gatewayType is opencode
    if (gatewayType === "opencode") {
      const fullPrompt = `${AI_METADATA_SYSTEM_PROMPT}\n\n${userPrompt}`;
      const rawOutput = await invoke<string>("run_opencode_prompt", {
        model,
        prompt: fullPrompt,
      });
      return this.parseJsonResponse(rawOutput, input);
    }

    // Otherwise standard OpenAI-compatible API
    const endpoint = baseUrl.endsWith("/") ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const payload = {
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: AI_METADATA_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`AI Gateway lỗi: HTTP ${res.status} (${res.statusText})`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || "";
    return this.parseJsonResponse(content, input);
  }

  public static parseJsonResponse(
    raw: string,
    fallbackInput: AiMetadataEnrichmentInput
  ): AiMetadataEnrichmentResult {
    let clean = raw.trim();

    // Remove markdown code fences ```json ... ```
    if (clean.includes("```")) {
      const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        clean = match[1].trim();
      }
    }

    // Try finding JSON object braces
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }

    try {
      const parsed = JSON.parse(clean);
      return {
        title: parsed.title || fallbackInput.title,
        author: parsed.author || fallbackInput.author || "Khuyết Danh",
        genre: parsed.genre || "Chưa phân loại",
        description: parsed.description || "",
        language: parsed.language || fallbackInput.language || "vi",
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      };
    } catch {
      throw new Error("Không thể phân tích phản hồi JSON từ mô hình AI.");
    }
  }
}
