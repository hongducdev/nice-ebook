import { useState } from "react";
import { Download, X, CheckCircle2, Sparkles, AlertTriangle, Info } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/useAppStore";
import { generateEpubCss } from "../../utils/cssGenerator";
import {
  buildKindleEdition,
  sanitizeCssForKindle,
  describeKindleReadiness,
  KindleEditionChapterSource,
} from "../../services/kindle/kindleExportService";
import { toast } from "sonner";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ExportMode = "standard" | "kindle";
type KindleTarget = "epub" | "azw3" | "mobi";

interface KindleConversionResult {
  output_path: string;
  output_bytes: number;
  format: string;
  warnings: string[];
  link_repair: {
    documents_scanned: number;
    dangling_links_removed: number;
    fragments_stripped: number;
    missing_targets: string[];
  } | null;
  toc_repair: {
    had_ncx: boolean;
    had_nav: boolean;
    added_ncx: boolean;
    added_nav: boolean;
    entry_count: number;
  } | null;
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const {
    currentBook,
    currentFilePath,
    currentFileBytes,
    isVietnameseBook,
    fontFamily,
    activePreset,
    fontSize,
    lineHeight,
    firstLineIndent,
    dropCaps,
    textAlign,
    sceneDivider,
    customCss,
    bookStyleSignature,
    modifiedChapters,
    wordWiseSettings,
    xrayData,
  } = useAppStore();

  const [isExporting, setIsExporting] = useState(false);
  const [exportedSize, setExportedSize] = useState<number | null>(null);
  const [exportedPath, setExportedPath] = useState<string | null>(null);
  const [conversionWarnings, setConversionWarnings] = useState<string[]>([]);
  const [linkRepair, setLinkRepair] = useState<{
    removed: number;
    stripped: number;
    targets: string[];
  } | null>(null);
  const [tocRepair, setTocRepair] = useState<{
    addedNcx: boolean;
    addedNav: boolean;
    entries: number;
  } | null>(null);

  const [exportMode, setExportMode] = useState<ExportMode>("kindle");
  const [kindleTarget, setKindleTarget] = useState<KindleTarget>("azw3");
  const [applyWordWise, setApplyWordWise] = useState(true);
  const [appendXRayAppendix, setAppendXRayAppendix] = useState(true);

  if (!isOpen || !currentBook) return null;

  const safeTitle = currentBook.title.replace(/[/\\?%*:|"<>]/g, "_");

  const metadataOverrides = {
    title: currentBook.title,
    author: currentBook.author,
    language: currentBook.language,
    description: currentBook.description,
    cover_data_url: currentBook.cover_data_url,
  };

  const buildCss = () =>
    generateEpubCss({
      preset: activePreset,
      fontSize,
      lineHeight,
      firstLineIndent,
      dropCaps,
      textAlign,
      sceneDivider,
      customOverrides: customCss,
      isVietnamese: isVietnameseBook,
      fontFamily,
      // Chế độ "theo sách hiện tại" chỉ ghi đè những token đọc được từ CSS gốc.
      signature: bookStyleSignature,
    });

  /** Reads each chapter's current effective HTML (edited override, else the file on disk). */
  async function collectChapters(): Promise<KindleEditionChapterSource[]> {
    if (!currentBook) return [];
    const sources: KindleEditionChapterSource[] = [];

    for (const chapter of currentBook.chapters) {
      let html = modifiedChapters[chapter.href];
      if (!html) {
        try {
          if (currentFilePath) {
            html = await invoke<string>("read_chapter", {
              path: currentFilePath,
              href: chapter.href,
            });
          } else if (currentFileBytes) {
            html = await invoke<string>("read_chapter_bytes", {
              bytes: currentFileBytes,
              href: chapter.href,
            });
          }
        } catch (err) {
          console.warn(`Không đọc được chương ${chapter.href}:`, err);
        }
      }
      if (html) {
        sources.push({ href: chapter.href, title: chapter.title, html });
      }
    }
    return sources;
  }

  async function handleStandardExport() {
    const outputPath = await save({
      defaultPath: `${safeTitle}_styled.epub`,
      filters: [{ name: "EPUB Ebook", extensions: ["epub"] }],
    });
    if (!outputPath) return;

    setIsExporting(true);
    setExportedSize(null);
    setExportedPath(null);
    setConversionWarnings([]);

    try {
      const overrides = Object.keys(modifiedChapters).length > 0 ? modifiedChapters : null;
      const size = await invoke<number>("export_epub", {
        inputPath: currentFilePath,
        inputBytes: currentFileBytes,
        outputPath,
        customCss: buildCss(),
        chapterOverrides: overrides,
        metadataOverrides,
      });

      setExportedSize(size);
      setExportedPath(outputPath);
      toast.success("Xuất file EPUB thành công!");
    } catch (err) {
      console.error("Export EPUB error:", err);
      toast.error(`Lỗi khi xuất EPUB: ${err}`);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleKindleExport() {
    if (!currentBook) return;

    const isNativeKindle = kindleTarget !== "epub";
    const extension = kindleTarget;
    const filterLabel =
      kindleTarget === "azw3"
        ? "Kindle AZW3"
        : kindleTarget === "mobi"
          ? "Kindle MOBI"
          : "EPUB (Send-to-Kindle)";

    const outputPath = await save({
      defaultPath: `${safeTitle}_kindle.${extension}`,
      filters: [{ name: filterLabel, extensions: [extension] }],
    });
    if (!outputPath) return;

    setIsExporting(true);
    setExportedSize(null);
    setExportedPath(null);
    setConversionWarnings([]);
    setLinkRepair(null);
    setTocRepair(null);

    try {
      const chapters = await collectChapters();
      const edition = buildKindleEdition(chapters, {
        applyWordWise,
        wordWiseOptions: wordWiseSettings,
        appendXRayAppendix,
        xray: xrayData
          ? { bookTitle: currentBook.title, people: xrayData.people, terms: xrayData.terms }
          : null,
      });

      // A remote @import is render-blocking for a Kindle build, so it is stripped before export.
      const css = sanitizeCssForKindle(buildCss());

      if (isNativeKindle) {
        // One Rust call: build the Kindle-ready EPUB in temp, convert, always clean up.
        const result = await invoke<KindleConversionResult>("export_kindle_book", {
          inputPath: currentFilePath,
          inputBytes: currentFileBytes,
          outputPath,
          customCss: css,
          chapterOverrides: edition.chapterOverrides,
          metadataOverrides,
          extraChapters: edition.extraChapters,
        });

        setExportedSize(result.output_bytes);
        setExportedPath(result.output_path);
        setConversionWarnings(result.warnings ?? []);
        setLinkRepair(
          result.link_repair &&
            (result.link_repair.dangling_links_removed > 0 ||
              result.link_repair.fragments_stripped > 0)
            ? {
                removed: result.link_repair.dangling_links_removed,
                stripped: result.link_repair.fragments_stripped,
                targets: result.link_repair.missing_targets,
              }
            : null
        );
        setTocRepair(
          result.toc_repair && (result.toc_repair.added_ncx || result.toc_repair.added_nav)
            ? {
                addedNcx: result.toc_repair.added_ncx,
                addedNav: result.toc_repair.added_nav,
                entries: result.toc_repair.entry_count,
              }
            : null
        );

        toast.success(
          `Đã tạo bản Kindle (${kindleTarget.toUpperCase()}) với ${edition.wordWiseAnnotatedCount} chú thích từ vựng!`
        );
      } else {
        // Kindle-ready EPUB for Send-to-Kindle; the appendix travels as a new spine file.
        const size = await invoke<number>("export_epub", {
          inputPath: currentFilePath,
          inputBytes: currentFileBytes,
          outputPath,
          customCss: css,
          chapterOverrides: edition.chapterOverrides,
          metadataOverrides,
          extraChapters: edition.extraChapters,
        });

        setExportedSize(size);
        setExportedPath(outputPath);
        setLinkRepair(
          edition.linkReport.removedDanglingLinks > 0 ||
            edition.linkReport.strippedFragments > 0
            ? {
                removed: edition.linkReport.removedDanglingLinks,
                stripped: edition.linkReport.strippedFragments,
                targets: edition.linkReport.missingTargets,
              }
            : null
        );
        toast.success(
          `Đã xuất EPUB tối ưu cho Send-to-Kindle (${edition.wordWiseAnnotatedCount} chú thích từ vựng).`
        );
      }
    } catch (err) {
      console.error("Kindle export error:", err);
      toast.error(`Lỗi khi xuất bản Kindle: ${err}`);
    } finally {
      setIsExporting(false);
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const readiness = describeKindleReadiness({
    chapterCount: currentBook.chapter_count,
    hasWordWise: applyWordWise,
    hasXRayData: Boolean(xrayData),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="card-surface rounded-[var(--ui-radius-card)] w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="h-11 px-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--ui-titlebar-surface)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Download size={15} className="text-[var(--primary)]" />
            <span className="font-semibold text-xs text-[var(--foreground)]">Xuất Bản File Sách</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 overflow-y-auto">
          {/* Book summary */}
          <div className="p-3 rounded bg-[var(--secondary)] border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted-foreground)]">Tựa sách:</span>
              <span className="font-semibold text-[var(--foreground)] truncate max-w-[240px]">
                {currentBook.title}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted-foreground)]">Số chương:</span>
              <span className="font-mono text-[var(--foreground)]">
                {currentBook.chapter_count} chương
              </span>
            </div>
          </div>

          {/* Export mode selector */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-[var(--foreground)]">
              Định dạng xuất
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExportMode("kindle")}
                className={`p-2.5 rounded-[var(--ui-radius-button)] border text-left transition-all ${
                  exportMode === "kindle"
                    ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]"
                    : "border-[var(--border)] hover:bg-[var(--secondary)]"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--foreground)]">
                  <Sparkles size={12} className="text-[var(--primary)]" />
                  Bản Kindle
                </div>
                <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5 leading-relaxed">
                  Có chú thích từ vựng &amp; phụ lục tra cứu. Chuyển đổi ngay trong ứng dụng.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportMode("standard")}
                className={`p-2.5 rounded-[var(--ui-radius-button)] border text-left transition-all ${
                  exportMode === "standard"
                    ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]"
                    : "border-[var(--border)] hover:bg-[var(--secondary)]"
                }`}
              >
                <div className="text-xs font-bold text-[var(--foreground)]">EPUB chuẩn</div>
                <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5 leading-relaxed">
                  Chỉ định dạng và CSS, không thêm chú thích từ vựng.
                </div>
              </button>
            </div>
          </div>

          {/* Kindle options */}
          {exportMode === "kindle" && (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold text-[var(--foreground)]">
                  Định dạng tệp Kindle
                </span>
                <div className="flex flex-col gap-1.5">
                  {(
                    [
                      {
                        id: "azw3" as KindleTarget,
                        title: "AZW3 (KF8) — khuyên dùng",
                        desc: "Chép cáp USB vào thư mục documents/ của Kindle, hoặc dùng Send-to-Kindle.",
                      },
                      {
                        id: "mobi" as KindleTarget,
                        title: "MOBI (Dual) — máy rất cũ",
                        desc: "Gồm bản KF8 và một phần tương thích KF7 cho thiết bị đời đầu.",
                      },
                      {
                        id: "epub" as KindleTarget,
                        title: "EPUB tối ưu (Send-to-Kindle)",
                        desc: "Gửi qua email/web Amazon; Amazon sẽ tự chuyển sang định dạng Kindle.",
                      },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex items-start gap-2 p-2 rounded-[var(--ui-radius-button)] border cursor-pointer transition-all ${
                        kindleTarget === opt.id
                          ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))]"
                          : "border-[var(--border)] hover:bg-[var(--secondary)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="kindle-target"
                        checked={kindleTarget === opt.id}
                        onChange={() => setKindleTarget(opt.id)}
                        className="mt-0.5 accent-[var(--primary)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-[11px] font-semibold text-[var(--foreground)]">
                          {opt.title}
                        </span>
                        <span className="block text-[10px] text-[var(--muted-foreground)] leading-relaxed">
                          {opt.desc}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Feature toggles */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold text-[var(--foreground)]">
                  Nội dung bổ sung
                </span>
                <label className="flex items-start gap-2 p-2 rounded-[var(--ui-radius-button)] border border-[var(--border)] cursor-pointer hover:bg-[var(--secondary)]">
                  <input
                    type="checkbox"
                    checked={applyWordWise}
                    onChange={(e) => setApplyWordWise(e.target.checked)}
                    className="mt-0.5 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block text-[11px] font-semibold text-[var(--foreground)]">
                      Nhúng chú thích từ vựng (ruby)
                    </span>
                    <span className="block text-[10px] text-[var(--muted-foreground)] leading-relaxed">
                      Nghĩa ngắn hiển thị nhỏ phía trên từ, theo mức {wordWiseSettings.maxDifficulty} và
                      ngôn ngữ {wordWiseSettings.language === "vi" ? "Anh - Việt" : "Anh - Anh"}.
                    </span>
                  </span>
                </label>

                <label
                  className={`flex items-start gap-2 p-2 rounded-[var(--ui-radius-button)] border cursor-pointer transition-all ${
                    xrayData
                      ? "border-[var(--border)] hover:bg-[var(--secondary)]"
                      : "border-[var(--border)] opacity-60 cursor-not-allowed"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={appendXRayAppendix && Boolean(xrayData)}
                    disabled={!xrayData}
                    onChange={(e) => setAppendXRayAppendix(e.target.checked)}
                    className="mt-0.5 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block text-[11px] font-semibold text-[var(--foreground)]">
                      Thêm phụ lục tra cứu nhân vật (kiểu X-Ray)
                    </span>
                    <span className="block text-[10px] text-[var(--muted-foreground)] leading-relaxed">
                      {xrayData
                        ? `Sẽ thêm chương "Dramatis Personae" với ${xrayData.people.length} nhân vật và ${xrayData.terms.length} thuật ngữ.`
                        : "Chưa có dữ liệu. Hãy quét nhân vật ở mục Kindle X-Ray & Word Wise trước."}
                    </span>
                  </span>
                </label>
              </div>

              {/* Readiness warnings */}
              {readiness.warnings.length > 0 && (
                <div className="p-2.5 rounded bg-[color-mix(in_srgb,var(--ui-warning)_10%,var(--card))] border border-[color-mix(in_srgb,var(--ui-warning)_30%,var(--border))] flex flex-col gap-1">
                  {readiness.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-1.5 text-[10px] text-[var(--foreground)] leading-relaxed"
                    >
                      <AlertTriangle size={11} className="text-[var(--ui-warning)] mt-0.5 flex-shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Success banner */}
          {exportedSize !== null && exportedPath && (
            <div className="p-3 rounded bg-[color-mix(in_srgb,var(--ui-success)_12%,var(--card))] border border-[color-mix(in_srgb,var(--ui-success)_30%,var(--border))] text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-[var(--ui-success)] font-semibold">
                <CheckCircle2 size={14} />
                <span>Đã đóng gói hoàn tất!</span>
              </div>
              <p className="text-[11px] text-[var(--foreground)] font-mono break-all">
                {exportedPath}
              </p>
              <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] pt-1 border-t border-[var(--border)]">
                <span>Dung lượng tệp:</span>
                <span className="font-mono font-semibold text-[var(--foreground)]">
                  {formatSize(exportedSize)}
                </span>
              </div>
            </div>
          )}

          {/* Synthesized navigation — explains why a TOC may appear that the source lacked */}
          {tocRepair && (
            <div className="p-2.5 rounded bg-[var(--secondary)] border border-[var(--border)] flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-[var(--foreground)]">
                Đã bổ sung mục lục cho bản Kindle:
              </span>
              <span className="text-[10px] text-[var(--muted-foreground)] leading-relaxed">
                Sách gốc thiếu {tocRepair.addedNcx && tocRepair.addedNav
                  ? "cả mục lục NCX và trang mục lục"
                  : tocRepair.addedNcx
                    ? "mục lục NCX"
                    : "trang mục lục"}
                . Đã tạo tự động {tocRepair.entries} mục theo thứ tự chương — nếu không có bước này, tệp
                Kindle sẽ có mục lục hỏng và khó điều hướng.
              </span>
            </div>
          )}

          {/* Internal link repairs — surfaced so the user knows what changed */}
          {linkRepair && (
            <div className="p-2.5 rounded bg-[color-mix(in_srgb,var(--ui-warning)_10%,var(--card))] border border-[color-mix(in_srgb,var(--ui-warning)_30%,var(--border))] flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-[var(--foreground)]">
                Đã sửa liên kết hỏng để bản Kindle dựng được:
              </span>
              {linkRepair.removed > 0 && (
                <span className="text-[10px] text-[var(--foreground)] leading-relaxed">
                  · {linkRepair.removed} liên kết trỏ tới tệp không tồn tại đã được chuyển thành chữ
                  thường (nội dung vẫn giữ nguyên).
                </span>
              )}
              {linkRepair.stripped > 0 && (
                <span className="text-[10px] text-[var(--foreground)] leading-relaxed">
                  · {linkRepair.stripped} liên kết có neo (#) không tồn tại đã được bỏ phần neo.
                </span>
              )}
              {linkRepair.targets.slice(0, 3).map((t, i) => (
                <span
                  key={i}
                  className="text-[10px] text-[var(--muted-foreground)] font-mono break-all"
                >
                  ↳ thiếu: {t}
                </span>
              ))}
              {linkRepair.targets.length > 3 && (
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  … và {linkRepair.targets.length - 3} đích khác.
                </span>
              )}
            </div>
          )}

          {/* Converter warnings */}
          {conversionWarnings.length > 0 && (
            <div className="p-2.5 rounded bg-[var(--secondary)] border border-[var(--border)] flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-[var(--foreground)]">
                Bộ chuyển đổi đã đơn giản hoá {conversionWarnings.length} thành phần không hỗ trợ:
              </span>
              {conversionWarnings.slice(0, 5).map((w, i) => (
                <span key={i} className="text-[10px] text-[var(--muted-foreground)] leading-relaxed break-all">
                  {w}
                </span>
              ))}
            </div>
          )}

          {/* Honest note about scope */}
          <div className="p-2.5 rounded bg-[var(--secondary)] border border-[var(--border)] flex items-start gap-1.5">
            <Info size={12} className="text-[var(--muted-foreground)] mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-[var(--muted-foreground)] leading-relaxed">
              Bộ chuyển đổi Kindle được biên dịch sẵn trong ứng dụng, không cần cài Calibre. Chú thích
              từ vựng hiển thị dưới dạng ký tự nhỏ phía trên từ (chuẩn ruby), không phải công cụ Word Wise
              độc quyền của Amazon.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--ui-titlebar-surface)] flex items-center justify-end gap-2 flex-shrink-0">
          <button type="button" onClick={onClose} className="lg-button lg-button--secondary h-7 text-xs px-3">
            Đóng
          </button>
          <button
            type="button"
            onClick={exportMode === "kindle" ? handleKindleExport : handleStandardExport}
            disabled={isExporting}
            className="lg-button lg-button--primary h-7 text-xs px-3"
          >
            <Download size={13} className={isExporting ? "animate-bounce" : ""} />
            <span>
              {isExporting
                ? "Đang chuyển đổi..."
                : exportMode === "kindle"
                  ? "Chọn Nơi Lưu & Tạo Bản Kindle"
                  : "Chọn Nơi Lưu & Xuất"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
