import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { AiService } from "./aiService";

describe("AiService - OpenCode Free Model Routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes opencode/ models to run_opencode_prompt and parses returned styling JSON", async () => {
    const mockStylingJson = JSON.stringify({
      theme_name: "Cyber Neon Opencode",
      genre_analysis: "Tác phẩm viễn tưởng công nghệ cao",
      colors: {
        bg: "#050508",
        text: "#e0f2fe",
        accent: "#06b6d4",
        border: "#164e63",
        cardBg: "#082f49",
      },
      typography: {
        font_family: "'JetBrains Mono', monospace",
        line_height: 1.7,
        first_line_indent: "1.2em",
        drop_caps: false,
        scene_divider: "— ❖ —",
      },
      custom_css: "body { letter-spacing: 0.05em; }",
    });

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "run_opencode_prompt") {
        return Promise.resolve(`> build · deepseek-v4.1-flash\n${mockStylingJson}`);
      }
      return Promise.resolve({});
    });

    const response = await AiService.generateStyling({
      baseUrl: "opencode://cli",
      model: "opencode/mimo-v2.6-flash-free",
      title: "Vũ Trụ Vô Tận",
      author: "Nguyễn Văn A",
      sampleText: "Phi thuyền lướt qua không gian vô tận, hướng về tinh vân xanh.",
    });

    expect(invoke).toHaveBeenCalledWith("run_opencode_prompt", expect.objectContaining({
      model: "opencode/mimo-v2.6-flash-free",
    }));

    expect(response.source).toBe("gateway");
    expect(response.result.theme_name).toBe("Cyber Neon Opencode");
    expect(response.result.colors.accent).toBe("#06b6d4");
  });

  it("falls back to Jev Core when OpenCode prompt execution fails", async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "run_opencode_prompt") {
        return Promise.reject(new Error("OpenCode binary not found"));
      }
      if (cmd === "classify_text_jev") {
        return Promise.resolve({
          genre: "scifi",
          genre_label: "Khoa Học Viễn Tưởng",
          confidence: 0.85,
          explanation: "Jev Core heuristic fallback",
          typography: {
            line_height: 1.65,
            first_line_indent: "1em",
            drop_caps: false,
            scene_divider: "— ❖ —",
            palette: {
              bg_color: "#08080a",
              text_color: "#f1f5f9",
              accent_color: "#06b6d4",
              border_color: "#1e293b",
              font_family: "'JetBrains Mono', monospace",
            },
          },
        });
      }
      return Promise.resolve({});
    });

    const response = await AiService.generateStyling({
      baseUrl: "opencode://cli",
      model: "opencode/nemotron-3.5-lightning-free",
      title: "Cuộc Chiến Không Gian",
      author: "Tác giả B",
      sampleText: "Hạm đội không gian triển khai đội hình phòng thủ.",
    });

    expect(response.source).toBe("jev_fallback");
    expect(response.result.theme_name).toContain("Khoa Học Viễn Tưởng");
    expect(response.result.colors.accent).toBe("#06b6d4");
  });

  it("auditAndFixBookStyle routes to OpenCode and parses returned audit JSON", async () => {
    const mockAuditJson = JSON.stringify({
      overallScore: 88,
      summary: "Style gốc cuốn sách bảo toàn tốt, cải thiện font và độ thoáng",
      preservationNotes: "Giữ nguyên nền vàng nhạt và tiêu đề đỏ mận của nhà xuất bản",
      auditItems: [
        {
          category: "typography",
          status: "warning",
          title: "Cần bổ sung font tiếng Việt",
          detail: "Font gốc thiếu dấu hỏi/ngã",
          fixRecommendation: "Thêm Literata vào đầu font-family",
        },
      ],
      suggestedTypography: {
        fontFamily: "'Literata', serif",
        lineHeight: 1.75,
        firstLineIndent: "1.5em",
        textAlign: "justify",
      },
      customCssOverrides: "p { text-indent: 1.5em; }",
      explanation: "Đã tối ưu hóa trải nghiệm đọc",
    });

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "run_opencode_prompt") {
        return Promise.resolve(mockAuditJson);
      }
      return Promise.resolve({});
    });

    const response = await AiService.auditAndFixBookStyle({
      baseUrl: "opencode://cli",
      model: "opencode/qwen-2.5-coder",
      title: "Sách Mẫu Gốc",
      originalCss: "body { font-family: Arial; }",
      sampleText: "Đây là nội dung chương đầu tiên.",
      isVietnamese: true,
    });

    expect(response.source).toBe("gateway");
    expect(response.result.overallScore).toBe(88);
    expect(response.result.preservationNotes).toContain("Giữ nguyên");
    expect(response.result.customCssOverrides).toBe("p { text-indent: 1.5em; }");
  });

  it("auditAndFixBookStyle falls back to deterministic heuristic when gateway fails", async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "run_opencode_prompt") {
        return Promise.reject(new Error("Network offline"));
      }
      return Promise.resolve({});
    });

    const response = await AiService.auditAndFixBookStyle({
      baseUrl: "opencode://cli",
      model: "opencode/qwen-2.5-coder",
      title: "Truyện Kiều",
      author: "Nguyễn Du",
      originalCss: "body { font-size: 14px; }",
      signature: {
        fontFamily: "Times New Roman",
        fontSize: 14,
        lineHeight: 1.2,
        textAlign: "justify",
        firstLineIndent: "0",
        confidence: 0.7,
        colors: { bg: "#ffffff", text: "#000000", accent: null },
      },
      sampleText: "Trăm năm trong cõi người ta...",
      isVietnamese: true,
    });

    expect(response.source).toBe("jev_fallback");
    expect(response.result.overallScore).toBeGreaterThan(50);
    expect(response.result.auditItems.length).toBeGreaterThan(0);
    // Should detect non-Vietnamese font and low line-height
    const warnings = response.result.auditItems.filter((i) => i.status === "warning");
    expect(warnings.length).toBeGreaterThan(0);
    expect(response.result.suggestedTypography.fontFamily).toContain("Literata");
    expect(response.result.customCssOverrides).toContain("line-height");
  });

  it("enhanceChapter processes chapter and emits formatted logs matching terminal output", async () => {
    const mockPlanJson = JSON.stringify({
      h1_title: "Chương Mở Đầu: Thay Đổi Cuộc Đời",
      top_junk_indices: [0, 1],
      headings: [
        { level: "h2", title: "1. Vượt Qua Nghịch Cảnh", before_paragraph_index: 3 },
      ],
      spelling_corrections: [
        { paragraph_id: "p_2", original: "tiêu sử", corrected: "tiểu sử", reason: "lỗi chính tả dấu hỏi/ngã" },
      ],
    });

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "run_opencode_prompt") {
        return Promise.resolve(mockPlanJson);
      }
      return Promise.resolve({});
    });

    const logs: Array<{ type: string; text: string }> = [];

    const execution = await AiService.enhanceChapter({
      baseUrl: "opencode://cli",
      model: "opencode/gemini-3.6-flash",
      chapterTitle: "part0003.html",
      chapterHtml: "<html><body><p>Rác top 0</p><p>Rác top 1</p><p>Đây là tiêu sử của ông ấy.</p><p>Đoạn 3 kết thúc.</p></body></html>",
      onLog: (l) => logs.push(l),
    });

    expect(execution.plan.h1_title).toBe("Chương Mở Đầu: Thay Đổi Cuộc Đời");
    expect(execution.updatedHtml).toContain('<h1 class="chapter-title">Chương Mở Đầu: Thay Đổi Cuộc Đời</h1>');
    expect(execution.updatedHtml).toContain('<h2 class="chapter-subheading">1. Vượt Qua Nghịch Cảnh</h2>');
    expect(execution.updatedHtml).toContain("tiểu sử");
    expect(execution.updatedHtml).not.toContain("tiêu sử");

    // Verify logs
    const logTexts = logs.map((l) => l.text);
    expect(logTexts.some((t) => t.includes("✅ H1 Chuẩn:"))).toBe(true);
    expect(logTexts.some((t) => t.includes("Dọn dẹp các thẻ top rác: index [0, 1]"))).toBe(true);
    expect(logTexts.some((t) => t.includes("📌 Bổ sung 1 heading (H2/H3):"))).toBe(true);
    expect(logTexts.some((t) => t.includes("✍️ Sửa 1 lỗi chính tả:"))).toBe(true);
  });

  it("enhanceChapter handles model busy retry and succeeds on subsequent attempt", async () => {
    let callCount = 0;
    const mockPlanJson = JSON.stringify({
      h1_title: "Chương Sau Khi Thử Lại",
      top_junk_indices: [],
      headings: [],
      spelling_corrections: [],
    });

    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "run_opencode_prompt") {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Model rate limit exceeded (429)"));
        }
        return Promise.resolve(mockPlanJson);
      }
      return Promise.resolve({});
    });

    const retryRecords: Array<{ attempt: number; maxAttempts: number }> = [];
    const logs: Array<{ type: string; text: string }> = [];

    const execution = await AiService.enhanceChapter({
      baseUrl: "opencode://cli",
      model: "opencode/gemini-3.6-flash",
      chapterTitle: "part0004.html",
      chapterHtml: "<html><body><p>Nội dung thử lại.</p></body></html>",
      retryDelaySec: 0.001, // Fast timer for test
      onRetry: (attempt, maxAttempts) => retryRecords.push({ attempt, maxAttempts }),
      onLog: (l) => logs.push(l),
    });

    expect(callCount).toBe(2);
    expect(retryRecords).toHaveLength(1);
    expect(retryRecords[0].attempt).toBe(1);
    expect(retryRecords[0].maxAttempts).toBe(3);
    expect(logs.some((l) => l.text.includes("⚠️ Model opencode/gemini-3.6-flash bận"))).toBe(true);
    expect(execution.plan.h1_title).toBe("Chương Sau Khi Thử Lại");
  });

  it("enhanceChapter throws error after exhausting all retries", async () => {
    let callCount = 0;
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "run_opencode_prompt") {
        callCount++;
        return Promise.reject(new Error("Service Unavailable (503)"));
      }
      return Promise.resolve({});
    });

    const retryRecords: number[] = [];

    await expect(
      AiService.enhanceChapter({
        baseUrl: "opencode://cli",
        model: "opencode/gemini-3.6-flash",
        chapterTitle: "part0005.html",
        chapterHtml: "<html><body><p>Nội dung lỗi.</p></body></html>",
        isFallbackEnabled: false,
        maxAttempts: 3,
        retryDelaySec: 0.001,
        onRetry: (attempt) => retryRecords.push(attempt),
      })
    ).rejects.toThrow("Service Unavailable (503)");

    expect(callCount).toBe(3);
    expect(retryRecords).toEqual([1, 2]);
  });

  it("enhanceChapter executes fast Jev-Verdict 2.0 System-1 mode via native invoke", async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "run_jev_verdict_chapter") {
        return Promise.resolve({
          h1_title: "Chương 1: Khởi Nguyên",
          top_junk_indices: [0],
          headings: [
            { level: "h2", title: "1. Bước Đi Đầu Tiên", before_paragraph_index: 2 },
          ],
          spelling_corrections: [
            { paragraph_id: "p_1", original: "nổ lực", corrected: "nỗ lực", reason: "lỗi chính tả dấu hỏi/ngã" },
          ],
          confidence: 0.96,
          concentration: 0.92,
          latency_ms: 12.5,
          engine: "jev-verdict-2.0-rust-native",
          needs_cloud_escalation: false,
          ambiguous_paragraphs: [],
        });
      }
      return Promise.resolve({});
    });

    const logs: Array<{ type: string; text: string }> = [];

    const execution = await AiService.enhanceChapter({
      baseUrl: "http://127.0.0.1:20128/v1",
      model: "jev-verdict-2.0",
      engineMode: "jev-verdict",
      chapterTitle: "part0001.html",
      chapterHtml: "<html><body><p>Rác top 0</p><p>Đây là nổ lực của nhân vật.</p><p>Đoạn 2 tiếp tục.</p></body></html>",
      onLog: (l) => logs.push(l),
    });

    expect(invoke).toHaveBeenCalledWith("run_jev_verdict_chapter", expect.objectContaining({
      chapterTitle: "part0001.html",
    }));

    expect(execution.plan.h1_title).toBe("Chương 1: Khởi Nguyên");
    expect(execution.updatedHtml).toContain('<h1 class="chapter-title">Chương 1: Khởi Nguyên</h1>');
    expect(execution.updatedHtml).toContain("nỗ lực");
    expect(logs.some((l) => l.text.includes("⚡ [Xử Lý Cục Bộ] Native Engine"))).toBe(true);
  });

  it("enhanceChapter automatically falls back to secondary model when primary fails", async () => {
    (invoke as any).mockImplementation((cmd: string, args: any) => {
      if (cmd === "run_opencode_prompt") {
        if (args.model === "opencode/primary-failing") {
          return Promise.reject(new Error("Rate Limit 429 on primary"));
        }
        if (args.model === "opencode/fallback-success") {
          return Promise.resolve(
            JSON.stringify({
              h1_title: "Chương Dự Phòng Thành Công",
              top_junk_indices: [],
              headings: [],
              spelling_corrections: [],
            })
          );
        }
      }
      return Promise.resolve({});
    });

    const fallbackEvents: Array<{ failed: string; next: string }> = [];
    const logs: Array<{ type: string; text: string }> = [];

    const execution = await AiService.enhanceChapter({
      baseUrl: "opencode://cli",
      model: "opencode/primary-failing",
      fallbackModels: ["opencode/fallback-success"],
      isFallbackEnabled: true,
      chapterTitle: "part0002.html",
      chapterHtml: "<html><body><p>Nội dung kiểm tra fallback.</p></body></html>",
      maxAttempts: 1, // 1 attempt on primary before falling back
      retryDelaySec: 0.001,
      onFallback: (failed, next) => fallbackEvents.push({ failed, next }),
      onLog: (l) => logs.push(l),
    });

    expect(fallbackEvents).toHaveLength(1);
    expect(fallbackEvents[0].failed).toBe("opencode/primary-failing");
    expect(fallbackEvents[0].next).toBe("opencode/fallback-success");
    expect(logs.some((l) => l.text.includes("🔄 [Model Fallback]"))).toBe(true);
    expect(execution.plan.h1_title).toBe("Chương Dự Phòng Thành Công");
  });

  it("enhanceChapter executes final Jev Verdict 2.0 safety net when all cloud models fail", async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "run_opencode_prompt") {
        return Promise.reject(new Error("All Cloud Gateways Offline 503"));
      }
      if (cmd === "run_jev_verdict_chapter") {
        return Promise.resolve({
          h1_title: "Chương Cứu Sinh Bởi Jev Verdict",
          top_junk_indices: [],
          headings: [],
          spelling_corrections: [],
          confidence: 0.95,
          concentration: 0.91,
          latency_ms: 10.0,
          engine: "jev-verdict-2.0-rust-native",
          needs_cloud_escalation: false,
          ambiguous_paragraphs: [],
        });
      }
      return Promise.resolve({});
    });

    const logs: Array<{ type: string; text: string }> = [];

    const execution = await AiService.enhanceChapter({
      baseUrl: "opencode://cli",
      model: "opencode/offline-model",
      engineMode: "gateway",
      fallbackModels: [],
      isFallbackEnabled: true,
      chapterTitle: "part0003.html",
      chapterHtml: "<html><body><p>Nội dung chạy cứu sinh.</p></body></html>",
      maxAttempts: 1,
      retryDelaySec: 0.001,
      onLog: (l) => logs.push(l),
    });

    expect(execution.plan.h1_title).toBe("Chương Cứu Sinh Bởi Jev Verdict");
    expect(logs.some((l) => l.text.includes("[Fallback Final]"))).toBe(true);
  });

  it("when isFallbackEnabled is false, enhanceChapter does not fallback and throws error", async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === "run_opencode_prompt") {
        return Promise.reject(new Error("Rate Limit 429 without fallback"));
      }
      return Promise.resolve({});
    });

    const fallbackEvents: any[] = [];

    await expect(
      AiService.enhanceChapter({
        baseUrl: "opencode://cli",
        model: "opencode/primary-failing",
        fallbackModels: ["opencode/fallback-success"],
        isFallbackEnabled: false, // Fallback disabled
        chapterTitle: "part0004.html",
        chapterHtml: "<html><body><p>Nội dung không fallback.</p></body></html>",
        maxAttempts: 1,
        retryDelaySec: 0.001,
        onFallback: (failed, next) => fallbackEvents.push({ failed, next }),
      })
    ).rejects.toThrow("Rate Limit 429 without fallback");

    expect(fallbackEvents).toHaveLength(0);
  });

  describe("AiService.testModel", () => {
    it("tests jev-verdict-2.0 offline model instantly with success", async () => {
      const res = await AiService.testModel({
        baseUrl: "http://127.0.0.1:20128/v1",
        model: "jev-verdict-2.0",
      });

      expect(res.success).toBe(true);
      expect(res.latencyMs).toBeLessThanOrEqual(5);
      expect(res.message).toContain("Lõi Offline Cục Bộ");
    });

    it("tests opencode model via test_opencode_model invoke", async () => {
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === "test_opencode_model") {
          return Promise.resolve(120);
        }
        return Promise.resolve({});
      });

      const res = await AiService.testModel({
        baseUrl: "opencode://cli",
        model: "opencode/mimo-v2.6-flash-free",
      });

      expect(res.success).toBe(true);
      expect(res.latencyMs).toBe(120);
      expect(res.message).toContain("OpenCode Free");
    });

    it("handles opencode model test failure gracefully", async () => {
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === "test_opencode_model") {
          return Promise.reject(new Error("Model not pulled"));
        }
        return Promise.resolve({});
      });

      const res = await AiService.testModel({
        baseUrl: "opencode://cli",
        model: "opencode/nonexistent",
      });

      expect(res.success).toBe(false);
      expect(res.message).toContain("Model not pulled");
    });

    it("tests gateway model via HTTP and sends Authorization Bearer when apiKey is provided", async () => {
      const originalFetch = globalThis.fetch;
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(""),
      });
      globalThis.fetch = mockFetch as any;

      try {
        const res = await AiService.testModel({
          baseUrl: "http://127.0.0.1:20128/v1",
          apiKey: "sk-mock-test-key",
          model: "ag/gemini-3.8-flash",
        });

        expect(res.success).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          "http://127.0.0.1:20128/v1/chat/completions",
          expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({
              Authorization: "Bearer sk-mock-test-key",
              "Content-Type": "application/json",
            }),
          })
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
