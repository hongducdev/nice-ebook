export interface AiStylingResult {
  theme_name: string;
  genre_analysis: string;
  colors: {
    bg: string;
    text: string;
    accent: string;
    border: string;
    cardBg: string;
  };
  typography: {
    font_family: string;
    line_height: number;
    first_line_indent: string;
    drop_caps: boolean;
    scene_divider: string;
  };
  custom_css: string;
}

export const EBOOK_STYLING_SYSTEM_PROMPT = `Bạn là chuyên gia thiết kế mỹ thuật và typography sách xuất bản quốc tế (Book Interior Designer).
Nhiệm vụ của bạn là phân tích ngữ cảnh, thể loại, văn phong của tác phẩm và tạo ra một bộ phong cách CSS hoàn chỉnh, độc bản cho cuốn sách.

Quy tắc bắt buộc:
1. Đảm bảo độ tương phản cao, dễ đọc trong thời gian dài (chuẩn WCAG AA).
2. Màu nền tối/ấm (Dark, Sepia, Parchment, OLED Dark) bảo vệ mắt người đọc.
3. Luôn phản hồi DUY NHẤT một khối JSON hợp lệ theo cấu trúc sau (không kèm lời mở đầu hay giải thích markdown ngoài JSON):
{
  "theme_name": "Tên phong cách gợi ý (VD: Tiên Hiệp Ma Đạo, Cyberpunk Dạ Hành...)",
  "genre_analysis": "Mô tả ngắn gọn về không khí văn phong tác phẩm (1-2 câu)",
  "colors": {
    "bg": "#màu nền hex",
    "text": "#màu chữ hex",
    "accent": "#màu điểm nhấn tiêu đề hex",
    "border": "#màu đường kẻ hex",
    "cardBg": "#màu nền khối trích dẫn hex"
  },
  "typography": {
    "font_family": "Tên font CSS ưu tiên (VD: 'Noto Serif', 'Lora', 'Inter', 'JetBrains Mono', serif...)",
    "line_height": 1.75,
    "first_line_indent": "2em",
    "drop_caps": true,
    "scene_divider": "Ký tự phân cách cảnh (VD: ✦ ✦ ✦, ☁ ☁ ☁, — ❖ —)"
  },
  "custom_css": "Các quy tắc CSS bổ sung dành riêng cho sách (h1, blockquote, drop-cap...)"
}`;

export function buildStylingUserPrompt(
  title: string,
  author: string,
  sampleText: string,
  jevGenreHint?: string
): string {
  const snippet = sampleText.slice(0, 3000);
  return `Hãy thiết kế phong cách typography và CSS cho cuốn sách sau:
Tiêu đề: ${title}
Tác giả: ${author}
Gợi ý thể loại sơ bộ từ Jev Core: ${jevGenreHint || "Chưa rõ"}

Đoạn văn trích dẫn từ sách:
"""
${snippet}
"""

Hãy trả về mã JSON theo đúng quy cách đã yêu cầu.`;
}
