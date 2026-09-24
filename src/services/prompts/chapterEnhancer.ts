import { ChapterEnhancePlan } from "../../utils/chapterTransformer";

export const CHAPTER_ENHANCER_SYSTEM_PROMPT = `Bạn là chuyên gia biên tập và xuất bản sách điện tử chuyên nghiệp tiếng Việt.
Nhiệm vụ của bạn là phân tích nội dung chương sách được đánh số đoạn văn [p_0], [p_1], [p_2]... và thực hiện:

1. CHUẨN HÓA TIÊU ĐỀ CHƯƠNG (h1_title):
- Xác định tiêu đề chính xác, trang trọng của chương sách (ví dụ: "Chương Mở Đầu: Các thói quen có thể thay đổi cuộc đời bạn" hoặc "Thói Quen Thứ 1: Chấp nhận toàn bộ con người mình").

2. DỌN DẸP CÁC THẺ TOP RÁC (top_junk_indices):
- Liệt kê các index số nguyên [0, 1, 2...] của các đoạn văn ở đầu chương là rác thừa (như tiêu đề sách lặp lại nhiều lần, tên tác giả thừa, số trang ngắt dòng, dòng rác từ bản scan OCR).

3. BỔ SUNG CÁC HEADING PHÂN CẤP (headings):
- Chia cấu trúc nội dung dài thành các phần mạch lạc.
- Sử dụng "h2" cho các phần lớn (ví dụ: "1. Tìm hiểu những người đã vượt qua nghịch cảnh", "2. Nghiên cứu những lối suy nghĩ vượt thời gian").
- Sử dụng "h3" cho các phương pháp hoặc tiểu mục con (ví dụ: "Phương pháp Nâng cao đánh giá về bản thân").
- Chỉ định rõ "before_paragraph_index" (số nguyên đại diện cho đoạn văn mà heading này cần đứng trước).

4. SỬA LỖI CHÍNH TẢ & GÕ DẤU TIẾNG VIỆT (spelling_corrections):
- Quét từng đoạn văn để phát hiện:
  + Lỗi chính tả dấu hỏi/ngã (ví dụ: "tiêu sử" -> "tiểu sử", "phẩu thuật" -> "phẫu thuật", "nổ lực" -> "nỗ lực", "nữa vời" -> "nửa vời").
  + Lỗi gõ sai vị trí dấu (ví dụ: "của tôi" thay vì vị trí sai, "hoà" / "hòa").
  + Lỗi gõ dấu telex / VNI (ví dụ: "cuộc sông" -> "cuộc sống").
  + Lỗi nhầm lẫn ký tự hoặc phụ âm (ví dụ: "New Yord Yankees" -> "New York Yankees", "chuyển dang" -> "chuyển sang").
- Nêu rõ: paragraph_id (ví dụ: "p_7"), từ gốc ("original"), từ sửa đúng ("corrected"), lý do lỗi ("reason").

QUY ĐỊNH BẮT BUỘC:
- Trả về DUY NHẤT dữ liệu dạng JSON thuần túy (không bọc codeblock markdown \`\`\`json, không kèm lời bình luận hay giải thích).
- Đúng định dạng cấu trúc sau:
{
  "h1_title": "string",
  "top_junk_indices": [0, 1, 2],
  "headings": [
    { "level": "h2", "title": "string", "before_paragraph_index": 6 },
    { "level": "h3", "title": "string", "before_paragraph_index": 9 }
  ],
  "spelling_corrections": [
    { "paragraph_id": "p_7", "original": "tiêu sử", "corrected": "tiểu sử", "reason": "lỗi chính tả dấu hỏi/ngã" }
  ]
}`;

export interface BuildPromptParams {
  chapterTitle: string;
  paragraphs: Array<{ id: string; index: number; text: string }>;
  features?: {
    standardizeH1?: boolean;
    cleanTopJunk?: boolean;
    addHeadings?: boolean;
    fixVietnameseTypos?: boolean;
  };
}

export function buildChapterEnhancerUserPrompt(params: BuildPromptParams): string {
  const { chapterTitle, paragraphs, features } = params;

  const featureNotes: string[] = [];
  if (features?.standardizeH1 !== false) featureNotes.push("- Chuẩn hóa H1 tiêu đề chương");
  if (features?.cleanTopJunk !== false) featureNotes.push("- Dọn dẹp các thẻ top rác đầu chương");
  if (features?.addHeadings !== false) featureNotes.push("- Bổ sung heading H2/H3 hợp lý");
  if (features?.fixVietnameseTypos !== false) featureNotes.push("- Sửa các lỗi chính tả, hỏi ngã, nhầm ký tự tiếng Việt");

  // Format paragraphs into clean list
  const formattedParagraphs = paragraphs
    .map((p) => `[${p.id}] ${p.text}`)
    .join("\n\n");

  return `CHƯƠNG HIỆN TẠI: "${chapterTitle}"

YÊU CẦU BẬT:
${featureNotes.join("\n")}

NỘI DUNG CÁC ĐOẠN VĂN:
${formattedParagraphs}

Hãy phân tích và trả về kết quả JSON chuẩn xác nhất.`;
}

export function parseChapterEnhancePlan(rawText: string): ChapterEnhancePlan {
  // Strip potential markdown code blocks
  const cleaned = rawText
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/\s*```$/m, "")
    .trim();

  // Find the outermost JSON object
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Không tìm thấy cấu trúc JSON hợp lệ trong phản hồi AI");
  }

  const jsonString = cleaned.slice(firstBrace, lastBrace + 1);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`Lỗi phân tích cú pháp JSON từ phản hồi AI: ${err}`);
  }

  function isRecord(val: unknown): val is Record<string, unknown> {
    return typeof val === "object" && val !== null;
  }

  const topJunk = Array.isArray(parsed.top_junk_indices)
    ? (parsed.top_junk_indices.filter((n: unknown): n is number => typeof n === "number") as number[])
    : [];

  const rawHeadings = Array.isArray(parsed.headings) ? parsed.headings : [];
  const headings = rawHeadings
    .filter(
      (h: unknown): h is Record<string, unknown> =>
        isRecord(h) && typeof h.title === "string"
    )
    .map((h) => ({
      level: (h.level === "h3" ? "h3" : "h2") as "h2" | "h3",
      title: String(h.title).trim(),
      before_paragraph_index: Number(h.before_paragraph_index || 0),
    }));

  const rawCorrections = Array.isArray(parsed.spelling_corrections) ? parsed.spelling_corrections : [];
  const spellingCorrections = rawCorrections
    .filter(
      (c: unknown): c is Record<string, unknown> =>
        isRecord(c) &&
        typeof c.paragraph_id === "string" &&
        typeof c.original === "string" &&
        typeof c.corrected === "string"
    )
    .map((c) => ({
      paragraph_id: String(c.paragraph_id).trim(),
      original: String(c.original).trim(),
      corrected: String(c.corrected).trim(),
      reason: typeof c.reason === "string" ? c.reason.trim() : "Lỗi chính tả",
    }));

  return {
    h1_title: typeof parsed.h1_title === "string" ? parsed.h1_title.trim() : undefined,
    top_junk_indices: topJunk,
    headings,
    spelling_corrections: spellingCorrections,
  };
}
