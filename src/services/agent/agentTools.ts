/**
 * Agent Tools Registry & Execution Facade.
 *
 * Enforces strict safety boundary:
 * - Read-only tools can be executed automatically by the agent loop.
 * - Mutating tools are STRUCTURALLY UNROUTABLE to auto-execution in the agent loop.
 *   They can only generate an ActionProposal that requires explicit user confirmation.
 * - Jev Guardrail Gatekeeper verifies parameters for path traversal / command injection.
 * - Secret Scrubber masks sensitive tokens before returning data to LLM context.
 */

import { maskSecrets } from "../../utils/secretScrubber";
import { STYLE_PRESETS } from "../../presets/styles";
import type { ActiveTab } from "../../types/navigation";

export type ToolVerdict = "allow" | "warn" | "block";

export interface ToolSecurityVerdict {
  verdict: ToolVerdict;
  riskScore: number;
  reason: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  isMutating: boolean;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
        items?: Record<string, unknown>;
      }
    >;
    required?: string[];
  };
}

export interface ActionProposal {
  id: string;
  toolName: string;
  title: string;
  description: string;
  parameters: Record<string, unknown>;
  diffSummary?: Array<{ field: string; before: string; after: string }>;
  createdAt: number;
}

export interface ReadOnlyStoreContext {
  currentBook: {
    title: string;
    author: string;
    language: string;
    description: string | null;
    chapter_count: number;
    chapters: Array<{ id: string; href: string; title: string; preview_text: string }>;
  } | null;
  activePresetId: string;
  fontSize: number;
  lineHeight: number;
  dropCaps: boolean;
  textAlign?: "justify" | "left";
  fontFamily?: string;
  activeChapterIndex: number;
  activeTab: string;
  modifiedChapters: Record<string, string>;
  translationConfig: {
    sourceLang: string;
    targetLang: string;
    mode: string;
    tone: string;
    glossary: Record<string, string>;
  };
  workflowJobs?: Record<string, unknown>;
  xrayData?: {
    people?: Array<{ name: string; description?: string }>;
    terms?: Array<{ name: string; description?: string }>;
  } | null;
  readChapterText: (index: number) => Promise<string>;
  setActiveTab: (tab: ActiveTab) => void;
  setActiveChapterIndex: (index: number) => void;
  openExportModal?: () => void;
  cavemanMode?: "off" | "lite" | "full" | "ultra";
}

export interface MutatingStoreContext {
  updateBookMetadata: (meta: Record<string, unknown>) => void;
  selectPreset: (presetId: string) => void;
  updateTypography: (typo: Record<string, unknown>) => void;
  setTranslationConfig: (config: Record<string, unknown>) => void;
  setChapterHtml?: (chapterHref: string, html: string) => void;
  updateChapterTitle?: (chapterIndex: number, newTitle: string) => Promise<boolean>;
  batchUpdateChapterTitles?: (updates: Array<{ chapterIndex: number; newTitle: string }>) => Promise<number>;
  /** Null when the book was loaded from bytes; used to report saves accurately. */
  currentFilePath?: string | null;
  translateSingleChapter?: (chapterIndex: number) => Promise<boolean>;
  batchTranslateChapters?: (chapterIndices?: number[], skipAlreadyTranslated?: boolean) => Promise<boolean>;
  enhanceSingleChapter?: (chapterIndex: number, features?: Record<string, unknown>) => Promise<boolean>;
  runXRayExtraction?: () => Promise<unknown>;
  embedXRayAppendixToBook?: () => Promise<boolean>;
  cleanWatermarksInBook?: (keywords?: string[]) => Promise<unknown>;
  setActiveTab?: (tab: ActiveTab) => void;
  openExportModal?: () => void;
  saveActiveProject?: () => void;
  autoSaveMetadataToFile?: () => Promise<boolean>;
  currentBook?: {
    title: string;
    author: string;
    chapters: Array<{ id: string; href: string; title: string; preview_text: string }>;
  } | null;
  readChapterText?: (index: number) => Promise<string>;
}

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "get_project_status",
    description: "Lấy thông tin tổng quan về cuốn sách hiện tại: tiêu đề, tác giả, số chương, preset giao diện, số chương đã biên tập/dịch.",
    isMutating: false,
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_chapters",
    description: "Xem danh sách các chương của sách hiện tại kèm số thứ tự, tiêu đề và trạng thái biên tập/dịch.",
    isMutating: false,
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Số lượng chương tối đa cần lấy (mặc định 20, tối đa 200)" },
        offset: { type: "number", description: "Vị trí bắt đầu (bỏ qua N chương đầu, mặc định 0)" },
        search: { type: "string", description: "Từ khóa lọc tiêu đề chương (tùy chọn)" },
      },
    },
  },
  {
    name: "read_chapter_excerpt",
    description: "Đọc nội dung văn bản hoặc trích đoạn của một chương cụ thể trong sách để tóm tắt hoặc trả lời thắc mắc. Mặc định đọc chương đang chọn xem.",
    isMutating: false,
    parameters: {
      type: "object",
      properties: {
        chapterIndex: { type: "number", description: "Chỉ số chương cần đọc (bắt đầu từ 0). Nếu bỏ trống sẽ đọc chương người dùng đang mở." },
        maxChars: { type: "number", description: "Số ký tự tối đa cần đọc (mặc định 2000)" },
      },
    },
  },
  {
    name: "search_book_content",
    description: "Tìm kiếm từ khóa, tên nhân vật hoặc cụm từ xuất hiện trong toàn bộ các chương của cuốn sách hiện tại.",
    isMutating: false,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Từ khóa hoặc đoạn văn bản cần tìm kiếm" },
        maxResults: { type: "number", description: "Số lượng kết quả trích đoạn tối đa (mặc định 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_translation_status",
    description: "Xem chi tiết tiến độ dịch thuật, cặp ngôn ngữ, phong cách dịch và số lượng thuật ngữ trong Glossary.",
    isMutating: false,
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "navigate_tab",
    description: "Chuyển giao diện làm việc sang tab khác trong ứng dụng (ví dụ: 'reader' để đọc sách, 'translator' để dịch, 'editor' để chỉnh font/CSS, 'presets' để chọn phong cách).",
    isMutating: false,
    parameters: {
      type: "object",
      properties: {
        tab: {
          type: "string",
          description: "Tên tab cần chuyển đến",
          enum: ["books", "presets", "editor", "reader", "ai", "settings", "ai-editor", "converter", "kindle", "translator"],
        },
        chapterIndex: { type: "number", description: "Chỉ số chương cần chuyển đến (tùy chọn)" },
      },
      required: ["tab"],
    },
  },
  {
    name: "update_metadata",
    description: "Đề xuất cập nhật thông tin tác phẩm (tên sách, tác giả, mô tả, nhà xuất bản, năm xuất bản). Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Tên sách mới" },
        author: { type: "string", description: "Tên tác giả mới" },
        description: { type: "string", description: "Mô tả / tóm tắt nội dung sách" },
        publisher: { type: "string", description: "Nhà xuất bản" },
        published_year: { type: "string", description: "Năm phát hành" },
      },
    },
  },
  {
    name: "apply_style_preset",
    description: "Đề xuất đổi phong cách giao diện (preset) chuẩn của NiceEbook Studio cho cuốn sách. Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        presetId: {
          type: "string",
          description: "ID preset (wuxia-ancient: Cổ Phong / Tiên Hiệp, lightnovel-clean: Light Novel / Anime, scifi-neon: Khoa Học Viễn Tưởng, classic-hardcover: Văn Học Bìa Cứng, mystery-dark: Bí Ẩn / Trinh Thám)",
          enum: ["wuxia-ancient", "lightnovel-clean", "scifi-neon", "classic-hardcover", "mystery-dark"],
        },
        fontSize: { type: "number", description: "Cỡ chữ (px, từ 12 đến 28)" },
        dropCaps: { type: "boolean", description: "Bật/tắt chữ hoa đầu dòng (drop caps)" },
        lineHeight: { type: "number", description: "Khoảng cách giãn dòng (1.2 đến 2.5)" },
      },
      required: ["presetId"],
    },
  },
  {
    name: "update_typography",
    description: "Đề xuất điều chỉnh chi tiết kiểu chữ (cỡ chữ, khoảng cách giãn dòng, căn lề, chữ hoa đầu đoạn). Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        fontSize: { type: "number", description: "Cỡ chữ (px, từ 12 đến 28)" },
        lineHeight: { type: "number", description: "Khoảng cách giãn dòng (ví dụ: 1.5, 1.75, 2.0)" },
        textAlign: {
          type: "string",
          description: "Căn lề văn bản ('justify': căn đều 2 bên, 'left': căn trái)",
          enum: ["justify", "left"],
        },
        dropCaps: { type: "boolean", description: "Bật/tắt chữ hoa lớn đầu đoạn" },
      },
    },
  },
  {
    name: "clean_watermarks",
    description: "Đề xuất quét và làm sạch toàn bộ watermark quảng cáo, link web rác chèn trong sách. Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "object", description: "Danh sách từ khóa bổ sung cần lọc bỏ (tùy chọn)" },
      },
    },
  },
  {
    name: "manage_glossary",
    description: "Đề xuất thêm các từ khóa, tên riêng hoặc thuật ngữ dịch vào bảng Glossary của cuốn sách. Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        terms: { type: "object", description: "Bảng cặp từ khóa: {'Từ gốc': 'Bản dịch'}" },
      },
      required: ["terms"],
    },
  },
  {
    name: "get_workflow_status",
    description: "Tra cứu trạng thái các tác vụ nền đang chạy (dịch thuật, enhance, trích xuất X-Ray, OCR...).",
    isMutating: false,
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "translate_chapter",
    description: "Đề xuất dịch một chương sách từ ngôn ngữ gốc sang ngôn ngữ đích qua AI Gateway. Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        chapterIndex: { type: "number", description: "Chỉ số chương cần dịch (bắt đầu từ 0)" },
        targetLang: { type: "string", description: "Ngôn ngữ đích (ví dụ: vi, en, ja, fr, zh)" },
      },
      required: ["chapterIndex"],
    },
  },
  {
    name: "batch_translate_chapters",
    description: "Kích hoạt tiến trình dịch thuật AI tự động cho toàn bộ sách hoặc tất cả các chương chưa dịch. Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["unprocessed", "all"],
          description: "Phạm vi dịch: 'unprocessed' (các chương chưa dịch) hoặc 'all' (toàn bộ sách)",
        },
      },
      required: ["scope"],
    },
  },
  {
    name: "update_chapter_title",
    description: "Đề xuất đổi hoặc sửa tiêu đề của một chương trong sách. Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        chapterIndex: { type: "number", description: "Chỉ số chương cần đổi tiêu đề (bắt đầu từ 0)" },
        newTitle: { type: "string", description: "Tiêu đề mới cho chương" },
      },
      required: ["chapterIndex", "newTitle"],
    },
  },
  {
    name: "batch_update_chapter_titles",
    description: "Đề xuất đổi hoặc dịch tiêu đề hàng loạt cho nhiều chương sách cùng lúc. Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          description: "Danh sách các chương cần cập nhật tiêu đề",
          items: {
            type: "object",
            properties: {
              chapterIndex: { type: "number", description: "Chỉ số chương (bắt đầu từ 0)" },
              newTitle: { type: "string", description: "Tiêu đề mới của chương" },
            },
            required: ["chapterIndex", "newTitle"],
          },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "enhance_chapter",
    description: "Đề xuất chuẩn hóa định dạng chương: sửa lỗi chính tả, chuẩn hóa tiêu đề H1 và xóa rác/watermark. Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        chapterIndex: { type: "number", description: "Chỉ số chương cần tối ưu (bắt đầu từ 0)" },
        standardizeH1: { type: "boolean", description: "Chuẩn hóa tiêu đề H1 theo danh mục" },
        cleanWatermarks: { type: "boolean", description: "Quét và xóa watermark/rác đầu chương" },
      },
      required: ["chapterIndex"],
    },
  },
  {
    name: "extract_xray_entities",
    description: "Đề xuất trích xuất danh sách nhân vật, địa danh và thuật ngữ cho tính năng Kindle X-Ray. Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        autoEmbedAppendix: { type: "boolean", description: "Tự động nhúng phụ lục X-Ray vào cuối sách (mặc định true)" },
      },
    },
  },
  {
    name: "export_book",
    description: "Đề xuất xuất sách đã tinh chỉnh sang định dạng chuẩn (EPUB, AZW3, MOBI). Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        format: {
          type: "string",
          description: "Định dạng xuất (epub, azw3, mobi)",
          enum: ["epub", "azw3", "mobi"],
        },
      },
      required: ["format"],
    },
  },
  {
    name: "save_project",
    description: "Lưu toàn bộ thay đổi của cuốn sách (tên sách, tác giả, metadata, kiểu dáng, nội dung các chương) vào dự án và trực tiếp ghi an toàn vào file sách trên máy tính.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "import_content_snippet",
    description: "Đề xuất chỉnh sửa trực tiếp hoặc chèn nội dung trích đoạn/lời tựa vào một chương cụ thể. Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        chapterIndex: { type: "number", description: "Chỉ số chương cần chèn/sửa" },
        snippet: { type: "string", description: "Nội dung văn bản/HTML cần chèn hoặc thay thế" },
        mode: {
          type: "string",
          description: "Chế độ chèn ('prepend', 'append', 'replace')",
          enum: ["prepend", "append", "replace"],
        },
      },
      required: ["chapterIndex", "snippet"],
    },
  },
];

export class AgentToolDispatcher {
  /**
   * Jev Guardrail - Tool Security Gatekeeper
   * Analyzes parameters and tool type to produce ALLOW / WARN / BLOCK verdicts.
   */
  public static evaluateToolCall(
    toolName: string,
    params: Record<string, unknown>
  ): ToolSecurityVerdict {
    const tool = AGENT_TOOLS.find((t) => t.name === toolName);
    if (!tool) {
      return {
        verdict: "block",
        riskScore: 9.0,
        reason: `Công cụ "${toolName}" không tồn tại trong danh mục cho phép.`,
      };
    }

    // Inspect all parameter values recursively for dangerous patterns (Path Traversal, command injection, script tags)
    const dangerousCommandPattern = /(?:\brm\s+-[a-z]*r[a-z]*\b|\bDROP\s+TABLE\b|<\s*script\b|javascript\s*:)/i;
    const dangerousPathPattern = /(?:(?:^|[/\\])\.\.[/\\]|\/etc\/(?:passwd|shadow))/i;
    const stack: unknown[] = [params];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== "object") continue;

      for (const [key, val] of Object.entries(current as Record<string, unknown>)) {
        if (typeof val === "string") {
          if (dangerousCommandPattern.test(val) || dangerousPathPattern.test(val)) {
            return {
              verdict: "block",
              riskScore: 10.0,
              reason: `Phát hiện tham số không an toàn trong trường "${key}" (chứa ký tự nguy hiểm hoặc đường dẫn cấm).`,
            };
          }
        } else if (typeof val === "object" && val !== null) {
          stack.push(val);
        }
      }
    }

    if (tool.isMutating) {
      return {
        verdict: "warn",
        riskScore: 5.0,
        reason: `Công cụ thay đổi trạng thái "${toolName}" cần xác nhận từ người dùng.`,
      };
    }

    return {
      verdict: "allow",
      riskScore: 1.0,
      reason: "Thao tác đọc an toàn.",
    };
  }

  /**
   * Executes a read-only tool. If a mutating tool name is passed here,
   * it throws an invariant error immediately.
   */
  public static async executeReadOnlyTool(
    toolName: string,
    params: Record<string, unknown>,
    ctx: ReadOnlyStoreContext
  ): Promise<string> {
    const security = this.evaluateToolCall(toolName, params);
    if (security.verdict === "block") {
      throw new Error(`[Jev Guardrail - BLOCK]: ${security.reason}`);
    }
    const tool = AGENT_TOOLS.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Công cụ không xác định: "${toolName}"`);
    }

    if (tool.isMutating) {
      throw new Error(
        `Vi phạm quyền an toàn: Công cụ thay đổi dữ liệu "${toolName}" không thể tự động thực thi mà phải qua ActionProposal xác nhận.`
      );
    }

    let output: string;
    switch (toolName) {
      case "get_project_status": {
        if (!ctx.currentBook) {
          output = "Hiện tại chưa có cuốn sách nào được mở trong dự án.";
          break;
        }
        const b = ctx.currentBook;
        const modCount = Object.keys(ctx.modifiedChapters).length;
        const glossaryCount = Object.keys(ctx.translationConfig.glossary || {}).length;

        output = JSON.stringify(
          {
            title: b.title,
            author: b.author,
            language: b.language,
            chapter_count: b.chapter_count,
            current_preset: ctx.activePresetId,
            font_size: `${ctx.fontSize}px`,
            modified_chapters_count: modCount,
            glossary_terms_count: glossaryCount,
            active_chapter_index: ctx.activeChapterIndex,
            active_tab: ctx.activeTab,
          },
          null,
          2
        );
        break;
      }

      case "list_chapters": {
        if (!ctx.currentBook || ctx.currentBook.chapters.length === 0) {
          output = "Không có danh sách chương.";
          break;
        }
        const limit = typeof params.limit === "number" ? Math.min(200, Math.max(1, params.limit)) : 20;
        const offset = typeof params.offset === "number" ? Math.max(0, params.offset) : 0;
        const search = typeof params.search === "string" ? params.search.toLowerCase().trim() : "";

        let filtered = ctx.currentBook.chapters.map((c, i) => ({
          index: i,
          title: c.title,
          href: c.href,
          is_modified_or_translated: Boolean(ctx.modifiedChapters[c.href]),
        }));

        if (search) {
          filtered = filtered.filter((c) => c.title.toLowerCase().includes(search));
        }

        const sliced = filtered.slice(offset, offset + limit);

        output = JSON.stringify(
          {
            total: ctx.currentBook.chapters.length,
            matching: filtered.length,
            showing: sliced.length,
            offset,
            chapters: sliced,
          },
          null,
          2
        );
        break;
      }

      case "read_chapter_excerpt": {
        const chIdx =
          params.chapterIndex !== undefined && !isNaN(Number(params.chapterIndex))
            ? Number(params.chapterIndex)
            : ctx.activeChapterIndex;

        if (chIdx < 0 || !ctx.currentBook || chIdx >= ctx.currentBook.chapters.length) {
          output = `Lỗi: Chỉ số chương ${params.chapterIndex} không hợp lệ (sách có ${ctx.currentBook?.chapters.length || 0} chương).`;
          break;
        }

        const maxChars = typeof params.maxChars === "number" ? Math.max(200, params.maxChars) : 2000;
        const rawText = await ctx.readChapterText(chIdx);
        const cleanText = rawText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const excerpt = cleanText.slice(0, maxChars);

        // Security Tagging: Content is wrapped in passive data tags so LLMs do not execute commands inside it
        output = `<book_content_data chapter_index="${chIdx}" title="${ctx.currentBook.chapters[chIdx].title}">\n${excerpt}\n</book_content_data>`;
        break;
      }

      case "search_book_content": {
        const query = String(params.query || "").trim();
        if (!query) {
          output = "Vui lòng cung cấp từ khóa cần tìm kiếm (query).";
          break;
        }
        if (!ctx.currentBook || ctx.currentBook.chapters.length === 0) {
          output = "Chưa có sách hoặc danh sách chương để tìm kiếm.";
          break;
        }
        const maxResults = typeof params.maxResults === "number" ? Math.max(1, params.maxResults) : 5;
        const matches: Array<{ chapterIndex: number; chapterTitle: string; snippet: string }> = [];

        for (let i = 0; i < ctx.currentBook.chapters.length && matches.length < maxResults; i++) {
          const ch = ctx.currentBook.chapters[i];
          const text = await ctx.readChapterText(i);
          const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
          const matchIdx = plain.toLowerCase().indexOf(query.toLowerCase());
          if (matchIdx !== -1) {
            const start = Math.max(0, matchIdx - 60);
            const end = Math.min(plain.length, matchIdx + query.length + 80);
            const snippet =
              (start > 0 ? "..." : "") +
              plain.slice(start, end).trim() +
              (end < plain.length ? "..." : "");
            matches.push({
              chapterIndex: i,
              chapterTitle: ch.title,
              snippet,
            });
          }
        }

        output = JSON.stringify(
          {
            query,
            total_matches_found: matches.length,
            matches,
          },
          null,
          2
        );
        break;
      }

      case "get_translation_status": {
        const total = ctx.currentBook?.chapter_count || 0;
        const modCount = Object.keys(ctx.modifiedChapters || {}).length;
        const glossary = ctx.translationConfig.glossary || {};
        output = JSON.stringify(
          {
            source_language: ctx.translationConfig.sourceLang,
            target_language: ctx.translationConfig.targetLang,
            translation_mode: ctx.translationConfig.mode,
            translation_tone: ctx.translationConfig.tone,
            glossary_terms_count: Object.keys(glossary).length,
            glossary_sample: Object.entries(glossary)
              .slice(0, 10)
              .map(([k, v]) => ({ original: k, translated: v })),
            total_chapters: total,
            translated_or_modified_chapters: modCount,
            pending_chapters: Math.max(0, total - modCount),
          },
          null,
          2
        );
        break;
      }

      case "navigate_tab": {
        const tab = String(params.tab) as ActiveTab;
        ctx.setActiveTab(tab);
        if (typeof params.chapterIndex === "number") {
          ctx.setActiveChapterIndex(params.chapterIndex);
        }
        output = `Đã chuyển sang màn hình "${tab}" thành công.`;
        break;
      }
      case "get_workflow_status": {
        const jobs = ctx.workflowJobs || {};
        const jobList = Object.values(jobs);
        if (jobList.length === 0) {
          output = "Hiện tại không có tác vụ nền nào đang chạy hoặc gần đây.";
          break;
        }
        output = JSON.stringify(
          {
            total_jobs: jobList.length,
            jobs: jobList,
          },
          null,
          2
        );
        break;
      }

      default:
        throw new Error(`Chưa hỗ trợ công cụ: ${toolName}`);
    }

    return maskSecrets(output);
  }

  /**
   * Constructs an ActionProposal for a mutating tool.
   */
  public static createActionProposal(
    toolName: string,
    params: Record<string, unknown>,
    ctx: ReadOnlyStoreContext
  ): ActionProposal {
    const security = this.evaluateToolCall(toolName, params);
    if (security.verdict === "block") {
      throw new Error(`[Jev Guardrail - BLOCK]: ${security.reason}`);
    }

    const tool = AGENT_TOOLS.find((t) => t.name === toolName);
    if (!tool || !tool.isMutating) {
      throw new Error(`Không thể tạo đề xuất cho công cụ không thay đổi dữ liệu: "${toolName}"`);
    }

    const proposalId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    switch (toolName) {
      case "update_metadata": {
        const diffs: Array<{ field: string; before: string; after: string }> = [];
        if (params.title && typeof params.title === "string") {
          diffs.push({ field: "Tên sách", before: ctx.currentBook?.title || "", after: params.title });
        }
        if (params.author && typeof params.author === "string") {
          diffs.push({ field: "Tác giả", before: ctx.currentBook?.author || "", after: params.author });
        }
        if (params.description && typeof params.description === "string") {
          diffs.push({ field: "Mô tả", before: ctx.currentBook?.description || "", after: params.description });
        }

        return {
          id: proposalId,
          toolName,
          title: "Cập nhật thông tin tác phẩm",
          description: `Đề xuất cập nhật ${diffs.length} trường thông tin của sách.`,
          parameters: params,
          diffSummary: diffs,
          createdAt: Date.now(),
        };
      }

      case "apply_style_preset": {
        const presetId = String(params.presetId || "");
        const diffs: Array<{ field: string; before: string; after: string }> = [
          { field: "Phong cách giao diện", before: ctx.activePresetId, after: presetId },
        ];
        if (typeof params.fontSize === "number") {
          diffs.push({ field: "Cỡ chữ", before: `${ctx.fontSize}px`, after: `${params.fontSize}px` });
        }
        if (typeof params.lineHeight === "number") {
          diffs.push({ field: "Giãn dòng", before: `${ctx.lineHeight}`, after: `${params.lineHeight}` });
        }
        if (typeof params.dropCaps === "boolean") {
          diffs.push({ field: "Drop caps", before: ctx.dropCaps ? "Bật" : "Tắt", after: params.dropCaps ? "Bật" : "Tắt" });
        }

        return {
          id: proposalId,
          toolName,
          title: `Đổi phong cách sang "${presetId}"`,
          description: `Đề xuất áp dụng preset "${presetId}" cho toàn bộ cuốn sách.`,
          parameters: params,
          diffSummary: diffs,
          createdAt: Date.now(),
        };
      }

      case "update_typography": {
        const diffs: Array<{ field: string; before: string; after: string }> = [];
        if (typeof params.fontSize === "number") {
          diffs.push({ field: "Cỡ chữ", before: `${ctx.fontSize}px`, after: `${params.fontSize}px` });
        }
        if (typeof params.lineHeight === "number") {
          diffs.push({ field: "Giãn dòng", before: `${ctx.lineHeight}`, after: `${params.lineHeight}` });
        }
        if (params.textAlign === "justify" || params.textAlign === "left") {
          diffs.push({ field: "Căn lề", before: ctx.textAlign || "justify", after: params.textAlign });
        }
        if (typeof params.dropCaps === "boolean") {
          diffs.push({ field: "Chữ hoa đầu đoạn", before: ctx.dropCaps ? "Bật" : "Tắt", after: params.dropCaps ? "Bật" : "Tắt" });
        }

        return {
          id: proposalId,
          toolName,
          title: "Điều chỉnh thông số kiểu chữ",
          description: `Đề xuất cập nhật ${diffs.length} thông số hiển thị kiểu chữ của sách.`,
          parameters: params,
          diffSummary: diffs,
          createdAt: Date.now(),
        };
      }

      case "clean_watermarks": {
        return {
          id: proposalId,
          toolName,
          title: "Làm sạch Watermark & Rác quảng cáo trong sách",
          description: "Đề xuất quét qua toàn bộ các chương trong sách và loại bỏ các đoạn text quảng cáo, link web chèn tự động.",
          parameters: params,
          diffSummary: [
            { field: "Thao tác", before: "Chưa quét sạch", after: "Tự động phát hiện & xóa watermark" },
          ],
          createdAt: Date.now(),
        };
      }

      case "manage_glossary": {
        const terms = (params.terms as Record<string, string>) || {};
        const termCount = Object.keys(terms).length;
        const diffs: Array<{ field: string; before: string; after: string }> = [];
        for (const [k, v] of Object.entries(terms)) {
          diffs.push({ field: k, before: ctx.translationConfig.glossary[k] || "(Chưa có)", after: String(v) });
        }

        return {
          id: proposalId,
          toolName,
          title: `Thêm ${termCount} thuật ngữ vào Glossary`,
          description: `Đề xuất bổ sung các từ khóa vào bộ từ điển dịch thuật.`,
          parameters: params,
          diffSummary: diffs,
          createdAt: Date.now(),
        };
      }

      case "translate_chapter": {
        const chIdx =
          params.chapterIndex !== undefined && !isNaN(Number(params.chapterIndex))
            ? Number(params.chapterIndex)
            : ctx.activeChapterIndex;
        const targetLang = typeof params.targetLang === "string" ? params.targetLang : ctx.translationConfig.targetLang || "vi";
        const chTitle = ctx.currentBook?.chapters[chIdx]?.title || `Chương ${chIdx + 1}`;
        return {
          id: proposalId,
          toolName,
          title: `Dịch chương: "${chTitle}" sang ${targetLang.toUpperCase()}`,
          description: `Đề xuất dịch tự động nội dung chương ${chIdx + 1} qua AI Gateway.`,
          parameters: { ...params, chapterIndex: chIdx, targetLang },
          diffSummary: [
            { field: "Chương cần dịch", before: chTitle, after: `Chương ${chIdx + 1}` },
            { field: "Ngôn ngữ đích", before: ctx.translationConfig.targetLang || "Chưa chọn", after: targetLang.toUpperCase() },
          ],
          createdAt: Date.now(),
        };
      }

      case "batch_translate_chapters": {
        const scope = params.scope === "all" ? "all" : "unprocessed";
        const total = ctx.currentBook?.chapters.length || ctx.currentBook?.chapter_count || 0;
        return {
          id: proposalId,
          toolName,
          title: scope === "all" ? `Dịch toàn bộ ${total} chương sách` : "Dịch tất cả các chương chưa dịch",
          description: `Đề xuất kích hoạt tiến trình dịch thuật AI nền cho ${scope === "all" ? "toàn bộ cuốn sách" : "các chương còn thiếu"}.`,
          parameters: { ...params, scope },
          diffSummary: [
            { field: "Phạm vi dịch", before: "Thủ công", after: scope === "all" ? "Toàn bộ sách" : "Các chương chưa dịch" },
            { field: "Ngôn ngữ đích", before: ctx.translationConfig.targetLang || "vi", after: ctx.translationConfig.targetLang || "vi" },
          ],
          createdAt: Date.now(),
        };
      }

      case "update_chapter_title": {
        const chIdx = Number(params.chapterIndex);
        const newTitle = String(params.newTitle || "").trim();
        const oldTitle = ctx.currentBook?.chapters[chIdx]?.title || `Chương ${chIdx + 1}`;
        return {
          id: proposalId,
          toolName,
          title: `Đổi tiêu đề chương ${chIdx + 1}`,
          description: `Đề xuất đổi tên chương thành "${newTitle}".`,
          parameters: { ...params, chapterIndex: chIdx, newTitle },
          diffSummary: [
            { field: `Chương ${chIdx + 1}`, before: oldTitle, after: newTitle },
          ],
          createdAt: Date.now(),
        };
      }

      case "batch_update_chapter_titles": {
        const rawUpdates = (params.updates as Array<{ chapterIndex: number; newTitle: string }>) || [];
        const diffs: Array<{ field: string; before: string; after: string }> = [];
        for (const u of rawUpdates) {
          const idx = Number(u.chapterIndex);
          const oldTitle = ctx.currentBook?.chapters[idx]?.title || `Chương ${idx + 1}`;
          diffs.push({ field: `Chương ${idx + 1}`, before: oldTitle, after: String(u.newTitle || "").trim() });
        }
        return {
          id: proposalId,
          toolName,
          title: `Cập nhật tiêu đề cho ${diffs.length} chương sách`,
          description: `Đề xuất cập nhật/dịch tiêu đề hàng loạt cho ${diffs.length} chương.`,
          parameters: { ...params, updates: rawUpdates },
          diffSummary: diffs.slice(0, 10),
          createdAt: Date.now(),
        };
      }

      case "enhance_chapter": {
        const chIdx =
          params.chapterIndex !== undefined && !isNaN(Number(params.chapterIndex))
            ? Number(params.chapterIndex)
            : ctx.activeChapterIndex;
        const chTitle = ctx.currentBook?.chapters[chIdx]?.title || `Chương ${chIdx + 1}`;
        return {
          id: proposalId,
          toolName,
          title: `Tối ưu & chuẩn hóa định dạng: "${chTitle}"`,
          description: `Đề xuất soát lỗi chính tả, chuẩn hóa tiêu đề H1 và làm sạch rác/watermark cho chương ${chIdx + 1}.`,
          parameters: { ...params, chapterIndex: chIdx },
          diffSummary: [
            { field: "Chương xử lý", before: chTitle, after: `Chuẩn hóa H1 & dọn dẹp nội dung` },
            { field: "Xóa Watermark", before: "Chưa lọc", after: params.cleanWatermarks !== false ? "Bật" : "Tắt" },
          ],
          createdAt: Date.now(),
        };
      }

      case "extract_xray_entities": {
        return {
          id: proposalId,
          toolName,
          title: `Trích xuất nhân vật & thuật ngữ (Kindle X-Ray)`,
          description: `Đề xuất quét toàn bộ sách để nhận diện nhân vật, địa danh và thuật ngữ chính nhằm tạo phụ lục Kindle X-Ray.`,
          parameters: params,
          diffSummary: [
            { field: "Tính năng", before: "Chưa phân tích", after: "Trích xuất thực thể & Nhúng phụ lục X-Ray" },
          ],
          createdAt: Date.now(),
        };
      }

      case "export_book": {
        const fmt = String(params.format || "epub").toUpperCase();
        return {
          id: proposalId,
          toolName,
          title: `Xuất bản sách đóng gói sang định dạng ${fmt}`,
          description: `Đề xuất áp dụng phong cách hiện tại và chuyển giao diện sang trung tâm xuất file ${fmt}.`,
          parameters: params,
          diffSummary: [
            { field: "Định dạng xuất", before: "Bản thảo NiceEbook", after: `${fmt} hoàn chỉnh` },
          ],
          createdAt: Date.now(),
        };
      }

      case "save_project": {
        return {
          id: proposalId,
          toolName,
          title: "Lưu dự án & ghi file sách",
          description: "Lưu toàn bộ thay đổi vào bộ nhớ dự án và cập nhật an toàn vào file EPUB",
          parameters: params,
          diffSummary: [
            { field: "Tự động lưu", before: "Chưa lưu đĩa", after: "Ghi đè file sách & cập nhật dự án" },
          ],
          createdAt: Date.now(),
        };
      }

      case "import_content_snippet": {
        const chIdx = Number(params.chapterIndex);
        const snippet = String(params.snippet || "");
        const mode = String(params.mode || "append");
        const chTitle = ctx.currentBook?.chapters[chIdx]?.title || `Chương ${chIdx + 1}`;
        return {
          id: proposalId,
          toolName,
          title: `Chèn nội dung vào: "${chTitle}" (${mode})`,
          description: `Đề xuất chèn đoạn trích (${snippet.length} ký tự) vào chương ${chIdx + 1}.`,
          parameters: { ...params, chapterIndex: chIdx, snippet, mode },
          diffSummary: [
            { field: "Chương đích", before: chTitle, after: `${chTitle} (${mode})` },
            { field: "Đoạn chèn", before: "(Chưa có)", after: snippet.slice(0, 80) + (snippet.length > 80 ? "..." : "") },
          ],
          createdAt: Date.now(),
        };
      }

      default:
        throw new Error(`Chưa cấu hình đề xuất cho công cụ: ${toolName}`);
    }
  }

  /**
   * Re-validates parameters at approval time and executes the mutating tool.
   */
  public static async executeApprovedAction(
    proposal: ActionProposal,
    ctx: MutatingStoreContext
  ): Promise<string> {
    const { toolName, parameters } = proposal;

    switch (toolName) {
      case "update_metadata": {
        // Accept the aliases models actually emit, and treat an empty string as
        // "not provided". Forwarding `""` verbatim would silently WIPE a field
        // whenever a model echoes a half-filled metadata object.
        const text = (value: unknown): string | undefined => {
          if (value === undefined || value === null) return undefined;
          const trimmed = String(value).trim();
          return trimmed === "" ? undefined : trimmed;
        };

        const resolved: Record<string, string | undefined> = {
          title: text(parameters.title ?? parameters.book_title ?? parameters.bookTitle ?? parameters.name ?? parameters.tieu_de ?? parameters.ten_sach),
          author: text(parameters.author ?? parameters.book_author ?? parameters.authorName ?? parameters.tac_gia),
          description: text(parameters.description ?? parameters.summary ?? parameters.van_an ?? parameters.mo_ta ?? parameters.synopsis),
          publisher: text(parameters.publisher ?? parameters.nha_xuat_ban),
          published_year: text(parameters.published_year ?? parameters.publishedYear ?? parameters.year ?? parameters.nam_xuat_ban),
          genre: text(parameters.genre ?? parameters.the_loai ?? parameters.category),
          language: text(parameters.language ?? parameters.lang ?? parameters.ngon_ngu),
        };

        const updates = Object.fromEntries(
          Object.entries(resolved).filter(([, value]) => value !== undefined)
        );

        if (Object.keys(updates).length === 0) {
          throw new Error("Không có trường thông tin metadata hợp lệ nào để cập nhật.");
        }

        ctx.updateBookMetadata(updates);

        if (ctx.saveActiveProject) ctx.saveActiveProject();
        if (ctx.autoSaveMetadataToFile) await ctx.autoSaveMetadataToFile();

        const fieldLabels: Record<string, string> = {
          title: "Tựa đề",
          author: "Tác giả",
          description: "Mô tả",
          publisher: "NXB",
          published_year: "Năm",
          genre: "Thể loại",
          language: "Ngôn ngữ",
        };
        const summary = Object.entries(updates)
          .map(([key, value]) => `${fieldLabels[key] ?? key}: "${value}"`)
          .join(", ");
        return `Đã cập nhật và lưu thông tin sách: ${summary}.`;
      }

      case "apply_style_preset": {
        let presetId = String(parameters.presetId || parameters.preset || "").trim();
        const presetAliases: Record<string, string> = {
          wuxia: "wuxia-ancient",
          "tien-hiep": "wuxia-ancient",
          "co-phong": "wuxia-ancient",
          lightnovel: "lightnovel-clean",
          anime: "lightnovel-clean",
          scifi: "scifi-neon",
          "sci-fi": "scifi-neon",
          classic: "classic-hardcover",
          hardcover: "classic-hardcover",
          mystery: "mystery-dark",
        };
        // `hasOwnProperty.call` avoids the prototype chain: a model-supplied
        // `presetId: "constructor"` would otherwise resolve to a function.
        const aliasKey = presetId.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(presetAliases, aliasKey)) {
          presetId = presetAliases[aliasKey];
        }

        const hasTypographyChange =
          typeof parameters.fontSize === "number" ||
          typeof parameters.lineHeight === "number" ||
          typeof parameters.dropCaps === "boolean";

        if (presetId) {
          if (!STYLE_PRESETS.some((preset) => preset.id === presetId)) {
            throw new Error(`Preset không tồn tại: "${presetId}". Không có thay đổi nào được áp dụng.`);
          }
          ctx.selectPreset(presetId);
        } else if (!hasTypographyChange) {
          throw new Error("Thiếu presetId nên không có phong cách nào được áp dụng.");
        }

        if (typeof parameters.fontSize === "number") {
          ctx.updateTypography({ fontSize: parameters.fontSize });
        }
        if (typeof parameters.lineHeight === "number") {
          ctx.updateTypography({ lineHeight: parameters.lineHeight });
        }
        if (typeof parameters.dropCaps === "boolean") {
          ctx.updateTypography({ dropCaps: parameters.dropCaps });
        }
        if (ctx.saveActiveProject) ctx.saveActiveProject();
        if (ctx.autoSaveMetadataToFile) await ctx.autoSaveMetadataToFile();

        return presetId
          ? `Đã áp dụng phong cách "${presetId}" thành công và lưu vào dự án.`
          : `Đã cập nhật thông số kiểu chữ và lưu vào dự án.`;
      }

      case "update_typography": {
        ctx.updateTypography(parameters);
        if (ctx.saveActiveProject) ctx.saveActiveProject();
        if (ctx.autoSaveMetadataToFile) await ctx.autoSaveMetadataToFile();
        return `Đã cập nhật các thông số hiển thị kiểu chữ và lưu thành công.`;
      }

      case "clean_watermarks": {
        if (!ctx.cleanWatermarksInBook) {
          throw new Error("Chức năng làm sạch watermark không khả dụng.");
        }
        const res = (await ctx.cleanWatermarksInBook(
          parameters.keywords as string[] | undefined
        )) as { affectedChapters?: number; removedCount?: number } | undefined;
        const removed = res?.removedCount || 0;
        const affected = res?.affectedChapters || 0;
        if (removed === 0) {
          return `Đã kiểm tra toàn bộ sách: không phát hiện thêm đoạn watermark nào cần xóa.`;
        }
        return `Đã quét và xóa thành công ${removed} đoạn watermark/rác từ ${affected} chương trong sách.`;
      }

      case "manage_glossary": {
        const terms = (parameters.terms as Record<string, string>) || {};
        ctx.setTranslationConfig({
          glossary: { ...terms },
        });
        if (ctx.saveActiveProject) ctx.saveActiveProject();
        return `Đã cập nhật ${Object.keys(terms).length} thuật ngữ vào Glossary.`;
      }

      case "translate_chapter": {
        const rawIdx = parameters.chapterIndex ?? parameters.chapter_index ?? (parameters.chapter !== undefined ? Number(parameters.chapter) - 1 : 0);
        const chIdx = Number(rawIdx);
        if (Number.isNaN(chIdx) || chIdx < 0) {
          throw new Error(`Chỉ số chương cần dịch không hợp lệ.`);
        }
        if (!ctx.translateSingleChapter) {
          throw new Error("Chức năng dịch thuật không khả dụng.");
        }
        const ok = await ctx.translateSingleChapter(chIdx);
        if (!ok) {
          throw new Error(`Dịch chương ${chIdx + 1} thất bại. Vui lòng kiểm tra kết nối AI Gateway trong Cổng AI.`);
        }
        return `Đã kích hoạt dịch thành công chương ${chIdx + 1} sang tiếng Việt và lưu vào dự án.`;
      }

      case "batch_translate_chapters": {
        const scope = parameters.scope === "all" ? "all" : "unprocessed";
        if (!ctx.batchTranslateChapters) {
          throw new Error("Chức năng dịch hàng loạt không khả dụng.");
        }
        // AWAITED, not fire-and-forget. Returning immediately made the proposal
        // render as "Đã thực thi" and re-export the EPUB while chapters were still
        // being written. Progress is surfaced live through `isTranslating`.
        const finished = await ctx.batchTranslateChapters(undefined, scope === "unprocessed");
        if (!finished) {
          throw new Error("Tiến trình dịch hàng loạt không thể khởi động.");
        }
        return `Đã hoàn tất lượt dịch cho ${scope === "all" ? "toàn bộ cuốn sách" : "các chương chưa dịch"}. Các chương không dịch được (nếu có) đã được ghi rõ trong nhật ký.`;
      }

      case "update_chapter_title": {
        const rawIdx = parameters.chapterIndex ?? parameters.chapter_index ?? parameters.index ?? (parameters.chapter !== undefined ? Number(parameters.chapter) - 1 : undefined);
        const chIdx = Number(rawIdx);
        const newTitle = String(parameters.newTitle ?? parameters.title ?? parameters.new_title ?? parameters.tieu_de_moi ?? "").trim();

        if (Number.isNaN(chIdx) || chIdx < 0) {
          throw new Error(`Chỉ số chương không hợp lệ: ${parameters.chapterIndex ?? parameters.chapter}`);
        }
        if (!newTitle) {
          throw new Error("Tiêu đề chương mới không được để trống.");
        }
        if (!ctx.updateChapterTitle) {
          throw new Error("Chức năng đổi tiêu đề chương không khả dụng.");
        }

        // The store action persists the rewritten <h1> into `modifiedChapters`,
        // the project DB and the EPUB, so it must be awaited and its result
        // checked: without the heading rewrite a title change is silently lost
        // on reopen, which is exactly the "reports success but did nothing" bug.
        const persisted = await ctx.updateChapterTitle(chIdx, newTitle);
        if (!persisted) {
          throw new Error(
            `Không thể đổi tiêu đề chương ${chIdx + 1}: không đọc được nội dung chương để ghi lại tiêu đề.`
          );
        }
        return `Đã đổi tiêu đề chương ${chIdx + 1} thành "${newTitle}" và lưu vào sách.`;
      }

      case "batch_update_chapter_titles": {
        const rawUpdates = (parameters.updates ?? parameters.chapter_titles ?? parameters.chapters) as Array<Record<string, unknown>> | undefined;
        if (!rawUpdates || !Array.isArray(rawUpdates) || rawUpdates.length === 0) {
          throw new Error("Danh sách tiêu đề chương cần cập nhật rỗng hoặc không đúng định dạng.");
        }

        const normalizedList: Array<{ chapterIndex: number; newTitle: string }> = [];
        for (const u of rawUpdates) {
          const rawIdx = u.chapterIndex ?? u.chapter_index ?? u.index ?? (u.chapter !== undefined ? Number(u.chapter) - 1 : undefined);
          const idx = Number(rawIdx);
          const title = String(u.newTitle ?? u.title ?? u.new_title ?? u.tieu_de ?? "").trim();
          if (!Number.isNaN(idx) && idx >= 0 && title) {
            normalizedList.push({ chapterIndex: idx, newTitle: title });
          }
        }

        if (normalizedList.length === 0) {
          throw new Error("Không có chương hợp lệ nào để cập nhật tiêu đề.");
        }

        if (!ctx.batchUpdateChapterTitles) {
          throw new Error("Chức năng đổi tiêu đề hàng loạt không khả dụng.");
        }

        // Coerce defensively: a context that returns a non-number must be treated as
        // "nothing persisted" rather than silently reporting an `undefined` count.
        const persistedCount = Number(await ctx.batchUpdateChapterTitles(normalizedList)) || 0;
        if (persistedCount === 0) {
          throw new Error(
            "Không thể cập nhật tiêu đề: không đọc được nội dung các chương để ghi lại tiêu đề."
          );
        }
        const skipped = normalizedList.length - persistedCount;
        return skipped > 0
          ? `Đã cập nhật và lưu tiêu đề cho ${persistedCount}/${normalizedList.length} chương (${skipped} chương không đọc được nội dung nên bị bỏ qua).`
          : `Đã cập nhật và lưu tiêu đề cho ${persistedCount} chương sách.`;
      }

      case "enhance_chapter": {
        const rawIdx = parameters.chapterIndex ?? parameters.chapter_index ?? (parameters.chapter !== undefined ? Number(parameters.chapter) - 1 : 0);
        const chIdx = Number(rawIdx);
        if (Number.isNaN(chIdx) || chIdx < 0) {
          throw new Error(`Chỉ số chương không hợp lệ.`);
        }
        if (!ctx.enhanceSingleChapter) {
          throw new Error("Chức năng biên tập AI không khả dụng.");
        }
        const ok = await ctx.enhanceSingleChapter(chIdx, {
          standardizeH1: parameters.standardizeH1 !== false,
          cleanTopJunk: true,
        });
        if (!ok) {
          throw new Error(`Biên tập tối ưu chương ${chIdx + 1} thất bại.`);
        }
        return `Đã chuẩn hóa tiêu đề H1 và tối ưu định dạng chương ${chIdx + 1} thành công.`;
      }

      case "extract_xray_entities": {
        if (!ctx.runXRayExtraction) {
          throw new Error("Chức năng trích xuất X-Ray không khả dụng.");
        }
        const data = await ctx.runXRayExtraction();
        if (!data) {
          throw new Error("Không thể trích xuất thực thể X-Ray từ sách.");
        }
        if (parameters.autoEmbedAppendix !== false && ctx.embedXRayAppendixToBook) {
          await ctx.embedXRayAppendixToBook();
          return `Đã trích xuất nhân vật/thuật ngữ và tự động nhúng phụ lục X-Ray vào sách thành công.`;
        }
        return `Đã trích xuất danh sách thực thể X-Ray thành công.`;
      }

      case "export_book": {
        const fmt = String(parameters.format || "epub");
        if (ctx.openExportModal) {
          ctx.openExportModal();
        } else if (ctx.setActiveTab) {
          ctx.setActiveTab("reader");
        }
        return `Đã mở trung tâm xuất file cho định dạng ${fmt.toUpperCase()}. Bạn có thể xem lại và xuất sách ngay.`;
      }

      case "save_project": {
        // This tool owns the save (and reports its real outcome). `confirmAgentAction`
        // skips its own save for this tool so the EPUB is not re-exported twice.
        if (ctx.saveActiveProject) ctx.saveActiveProject();

        if (!ctx.currentFilePath) {
          return `Đã lưu toàn bộ thông tin sách, metadata và nội dung vào dự án. Sách này được mở từ bộ nhớ nên không có file trên đĩa để ghi.`;
        }

        const savedToFile = ctx.autoSaveMetadataToFile
          ? await ctx.autoSaveMetadataToFile()
          : false;

        return savedToFile
          ? `Đã lưu toàn bộ thông tin sách, metadata và nội dung vào dự án và ghi thành công vào file EPUB.`
          : `Đã lưu toàn bộ thay đổi vào dự án, nhưng KHÔNG ghi được vào file EPUB (file có thể đang bị khóa hoặc đã bị di chuyển).`;
      }

      case "import_content_snippet": {
        const chIdx = Number(parameters.chapterIndex);
        const snippet = String(parameters.snippet || "");
        const mode = String(parameters.mode || "append");
        if (ctx.currentBook && ctx.currentBook.chapters[chIdx] && ctx.setChapterHtml && ctx.readChapterText) {
          const ch = ctx.currentBook.chapters[chIdx];
          const currentHtml = await ctx.readChapterText(chIdx);
          let newHtml = currentHtml;
          if (mode === "prepend") {
            newHtml = `<div class="agent-snippet">${snippet}</div>\n${currentHtml}`;
          } else if (mode === "replace") {
            newHtml = snippet;
          } else {
            newHtml = `${currentHtml}\n<div class="agent-snippet">${snippet}</div>`;
          }
          ctx.setChapterHtml(ch.href, newHtml);
          if (ctx.saveActiveProject) ctx.saveActiveProject();
          if (ctx.autoSaveMetadataToFile) await ctx.autoSaveMetadataToFile();
          return `Đã chèn nội dung vào chương ${chIdx + 1} (${mode}) thành công.`;
        }
        throw new Error(`Không tìm thấy chương ${chIdx + 1} để chèn nội dung.`);
      }

      default:
        throw new Error(`Không thể thực thi hành động: ${toolName}`);
    }
  }
}
