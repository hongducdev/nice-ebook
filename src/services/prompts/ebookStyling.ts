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

// ---------------------------------------------------------------------------
// AI Style Audit & Fix on Original Book Styles
// ---------------------------------------------------------------------------

export type StyleAuditCategory = "typography" | "contrast" | "spacing" | "headings" | "compatibility";
export type StyleAuditStatus = "pass" | "warning" | "issue";

export interface AiStyleAuditItem {
  category: StyleAuditCategory;
  status: StyleAuditStatus;
  title: string;
  detail: string;
  fixRecommendation?: string;
}

export interface AiStyleAuditResult {
  overallScore: number; // 0 - 100
  summary: string;
  preservationNotes: string;
  auditItems: AiStyleAuditItem[];
  suggestedTypography: {
    fontFamily?: string;
    fontSize?: number;
    lineHeight?: number;
    textAlign?: "justify" | "left";
    firstLineIndent?: string;
    dropCaps?: boolean;
    sceneDivider?: string;
  };
  customCssOverrides: string;
  explanation: string;
}

export const AI_STYLE_AUDIT_SYSTEM_PROMPT = `Bạn là chuyên gia kiểm tra và tinh chỉnh typography sách số (Digital Book Typography & EPUB Auditor).
Nhiệm vụ của bạn là kiểm tra CSS gốc của sách (original book stylesheet), phát hiện các nhược điểm về hiển thị, khả năng đọc, lỗi font tiếng Việt, độ tương phản và quy chuẩn e-reader; sau đó đề xuất các tinh chỉnh và quy tắc CSS bổ trợ TRỰC TIẾP TRÊN NỀN STYLE GỐC đó, tuyệt đối KHÔNG đập bỏ hay thay thế phong cách nguyên bản của nhà xuất bản.

Các tiêu chí kiểm tra bắt buộc:
1. Font & Dấu Tiếng Việt: Nếu là sách tiếng Việt, kiểm tra font gốc có đầy đủ dấu thanh không, đề xuất font fallback chuẩn (Literata, Lora, Be Vietnam Pro, Merriweather).
2. Độ tương phản & Khả năng đọc: Đảm bảo độ tương phản chữ/nền đạt chuẩn WCAG AA, không dùng màu cố định cứng gây lỗi khi chuyển chế độ Sáng/Tối/Sepia trên máy đọc sách.
3. Giãn dòng & Thụt lề (Spacing): Line-height tối ưu cho tiểu thuyết/sách dài (1.6 - 1.8), thụt lề đầu dòng chuẩn (1.5em - 2em).
4. Phân cấp tiêu đề (Headings): Tiêu đề chương h1/h2 rõ ràng, có khoảng đệm phía trên và tránh bị dính trang (break-inside: avoid).
5. Tương thích E-Reader / Kindle: Tránh các thuộc tính CSS3 phức tạp hoặc fixed width làm vỡ màn hình nhỏ.

Luôn phản hồi DUY NHẤT một khối JSON hợp lệ theo cấu trúc sau (không kèm markdown ngoài khối JSON):
{
  "overallScore": 85,
  "summary": "Tóm tắt ngắn gọn 1-2 câu về tình trạng style gốc và hướng cải thiện.",
  "preservationNotes": "Những nét đặc trưng của sách gốc được giữ nguyên (màu sắc, cấu trúc, font cơ bản...).",
  "auditItems": [
    {
      "category": "typography",
      "status": "warning",
      "title": "Font chữ gốc chưa tối ưu dấu thanh tiếng Việt",
      "detail": "CSS gốc sử dụng font có thể bị nhảy chữ khi hiển thị tiếng Việt có dấu phức tạp.",
      "fixRecommendation": "Bổ sung Literata / Be Vietnam Pro vào đầu danh sách font fallback."
    }
  ],
  "suggestedTypography": {
    "fontFamily": "'Literata', 'Noto Serif', serif",
    "fontSize": 16,
    "lineHeight": 1.7,
    "textAlign": "justify",
    "firstLineIndent": "1.5em",
    "dropCaps": false,
    "sceneDivider": "* * *"
  },
  "customCssOverrides": "/* Các quy tắc CSS bổ trợ an toàn, chỉ ghi đè những gì cần sửa */",
  "explanation": "Giải thích chi tiết các điểm đã tối ưu hóa."
}`;

export function buildStyleAuditUserPrompt(params: {
  title: string;
  author: string;
  originalCss: string;
  signatureSummary?: string;
  sampleText: string;
  isVietnamese?: boolean;
}): string {
  const { title, author, originalCss, signatureSummary, sampleText, isVietnamese } = params;
  const cssSnippet = originalCss ? originalCss.slice(0, 4000) : "/* Không có stylesheet ngoài (dùng mặc định) */";
  const textSnippet = sampleText.slice(0, 1500);

  return `Hãy kiểm tra và tinh chỉnh style cho cuốn sách sau dựa trên CSS gốc của nó:
Tiêu đề: ${title}
Tác giả: ${author || "Chưa rõ"}
Ngôn ngữ: ${isVietnamese ? "Tiếng Việt (Cần tối ưu dấu thanh)" : "Ngoại ngữ"}
Đặc trưng phân tích tự động từ CSS gốc: ${signatureSummary || "Chưa xác định"}

Trích đoạn CSS gốc của sách:
\`\`\`css
${cssSnippet}
\`\`\`

Trích đoạn nội dung sách:
"""
${textSnippet}
"""

Hãy trả về mã JSON theo đúng quy cách đã yêu cầu. Tuyệt đối tôn trọng style gốc của sách, chỉ đưa ra các quy tắc CSS bổ trợ để sửa lỗi hiển thị và tăng trải nghiệm đọc.`;
}

/**
 * Tạo báo cáo kiểm tra và tinh chỉnh cục bộ offline (deterministic heuristic fallback)
 * khi không có kết nối tới AI Gateway hoặc AI gặp lỗi mạng.
 */
export function generateOfflineStyleAuditFallback(params: {
  title: string;
  author?: string;
  originalCss?: string;
  signature?: {
    fontFamily: string | null;
    fontSize: number | null;
    lineHeight: number | null;
    textAlign: "justify" | "left" | null;
    firstLineIndent: string | null;
    confidence: number;
    colors: { bg: string | null; text: string | null; accent: string | null };
  } | null;
  isVietnamese?: boolean;
}): AiStyleAuditResult {
  const { title, originalCss = "", signature, isVietnamese = true } = params;
  const auditItems: AiStyleAuditItem[] = [];
  let score = 90;

  // 1. Font & Diacritics Check
  const currentFont = signature?.fontFamily || "";
  const hasVietnameseFont =
    /Literata|Lora|Be Vietnam|Merriweather|Source Serif/i.test(currentFont);

  if (isVietnamese && !hasVietnameseFont) {
    auditItems.push({
      category: "typography",
      status: "warning",
      title: "Phông chữ chưa ưu tiên tối ưu tiếng Việt",
      detail: currentFont
        ? `Font gốc '${currentFont.split(",")[0]}' có thể thiếu dấu thanh hoặc bị lỗi chân chữ tiếng Việt trên một số thiết bị.`
        : "Sách chưa chỉ định phông chữ có hỗ trợ đầy đủ bộ dấu tiếng Việt.",
      fixRecommendation: "Ưu tiên Literata và Be Vietnam Pro trong font-family để hiển thị dấu thanh mượt mà.",
    });
    score -= 8;
  } else {
    auditItems.push({
      category: "typography",
      status: "pass",
      title: "Hệ thống phông chữ",
      detail: currentFont
        ? `Phông chữ gốc '${currentFont.split(",")[0]}' hiển thị tốt.`
        : "Đã thiết lập phông chữ tiêu chuẩn cho sách.",
    });
  }

  // 2. Line Height & Reading Strain Check
  const lh = signature?.lineHeight;
  if (!lh || lh < 1.5) {
    auditItems.push({
      category: "spacing",
      status: "warning",
      title: "Khoảng cách dòng hơi sít sao",
      detail: `Khoảng cách dòng hiện tại (${lh ? lh.toFixed(2) : "mặc định"}) có thể gây mỏi mắt khi đọc chương dài trên màn hình.`,
      fixRecommendation: "Nâng độ giãn dòng lên 1.70 - 1.75 để tăng độ thoáng và dễ theo dõi dòng chữ.",
    });
    score -= 6;
  } else if (lh > 2.1) {
    auditItems.push({
      category: "spacing",
      status: "warning",
      title: "Khoảng cách dòng quá thưa",
      detail: `Độ giãn dòng ${lh.toFixed(2)} làm ngắt quãng trải nghiệm đọc.`,
      fixRecommendation: "Điều chỉnh về mức 1.75 tiêu chuẩn của sách xuất bản.",
    });
    score -= 4;
  } else {
    auditItems.push({
      category: "spacing",
      status: "pass",
      title: "Độ giãn dòng (Line Height)",
      detail: `Độ giãn dòng ${lh.toFixed(2)} đạt chuẩn xuất bản tối ưu.`,
    });
  }

  // 3. Paragraph Indentation
  const indent = signature?.firstLineIndent;
  if (!indent || indent === "0" || indent === "0em" || indent === "0px") {
    auditItems.push({
      category: "spacing",
      status: "warning",
      title: "Thiếu thụt lề đầu dòng đoạn văn",
      detail: "Các đoạn văn có thể dính liền nhau nếu không có khoảng cách đoạn hoặc thụt lề đầu dòng rõ rệt.",
      fixRecommendation: "Áp dụng thụt lề 1.5em cho câu mở đầu của mỗi đoạn văn.",
    });
    score -= 5;
  } else {
    auditItems.push({
      category: "spacing",
      status: "pass",
      title: "Thụt lề đoạn văn",
      detail: `Thụt lề đầu dòng '${indent}' rõ ràng, dễ phân biệt các đoạn.`,
    });
  }

  // 4. Headings & Structural Hierarchy
  const hasHeadingRules = /h1\b|h2\b/i.test(originalCss);
  if (!hasHeadingRules) {
    auditItems.push({
      category: "headings",
      status: "warning",
      title: "Định dạng tiêu đề chương còn đơn giản",
      detail: "CSS gốc chưa có quy tắc căn giữa hoặc khoảng cách đệm cho tiêu đề h1/h2.",
      fixRecommendation: "Thêm khoảng đệm trên/dưới và căn giữa cho tiêu đề chương.",
    });
    score -= 5;
  } else {
    auditItems.push({
      category: "headings",
      status: "pass",
      title: "Phân cấp tiêu đề",
      detail: "CSS gốc đã có định dạng riêng cho tiêu đề chương.",
    });
  }

  // 5. Kindle & E-Reader Safe Compatibility
  const hasRigidWidth = /width:\s*\d+px/i.test(originalCss);
  if (hasRigidWidth) {
    auditItems.push({
      category: "compatibility",
      status: "issue",
      title: "Phát hiện kích thước pixel cố định",
      detail: "Có quy tắc CSS dùng độ rộng px cố định, có thể tràn viền trên màn hình Kindle hoặc điện thoại.",
      fixRecommendation: "Sử dụng max-width: 100% để co giãn linh hoạt theo khổ màn hình.",
    });
    score -= 8;
  } else {
    auditItems.push({
      category: "compatibility",
      status: "pass",
      title: "Tương thích máy đọc sách",
      detail: "Không phát hiện quy tắc gây lỗi tràn khung trên màn hình nhỏ.",
    });
  }

  const finalScore = Math.max(50, Math.min(100, score));

  // Build targeted custom CSS overrides that complement the original style
  const recommendedFont = isVietnamese
    ? "'Literata', 'Lora', 'Be Vietnam Pro', serif"
    : "'Noto Serif', 'Times New Roman', serif";

  const customCssRules = [
    `/* Bổ trợ bởi AI Style Auditor cho "${title}" */`,
    `/* Đảm bảo hiển thị chuẩn trên màn hình máy đọc sách Kindle & Kobo */`,
    `body {`,
    `  font-family: ${recommendedFont};`,
    `  line-height: ${lh && lh >= 1.5 && lh <= 2.0 ? lh : 1.75};`,
    `  text-align: ${signature?.textAlign || "justify"};`,
    `}`,
    `p {`,
    `  text-indent: ${indent && indent !== "0" && indent !== "0em" ? indent : "1.5em"};`,
    `  margin-top: 0;`,
    `  margin-bottom: 0.5em;`,
    `}`,
    `h1, h2, h3 {`,
    `  text-align: center;`,
    `  margin-top: 1.5em;`,
    `  margin-bottom: 1em;`,
    `  page-break-after: avoid;`,
    `  break-after: avoid;`,
    `}`,
    `img {`,
    `  max-width: 100%;`,
    `  height: auto;`,
    `}`,
  ].join("\n");

  return {
    overallScore: finalScore,
    summary: `Đã kiểm tra CSS gốc của "${title}". Điểm đánh giá: ${finalScore}/100. Phong cách tổng thể được bảo toàn, đề xuất tinh chỉnh độ thoáng dòng và font tiếng Việt.`,
    preservationNotes: "Giữ nguyên cấu trúc bảng màu, lề trang và bố cục gốc của nhà xuất bản; chỉ bổ sung tinh chỉnh tương thích và độ thoáng khi đọc.",
    auditItems,
    suggestedTypography: {
      fontFamily: recommendedFont,
      lineHeight: lh && lh >= 1.5 && lh <= 2.0 ? lh : 1.75,
      firstLineIndent: indent && indent !== "0" && indent !== "0em" ? indent : "1.5em",
      textAlign: signature?.textAlign || "justify",
    },
    customCssOverrides: customCssRules,
    explanation: "Đã phân tích các token định dạng gốc từ sách và bổ sung các quy tắc cải thiện khả năng đọc mà không làm mất chất riêng của sách.",
  };
}

/**
 * Loại bỏ các thẻ hoặc cú pháp nguy hiểm trong mã CSS sinh ra bởi AI.
 */
export function sanitizeCssOverrides(rawCss: string): string {
  if (!rawCss) return "";
  return rawCss
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>|<\/style>/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .trim();
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
