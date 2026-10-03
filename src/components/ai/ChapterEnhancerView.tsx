import { useState, useRef, useEffect, useMemo } from "react";
import {
  Wand2,
  Play,
  Square,
  RotateCcw,
  BookOpen,
  CheckCircle2,
  Heading,
  PenTool,
  Trash2,
  Sliders,
  Check,
  Cpu,
  Zap,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Progress } from "../ui/progress";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Separator } from "../ui/separator";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { TranslationLogPanel, LogFilterKey, filterLogs } from "../translation/TranslationLogPanel";
import { AgentModelSelector } from "../agent/AgentModelSelector";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { useAppStore } from "../../stores/useAppStore";
import { toast } from "sonner";

type AiEngineMode = "hybrid" | "jev-verdict" | "gateway";
type EnhanceScope = "unprocessed" | "all" | "single";

/** Mutually exclusive AI acceleration engines (each needs a description line). */
const ENGINE_OPTIONS: Array<{ id: AiEngineMode; title: string; description: string }> = [
  {
    id: "hybrid",
    title: "⚡🌐 Hybrid (Khuyên dùng)",
    description:
      "Lõi cục bộ lọc rác & sửa lỗi nhanh; chỉ chuyển tiếp câu từ phức tạp lên Cloud LLM (tiết kiệm ~80% token).",
  },
  {
    id: "jev-verdict",
    title: "⚡ Tự động Offline (~15ms)",
    description:
      "100% Offline trên Rust, không cần API key, không bị Rate Limit, xử lý toàn bộ sách trong vài giây.",
  },
  {
    id: "gateway",
    title: "🌐 Cloud AI Gateway Thuần",
    description: "Gửi toàn bộ văn bản chương lên mô hình đám mây (DeepSeek, Gemini, Claude).",
  },
];

/** Success chip styling shared by the fallback-chain test results. */
const TEST_SUCCESS_BADGE =
  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";

export function ChapterEnhancerView() {
  const {
    currentBook,
    activeChapterIndex,
    setActiveChapterIndex,
    setActiveTab,
    activeGateway,
    selectedModel,
    aiEngineMode,
    setAiEngineMode,
    fallbackModels,
    isFallbackEnabled,
    setIsFallbackEnabled,
    modifiedChapters,
    chapterEnhanceReports,
    modelTestResults,
    validateAndFilterFallbackModels,
    isBatchEnhancing,
    enhanceProgress,
    terminalLogs,
    clearEnhancerLogs,
    resetChapterOverrides,
    enhanceSingleChapter,
    batchEnhanceChapters,
    stopBatchEnhance,
    cleanWatermarksInBook,
  } = useAppStore();

  const [scope, setScope] = useState<EnhanceScope>("unprocessed");
  const [skipAlreadyEnhanced, setSkipAlreadyEnhanced] = useState(true);
  const [forceReprocessSingle, setForceReprocessSingle] = useState(false);
  const [isCheckingFallback, setIsCheckingFallback] = useState(false);
  const [standardizeH1, setStandardizeH1] = useState(true);
  const [cleanTopJunk, setCleanTopJunk] = useState(true);
  const [addHeadings, setAddHeadings] = useState(true);
  const [fixVietnameseTypos, setFixVietnameseTypos] = useState(true);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [isProcessingSingle, setIsProcessingSingle] = useState(false);
  const [isCleaningWatermarks, setIsCleaningWatermarks] = useState(false);
  const [customWatermarkInput, setCustomWatermarkInput] = useState("dtv-ebook, dtv-ebook.com");
  const [logFilter, setLogFilter] = useState<LogFilterKey>("all");
  const [logSearch, setLogSearch] = useState("");
  const [logAutoScroll, setLogAutoScroll] = useState(true);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Isolated enhancement logs to prevent translation logs leaking into editor
  const enhancerLogs = useMemo(
    () =>
      terminalLogs.filter(
        (l) =>
          l.category === "enhancement" ||
          (!l.category &&
            (l.text.includes("[Biên tập]") ||
              l.text.includes("[Tối ưu]") ||
              l.text.includes("chính tả") ||
              l.text.includes("H1") ||
              l.text.includes("H2")))
      ),
    [terminalLogs]
  );

  const filteredEnhancerLogs = useMemo(
    () => filterLogs(enhancerLogs, logFilter, logSearch),
    [enhancerLogs, logFilter, logSearch]
  );

  // Auto scroll terminal log to bottom on new lines without animation stutter
  useEffect(() => {
    if (logAutoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [enhancerLogs, logAutoScroll]);

  // Aggregate statistics across reports
  const reportsList = Object.values(chapterEnhanceReports);
  const totalHeadingsAdded = reportsList.reduce((acc, r) => acc + (r.headingsCount || 0), 0);
  const totalTyposFixed = reportsList.reduce((acc, r) => acc + (r.typosFixedCount || 0), 0);
  const totalJunkCleaned = reportsList.reduce((acc, r) => acc + (r.cleanedTopIndices?.length || 0), 0);
  const modifiedCount = Object.keys(modifiedChapters).length;
  const totalChapters = currentBook?.chapter_count || 0;
  const processedHrefs = new Set(Object.keys(modifiedChapters));
  const unprocessedCount = currentBook?.chapters.filter((ch) => !processedHrefs.has(ch.href)).length || 0;
  const primaryTestResult = modelTestResults[selectedModel || ""];

  async function handleCheckFallbackChain() {
    setIsCheckingFallback(true);
    toast.loading("Đang kiểm tra lỗi kết nối các mô hình dự phòng...", { id: "check-fallback" });
    try {
      const verified = await validateAndFilterFallbackModels();
      const removedCount = fallbackModels.length - verified.length;
      if (removedCount > 0) {
        toast.warning(`Đã tự động loại ${removedCount} mô hình bị lỗi khỏi chuỗi dự phòng!`, { id: "check-fallback" });
      } else {
        toast.success("Tất cả các mô hình trong chuỗi dự phòng đều hoạt động tốt (không lỗi)!", { id: "check-fallback" });
      }
    } catch (err) {
      toast.error(`Lỗi khi kiểm tra chuỗi fallback: ${err}`, { id: "check-fallback" });
    } finally {
      setIsCheckingFallback(false);
    }
  }

  async function handleCleanWatermarks() {
    if (!currentBook) {
      toast.error("Vui lòng mở một cuốn sách trước khi làm sạch watermark.");
      return;
    }

    setIsCleaningWatermarks(true);
    toast.loading("Đang quét và làm sạch watermark trên toàn bộ các chương...", { id: "clean-wm" });

    try {
      const customKws = customWatermarkInput
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const result = await cleanWatermarksInBook(customKws);
      if (result.affectedChapters > 0 || result.removedCount > 0) {
        toast.success(
          `Đã xóa sạch ${result.removedCount} đoạn watermark/header rác trong ${result.affectedChapters} chương!`,
          { id: "clean-wm" }
        );
      } else {
        toast.info("Không phát hiện thêm watermark nào trong sách.", { id: "clean-wm" });
      }
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi làm sạch watermark", { id: "clean-wm" });
    } finally {
      setIsCleaningWatermarks(false);
    }
  }

  async function handleStartEnhance() {
    if (!currentBook) {
      toast.error("Vui lòng mở một cuốn sách trước khi thực hiện biên tập AI");
      return;
    }

    const features = {
      standardizeH1,
      cleanTopJunk,
      addHeadings,
      fixVietnameseTypos,
    };

    if (scope === "single") {
      const activeCh = currentBook.chapters[activeChapterIndex];
      const isAlreadyDone = activeCh && Boolean(modifiedChapters[activeCh.href]);

      if (isAlreadyDone && !forceReprocessSingle) {
        toast.info(`Chương ${activeChapterIndex + 1} đã được xử lý trước đó trong dự án. Bật "Biên tập lại từ đầu" nếu muốn làm lại.`, { id: "enhance-ch" });
        return;
      }

      setIsProcessingSingle(true);
      toast.loading(`Đang xử lý chương ${activeChapterIndex + 1}...`, { id: "enhance-ch" });
      try {
        const ok = await enhanceSingleChapter(activeChapterIndex, features, {
          forceReprocess: forceReprocessSingle,
        });
        if (ok) {
          toast.success(`Đã chuẩn hóa chương ${activeChapterIndex + 1}!`, { id: "enhance-ch" });
        } else {
          toast.error(`Xử lý chương thất bại. Vui lòng kiểm tra log bên dưới.`, { id: "enhance-ch" });
        }
      } finally {
        setIsProcessingSingle(false);
      }
    } else {
      let targetIndices: number[] | undefined = undefined;

      if (scope === "unprocessed") {
        targetIndices = currentBook.chapters
          .map((ch, idx) => (!processedHrefs.has(ch.href) ? idx : -1))
          .filter((idx) => idx !== -1);

        if (targetIndices.length === 0) {
          toast.success("Tất cả các chương đều đã được xử lý xong trong dự án! Không cần làm lại.");
          return;
        }

        toast.info(`Bắt đầu xử lý ${targetIndices.length} chương còn dang dở trong dự án...`);
      } else {
        toast.info(`Bắt đầu xử lý ${currentBook.chapter_count} chương...`);
      }

      const completed = await batchEnhanceChapters(targetIndices, features, {
        skipAlreadyEnhanced: scope === "all" ? skipAlreadyEnhanced : false,
      });

      if (completed) {
        toast.success("Hoàn tất tiến trình biên tập AI!");
      }
    }
  }

  function handleCopyLogs() {
    if (enhancerLogs.length === 0) return;
    const text = filteredEnhancerLogs
      .map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.type.toUpperCase()}] ${l.text}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedLogs(false), 2000);
    toast.success(
      filteredEnhancerLogs.length === enhancerLogs.length
        ? "Đã sao chép toàn bộ log biên tập"
        : `Đã sao chép ${filteredEnhancerLogs.length}/${enhancerLogs.length} dòng log đang hiển thị`
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Header */}
      <div className="px-4 py-2.5 bg-transparent flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
            <Wand2 className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading font-medium text-sm text-foreground tracking-tight">
                Bước 3: Biên Tập &amp; Soát Lỗi AI
              </h1>
              <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary px-2 h-4.5 rounded-full">
                {selectedModel || "gemini-3.6-flash"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Chuẩn hóa H1, dọn dẹp thẻ top rác, chèn heading H2/H3 phân cấp và sửa lỗi chính tả tiếng Việt.
            </p>
          </div>
        </div>

        {/* Top actions */}
        <div className="flex items-center gap-2 shrink-0">
          <AgentModelSelector compact className="h-7" />
          {modifiedCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setActiveTab("reader")}
              className="h-7 px-3 text-xs gap-1.5 rounded-full text-foreground hover:text-primary hover:border-primary/40 transition-colors shadow-2xs"
              title="Xem trực tiếp các chương đã biên tập"
            >
              <BookOpen className="size-3 text-primary" />
              <span>Xem Trình Đọc</span>
            </Button>
          )}

          {modifiedCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={resetChapterOverrides}
              className="h-7 px-3 text-xs gap-1.5 rounded-full text-destructive border-destructive/30 hover:bg-destructive/10 transition-colors shadow-2xs"
              title="Hoàn tác tất cả các thay đổi nội dung"
            >
              <RotateCcw className="size-3" />
              <span>Hoàn Tác</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Content: Split into Controls & Terminal Output */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Control Panel */}
        <div className="w-full lg:w-[380px] border-r border-border flex flex-col p-4 gap-4 overflow-y-auto flex-shrink-0 bg-background">
          {/* Book / Target Scope */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Phạm Vi Xử Lý
            </Label>
            <ToggleGroup
              type="single"
              value={scope}
              onValueChange={(val) => {
                if (val) setScope(val as EnhanceScope);
              }}
              className="grid grid-cols-3 w-full border border-border rounded-md p-0.5 bg-muted/40"
            >
              <ToggleGroupItem
                value="unprocessed"
                size="sm"
                className="h-7 text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-primary"
                title="Chỉ biên tập các chương chưa được xử lý trong dự án"
              >
                Chưa làm ({unprocessedCount})
              </ToggleGroupItem>
              <ToggleGroupItem
                value="all"
                size="sm"
                className="h-7 text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-primary"
                title="Duyệt qua tất cả các chương trong sách"
              >
                Tất cả ({totalChapters})
              </ToggleGroupItem>
              <ToggleGroupItem
                value="single"
                size="sm"
                className="h-7 text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-primary"
              >
                Đơn lẻ
              </ToggleGroupItem>
            </ToggleGroup>

            {scope === "all" && modifiedCount > 0 && (
              <Label
                htmlFor="skip-already-enhanced"
                className="flex items-center gap-2 mt-1 px-1 text-[11px] font-normal text-muted-foreground cursor-pointer select-none"
              >
                <Checkbox
                  id="skip-already-enhanced"
                  checked={skipAlreadyEnhanced}
                  onCheckedChange={(checked) => setSkipAlreadyEnhanced(Boolean(checked))}
                />
                <span>Kiểm tra &amp; bỏ qua các chương đã làm ({modifiedCount} chương)</span>
              </Label>
            )}

            {scope === "single" && currentBook && (
              <div className="mt-1 flex flex-col gap-1.5">
                <Label
                  htmlFor="single-chapter-select"
                  className="text-[11px] font-normal text-muted-foreground"
                >
                  Chọn chương cần biên tập:
                </Label>
                <Select
                  value={String(activeChapterIndex)}
                  onValueChange={(val) => {
                    setActiveChapterIndex(Number(val));
                    setForceReprocessSingle(false);
                  }}
                >
                  <SelectTrigger
                    id="single-chapter-select"
                    size="sm"
                    className="w-full font-mono text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {currentBook.chapters.map((ch, idx) => {
                        const isDone = Boolean(modifiedChapters[ch.href]);
                        return (
                          <SelectItem key={ch.href} value={String(idx)} className="font-mono text-xs">
                            [{idx + 1}] {ch.title} {isDone ? "✓ (Đã làm)" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                {currentBook.chapters[activeChapterIndex] &&
                  modifiedChapters[currentBook.chapters[activeChapterIndex].href] && (
                    <Alert className="border-emerald-500/20 bg-emerald-500/10 px-2 py-2 text-[11px]">
                      <AlertTitle className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Check className="size-3" />
                        <span>Chương này đã hoàn thành và lưu trong dự án.</span>
                      </AlertTitle>
                      <AlertDescription className="text-[11px]">
                        <Label
                          htmlFor="force-reprocess-single"
                          className="flex items-center gap-1.5 mt-0.5 px-0 text-[11px] font-normal text-muted-foreground cursor-pointer select-none"
                        >
                          <Checkbox
                            id="force-reprocess-single"
                            checked={forceReprocessSingle}
                            onCheckedChange={(checked) => setForceReprocessSingle(Boolean(checked))}
                          />
                          <span>Biên tập lại từ đầu (Ghi đè nội dung gốc)</span>
                        </Label>
                      </AlertDescription>
                    </Alert>
                  )}
              </div>
            )}
          </div>

          {/* AI Acceleration Engine (Jev Verdict 2.0 vs Hybrid vs Cloud) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="size-3.5 text-primary" />
                <span>Động Cơ AI (Engine)</span>
              </Label>
              <Badge variant="outline" className="text-[9px] font-mono border-primary/40 text-primary">
                Offline Core
              </Badge>
            </div>

            <RadioGroup
              value={aiEngineMode}
              onValueChange={(val) => setAiEngineMode(val as AiEngineMode)}
            >
              {ENGINE_OPTIONS.map((option) => (
                <Label
                  key={option.id}
                  htmlFor={`engine-${option.id}`}
                  className={`flex items-start gap-2 rounded-lg border p-2 text-left cursor-pointer select-none transition-all font-normal ${
                    aiEngineMode === option.id
                      ? "border-primary bg-primary/5 shadow-xs"
                      : "border-border hover:bg-secondary/40"
                  }`}
                >
                  <RadioGroupItem value={option.id} id={`engine-${option.id}`} className="mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-foreground">{option.title}</span>
                    <span className="text-[11px] text-muted-foreground leading-snug">
                      {option.description}
                    </span>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </div>

          {/* Model & Gateway Selection */}
          <Card className="shrink-0 px-3 gap-2">
            <CardHeader className="px-0 gap-2">
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                <Cpu className="size-3.5 text-primary" />
                <span>AI Gateway &amp; Model</span>
              </CardTitle>
              <CardAction className="self-center">
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  onClick={() => setActiveTab("ai")}
                  className="text-[10px]"
                >
                  Đổi Model
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="px-0 flex flex-col gap-2 text-xs">
              <div className="text-muted-foreground flex items-center justify-between">
                <span>Cổng kết nối:</span>
                <span className="font-mono text-foreground font-medium">
                  {activeGateway ? activeGateway.name : "9router (Local)"}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 pt-1 border-t border-border/40">
                <span className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">
                  Mô hình chỉ định:
                </span>
                <AgentModelSelector className="w-full" />
              </div>
            </CardContent>
          </Card>

          {/* Model Fallback Configuration */}
          <Card className="shrink-0 px-3 gap-2">
            <CardHeader className="px-0 gap-2">
              <CardTitle className="text-xs">
                <Label
                  htmlFor="fallback-enabled"
                  className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold"
                >
                  <Switch
                    id="fallback-enabled"
                    size="sm"
                    checked={isFallbackEnabled}
                    onCheckedChange={setIsFallbackEnabled}
                  />
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-emerald-500" />
                    <span>Cơ Chế Dự Phòng (Fallback)</span>
                  </span>
                </Label>
              </CardTitle>
              <CardAction className="self-center">
                <Badge variant="secondary" className={`text-[9px] font-mono ${TEST_SUCCESS_BADGE}`}>
                  Zero-Fail
                </Badge>
              </CardAction>
            </CardHeader>

            {isFallbackEnabled && (
              <CardContent className="px-0 flex flex-col gap-1.5 mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Chuỗi mô hình dự phòng (theo Gateway):
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    onClick={handleCheckFallbackChain}
                    disabled={isCheckingFallback}
                    className="text-[10px] gap-1"
                    title="Kiểm tra kết nối và loại bỏ các mô hình lỗi khỏi chuỗi dự phòng"
                  >
                    {isCheckingFallback ? (
                      <Spinner className="size-2.5" />
                    ) : (
                      <Activity className="size-2.5" />
                    )}
                    <span>{isCheckingFallback ? "Đang kiểm tra..." : "Kiểm tra lỗi"}</span>
                  </Button>
                </div>

                <div className="flex flex-col gap-1">
                  <Card size="sm" className="gap-0 py-0">
                    <CardContent className="flex items-center justify-between gap-1.5 py-1.5 font-mono text-[10px] text-primary font-semibold">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-3 text-center">1.</span>
                        <span className="truncate">{selectedModel || "gemini-3.6-flash"}</span>
                        <span className="text-[9px] opacity-75 font-sans font-normal">(Chính)</span>
                      </div>
                      {primaryTestResult && (
                        <Badge
                          variant={primaryTestResult.success ? "secondary" : "destructive"}
                          className={`text-[9px] font-mono ${
                            primaryTestResult.success ? TEST_SUCCESS_BADGE : ""
                          }`}
                          title={primaryTestResult.message}
                        >
                          {primaryTestResult.success ? `${primaryTestResult.latencyMs}ms` : "Lỗi"}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>

                  {fallbackModels.map((m, idx) => {
                    const test = modelTestResults[m];
                    return (
                      <Card key={m} size="sm" className="gap-0 py-0">
                        <CardContent className="flex items-center justify-between gap-1.5 py-1.5 font-mono text-[10px] text-muted-foreground">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="w-3 text-center">{idx + 2}.</span>
                            <span className="truncate">{m}</span>
                            <span className="text-[9px] opacity-60 font-sans">
                              {m === "jev-verdict-2.0" ? "(Rust Offline)" : "(Dự phòng)"}
                            </span>
                          </div>
                          {test && (
                            <Badge
                              variant={test.success ? "secondary" : "destructive"}
                              className={`text-[9px] font-mono ${
                                test.success ? TEST_SUCCESS_BADGE : ""
                              }`}
                              title={test.message}
                            >
                              {test.success ? `${test.latencyMs}ms` : "Lỗi"}
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Feature Toggles */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="size-3.5" />
              <span>Chức Năng Kích Hoạt</span>
            </Label>

            <div className="flex flex-col gap-2">
              <Label
                htmlFor="feature-standardize-h1"
                className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/40 cursor-pointer select-none border border-transparent hover:border-border transition-colors font-normal"
              >
                <Checkbox
                  id="feature-standardize-h1"
                  checked={standardizeH1}
                  onCheckedChange={(checked) => setStandardizeH1(Boolean(checked))}
                  className="mt-0.5"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1">
                    ✅ Chuẩn Hóa H1 Tiêu Đề
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Tự động nhận diện và đặt lại H1 chuẩn trang trọng cho từng chương.
                  </span>
                </div>
              </Label>

              <Label
                htmlFor="feature-clean-top-junk"
                className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/40 cursor-pointer select-none border border-transparent hover:border-border transition-colors font-normal"
              >
                <Checkbox
                  id="feature-clean-top-junk"
                  checked={cleanTopJunk}
                  onCheckedChange={(checked) => setCleanTopJunk(Boolean(checked))}
                  className="mt-0.5"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1">
                    🗑️ Dọn Dẹp Các Thẻ Top Rác
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Xóa bỏ các dòng thừa, tiêu đề sách lặp lại ở đầu chương (index 0, 1, 2...).
                  </span>
                </div>
              </Label>

              <Label
                htmlFor="feature-add-headings"
                className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/40 cursor-pointer select-none border border-transparent hover:border-border transition-colors font-normal"
              >
                <Checkbox
                  id="feature-add-headings"
                  checked={addHeadings}
                  onCheckedChange={(checked) => setAddHeadings(Boolean(checked))}
                  className="mt-0.5"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1">
                    📌 Bổ Sung Heading Phân Cấp (H2/H3)
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Chia nhỏ văn bản dài thành các mục lớn (H2) và tiểu mục phương pháp (H3).
                  </span>
                </div>
              </Label>

              <Label
                htmlFor="feature-fix-typos"
                className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/40 cursor-pointer select-none border border-transparent hover:border-border transition-colors font-normal"
              >
                <Checkbox
                  id="feature-fix-typos"
                  checked={fixVietnameseTypos}
                  onCheckedChange={(checked) => setFixVietnameseTypos(Boolean(checked))}
                  className="mt-0.5"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1">
                    ✍️ Sửa Lỗi Chính Tả Tiếng Việt
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Sửa lỗi gõ dấu, dấu hỏi/ngã (tiêu sử -&gt; tiểu sử), nhầm lẫn ký tự, sai phụ âm.
                  </span>
                </div>
              </Label>
            </div>
          </div>

          {/* Watermark & Header/Footer Cleaner Card */}
          <Card className="shrink-0 px-3.5 gap-2.5">
            <CardHeader className="px-0 gap-2">
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                <Trash2 className="size-3.5 text-amber-500" />
                <span>Làm Sạch Watermark &amp; Header/Footer</span>
              </CardTitle>
              <CardAction className="self-center">
                <Badge variant="outline" className="text-[9px] font-mono border-primary/40 text-primary">
                  DTV &bull; TVE-4U
                </Badge>
              </CardAction>
              <CardDescription className="text-[11px] leading-relaxed col-span-full">
                Tự động loại bỏ các đoạn watermark, dấu bản quyền web (dtv-ebook, tve-4u, truyenfull...) và số trang thừa ở đầu/cuối chương.
              </CardDescription>
            </CardHeader>

            <CardContent className="px-0 flex flex-col gap-2.5">
              <div className="flex flex-col gap-1">
                <Label htmlFor="watermark-keywords" className="text-[10px] font-normal text-muted-foreground">
                  Từ khóa / Tên miền watermark bổ sung:
                </Label>
                <Input
                  id="watermark-keywords"
                  type="text"
                  value={customWatermarkInput}
                  onChange={(e) => setCustomWatermarkInput(e.target.value)}
                  placeholder="vd: dtv-ebook, dtv-ebook.com"
                  className="h-8 text-xs"
                />
              </div>

              <Button
                type="button"
                variant="secondary"
                disabled={isCleaningWatermarks || !currentBook}
                onClick={handleCleanWatermarks}
                className="w-full gap-1.5 text-xs"
              >
                {isCleaningWatermarks ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <Trash2 className="size-3.5 text-amber-500" />
                )}
                <span>{isCleaningWatermarks ? "Đang quét..." : "Quét & Xóa Sạch Watermark (Toàn Sách)"}</span>
              </Button>
            </CardContent>
          </Card>

          {/* Action Trigger Button */}
          <div className="mt-auto flex flex-col gap-2">
            <Separator className="mb-2" />

            {isBatchEnhancing ? (
              <Button
                type="button"
                variant="destructive"
                onClick={stopBatchEnhance}
                className="w-full h-11 gap-2.5 font-semibold text-sm"
              >
                <Square className="size-4 fill-current" />
                <span>Dừng Tiến Trình</span>
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleStartEnhance}
                disabled={!currentBook || isProcessingSingle}
                className="w-full h-11 gap-2.5 font-semibold text-sm"
              >
                {isProcessingSingle ? (
                  <Spinner className="size-4" />
                ) : (
                  <Play className="size-4 fill-current" />
                )}
                <span>{isProcessingSingle ? "Đang Xử Lý..." : "Bắt Đầu Xử Lý AI"}</span>
              </Button>
            )}

            {enhanceProgress && (
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Tiến trình xử lý:</span>
                  <span className="font-mono font-medium text-foreground">
                    {enhanceProgress.current} / {enhanceProgress.total}
                  </span>
                </div>
                <Progress
                  value={(enhanceProgress.current / enhanceProgress.total) * 100}
                  className="h-1.5"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Terminal Console Viewer */}
        <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
          {/* Quick Metrics & Controls Header */}
          <div className="px-4 py-2 bg-muted/30 border-b border-border flex flex-wrap items-center justify-between gap-2 select-none flex-shrink-0">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 flex-1 min-w-0">
              <Card size="sm" className="gap-0 py-0 bg-card">
                <CardContent className="flex items-center gap-1.5 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                  <CheckCircle2 className="size-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                  <span className="truncate">
                    Chương đã sửa:{" "}
                    <span className="font-semibold text-foreground">
                      {modifiedCount}/{totalChapters}
                    </span>
                  </span>
                </CardContent>
              </Card>

              <Card size="sm" className="gap-0 py-0 bg-card">
                <CardContent className="flex items-center gap-1.5 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                  <Heading className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">
                    Heading bổ sung:{" "}
                    <span className="font-semibold text-foreground">+{totalHeadingsAdded}</span>
                  </span>
                </CardContent>
              </Card>

              <Card size="sm" className="gap-0 py-0 bg-card">
                <CardContent className="flex items-center gap-1.5 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                  <PenTool className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="truncate">
                    Lỗi chính tả sửa:{" "}
                    <span className="font-semibold text-foreground">{totalTyposFixed}</span>
                  </span>
                </CardContent>
              </Card>

              <Card size="sm" className="gap-0 py-0 bg-card">
                <CardContent className="flex items-center gap-1.5 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                  <span className="truncate">
                    Top rác đã dọn:{" "}
                    <span className="font-semibold text-foreground">{totalJunkCleaned}</span>
                  </span>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Console Log Area — Unified with TranslationLogPanel */}
          <div className="flex-1 overflow-hidden relative flex flex-col">
            <TranslationLogPanel
              logs={enhancerLogs}
              filter={logFilter}
              search={logSearch}
              autoScroll={logAutoScroll}
              onFilterChange={setLogFilter}
              onSearchChange={setLogSearch}
              onToggleAutoScroll={() => setLogAutoScroll((v) => !v)}
              onCopyLogs={handleCopyLogs}
              onClearLogs={clearEnhancerLogs}
              isCopied={copiedLogs}
              emptyPlaceholder={{
                title: "Chưa có tiến trình biên tập nào được ghi lại.",
                description:
                  'Chọn các tùy chọn bên trái rồi nhấn "Bắt Đầu Xử Lý AI" để chuẩn hóa H1, thêm heading H2/H3 và sửa lỗi chính tả.',
                icon: Wand2,
              }}
              ariaLabel="Nhật ký biên tập AI"
              endRef={terminalEndRef}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
