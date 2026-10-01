import { Check, Loader2, Sliders, Square, Languages, Wand2, Sparkles } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { useAppStore, TranslationProgress } from "../../stores/useAppStore";
import { ActionProposal } from "../../services/agent/agentTools";
import { WorkflowJob } from "../../types/workflow";

export interface ActionProposalCardViewProps {
  proposal: ActionProposal;
  status: "pending" | "executing" | "approved" | "rejected" | "executed";
  onConfirm: (approved: boolean) => void;
  isTranslating?: boolean;
  translationProgress?: TranslationProgress | null;
  onStopTranslation?: () => void;
  isBatchEnhancing?: boolean;
  enhanceProgress?: { current: number; total: number; currentChapterHref: string } | null;
  onStopBatchEnhance?: () => void;
  isExtractingEntities?: boolean;
  runningJob?: WorkflowJob;
}

export function ActionProposalCardView({
  proposal,
  status,
  onConfirm,
  isTranslating = false,
  translationProgress = null,
  onStopTranslation,
  isBatchEnhancing = false,
  enhanceProgress = null,
  onStopBatchEnhance,
  isExtractingEntities = false,
  runningJob,
}: ActionProposalCardViewProps) {
  const isProposalExecuting = status === "executing";

  // Check if related background task is currently active for this tool
  const isRelatedTaskActive =
    (proposal.toolName === "translate_chapter" && isTranslating) ||
    (proposal.toolName === "enhance_chapter" && isBatchEnhancing) ||
    (proposal.toolName === "extract_xray_entities" && isExtractingEntities);

  const isActive = isProposalExecuting || (status === "pending" && isRelatedTaskActive);

  return (
    <div
      className={`mt-2.5 p-3 rounded-lg border transition-all duration-150 flex flex-col gap-2 shadow-xs ${
        isActive
          ? "border-primary/50 bg-primary/5"
          : status === "executed"
          ? "border-emerald-500/40 bg-emerald-500/5"
          : status === "rejected"
          ? "border-border/60 bg-muted/20 opacity-70"
          : "border-amber-500/40 bg-amber-500/5"
      } text-foreground`}
    >
      {/* Proposal Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-[11px] min-w-0">
          {proposal.toolName === "translate_chapter" ? (
            <Languages size={13} className="text-primary shrink-0" />
          ) : proposal.toolName === "enhance_chapter" ? (
            <Wand2 size={13} className="text-primary shrink-0" />
          ) : proposal.toolName === "extract_xray_entities" ? (
            <Sparkles size={13} className="text-primary shrink-0" />
          ) : (
            <Sliders size={13} className={isActive ? "text-primary shrink-0" : "text-amber-500 shrink-0"} />
          )}
          <span className="truncate">{proposal.title}</span>
        </div>

        {isActive ? (
          <Badge
            variant="outline"
            className="text-[9px] px-1.5 h-4 bg-primary/10 text-primary border-primary/30 shrink-0 gap-1 animate-pulse"
          >
            <Loader2 size={10} className="animate-spin" />
            <span>Đang thực thi...</span>
          </Badge>
        ) : status === "executed" ? (
          <Badge
            variant="secondary"
            className="text-[9px] px-1.5 h-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0 gap-1"
          >
            <Check size={10} />
            <span>Đã thực thi</span>
          </Badge>
        ) : status === "rejected" ? (
          <Badge variant="outline" className="text-[9px] px-1.5 h-4 text-muted-foreground shrink-0">
            Đã bỏ qua
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[9px] px-1.5 h-4 shrink-0"
          >
            Chờ xác nhận
          </Badge>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground leading-tight">
        {proposal.description}
      </p>

      {/* Diffs / Changes Summary */}
      {proposal.diffSummary && proposal.diffSummary.length > 0 && (
        <div className="border border-border rounded bg-card/80 overflow-hidden mt-0.5">
          <table className="w-full text-[10px] text-left">
            <tbody className="divide-y divide-border/60">
              {proposal.diffSummary.map((d, i) => (
                <tr key={i} className="hover:bg-secondary/30">
                  <td className="p-1.5 font-medium text-muted-foreground w-24">
                    {d.field}
                  </td>
                  <td className="p-1.5 text-muted-foreground line-through">
                    {d.before || "(Trống)"}
                  </td>
                  <td className="p-1.5 text-center w-4 text-primary">➔</td>
                  <td className="p-1.5 font-semibold text-primary">
                    {d.after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Live Real-time Progress Display when Active */}
      {isActive && (
        <div className="p-2 rounded border border-primary/20 bg-background/60 flex flex-col gap-1.5 animate-in fade-in duration-150">
          {proposal.toolName === "translate_chapter" ? (
            <>
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-foreground truncate max-w-[180px]">
                  {translationProgress ? `Đang dịch: ${translationProgress.currentChapterTitle}` : "Đang kết nối AI Gateway..."}
                </span>
                <span className="font-mono text-primary font-bold text-xs">
                  {translationProgress?.percent ?? 0}%
                </span>
              </div>
              <Progress value={translationProgress?.percent ?? 0} className="h-1.5" />
              <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                <span>
                  {translationProgress && translationProgress.totalBlocks > 0
                    ? `Đoạn ${translationProgress.currentBlock}/${translationProgress.totalBlocks}`
                    : "Đang phân tích đoạn văn..."}
                </span>
                {onStopTranslation && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={onStopTranslation}
                    className="h-4.5 px-1.5 text-[9px] gap-0.5 text-destructive hover:bg-destructive/10 cursor-pointer"
                    title="Dừng tiến trình dịch"
                  >
                    <Square size={8} />
                    <span>Dừng</span>
                  </Button>
                )}
              </div>
            </>
          ) : proposal.toolName === "enhance_chapter" ? (
            <>
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-foreground truncate">
                  Đang tối ưu & chuẩn hóa chương...
                </span>
                <span className="font-mono text-primary font-bold text-xs">
                  {enhanceProgress ? Math.round((enhanceProgress.current / Math.max(1, enhanceProgress.total)) * 100) : 0}%
                </span>
              </div>
              <Progress
                value={enhanceProgress ? Math.round((enhanceProgress.current / Math.max(1, enhanceProgress.total)) * 100) : 0}
                className="h-1.5"
              />
              <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                <span>
                  {enhanceProgress ? `Chương ${enhanceProgress.current}/${enhanceProgress.total}` : "Đang xử lý..."}
                </span>
                {onStopBatchEnhance && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={onStopBatchEnhance}
                    className="h-4.5 px-1.5 text-[9px] gap-0.5 text-destructive hover:bg-destructive/10 cursor-pointer"
                    title="Dừng tiến trình tối ưu"
                  >
                    <Square size={8} />
                    <span>Dừng</span>
                  </Button>
                )}
              </div>
            </>
          ) : proposal.toolName === "extract_xray_entities" ? (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Loader2 size={12} className="animate-spin text-primary shrink-0" />
              <span>Đang quét nội dung sách để nhận diện nhân vật & thuật ngữ...</span>
            </div>
          ) : runningJob ? (
            <>
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-foreground truncate">{runningJob.label}</span>
                <span className="font-mono text-primary font-bold text-xs">{runningJob.progress}%</span>
              </div>
              <Progress value={runningJob.progress} className="h-1.5" />
              <span className="text-[9px] text-muted-foreground truncate">{runningJob.detail || "Đang xử lý..."}</span>
            </>
          ) : (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Loader2 size={12} className="animate-spin text-primary shrink-0" />
              <span>Đang thực thi tác vụ...</span>
            </div>
          )}
        </div>
      )}

      {/* Action Decision Buttons */}
      {isActive ? (
        <div className="flex items-center justify-end pt-1 mt-1 border-t border-primary/20">
          <Button
            type="button"
            disabled
            size="xs"
            className="text-[10px] h-6 px-2.5 gap-1.5 font-medium shadow-xs opacity-80 cursor-not-allowed"
          >
            <Loader2 size={11} className="animate-spin" />
            <span>Đang thực thi...</span>
          </Button>
        </div>
      ) : status === "pending" ? (
        <div className="flex items-center justify-end gap-2 pt-1 mt-1 border-t border-amber-500/20">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onConfirm(false)}
            className="text-[10px] h-6 px-2 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Bỏ qua
          </Button>
          <Button
            type="button"
            size="xs"
            onClick={() => onConfirm(true)}
            className="text-[10px] h-6 px-2.5 gap-1 font-medium shadow-xs cursor-pointer"
          >
            <Check size={11} />
            <span>Chấp nhận thực thi</span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ActionProposalCard({
  proposal,
  status,
  onConfirm,
}: {
  proposal: ActionProposal;
  status: "pending" | "executing" | "approved" | "rejected" | "executed";
  onConfirm: (approved: boolean) => void;
}) {
  const {
    isTranslating,
    translationProgress,
    stopTranslation,
    isBatchEnhancing,
    enhanceProgress,
    stopBatchEnhance,
    isExtractingEntities,
    workflowJobs,
  } = useAppStore();

  const runningJob = Object.values(workflowJobs || {}).find(
    (j) =>
      j.status === "running" &&
      ((proposal.toolName === "translate_chapter" && j.type === "translation") ||
        (proposal.toolName === "enhance_chapter" && j.type === "enhancement") ||
        (proposal.toolName === "extract_xray_entities" && j.type === "kindle_xray"))
  );

  return (
    <ActionProposalCardView
      proposal={proposal}
      status={status}
      onConfirm={onConfirm}
      isTranslating={isTranslating}
      translationProgress={translationProgress}
      onStopTranslation={stopTranslation}
      isBatchEnhancing={isBatchEnhancing}
      enhanceProgress={enhanceProgress}
      onStopBatchEnhance={stopBatchEnhance}
      isExtractingEntities={isExtractingEntities}
      runningJob={runningJob}
    />
  );
}
