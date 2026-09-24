import { invoke } from "@tauri-apps/api/core";
import { 
  EBOOK_STYLING_SYSTEM_PROMPT, 
  buildStylingUserPrompt, 
  AiStylingResult 
} from "./prompts/ebookStyling";
import {
  ChapterTransformer,
  ChapterEnhancePlan,
  ChapterEnhanceResult,
} from "../utils/chapterTransformer";
import {
  CHAPTER_ENHANCER_SYSTEM_PROMPT,
  buildChapterEnhancerUserPrompt,
  parseChapterEnhancePlan,
} from "./prompts/chapterEnhancer";
import { JevDecision } from "../stores/useAppStore";

export interface AiRequestOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  title: string;
  author: string;
  sampleText: string;
  jevGenreHint?: string;
}

export interface ChapterEnhanceRequestOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  fallbackModels?: string[];
  isFallbackEnabled?: boolean;
  temperature?: number;
  chapterTitle: string;
  chapterHtml: string;
  bookTitle?: string;
  author?: string;
  engineMode?: "jev-verdict" | "gateway" | "hybrid";
  features?: {
    standardizeH1?: boolean;
    cleanTopJunk?: boolean;
    addHeadings?: boolean;
    fixVietnameseTypos?: boolean;
  };
  onRetry?: (attempt: number, maxAttempts: number, delaySec: number, model: string) => void;
  onFallback?: (failedModel: string, nextModel: string, reason: string) => void;
  onLog?: (message: { type: "info" | "warning" | "success" | "detail"; text: string }) => void;
  maxAttempts?: number;
  retryDelaySec?: number;
}

export interface JevVerdictChapterPlan {
  h1_title: string;
  top_junk_indices: number[];
  headings: Array<{
    level: string;
    title: string;
    before_paragraph_index: number;
  }>;
  spelling_corrections: Array<{
    paragraph_id: string;
    original: string;
    corrected: string;
    reason: string;
  }>;
  confidence: number;
  concentration: number;
  latency_ms: number;
  engine: string;
  needs_cloud_escalation: boolean;
  ambiguous_paragraphs: string[];
}

export interface ChapterEnhanceExecutionResult {
  plan: ChapterEnhancePlan;
  result: ChapterEnhanceResult;
  updatedHtml: string;
}

export class AiService {
  public static async generateStyling(options: AiRequestOptions): Promise<{
    result: AiStylingResult;
    source: "gateway" | "jev_fallback";
    error?: string;
  }> {
    const {
      baseUrl,
      apiKey,
      model,
      temperature = 0.7,
      title,
      author,
      sampleText,
      jevGenreHint,
    } = options;

    const userPrompt = buildStylingUserPrompt(title, author, sampleText, jevGenreHint);

    // Special path: OpenCode CLI free models (no API key needed, executed via local opencode CLI)
    if (model.startsWith("opencode/") || baseUrl.startsWith("opencode:")) {
      try {
        const fullPrompt = `${EBOOK_STYLING_SYSTEM_PROMPT}\n\n${userPrompt}\n\nCRITICAL: Output ONLY valid raw JSON matching the requested structure with keys theme_name, genre_analysis, colors, typography, custom_css. Do NOT wrap in markdown or backticks.`;
        const rawOutput = await invoke<string>("run_opencode_prompt", {
          model,
          prompt: fullPrompt,
        });

        const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON structure found in OpenCode output");
        }

        const parsed: AiStylingResult = JSON.parse(jsonMatch[0]);
        return {
          result: parsed,
          source: "gateway",
        };
      } catch (openCodeErr) {
        console.warn("OpenCode CLI execution error, falling back to Jev Core:", openCodeErr);
      }
    }

    // Normalize base URL
    let url = baseUrl.trim();
    if (url.endsWith("/")) url = url.slice(0, -1);
    if (!url.endsWith("/chat/completions")) {
      url = `${url}/chat/completions`;
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (apiKey && apiKey.trim().length > 0) {
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      }

      const body = {
        model,
        messages: [
          { role: "system", content: EBOOK_STYLING_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature,
        stream: false,
      };

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI Gateway responded with status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from AI Gateway");
      }

      // Clean JSON string (remove markdown code blocks if present)
      const cleanJson = content
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const parsed: AiStylingResult = JSON.parse(cleanJson);
      return {
        result: parsed,
        source: "gateway",
      };
    } catch (err) {
      console.warn("AI Gateway call failed, falling back to Jev Core:", err);

      // Offline Jev Core Fallback
      const jev: JevDecision = await invoke("classify_text_jev", { text: sampleText });

      const fallbackResult: AiStylingResult = {
        theme_name: `${jev.genre_label} (Jev Auto-Generated)`,
        genre_analysis: jev.explanation,
        colors: {
          bg: jev.typography.palette.bg_color,
          text: jev.typography.palette.text_color,
          accent: jev.typography.palette.accent_color,
          border: jev.typography.palette.border_color,
          cardBg: "#1c1c22",
        },
        typography: {
          font_family: jev.typography.palette.font_family,
          line_height: jev.typography.line_height,
          first_line_indent: jev.typography.first_line_indent,
          drop_caps: jev.typography.drop_caps,
          scene_divider: jev.typography.scene_divider,
        },
        custom_css: `/* Jev Core Offline Generated Style */\n.drop-cap { color: ${jev.typography.palette.accent_color}; }`,
      };

      return {
        result: fallbackResult,
        source: "jev_fallback",
        error: String(err),
      };
    }
  }

  public static async enhanceChapter(
    options: ChapterEnhanceRequestOptions
  ): Promise<ChapterEnhanceExecutionResult> {
    const {
      baseUrl,
      apiKey,
      model,
      fallbackModels = [],
      isFallbackEnabled = true,
      temperature = 0.3,
      chapterTitle,
      chapterHtml,
      bookTitle = "",
      author = "",
      engineMode = "hybrid",
      features,
      onRetry,
      onFallback,
      onLog,
      maxAttempts = 3,
      retryDelaySec = 3,
    } = options;

    // Helper to run native Jev Verdict 2.0 Rust engine
    const runNativeJevVerdict = async (labelPrefix = "") => {
      const verdictPlan = await invoke<JevVerdictChapterPlan>("run_jev_verdict_chapter", {
        chapterTitle,
        chapterHtml,
        bookTitle,
        author,
      });

      onLog?.({
        type: "info",
        text: `⚡ ${labelPrefix}[Jev Verdict 2.0] System-1 Local Engine: ${verdictPlan.latency_ms.toFixed(1)}ms (Độ tập trung: ${verdictPlan.concentration.toFixed(3)}, Độ tin cậy: ${(verdictPlan.confidence * 100).toFixed(1)}%)`,
      });

      const vHeadings = Array.isArray(verdictPlan.headings) ? verdictPlan.headings : [];
      const vJunk = Array.isArray(verdictPlan.top_junk_indices) ? verdictPlan.top_junk_indices : [];
      const vCorrections = Array.isArray(verdictPlan.spelling_corrections) ? verdictPlan.spelling_corrections : [];

      const plan: ChapterEnhancePlan = {
        h1_title: features?.standardizeH1 !== false ? verdictPlan.h1_title : undefined,
        top_junk_indices: features?.cleanTopJunk !== false ? vJunk : [],
        headings: features?.addHeadings !== false ? vHeadings.map((h) => ({
          level: h.level === "h3" ? "h3" : "h2",
          title: h.title,
          before_paragraph_index: h.before_paragraph_index,
        })) : [],
        spelling_corrections: features?.fixVietnameseTypos !== false ? vCorrections : [],
      };

      const result = ChapterTransformer.applyPlan(chapterHtml, plan);

      if (plan.h1_title) {
        onLog?.({ type: "success", text: `✅ H1 Chuẩn: "${plan.h1_title}"` });
        if (plan.top_junk_indices && plan.top_junk_indices.length > 0) {
          onLog?.({ type: "detail", text: `   Dọn dẹp các thẻ top rác: index [${plan.top_junk_indices.join(", ")}]` });
        }
      }
      if (plan.headings && plan.headings.length > 0) {
        onLog?.({ type: "info", text: `📌 Bổ sung ${plan.headings.length} heading (H2/H3):` });
        for (const h of plan.headings) {
          onLog?.({ type: "detail", text: `   + [${h.level.toUpperCase()}] "${h.title}" (trước đoạn ${h.before_paragraph_index})` });
        }
      }
      if (plan.spelling_corrections && plan.spelling_corrections.length > 0) {
        onLog?.({ type: "info", text: `✍️ Sửa ${plan.spelling_corrections.length} lỗi chính tả:` });
        for (const c of plan.spelling_corrections) {
          onLog?.({ type: "detail", text: `   * [${c.paragraph_id}] "${c.original}" -> "${c.corrected}" (${c.reason})` });
        }
      }

      return {
        plan,
        result,
        updatedHtml: result.updatedHtml,
      };
    };

    // Path 1: Pure Jev-Verdict 2.0 Local System-1 Engine (Ultra-fast ~15ms, Zero-cloud)
    if (engineMode === "jev-verdict" || model.startsWith("jev-verdict")) {
      try {
        return await runNativeJevVerdict();
      } catch (verdictErr) {
        console.warn("Jev Verdict execution fallback to cloud gateway:", verdictErr);
      }
    }

    // Path 2: Hybrid Acceleration Mode (Jev Verdict System-1 Pre-Filter + Selective Cloud Escalation)
    if (engineMode === "hybrid") {
      try {
        const verdictPlan = await invoke<JevVerdictChapterPlan>("run_jev_verdict_chapter", {
          chapterTitle,
          chapterHtml,
          bookTitle,
          author,
        });

        // If highly confident and no complex ambiguity, commit immediately with 0 cloud tokens!
        if (!verdictPlan.needs_cloud_escalation && verdictPlan.confidence >= 0.90) {
          onLog?.({
            type: "info",
            text: `⚡ [Jev Verdict 2.0] System-1 Xác thực thành công: ${verdictPlan.latency_ms.toFixed(1)}ms (Bỏ qua gọi Cloud, Tiết kiệm 100% Token)`,
          });

          const plan: ChapterEnhancePlan = {
            h1_title: features?.standardizeH1 !== false ? verdictPlan.h1_title : undefined,
            top_junk_indices: features?.cleanTopJunk !== false ? verdictPlan.top_junk_indices : [],
            headings: features?.addHeadings !== false ? verdictPlan.headings.map((h) => ({
              level: h.level === "h3" ? "h3" : "h2",
              title: h.title,
              before_paragraph_index: h.before_paragraph_index,
            })) : [],
            spelling_corrections: features?.fixVietnameseTypos !== false ? verdictPlan.spelling_corrections : [],
          };

          const result = ChapterTransformer.applyPlan(chapterHtml, plan);
          if (plan.h1_title) onLog?.({ type: "success", text: `✅ H1 Chuẩn: "${plan.h1_title}"` });
          if (plan.headings && plan.headings.length > 0) {
            onLog?.({ type: "info", text: `📌 Bổ sung ${plan.headings.length} heading (H2/H3):` });
            for (const h of plan.headings) {
              onLog?.({ type: "detail", text: `   + [${h.level.toUpperCase()}] "${h.title}" (trước đoạn ${h.before_paragraph_index})` });
            }
          }
          if (plan.spelling_corrections && plan.spelling_corrections.length > 0) {
            onLog?.({ type: "info", text: `✍️ Sửa ${plan.spelling_corrections.length} lỗi chính tả:` });
            for (const c of plan.spelling_corrections) {
              onLog?.({ type: "detail", text: `   * [${c.paragraph_id}] "${c.original}" -> "${c.corrected}" (${c.reason})` });
            }
          }

          return { plan, result, updatedHtml: result.updatedHtml };
        }

        onLog?.({
          type: "info",
          text: `⚡ [Jev Verdict 2.0] Tiền xử lý System-1 hoàn tất (${verdictPlan.latency_ms.toFixed(1)}ms). Chuyển tiếp ${verdictPlan.ambiguous_paragraphs.length} đoạn nghi vấn lên Cloud LLM...`,
        });
      } catch (hybridErr) {
        console.warn("Hybrid pre-filter failed, falling back to full cloud pass:", hybridErr);
      }
    }

    // Build Model Fallback Chain: [primaryModel, ...fallbackModels, "jev-verdict-2.0"]
    const candidateModels = [model];
    if (isFallbackEnabled) {
      for (const fb of fallbackModels) {
        if (!candidateModels.includes(fb)) {
          candidateModels.push(fb);
        }
      }
      if (!candidateModels.includes("jev-verdict-2.0")) {
        candidateModels.push("jev-verdict-2.0");
      }
    }

    const { blocks } = ChapterTransformer.extractBlocks(chapterHtml);
    const paragraphsForPrompt = blocks.map((b) => ({
      id: b.id,
      index: b.index,
      text: b.text,
    }));

    const userPrompt = buildChapterEnhancerUserPrompt({
      chapterTitle,
      paragraphs: paragraphsForPrompt,
      features,
    });

    let overallLastError: Error | null = null;

    // Iterate through fallback models
    for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
      const activeCandidateModel = candidateModels[mIdx];

      // Ultimate fallback: Jev Verdict 2.0 (Offline System 1)
      if (activeCandidateModel === "jev-verdict-2.0" || activeCandidateModel.startsWith("jev-verdict")) {
        try {
          return await runNativeJevVerdict("[Fallback Final] ");
        } catch (jErr) {
          overallLastError = jErr instanceof Error ? jErr : new Error(String(jErr));
          console.warn("Final Jev Verdict fallback failed:", jErr);
          continue;
        }
      }

      let parsedPlan: ChapterEnhancePlan | null = null;
      let modelLastError: Error | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          let rawOutputContent = "";
          if (activeCandidateModel.startsWith("opencode/") || baseUrl.startsWith("opencode:")) {
            const fullPrompt = `${CHAPTER_ENHANCER_SYSTEM_PROMPT}\n\n${userPrompt}\n\nCRITICAL: Output ONLY valid raw JSON without markdown wrapping.`;
            rawOutputContent = await invoke<string>("run_opencode_prompt", {
              model: activeCandidateModel,
              prompt: fullPrompt,
            });
          } else {
            let url = baseUrl.trim();
            if (url.endsWith("/")) url = url.slice(0, -1);
            if (!url.endsWith("/chat/completions")) {
              url = `${url}/chat/completions`;
            }

            const headers: Record<string, string> = {
              "Content-Type": "application/json",
            };
            if (apiKey && apiKey.trim().length > 0) {
              headers["Authorization"] = `Bearer ${apiKey.trim()}`;
            }

            const body = {
              model: activeCandidateModel,
              messages: [
                { role: "system", content: CHAPTER_ENHANCER_SYSTEM_PROMPT },
                { role: "user", content: userPrompt },
              ],
              temperature,
              stream: false,
            };

            const response = await fetch(url, {
              method: "POST",
              headers,
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) {
              const errText = await response.text();
              throw new Error(`AI Gateway HTTP ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (!content) {
              throw new Error("Không nhận được nội dung từ AI Gateway");
            }
            rawOutputContent = content;
          }

          // Validate and parse JSON output safely inside attempt block
          parsedPlan = parseChapterEnhancePlan(rawOutputContent);
          break;
        } catch (err: unknown) {
          modelLastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < maxAttempts) {
            onRetry?.(attempt, maxAttempts, retryDelaySec, activeCandidateModel);
            onLog?.({
              type: "warning",
              text: `⚠️ Model ${activeCandidateModel} bận (thử lại lần ${attempt}/${maxAttempts} sau ${retryDelaySec}s)...`,
            });
            await new Promise((r) => setTimeout(r, retryDelaySec * 1000));
          }
        }
      }

      if (parsedPlan) {
        // Success with activeCandidateModel!
        const result = ChapterTransformer.applyPlan(chapterHtml, parsedPlan);

        if (parsedPlan.h1_title) {
          onLog?.({ type: "success", text: `✅ H1 Chuẩn: "${parsedPlan.h1_title}"` });
          if (parsedPlan.top_junk_indices && parsedPlan.top_junk_indices.length > 0) {
            onLog?.({ type: "detail", text: `   Dọn dẹp các thẻ top rác: index [${parsedPlan.top_junk_indices.join(", ")}]` });
          }
        }
        if (parsedPlan.headings && parsedPlan.headings.length > 0) {
          onLog?.({ type: "info", text: `📌 Bổ sung ${parsedPlan.headings.length} heading (H2/H3):` });
          for (const h of parsedPlan.headings) {
            onLog?.({ type: "detail", text: `   + [${h.level.toUpperCase()}] "${h.title}" (trước đoạn ${h.before_paragraph_index})` });
          }
        }
        if (parsedPlan.spelling_corrections && parsedPlan.spelling_corrections.length > 0) {
          onLog?.({ type: "info", text: `✍️ Sửa ${parsedPlan.spelling_corrections.length} lỗi chính tả:` });
          for (const c of parsedPlan.spelling_corrections) {
            onLog?.({ type: "detail", text: `   * [${c.paragraph_id}] "${c.original}" -> "${c.corrected}" (${c.reason})` });
          }
        }

        return {
          plan: parsedPlan,
          result,
          updatedHtml: result.updatedHtml,
        };
      }

      // If activeCandidateModel failed and fallback is available, notify and trigger next candidate
      overallLastError = modelLastError || new Error(`Mô hình ${activeCandidateModel} không phản hồi`);
      if (mIdx + 1 < candidateModels.length) {
        const nextModel = candidateModels[mIdx + 1];
        const reason = overallLastError.message;
        onFallback?.(activeCandidateModel, nextModel, reason);
        onLog?.({
          type: "warning",
          text: `🔄 [Model Fallback] Mô hình "${activeCandidateModel}" gặp sự cố (${reason}). Tự động chuyển đổi sang: "${nextModel}"...`,
        });
      }
    }

    throw overallLastError || new Error("Tất cả các mô hình trong chuỗi dự phòng đều thất bại");
  }
}
