import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentService, AgentChatMessage } from "./agentService";
import { ReadOnlyStoreContext } from "./agentTools";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("AgentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCtx: ReadOnlyStoreContext = {
    currentBook: {
      title: "Clean Code",
      author: "Robert C. Martin",
      language: "en",
      description: "A Handbook of Agile Software Craftsmanship",
      chapter_count: 5,
      chapters: [
        { id: "c1", href: "c1.xhtml", title: "Chapter 1: Clean Code", preview_text: "There are two parts..." },
      ],
    },
    activePresetId: "classic-hardcover",
    fontSize: 16,
    lineHeight: 1.7,
    dropCaps: true,
    activeChapterIndex: 0,
    activeTab: "books",
    modifiedChapters: {},
    translationConfig: {
      sourceLang: "Tiếng Anh (English)",
      targetLang: "Tiếng Việt (Vietnamese)",
      mode: "replace",
      tone: "academic",
      glossary: {},
    },
    readChapterText: vi.fn().mockResolvedValue("<p>Clean code reads like well-written prose.</p>"),
    setActiveTab: vi.fn(),
    setActiveChapterIndex: vi.fn(),
  };

  it("parses action output in markdown code blocks", () => {
    const raw = `
Tôi sẽ kiểm tra thông tin sách cho bạn.
\`\`\`json
{
  "thought": "Cần tra cứu trạng thái dự án",
  "action": "get_project_status",
  "parameters": {}
}
\`\`\`
    `;

    const parsed = AgentService.parseActionOutput(raw);
    expect(parsed.isAction).toBe(true);
    expect(parsed.action).toBe("get_project_status");
    expect(parsed.thought).toContain("Cần tra cứu");
  });

  it("parses plain conversational response without action", () => {
    const raw = "Chào bạn! Tôi có thể giúp gì cho cuốn sách 'Clean Code' của bạn hôm nay?";
    const parsed = AgentService.parseActionOutput(raw);
    expect(parsed.isAction).toBe(false);
    expect(parsed.conversationalReply).toBe(raw);
  });

  it("runs read-only tool automatically and completes the turn", async () => {
    const mockInvoke = vi.mocked(invoke);
    // 1st LLM call requests get_project_status
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify({
        thought: "Kiểm tra thông tin sách",
        action: "get_project_status",
        parameters: {},
      })
    );
    // 2nd LLM call responds with conversational summary
    mockInvoke.mockResolvedValueOnce(
      "Cuốn sách hiện tại là 'Clean Code' của tác giả Robert C. Martin với 5 chương."
    );

    const history: AgentChatMessage[] = [
      { id: "1", role: "user", content: "Sách này tên gì và có mấy chương?", timestamp: 100 },
    ];

    const updated = await AgentService.runAgentTurn(history, mockCtx, {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(updated.length).toBe(2);
    expect(updated[1].role).toBe("assistant");
    expect(updated[1].content).toContain("Clean Code");
  });

  it("halts turn and generates ActionProposal when model suggests a mutating tool", async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify({
        thought: "Người dùng muốn đổi phong cách sang light-novel",
        action: "apply_style_preset",
        parameters: { presetId: "light-novel", fontSize: 18 },
      })
    );

    const history: AgentChatMessage[] = [
      { id: "1", role: "user", content: "Đổi phong cách sách sang Light Novel giúp tôi với cỡ chữ 18px", timestamp: 100 },
    ];

    const updated = await AgentService.runAgentTurn(history, mockCtx, {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });

    // Loop must halt at 1 call and produce a pending proposal
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(updated.length).toBe(2);
    const assistantMsg = updated[1];
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.actionProposal).toBeDefined();
    expect(assistantMsg.actionProposal?.toolName).toBe("apply_style_preset");
    expect(assistantMsg.actionStatus).toBe("pending");
  });

  it("aborts turn cleanly on AbortSignal without mutating conversation", async () => {
    const controller = new AbortController();
    controller.abort();

    const history: AgentChatMessage[] = [
      { id: "1", role: "user", content: "Hello", timestamp: 100 },
    ];

    await expect(
      AgentService.runAgentTurn(history, mockCtx, {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
        abortSignal: controller.signal,
      })
    ).rejects.toThrow("Người dùng đã hủy cuộc trò chuyện");
  });

  it("structurally halts at update_metadata and never applies mutation during turn", async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify({
        thought: "Sửa tác giả và năm xuất bản",
        action: "update_metadata",
        parameters: { author: "Uncle Bob Martin", title: "Clean Code 2nd Ed" },
      })
    );

    const history: AgentChatMessage[] = [
      { id: "1", role: "user", content: "Sửa tác giả thành Uncle Bob Martin giúp tôi", timestamp: 100 },
    ];

    const updated = await AgentService.runAgentTurn(history, mockCtx, {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(updated.length).toBe(2);
    const msg = updated[1];
    expect(msg.actionProposal?.toolName).toBe("update_metadata");
    expect(msg.actionProposal?.parameters.author).toBe("Uncle Bob Martin");
    expect(msg.actionStatus).toBe("pending");
  });

  it("always preserves system prompt and tool definitions when trimming message history", async () => {
    const mockInvoke = vi.mocked(invoke);
    mockInvoke.mockResolvedValueOnce("Tôi hiểu rồi.");

    // Create 20 historical messages
    const longHistory: AgentChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
      id: `m_${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
      timestamp: 100 + i,
    }));

    await AgentService.runAgentTurn(longHistory, mockCtx, {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const sentMessages = (mockInvoke.mock.calls[0][1] as any).options.messages;

    // Index 0 must be system prompt containing tool schemas
    expect(sentMessages[0].role).toBe("system");
    expect(sentMessages[0].content).toContain("[DANH MỤC CÔNG CỤ (TOOLS)]");
    expect(sentMessages[0].content).toContain("get_project_status");

    // Total messages sent is bounded (1 system + 10 recent messages = 11)
    expect(sentMessages.length).toBe(11);
  });

  it("terminates gracefully when maximum tool loop iterations cap is reached", async () => {
    const mockInvoke = vi.mocked(invoke);
    // Return read-only tool calls repeatedly
    mockInvoke.mockResolvedValue(
      JSON.stringify({
        thought: "Kiểm tra danh sách chương",
        action: "list_chapters",
        parameters: {},
      })
    );

    const history: AgentChatMessage[] = [
      { id: "1", role: "user", content: "Lặp lại", timestamp: 100 },
    ];

    const updated = await AgentService.runAgentTurn(history, mockCtx, {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      maxIterations: 3,
    });

    // Exactly 3 iterations executed, does not hang or infinite loop
    expect(mockInvoke).toHaveBeenCalledTimes(3);
    expect(updated).toBeDefined();
  });
});
