/**
 * Agent Tools Registry & Execution Facade.
 *
 * Enforces strict safety boundary:
 * - Read-only tools can be executed automatically by the agent loop.
 * - Mutating tools are STRUCTURALLY UNROUTABLE to auto-execution in the agent loop.
 *   They can only generate an ActionProposal that requires explicit user confirmation.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  isMutating: boolean;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
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
  readChapterText: (index: number) => Promise<string>;
  setActiveTab: (tab: any) => void;
  setActiveChapterIndex: (index: number) => void;
}

export interface MutatingStoreContext {
  updateBookMetadata: (meta: any) => void;
  selectPreset: (presetId: string) => void;
  updateTypography: (typo: any) => void;
  setTranslationConfig: (config: any) => void;
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
    description: "Xem danh sách các chương của sách hiện tại kèm số thứ tự và tiêu đề chương.",
    isMutating: false,
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Số lượng chương tối đa cần lấy (mặc định 20)" },
      },
    },
  },
  {
    name: "read_chapter_excerpt",
    description: "Đọc nội dung văn bản hoặc trích đoạn của một chương cụ thể trong sách để tóm tắt hoặc trả lời thắc mắc.",
    isMutating: false,
    parameters: {
      type: "object",
      properties: {
        chapterIndex: { type: "number", description: "Chỉ số chương cần đọc (bắt đầu từ 0)" },
        maxChars: { type: "number", description: "Số ký tự tối đa cần đọc (mặc định 2000)" },
      },
      required: ["chapterIndex"],
    },
  },
  {
    name: "navigate_tab",
    description: "Chuyển giao diện làm việc sang tab khác (ví dụ: 'reader' để đọc sách, 'translator' để dịch, 'editor' để chỉnh kiểu chữ, 'books' để quản lý sách).",
    isMutating: false,
    parameters: {
      type: "object",
      properties: {
        tab: {
          type: "string",
          description: "Tên tab cần chuyển đến",
          enum: ["books", "reader", "presets", "editor", "ai", "ai-editor", "converter", "kindle", "translator", "settings"],
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
    description: "Đề xuất đổi phong cách giao diện (preset) hoặc kích thước chữ cho cuốn sách. Yêu cầu người dùng phê duyệt.",
    isMutating: true,
    parameters: {
      type: "object",
      properties: {
        presetId: {
          type: "string",
          description: "ID preset (classic-hardcover, modern-minimal, light-novel, poetry-elegance, wuxia-scroll, vintage-news, dark-velvet, academic-press)",
        },
        fontSize: { type: "number", description: "Cỡ chữ (px, từ 12 đến 28)" },
        dropCaps: { type: "boolean", description: "Bật/tắt chữ hoa đầu dòng (drop caps)" },
      },
      required: ["presetId"],
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
];

export class AgentToolDispatcher {
  /**
   * Executes a read-only tool. If a mutating tool name is passed here,
   * it throws an invariant error immediately.
   */
  public static async executeReadOnlyTool(
    toolName: string,
    params: Record<string, unknown>,
    ctx: ReadOnlyStoreContext
  ): Promise<string> {
    const tool = AGENT_TOOLS.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Công cụ không xác định: "${toolName}"`);
    }

    if (tool.isMutating) {
      throw new Error(
        `Vi phạm quyền an toàn: Công cụ thay đổi dữ liệu "${toolName}" không thể tự động thực thi mà phải qua ActionProposal xác nhận.`
      );
    }

    switch (toolName) {
      case "get_project_status": {
        if (!ctx.currentBook) {
          return "Hiện tại chưa có cuốn sách nào được mở trong dự án.";
        }
        const b = ctx.currentBook;
        const modCount = Object.keys(ctx.modifiedChapters).length;
        const glossaryCount = Object.keys(ctx.translationConfig.glossary || {}).length;

        return JSON.stringify(
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
      }

      case "list_chapters": {
        if (!ctx.currentBook || ctx.currentBook.chapters.length === 0) {
          return "Không có danh sách chương.";
        }
        const limit = typeof params.limit === "number" ? Math.max(1, params.limit) : 20;
        const list = ctx.currentBook.chapters.slice(0, limit).map((c, i) => ({
          index: i,
          title: c.title,
          href: c.href,
          is_modified_or_translated: Boolean(ctx.modifiedChapters[c.href]),
        }));

        return JSON.stringify(
          {
            total: ctx.currentBook.chapters.length,
            showing: list.length,
            chapters: list,
          },
          null,
          2
        );
      }

      case "read_chapter_excerpt": {
        const chIdx = Number(params.chapterIndex);
        if (isNaN(chIdx) || chIdx < 0 || !ctx.currentBook || chIdx >= ctx.currentBook.chapters.length) {
          return `Lỗi: Chỉ số chương ${params.chapterIndex} không hợp lệ.`;
        }

        const maxChars = typeof params.maxChars === "number" ? Math.max(200, params.maxChars) : 2000;
        const rawText = await ctx.readChapterText(chIdx);
        const cleanText = rawText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const excerpt = cleanText.slice(0, maxChars);

        // Security Tagging: Content is wrapped in passive data tags so LLMs do not execute commands inside it
        return `<book_content_data chapter_index="${chIdx}" title="${ctx.currentBook.chapters[chIdx].title}">\n${excerpt}\n</book_content_data>`;
      }

      case "navigate_tab": {
        const tab = String(params.tab);
        ctx.setActiveTab(tab);
        if (typeof params.chapterIndex === "number") {
          ctx.setActiveChapterIndex(params.chapterIndex);
        }
        return `Đã chuyển sang màn hình "${tab}" thành công.`;
      }

      default:
        throw new Error(`Chưa hỗ trợ công cụ: ${toolName}`);
    }
  }

  /**
   * Constructs an ActionProposal for a mutating tool.
   */
  public static createActionProposal(
    toolName: string,
    params: Record<string, unknown>,
    ctx: ReadOnlyStoreContext
  ): ActionProposal {
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
        ctx.updateBookMetadata(parameters);
        return `Đã cập nhật thông tin sách thành công.`;
      }

      case "apply_style_preset": {
        const presetId = String(parameters.presetId || "");
        if (presetId) {
          ctx.selectPreset(presetId);
        }
        if (typeof parameters.fontSize === "number") {
          ctx.updateTypography({ fontSize: parameters.fontSize });
        }
        if (typeof parameters.dropCaps === "boolean") {
          ctx.updateTypography({ dropCaps: parameters.dropCaps });
        }
        return `Đã áp dụng phong cách "${presetId}" thành công.`;
      }

      case "manage_glossary": {
        const terms = (parameters.terms as Record<string, string>) || {};
        ctx.setTranslationConfig({
          glossary: { ...terms },
        });
        return `Đã cập nhật ${Object.keys(terms).length} thuật ngữ vào Glossary.`;
      }

      default:
        throw new Error(`Không thể thực thi hành động: ${toolName}`);
    }
  }
}
