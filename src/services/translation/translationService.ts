import { invoke } from "@tauri-apps/api/core";
import { ChapterTranslator } from "../../utils/chapterTranslator";
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseTranslationResponse,
  TranslationTone,
} from "../prompts/bookTranslator";

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
  totalBlocks: number;
  translatedBlocksCount: number;
  elapsedMs: number;
  usedModel: string;
}

export class TranslationService {
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

        try {
          onLog?.({
            type: "detail",
            text: `[Mẻ ${cIdx + 1}/${chunks.length}] Gửi ${chunk.length} đoạn tới mô hình "${activeModel}"...`,
          });

          const rawOutput = await invoke<string>("call_ai_completion", {
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

          const parsed = parseTranslationResponse(rawOutput);
          const translatedKeys = Object.keys(parsed);

          if (translatedKeys.length === 0) {
            throw new Error(`Mô hình ${activeModel} không trả về mảng JSON bản dịch hợp lệ`);
          }

          for (const [k, v] of Object.entries(parsed)) {
            allTranslations[k] = v;
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

          onLog?.({
            type: "success",
            text: `✅ [Mẻ ${cIdx + 1}/${chunks.length}] Đã nhận bản dịch (${translatedKeys.length}/${chunk.length} đoạn).`,
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

    // Surgically apply all received translations to the original XHTML chapter
    const finalHtml = ChapterTranslator.applyTranslations(chapterHtml, allTranslations, {
      mode,
      glossary,
    });

    const elapsedMs = Math.round(performance.now() - start);
    const translatedCount = Object.keys(allTranslations).length;

    onLog?.({
      type: "success",
      text: `🎉 Hoàn tất dịch chương "${chapterTitle}" (${translatedCount}/${blocks.length} đoạn, thời gian: ${(
        elapsedMs / 1000
      ).toFixed(1)}s, chế độ: ${mode === "bilingual" ? "Song ngữ" : "Thay thế"}).`,
    });

    return {
      translatedHtml: finalHtml,
      totalBlocks: blocks.length,
      translatedBlocksCount: translatedCount,
      elapsedMs,
      usedModel: successfulModel,
    };
  }
}
