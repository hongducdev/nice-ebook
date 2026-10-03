import { Languages, Wand2, Activity, Square, ArrowUpRight } from "lucide-react";
import { Progress } from "../ui/progress";
import { Button } from "../ui/button";
import { useAppStore, TranslationProgress } from "../../stores/useAppStore";
import type { ActiveTab } from "../../types/navigation";
import type { WorkflowJob } from "../../types/workflow";

export interface AgentActiveTaskMonitorViewProps {
  isTranslating?: boolean;
  translationProgress?: TranslationProgress | null;
  onStopTranslation?: () => void;
  isBatchEnhancing?: boolean;
  enhanceProgress?: { current: number; total: number; currentChapterHref: string } | null;
  onStopBatchEnhance?: () => void;
  runningJob?: WorkflowJob;
  onNavigateTab?: (tab: ActiveTab) => void;
}

export function AgentActiveTaskMonitorView({
  isTranslating = false,
  translationProgress = null,
  onStopTranslation,
  isBatchEnhancing = false,
  enhanceProgress = null,
  onStopBatchEnhance,
  runningJob,
  onNavigateTab,
}: AgentActiveTaskMonitorViewProps) {
  const hasActiveTask = isTranslating || isBatchEnhancing || Boolean(runningJob);
  if (!hasActiveTask) return null;

  // 1. Translation Active
  if (isTranslating) {
    const pct = translationProgress?.percent ?? 0;
    const title = translationProgress?.currentChapterTitle || "Chương đang chọn";
    const blockDetail =
      translationProgress && translationProgress.totalBlocks > 0
        ? ` • Đoạn ${translationProgress.currentBlock}/${translationProgress.totalBlocks}`
        : "";
    const chDetail = translationProgress
      ? `Chương ${translationProgress.currentChapterIndex}/${translationProgress.totalChapters}`
      : "Đang kết nối...";

    return (
      <div className="mx-1 mb-2 p-2.5 rounded-xl border border-primary/40 bg-primary/5 text-foreground flex flex-col gap-1.5 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="relative flex size-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-primary" />
            </span>
            <Languages size={13} className="text-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate">
              Đang dịch: {title}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono text-primary font-bold text-xs">{pct}%</span>
            {onNavigateTab && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onNavigateTab("translator")}
                className="h-5.5 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Mở tab Dịch thuật AI để xem chi tiết"
              >
                <span>Tab Dịch</span>
                <ArrowUpRight size={11} />
              </Button>
            )}
            {onStopTranslation && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onStopTranslation}
                className="h-5.5 px-2 text-xs gap-1 text-destructive hover:bg-destructive/10 cursor-pointer"
                title="Dừng tiến trình dịch"
              >
                <Square size={10} />
                <span>Dừng</span>
              </Button>
            )}
          </div>
        </div>

        <Progress value={pct} className="h-1.5" />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{chDetail}{blockDetail}</span>
          <span className="italic text-xs">Đồng bộ realtime với bên Dịch</span>
        </div>
      </div>
    );
  }

  // 2. Batch Enhancement Active
  if (isBatchEnhancing) {
    const current = enhanceProgress?.current ?? 0;
    const total = enhanceProgress?.total ?? 1;
    const pct = Math.round((current / Math.max(1, total)) * 100);

    return (
      <div className="mx-1 mb-2 p-2.5 rounded-xl border border-primary/40 bg-primary/5 text-foreground flex flex-col gap-1.5 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="relative flex size-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-primary" />
            </span>
            <Wand2 size={13} className="text-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate">
              Đang biên tập & tối ưu chương
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono text-primary font-bold text-xs">{pct}%</span>
            {onNavigateTab && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onNavigateTab("ai-editor")}
                className="h-5.5 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Mở tab Biên tập để xem chi tiết"
              >
                <span>Tab AI</span>
                <ArrowUpRight size={11} />
              </Button>
            )}
            {onStopBatchEnhance && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onStopBatchEnhance}
                className="h-5.5 px-2 text-xs gap-1 text-destructive hover:bg-destructive/10 cursor-pointer"
                title="Dừng tiến trình tối ưu"
              >
                <Square size={10} />
                <span>Dừng</span>
              </Button>
            )}
          </div>
        </div>

        <Progress value={pct} className="h-1.5" />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Chương {current}/{total}</span>
          <span className="italic text-xs">Đồng bộ realtime với bên Biên tập</span>
        </div>
      </div>
    );
  }

  // 3. Other Workflow Job Active
  if (runningJob) {
    return (
      <div className="mx-1 mb-2 p-2.5 rounded-xl border border-primary/40 bg-primary/5 text-foreground flex flex-col gap-1.5 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Activity size={13} className="text-primary shrink-0 animate-pulse" />
            <span className="text-xs font-semibold text-foreground truncate">
              {runningJob.label}
            </span>
          </div>
          <span className="font-mono text-primary font-bold text-xs">{runningJob.progress}%</span>
        </div>

        <Progress value={runningJob.progress} className="h-1.5" />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{runningJob.detail || "Đang xử lý tác vụ nền..."}</span>
          <span className="italic text-xs">Workflow Job</span>
        </div>
      </div>
    );
  }

  return null;
}

export function AgentActiveTaskMonitor() {
  const {
    isTranslating,
    translationProgress,
    stopTranslation,
    isBatchEnhancing,
    enhanceProgress,
    stopBatchEnhance,
    workflowJobs,
    setActiveTab,
  } = useAppStore();

  const runningJob = Object.values(workflowJobs || {}).find((j) => j.status === "running");

  return (
    <AgentActiveTaskMonitorView
      isTranslating={isTranslating}
      translationProgress={translationProgress}
      onStopTranslation={stopTranslation}
      isBatchEnhancing={isBatchEnhancing}
      enhanceProgress={enhanceProgress}
      onStopBatchEnhance={stopBatchEnhance}
      runningJob={runningJob}
      onNavigateTab={setActiveTab}
    />
  );
}
