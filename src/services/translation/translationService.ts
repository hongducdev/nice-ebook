import { invoke } from "@tauri-apps/api/core";
import { ChapterTranslator } from "../../utils/chapterTranslator";
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildCorrectionPrompt,
  parseTranslationResponse,
  cleanTranslatedText,
  isUntranslatedEcho,
  isTranslationTruncated,
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
  convertCurrency?: boolean;
  baseUrl: string;
  apiKey?: string;
  model: string;
  fallbackModels?: string[];
  temperature?: number;
  timeoutSecs?: number;
  maxBlocksPerChunk?: number;
  concurrency?: 1 | 2 | 3;
  enableSlidingContext?: boolean;
  enableAdaptiveDownsizing?: boolean;
  abortSignal?: AbortSignal;
  onProgress?: (progress: {
    currentBlock: number;
    totalBlocks: number;
    currentChunk: number;
    totalChunks: number;
    percent: number;
  }) => void;
  onPartialUpdate?: (data: {
    partialHtml: string;
    latestTranslatedBlockIds: string[];
    resolvedCount: number;
    totalBlocks: number;
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

      const cleaned = cleanTranslatedText(res).replace(/^["'«“]|["'»”]$/g, "").trim();
      return cleaned || cleanTitle;
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
      maxBlocksPerChunk = 8,
      concurrency = 1,
      enableSlidingContext = true,
      enableAdaptiveDownsizing = true,
      convertCurrency = true,
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

    // High Attention Density Chunking (LinguaGacha standard: ~800-1200 chars or 6-8 blocks per batch)
    // Prevents context fatigue, sentence omission, and truncation at the tail of large paragraphs
    const chunks = ChapterTranslator.chunkBlocks(blocks, {
      maxBlocks: Math.min(maxBlocksPerChunk, 8),
      maxChars: 1200,
    });

    onLog?.({
      type: "info",
      text: `Bắt đầu dịch chương "${chapterTitle}": tổng cộng ${blocks.length} đoạn văn (chia thành ${chunks.length} mẻ, luồng song song: ${concurrency}x, ngữ cảnh trượt: ${enableSlidingContext ? "Bật" : "Tắt"}).`,
    });

    const candidateModels = [model];
    for (const fb of fallbackModels) {
      if (fb && !candidateModels.includes(fb)) {
        candidateModels.push(fb);
      }
    }

    const systemPrompt = buildSystemPrompt(tone, sourceLang, targetLang, { convertCurrency });
    const allTranslations: Record<string, string> = {};
    let processedBlocksCount = 0;
    let completedChunksCount = 0;
    let successfulModel = model;

    // Precompute ordered source contexts for all chunks to ensure deterministic
    // context ordering independent of worker completion timing under concurrency.
    const precomputedContexts: Array<Array<{ id: string; text: string }>> = [];
    for (let i = 0; i < chunks.length; i++) {
      if (i === 0 || !enableSlidingContext) {
        precomputedContexts.push([]);
      } else {
        const prevSlice = chunks[i - 1].slice(-3).map((b) => ({
          id: b.id,
          text: b.originalText,
        }));
        precomputedContexts.push(prevSlice);
      }
    }

    // Helper: Single-pass translation execution for a block chunk with candidate models & recovery
    const executeChunkSinglePass = async (
      chunk: typeof blocks,
      contextBlocks: Array<{ id: string; text: string }>,
      chunkLabel: string
    ): Promise<{ chunkTranslations: Record<string, string>; usedModel: string }> => {
      const chunkPrompt = buildUserPrompt({
        sourceLangName: sourceLang,
        targetLangName: targetLang,
        tone,
        blocks: chunk.map((b) => ({ id: b.id, text: b.originalText })),
        previousContextBlocks: contextBlocks,
        glossary,
        bookTitle,
        chapterTitle,
        researchBrief,
        convertCurrency,
      });

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
            text: `[${chunkLabel}] Gửi ${chunk.length} đoạn tới mô hình "${activeModel}"...`,
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

          const chunkTranslations: Record<string, string> = { ...parsed };

          // Emit detailed logs for each translated block
          for (const b of chunk) {
            const transText = chunkTranslations[b.id];
            if (transText && transText.trim().length > 0) {
              onLog?.({
                type: "detail",
                text: `📝 [${b.id}] ${transText}`,
              });
            }
          }

          // In-chunk missing block recovery pass
          const missingInChunk = chunk.filter(
            (b) =>
              !chunkTranslations[b.id] ||
              chunkTranslations[b.id].trim().length === 0 ||
              isUntranslatedEcho(chunkTranslations[b.id], b.originalText, sourceLang, targetLang)
          );

          if (missingInChunk.length > 0 && !abortSignal?.aborted) {
            const truncatedCount = missingInChunk.filter((b) =>
              chunkTranslations[b.id] && isTranslationTruncated(chunkTranslations[b.id], b.originalText, sourceLang, targetLang)
            ).length;
            onLog?.({
              type: "detail",
              text: `ℹ️ [${chunkLabel}] Phát hiện ${missingInChunk.length}/${chunk.length} đoạn chưa dịch hoàn chỉnh${
                truncatedCount > 0 ? ` (${truncatedCount} đoạn bị tóm tắt/cắt ngắn)` : ""
              }, đang gửi yêu cầu dịch bù...`,
            });
            try {
              const recoveryPrompt = buildCorrectionPrompt({
                sourceLangName: sourceLang,
                targetLangName: targetLang,
                tone,
                blocks: missingInChunk.map((b) => ({
                  id: b.id,
                  originalText: b.originalText,
                  priorTranslation: chunkTranslations[b.id],
                })),
                previousContextBlocks: contextBlocks,
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
                if (v && v.trim().length > 0 && !isUntranslatedEcho(v, missingInChunk.find((b) => b.id === k)?.originalText || "", sourceLang, targetLang)) {
                  chunkTranslations[k] = v;
                  onLog?.({
                    type: "detail",
                    text: `🔄 [Bù ${k}] ${v}`,
                  });
                }
              }
            } catch {
              // Targeted recovery skipped on soft error
            }
          }

          return { chunkTranslations, usedModel: activeModel };
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error(String(err));
          const errMsg = lastErr.message.toLowerCase();
          const isRateLimit =
            errMsg.includes("429") ||
            errMsg.includes("rate limit") ||
            errMsg.includes("too many requests");

          if (isRateLimit && !abortSignal?.aborted) {
            onLog?.({
              type: "warning",
              text: `⏳ [Rate Limit 429]: Mô hình "${activeModel}" đạt giới hạn tần suất. Đang giãn cách 1.5s trước khi chuyển thử lại...`,
            });
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }

          const hasNextModel = mIdx + 1 < candidateModels.length;
          onLog?.({
            type: "warning",
            text: `⚠️ [${chunkLabel}] Mô hình "${activeModel}" gặp sự cố: ${lastErr.message}${
              hasNextModel ? ` -> Thử mô hình kế tiếp: "${candidateModels[mIdx + 1]}"...` : ""
            }`,
          });
        }
      }

      throw lastErr || new Error(`Tất cả mô hình đều thất bại khi dịch ${chunkLabel}`);
    };

    // Helper: Adaptive Downsizing wrapper (LinguaGacha style)
    // If a chunk fails across candidate models, bisects chunk down into smaller sub-chunks
    const executeChunkAdaptive = async (
      chunk: typeof blocks,
      contextBlocks: Array<{ id: string; text: string }>,
      chunkLabel: string,
      depth = 0
    ): Promise<{ chunkTranslations: Record<string, string>; usedModel: string }> => {
      try {
        return await executeChunkSinglePass(chunk, contextBlocks, chunkLabel);
      } catch (err) {
        if (enableAdaptiveDownsizing && chunk.length > 1 && depth < 3) {
          onLog?.({
            type: "warning",
            text: `⚡ [LinguaGacha Adaptive Downsizing]: ${chunkLabel} (${chunk.length} đoạn) bị lỗi. Tự động chia nhỏ thành 2 mẻ con để cứu bản dịch...`,
          });
          const mid = Math.ceil(chunk.length / 2);
          const firstHalf = chunk.slice(0, mid);
          const secondHalf = chunk.slice(mid);

          const res1 = await executeChunkAdaptive(firstHalf, contextBlocks, `${chunkLabel}.1`, depth + 1);
          const secondHalfContext = firstHalf.slice(-3).map((b) => ({
            id: b.id,
            text: res1.chunkTranslations[b.id] || b.originalText,
          }));
          const res2 = await executeChunkAdaptive(secondHalf, secondHalfContext, `${chunkLabel}.2`, depth + 1);

          return {
            chunkTranslations: { ...res1.chunkTranslations, ...res2.chunkTranslations },
            usedModel: res2.usedModel || res1.usedModel,
          };
        }
        throw err;
      }
    };

    // Helper to emit real-time incremental preview update whenever blocks are translated
    let liveTranslatedTitle: string | undefined;

    const emitRealtimeUpdate = (latestIds: string[]) => {
      if (!options.onPartialUpdate) return;
      try {
        const headingBlock = blocks.find(
          (b) =>
            b.tag === "h1" ||
            b.tag === "h2" ||
            b.tag === "h3" ||
            /title|chapter|heading/i.test(b.attributes)
        );
        if (headingBlock && allTranslations[headingBlock.id]) {
          liveTranslatedTitle = allTranslations[headingBlock.id];
        }

        const currentPartialHtml = ChapterTranslator.applyTranslations(chapterHtml, allTranslations, {
          mode,
          glossary,
          translatedTitle: liveTranslatedTitle,
        });
        options.onPartialUpdate({
          partialHtml: currentPartialHtml,
          latestTranslatedBlockIds: latestIds,
          resolvedCount: Object.keys(allTranslations).length,
          totalBlocks: blocks.length,
        });
      } catch (err) {
        console.warn("Could not emit realtime preview update:", err);
      }
    };

    // CONCURRENT OR SEQUENTIAL DISPATCH POOL (concurrency: 1..3)
    const safeConcurrency = Math.min(Math.max(1, concurrency || 1), 3);

    if (safeConcurrency === 1) {
      // Sequential processing: allows utilizing previously translated Vietnamese text for enhanced context continuity
      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        if (abortSignal?.aborted) {
          throw new DOMException("Thao tác dịch đã bị hủy bởi người dùng", "AbortError");
        }

        const chunk = chunks[cIdx];
        // In sequential mode, if preceding blocks are already translated, use them for Vietnamese tone consistency
        let dynamicContext = precomputedContexts[cIdx];
        if (cIdx > 0 && enableSlidingContext) {
          const prevBlocks = chunks[cIdx - 1].slice(-3);
          dynamicContext = prevBlocks.map((b) => ({
            id: b.id,
            text: allTranslations[b.id] || b.originalText,
          }));
        }

        const { chunkTranslations, usedModel } = await executeChunkAdaptive(
          chunk,
          dynamicContext,
          `Mẻ ${cIdx + 1}/${chunks.length}`
        );

        for (const [k, v] of Object.entries(chunkTranslations)) {
          allTranslations[k] = v;
        }

        successfulModel = usedModel;
        processedBlocksCount += chunk.length;
        completedChunksCount++;

        emitRealtimeUpdate(Object.keys(chunkTranslations));

        const pct = Math.round((completedChunksCount / chunks.length) * 100);
        onProgress?.({
          currentBlock: processedBlocksCount,
          totalBlocks: blocks.length,
          currentChunk: completedChunksCount,
          totalChunks: chunks.length,
          percent: pct,
        });

        const currentResolvedCount = chunk.filter((b) => Boolean(allTranslations[b.id])).length;
        onLog?.({
          type: "success",
          text: `✅ [Mẻ ${cIdx + 1}/${chunks.length}] Đã nhận bản dịch (${currentResolvedCount}/${chunk.length} đoạn).`,
        });
      }
    } else {
      // High Concurrency Pool (LinguaGacha style: 2x - 5x parallel chunk streams)
      let activeIndex = 0;
      const workerErrors: Error[] = [];
      const workers: Promise<void>[] = [];

      for (let workerId = 0; workerId < safeConcurrency; workerId++) {
        workers.push(
          (async () => {
            while (activeIndex < chunks.length) {
              if (abortSignal?.aborted || workerErrors.length > 0) break;
              const cIdx = activeIndex++;
              const chunk = chunks[cIdx];
              const context = precomputedContexts[cIdx];

              try {
                const { chunkTranslations, usedModel } = await executeChunkAdaptive(
                  chunk,
                  context,
                  `Mẻ ${cIdx + 1}/${chunks.length} [Luồng ${workerId + 1}]`
                );

                for (const [k, v] of Object.entries(chunkTranslations)) {
                  allTranslations[k] = v;
                }

                successfulModel = usedModel;
                processedBlocksCount += chunk.length;
                completedChunksCount++;

                emitRealtimeUpdate(Object.keys(chunkTranslations));

                const pct = Math.round((completedChunksCount / chunks.length) * 100);
                onProgress?.({
                  currentBlock: processedBlocksCount,
                  totalBlocks: blocks.length,
                  currentChunk: completedChunksCount,
                  totalChunks: chunks.length,
                  percent: pct,
                });

                const currentResolvedCount = chunk.filter((b) => Boolean(allTranslations[b.id])).length;
                onLog?.({
                  type: "success",
                  text: `✅ [Mẻ ${cIdx + 1}/${chunks.length}] Hoàn thành (${currentResolvedCount}/${chunk.length} đoạn).`,
                });
              } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                workerErrors.push(error);
              }
            }
          })()
        );
      }

      await Promise.all(workers);

      if (workerErrors.length > 0) {
        throw workerErrors[0];
      }
    }

    if (abortSignal?.aborted) {
      throw new DOMException("Thao tác dịch đã bị hủy bởi người dùng", "AbortError");
    }

    // CHAPTER-WIDE ZERO-GAP VERIFICATION PASS
    // Sweep entire chapter: detect any block that was omitted, empty, or an untranslated echo
    const missingBlocks = blocks.filter((b) => {
      const trans = allTranslations[b.id];
      if (!trans || trans.trim().length === 0) return true;
      return isUntranslatedEcho(trans, b.originalText, sourceLang, targetLang);
    });

    if (missingBlocks.length > 0 && !abortSignal?.aborted) {
      onLog?.({
        type: "warning",
        text: `🔍 [Zero-Gap Pass]: Phát hiện ${missingBlocks.length}/${blocks.length} đoạn văn chưa được dịch. Bắt đầu quét bù triệt để từng đoạn...`,
      });

      // Split into small micro-chunks of 3 blocks to guarantee high LLM attention & compliance
      const microChunks = ChapterTranslator.chunkBlocks(missingBlocks, {
        maxBlocks: 3,
        maxChars: 1200,
      });

      const MAX_SWEEP_REQUESTS = 15; // Bounded safety cap to prevent thrashing
      let sweepRequests = 0;

      for (let sIdx = 0; sIdx < microChunks.length && sweepRequests < MAX_SWEEP_REQUESTS; sIdx++) {
        if (abortSignal?.aborted) break;

        const subChunk = microChunks[sIdx];
        sweepRequests++;

        const subPrompt = buildCorrectionPrompt({
          sourceLangName: sourceLang,
          targetLangName: targetLang,
          tone,
          blocks: subChunk.map((b) => ({
            id: b.id,
            originalText: b.originalText,
            priorTranslation: allTranslations[b.id],
          })),
          glossary,
          bookTitle,
          chapterTitle,
          researchBrief,
        });

        for (const candidateModel of candidateModels) {
          if (abortSignal?.aborted) break;

          const modelBreaker = getCircuitBreaker(`${baseUrl || "gateway"}|${candidateModel}`);
          if (!modelBreaker.canExecute()) continue;

          try {
            const rawRecovery = await modelBreaker.execute(async () => {
              return await invoke<string>("call_ai_completion", {
                options: {
                  base_url: baseUrl,
                  api_key: apiKey,
                  model: candidateModel,
                  messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: subPrompt },
                  ],
                  temperature,
                  timeout_secs: Math.min(timeoutSecs, 45),
                },
              });
            });

            const parsed = parseTranslationResponse(rawRecovery, subChunk.map((b) => b.id));
            let recoveredCount = 0;
            for (const [k, v] of Object.entries(parsed)) {
              const origBlock = subChunk.find((b) => b.id === k);
              if (v && v.trim().length > 0 && !isUntranslatedEcho(v, origBlock?.originalText || "", sourceLang, targetLang)) {
                allTranslations[k] = v;
                recoveredCount++;
                onLog?.({
                  type: "detail",
                  text: `🔄 [Zero-Gap ${k}] ${v}`,
                });
              }
            }

            if (recoveredCount > 0) {
              emitRealtimeUpdate(Object.keys(parsed));
              break; // Micro-chunk recovered successfully
            }
          } catch {
            // Soft failure on micro-chunk, continue to next candidate model or micro-chunk
          }
        }
      }
    }

    if (abortSignal?.aborted) {
      throw new DOMException("Thao tác dịch đã bị hủy bởi người dùng", "AbortError");
    }

    // Determine translated chapter title:
    // 1. Look for explicit heading blocks (h1..h6) or title/chapter-classed blocks
    let translatedChapterTitle: string | undefined = liveTranslatedTitle;
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
    const resolvedBlocksCount = blocks.filter(
      (b) => Boolean(allTranslations[b.id] && allTranslations[b.id].trim().length > 0)
    ).length;
    const completenessPct = Math.round((resolvedBlocksCount / blocks.length) * 100);

    onLog?.({
      type: resolvedBlocksCount === blocks.length ? "success" : "warning",
      text: `🎉 Hoàn tất dịch chương "${chapterTitle}" ➔ "${translatedChapterTitle || chapterTitle}" (${resolvedBlocksCount}/${blocks.length} đoạn, đạt ${completenessPct}% toàn vẹn nội dung, thời gian: ${(
        elapsedMs / 1000
      ).toFixed(1)}s, chế độ: ${mode === "bilingual" ? "Song ngữ" : "Thay thế"}).`,
    });

    return {
      translatedHtml: finalHtml,
      translatedChapterTitle,
      totalBlocks: blocks.length,
      translatedBlocksCount: resolvedBlocksCount,
      elapsedMs,
      usedModel: successfulModel,
    };
  }
}
