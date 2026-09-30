import { invoke } from "@tauri-apps/api/core";
import { ChapterTranslator } from "../../utils/chapterTranslator";
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseTranslationResponse,
  TranslationTone,
} from "../prompts/bookTranslator";
import { getCircuitBreaker } from "../ai/circuitBreaker";

export interface TranslateChapterOptions {
  chapterHtml: string;
  chapterTitle: string;
  bookTitle?: string;
  sourceLang: string;
  targetLang: string;
  tone: TranslationTone;
  mode: "replace" | "bilingual";
  glossary?: Record<string, string>;
  researchBrief?: string;
  translateChapterTitle?: boolean;
  baseUrl: string;
  apiKey?: string;
  model: string;
  fallbackModels?: string[];
  temperature?: number;
  timeoutSecs?: number;
  maxBlocksPerChunk?: number;
  abortSignal?: AbortSignal;
  onProgress?: (progress: {
    currentBlock: number;
    totalBlocks: number;
    currentChunk: number;
    totalChunks: number;
    percent: number;
  }) => void;
  onLog?: (log: {
    type: "info" | "warning" | "success" | "detail";
    text: string;
  }) => void;
}

export interface TranslateChapterResult {
  translatedHtml: string;
  translatedChapterTitle?: string;
  totalBlocks: number;
  translatedBlocksCount: number;
  elapsedMs: number;
  usedModel: string;
}

export class TranslationService {
  /**
   * Translates a single title (book title or chapter title) into the target language.
   */
  public static async translateTitle(options: {
    title: string;
    sourceLang: string;
    targetLang: string;
    tone: TranslationTone;
    baseUrl: string;
    apiKey?: string;
    model: string;
  }): Promise<string> {
    const { title, sourceLang, targetLang, tone, baseUrl, apiKey, model } = options;
    const cleanTitle = title.trim();
    if (!cleanTitle) return cleanTitle;

    const systemPrompt = `Bạn là một dịch giả sách chuyên nghiệp từ ${sourceLang} sang ${targetLang}.
Nhiệm vụ: Dịch tiêu đề tác phẩm hoặc tiêu đề chương sách sang ${targetLang} theo văn phong ${tone}.
Yêu cầu bắt buộc: Chỉ trả về duy nhất tên bản dịch đã chuyển ngữ, không thêm lời chào, không thêm ngoặc kép, không giải thích.`;

    try {
      const res = await invoke<string>("call_ai_completion", {
        options: {
          base_url: baseUrl,
          api_key: apiKey,
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Tiêu đề: "${cleanTitle}"` },
          ],
          temperature: 0.2,
          timeout_secs: 20,
        },
      });

      if (!res || typeof res !== "string") {
        return cleanTitle;
      }

      const trimmed = res.replace(/^["'«“]|["'»”]$/g, "").trim();
      return trimmed || cleanTitle;
    } catch (err) {
      console.warn("Could not translate title:", err);
      return cleanTitle;
    }
  }

  /**
   * Translates an entire XHTML chapter chunk-by-chunk with prompt isolation,
   * model fallback handling, surgical replacement, and abort support.
   */
  public static async translateChapter(
    options: TranslateChapterOptions
  ): Promise<TranslateChapterResult> {
    const start = performance.now();
    const {
      chapterHtml,
      chapterTitle,
      bookTitle,
      sourceLang,
      targetLang,
      tone,
      mode,
      glossary,
      researchBrief,
      baseUrl,
      apiKey,
      model,
      fallbackModels = [],
      temperature = 0.3,
      timeoutSecs = 90,
      maxBlocksPerChunk = 12,
      abortSignal,
      onProgress,
      onLog,
    } = options;

    if (abortSignal?.aborted) {
      throw new DOMException("Thao tác dịch đã bị hủy bởi người dùng", "AbortError");
    }

    const blocks = ChapterTranslator.extractTranslatableBlocks(chapterHtml);
    if (blocks.length === 0) {
      onLog?.({
        type: "info",
        text: `Chương "${chapterTitle}" không chứa đoạn văn bản nào cần dịch (chỉ chứa ảnh hoặc thẻ định dạng rỗng).`,
      });
      return {
        translatedHtml: chapterHtml,
        totalBlocks: 0,
        translatedBlocksCount: 0,
        elapsedMs: Math.round(performance.now() - start),
        usedModel: model,
      };
    }

    const chunks = ChapterTranslator.chunkBlocks(blocks, {
      maxBlocks: maxBlocksPerChunk,
      maxChars: 2200,
    });

    onLog?.({
      type: "info",
      text: `Bắt đầu dịch chương "${chapterTitle}": tổng cộng ${blocks.length} đoạn văn (chia thành ${chunks.length} mẻ).`,
    });

    const candidateModels = [model];
    for (const fb of fallbackModels) {
      if (fb && !candidateModels.includes(fb)) {
        candidateModels.push(fb);
      }
    }

    const systemPrompt = buildSystemPrompt(tone, sourceLang, targetLang);
    const allTranslations: Record<string, string> = {};
    let processedBlocksCount = 0;
    let successfulModel = model;

    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      if (abortSignal?.aborted) {
        throw new DOMException("Thao tác dịch đã bị hủy bởi người dùng", "AbortError");
      }

      const chunk = chunks[cIdx];
      const chunkPrompt = buildUserPrompt({
        sourceLangName: sourceLang,
        targetLangName: targetLang,
        tone,
        blocks: chunk.map((b) => ({ id: b.id, text: b.originalText })),
        glossary,
        bookTitle,
        chapterTitle,
        researchBrief,
      });

      let chunkSuccess = false;
      let lastErr: Error | null = null;

      for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
        const activeModel = candidateModels[mIdx];
        if (abortSignal?.aborted) {
          throw new DOMException("Thao tác dịch đã bị hủy bởi người dùng", "AbortError");
        }

        const modelBreaker = getCircuitBreaker(`${baseUrl || "gateway"}|${activeModel}`);

        if (!modelBreaker.canExecute()) {
          onLog?.({
            type: "warning",
            text: `⚠️ [Jev Guardrail]: Mô hình "${activeModel}" đang tạm ngắt do lỗi liên tục (Circuit Breaker OPEN). Thử mô hình kế tiếp...`,
          });
          continue;
        }

        try {
          onLog?.({
            type: "detail",
            text: `[Mẻ ${cIdx + 1}/${chunks.length}] Gửi ${chunk.length} đoạn tới mô hình "${activeModel}"...`,
          });

          const rawOutput = await modelBreaker.execute(async () => {
            return await invoke<string>("call_ai_completion", {
              options: {
                base_url: baseUrl,
                api_key: apiKey,
                model: activeModel,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: chunkPrompt },
                ],
                temperature,
                timeout_secs: timeoutSecs,
              },
            });
          });
          const parsed = parseTranslationResponse(rawOutput, chunk.map((b) => b.id));
          const translatedKeys = Object.keys(parsed);

          if (translatedKeys.length === 0) {
            throw new Error(`Mô hình ${activeModel} không trả về mảng JSON bản dịch hợp lệ`);
          }

          for (const [k, v] of Object.entries(parsed)) {
            allTranslations[k] = v;
          }

          // Missing Block Recovery: If model returned a partial chunk (e.g. 10/12 blocks),
          // automatically attempt a targeted sub-pass for the omitted blocks to prevent
          // residual source language leaking into the chapter.
          const missingInChunk = chunk.filter((b) => !allTranslations[b.id] || allTranslations[b.id].trim().length === 0);
          if (missingInChunk.length > 0 && missingInChunk.length < chunk.length && !abortSignal?.aborted) {
            onLog?.({
              type: "detail",
              text: `ℹ️ [Mẻ ${cIdx + 1}] Phát hiện ${missingInChunk.length}/${chunk.length} đoạn chưa dịch, đang gửi yêu cầu dịch bổ sung...`,
            });
            try {
              const recoveryPrompt = buildUserPrompt({
                sourceLangName: sourceLang,
                targetLangName: targetLang,
                tone,
                blocks: missingInChunk.map((b) => ({ id: b.id, text: b.originalText })),
                glossary,
                bookTitle,
                chapterTitle,
                researchBrief,
              });
              const rawRecovery = await invoke<string>("call_ai_completion", {
                options: {
                  base_url: baseUrl,
                  api_key: apiKey,
                  model: activeModel,
                  messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: recoveryPrompt },
                  ],
                  temperature,
                  timeout_secs: Math.min(timeoutSecs, 45),
                },
              });
              const parsedRecovery = parseTranslationResponse(rawRecovery, missingInChunk.map((b) => b.id));
              for (const [k, v] of Object.entries(parsedRecovery)) {
                if (v && v.trim().length > 0) {
                  allTranslations[k] = v;
                }
              }
            } catch (recoveryErr) {
              console.warn("Targeted missing blocks recovery pass skipped:", recoveryErr);
            }
          }

          successfulModel = activeModel;
          chunkSuccess = true;
          processedBlocksCount += chunk.length;

          const pct = Math.round(((cIdx + 1) / chunks.length) * 100);
          onProgress?.({
            currentBlock: processedBlocksCount,
            totalBlocks: blocks.length,
            currentChunk: cIdx + 1,
            totalChunks: chunks.length,
            percent: pct,
          });

          const currentResolvedCount = chunk.filter((b) => Boolean(allTranslations[b.id])).length;
          onLog?.({
            type: "success",
            text: `✅ [Mẻ ${cIdx + 1}/${chunks.length}] Đã nhận bản dịch (${currentResolvedCount}/${chunk.length} đoạn).`,
          });

          break; // Chunk succeeded, break fallback loop
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error(String(err));
          const hasNextModel = mIdx + 1 < candidateModels.length;
          onLog?.({
            type: "warning",
            text: `⚠️ [Mẻ ${cIdx + 1}] Mô hình "${activeModel}" gặp sự cố: ${lastErr.message}${
              hasNextModel ? ` -> Thử mô hình kế tiếp: "${candidateModels[mIdx + 1]}"...` : ""
            }`,
          });
        }
      }

      if (!chunkSuccess) {
        throw new Error(
          `Không thể dịch mẻ ${cIdx + 1}/${chunks.length} của chương "${chapterTitle}": ${
            lastErr?.message || "Lỗi không xác định"
          }`
        );
      }
    }

    if (abortSignal?.aborted) {
      throw new DOMException("Thao tác dịch đã bị hủy bởi người dùng", "AbortError");
    }

    // Determine translated chapter title:
    // 1. Look for explicit heading blocks (h1..h6) or title/chapter-classed blocks
    let translatedChapterTitle: string | undefined;
    const headingBlock = blocks.find(
      (b) =>
        b.tag === "h1" ||
        b.tag === "h2" ||
        b.tag === "h3" ||
        /title|chapter|heading/i.test(b.attributes)
    );
    if (headingBlock && allTranslations[headingBlock.id]) {
      translatedChapterTitle = allTranslations[headingBlock.id];
    }

    // 2. If no heading block translated, or chapterTitle was provided and translateChapterTitle is enabled
    if (!translatedChapterTitle && options.translateChapterTitle && chapterTitle && chapterTitle.trim()) {
      try {
        translatedChapterTitle = await TranslationService.translateTitle({
          title: chapterTitle,
          sourceLang,
          targetLang,
          tone,
          baseUrl,
          apiKey,
          model: successfulModel,
        });
      } catch {
        translatedChapterTitle = chapterTitle;
      }
    }

    // Surgically apply all received translations to the original XHTML chapter
    // and sync the <title> tag inside <head> with translatedChapterTitle.
    const finalHtml = ChapterTranslator.applyTranslations(chapterHtml, allTranslations, {
      mode,
      glossary,
      translatedTitle: translatedChapterTitle,
    });

    const elapsedMs = Math.round(performance.now() - start);
    const translatedCount = Object.keys(allTranslations).length;

    onLog?.({
      type: "success",
      text: `🎉 Hoàn tất dịch chương "${chapterTitle}" ➔ "${translatedChapterTitle || chapterTitle}" (${translatedCount}/${blocks.length} đoạn, thời gian: ${(
        elapsedMs / 1000
      ).toFixed(1)}s, chế độ: ${mode === "bilingual" ? "Song ngữ" : "Thay thế"}).`,
    });

    return {
      translatedHtml: finalHtml,
      translatedChapterTitle,
      totalBlocks: blocks.length,
      translatedBlocksCount: translatedCount,
      elapsedMs,
      usedModel: successfulModel,
    };
  }
}
