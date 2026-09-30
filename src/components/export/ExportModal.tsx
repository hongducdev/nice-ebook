import { useState } from "react";
import { Download, Sparkles, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Checkbox } from "../ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { ScrollArea } from "../ui/scroll-area";
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

  if (!currentBook) return null;
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3.5 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <Download className="size-4 text-primary" />
            <DialogTitle className="text-sm font-semibold">Xuất Bản File Sách</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Đóng gói EPUB chuẩn hoặc chuyển đổi sang định dạng Kindle (AZW3/MOBI/EPUB) tối ưu.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 p-5">
          <div className="flex flex-col gap-4">
            {/* Book summary */}
            <div className="p-3 rounded-lg bg-secondary/60 border border-border flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Tựa sách:</span>
                <span className="font-semibold text-foreground truncate max-w-[280px]">
                  {currentBook.title}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Số chương:</span>
                <Badge variant="outline" className="font-mono text-[11px] h-5">
                  {currentBook.chapter_count} chương
                </Badge>
              </div>
            </div>

            {/* Export mode selector */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-foreground">
                Định dạng xuất
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setExportMode("kindle")}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    exportMode === "kindle"
                      ? "border-primary bg-primary/10 shadow-xs"
                      : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Sparkles className="size-3.5 text-primary" />
                    Bản Kindle
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    Có chú thích từ vựng &amp; phụ lục tra cứu. Chuyển đổi ngay trong ứng dụng.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setExportMode("standard")}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    exportMode === "standard"
                      ? "border-primary bg-primary/10 shadow-xs"
                      : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <div className="text-xs font-bold text-foreground">EPUB chuẩn</div>
                  <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    Chỉ định dạng và CSS, không thêm chú thích từ vựng.
                  </div>
                </button>
              </div>
            </div>

            {/* Kindle options */}
            {exportMode === "kindle" && (
              <>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Định dạng tệp Kindle
                  </span>
                  <RadioGroup
                    value={kindleTarget}
                    onValueChange={(val) => setKindleTarget(val as KindleTarget)}
                    className="flex flex-col gap-2"
                  >
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
                        htmlFor={`target-${opt.id}`}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          kindleTarget === opt.id
                            ? "border-primary bg-primary/5 shadow-xs"
                            : "border-border hover:bg-secondary/40"
                        }`}
                      >
                        <RadioGroupItem value={opt.id} id={`target-${opt.id}`} className="mt-0.5" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold text-foreground">
                            {opt.title}
                          </span>
                          <span className="text-[11px] text-muted-foreground leading-relaxed">
                            {opt.desc}
                          </span>
                        </div>
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                {/* Feature toggles */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Nội dung bổ sung
                  </span>
                  <label
                    htmlFor="toggle-wordwise"
                    className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-secondary/40 transition-colors"
                  >
                    <Checkbox
                      id="toggle-wordwise"
                      checked={applyWordWise}
                      onCheckedChange={(checked) => setApplyWordWise(Boolean(checked))}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-foreground">
                        Nhúng chú thích từ vựng (ruby)
                      </span>
                      <span className="text-[11px] text-muted-foreground leading-relaxed">
                        Nghĩa ngắn hiển thị nhỏ phía trên từ, theo mức {wordWiseSettings.maxDifficulty} và
                        ngôn ngữ {wordWiseSettings.language === "vi" ? "Anh - Việt" : "Anh - Anh"}.
                      </span>
                    </div>
                  </label>

                  <label
                    htmlFor="toggle-xray"
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      xrayData
                        ? "border-border hover:bg-secondary/40"
                        : "border-border opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <Checkbox
                      id="toggle-xray"
                      checked={appendXRayAppendix && Boolean(xrayData)}
                      disabled={!xrayData}
                      onCheckedChange={(checked) => setAppendXRayAppendix(Boolean(checked))}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-foreground">
                        Thêm phụ lục tra cứu nhân vật (kiểu X-Ray)
                      </span>
                      <span className="text-[11px] text-muted-foreground leading-relaxed">
                        {xrayData
                          ? `Sẽ thêm chương "Dramatis Personae" với ${xrayData.people.length} nhân vật và ${xrayData.terms.length} thuật ngữ.`
                          : "Chưa có dữ liệu. Hãy quét nhân vật ở mục Kindle X-Ray & Word Wise trước."}
                      </span>
                    </div>
                  </label>
                </div>

                {/* Readiness warnings */}
                {readiness.warnings.length > 0 && (
                  <Alert className="border-amber-500/30 bg-amber-500/10 text-foreground py-2.5">
                    <AlertTriangle className="size-4 text-amber-500" />
                    <AlertTitle className="text-xs font-medium text-amber-600 dark:text-amber-400">Lưu ý trước khi xuất</AlertTitle>
                    <AlertDescription className="text-[11px] flex flex-col gap-1 mt-1 text-muted-foreground">
                      {readiness.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1.5 leading-relaxed">
                          <span>• {w}</span>
                        </div>
                      ))}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {/* Success banner */}
            {exportedSize !== null && exportedPath && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="size-4" />
                  <span>Đã đóng gói hoàn tất!</span>
                </div>
                <p className="text-[11px] text-foreground font-mono break-all bg-background/50 p-1.5 rounded border border-border">
                  {exportedPath}
                </p>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border">
                  <span>Dung lượng tệp:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatSize(exportedSize)}
                  </span>
                </div>
              </div>
            )}

            {/* Synthesized navigation */}
            {tocRepair && (
              <div className="p-2.5 rounded-lg bg-secondary/50 border border-border flex flex-col gap-1 text-[11px]">
                <span className="font-semibold text-foreground">
                  Đã bổ sung mục lục cho bản Kindle:
                </span>
                <span className="text-muted-foreground leading-relaxed">
                  Sách gốc thiếu {tocRepair.addedNcx && tocRepair.addedNav
                    ? "cả mục lục NCX và trang mục lục"
                    : tocRepair.addedNcx
                      ? "mục lục NCX"
                      : "trang mục lục"}
                  . Đã tạo tự động {tocRepair.entries} mục theo thứ tự chương.
                </span>
              </div>
            )}

            {/* Internal link repairs */}
            {linkRepair && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex flex-col gap-1 text-[11px]">
                <span className="font-semibold text-foreground">
                  Đã sửa liên kết hỏng để bản Kindle dựng được:
                </span>
                {linkRepair.removed > 0 && (
                  <span className="text-muted-foreground leading-relaxed">
                    • {linkRepair.removed} liên kết trỏ tới tệp không tồn tại đã được chuyển thành chữ thường.
                  </span>
                )}
                {linkRepair.stripped > 0 && (
                  <span className="text-muted-foreground leading-relaxed">
                    • {linkRepair.stripped} liên kết có neo (#) không tồn tại đã được bỏ neo.
                  </span>
                )}
              </div>
            )}

            {/* Converter warnings */}
            {conversionWarnings.length > 0 && (
              <div className="p-2.5 rounded-lg bg-secondary/50 border border-border flex flex-col gap-1 text-[11px]">
                <span className="font-semibold text-foreground">
                  Bộ chuyển đổi đã đơn giản hoá {conversionWarnings.length} thành phần không hỗ trợ:
                </span>
                {conversionWarnings.slice(0, 4).map((w, i) => (
                  <span key={i} className="text-muted-foreground leading-relaxed break-all">
                    • {w}
                  </span>
                ))}
              </div>
            )}

            {/* Honest note about scope */}
            <div className="p-2.5 rounded-lg bg-secondary/40 border border-border flex items-start gap-2">
              <Info className="size-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Bộ chuyển đổi Kindle được biên dịch sẵn trong ứng dụng, không cần cài Calibre. Chú thích
                từ vựng hiển thị dưới dạng ký tự nhỏ phía trên từ (chuẩn ruby).
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="m-0 p-4 border-t border-border bg-muted/30 flex items-center justify-end gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            Đóng
          </Button>
          <Button
            size="sm"
            onClick={exportMode === "kindle" ? handleKindleExport : handleStandardExport}
            disabled={isExporting}
            className="h-8 text-xs gap-1.5"
          >
            <Download className={`size-3.5 ${isExporting ? "animate-bounce" : ""}`} />
            <span>
              {isExporting
                ? "Đang chuyển đổi..."
                : exportMode === "kindle"
                  ? "Chọn Nơi Lưu & Tạo Bản Kindle"
                  : "Chọn Nơi Lưu & Xuất"}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
