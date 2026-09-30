import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Cpu, 
  BookCheck,
  FileText
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Progress } from "../ui/progress";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

export type ProgressStage = "reading" | "extracting" | "ocr" | "jev" | "packaging" | "done" | "error";

export interface ProgressStepItem {
  id: string;
  label: string;
  status: "pending" | "running" | "completed" | "error";
}

export interface ProgressModalProps {
  isOpen: boolean;
  title: string;
  statusText: string;
  subText?: string;
  percent: number; // 0 - 100, or -1 for indeterminate spinner
  stage?: ProgressStage;
  steps?: ProgressStepItem[];
  onCancel?: () => void;
  canCancel?: boolean;
}

export function ProgressModal({
  isOpen,
  title,
  statusText,
  subText,
  percent,
  stage = "reading",
  steps,
  onCancel,
  canCancel = true,
}: ProgressModalProps) {
  if (!isOpen) return null;

  const isIndeterminate = percent < 0;
  const clampedPercent = Math.min(100, Math.max(0, percent));

  const getStageIcon = () => {
    switch (stage) {
      case "jev":
        return <Cpu size={18} className="text-amber-500 animate-pulse" />;
      case "packaging":
        return <BookCheck size={18} className="text-primary" />;
      case "extracting":
        return <FileText size={18} className="text-primary" />;
      case "ocr":
        return <Sparkles size={18} className="text-amber-500" />;
      case "done":
        return <CheckCircle2 size={18} className="text-emerald-500" />;
      case "error":
        return <AlertCircle size={18} className="text-rose-500" />;
      default:
        return <Loader2 size={18} className="text-primary animate-spin" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && canCancel && onCancel) onCancel(); }}>
      <DialogContent showCloseButton={canCancel && Boolean(onCancel)} className="sm:max-w-md p-0 gap-0 overflow-hidden">
        {/* Modal Header */}
        <DialogHeader className="px-5 py-3.5 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            {getStageIcon()}
            <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">Tiến trình xử lý sách điện tử</DialogDescription>
        </DialogHeader>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4">
          {/* Main Status Callout */}
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-xs">
              {stage === "done" ? (
                <CheckCircle2 className="size-5 text-emerald-500" />
              ) : stage === "error" ? (
                <AlertCircle className="size-5 text-destructive" />
              ) : (
                <Loader2 className="size-5 animate-spin" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground truncate leading-tight">
                {statusText}
              </h4>
              {subText && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {subText}
                </p>
              )}
            </div>
          </div>

          {/* Progress Bar Container */}
          <div className="flex flex-col gap-2 bg-muted/40 p-3 rounded-lg border border-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">Tiến độ thực hiện</span>
              <span className="font-mono font-semibold text-primary">
                {isIndeterminate ? "Đang xử lý..." : `${clampedPercent}%`}
              </span>
            </div>

            {isIndeterminate ? (
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden relative">
                <div className="h-full bg-primary w-1/3 rounded-full animate-pulse" />
              </div>
            ) : (
              <Progress value={clampedPercent} className="h-2" />
            )}
          </div>

          {/* Stepper Stages (if provided) */}
          {steps && steps.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Các bước thực hiện
              </span>
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                {steps.map((step, idx) => (
                  <div
                    key={step.id || idx}
                    className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-md bg-background border border-border/70 shadow-2xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="size-4.5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold bg-muted text-muted-foreground">
                        {idx + 1}
                      </span>
                      <span
                        className={`${
                          step.status === "running"
                            ? "text-foreground font-semibold"
                            : step.status === "completed"
                            ? "text-emerald-600 dark:text-emerald-400 line-through opacity-85"
                            : "text-muted-foreground"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>

                    <div>
                      {step.status === "running" && (
                        <Badge variant="outline" className="h-5 text-[11px] gap-1 border-primary/40 text-primary">
                          <Loader2 className="size-3 animate-spin" />
                          <span>Đang chạy</span>
                        </Badge>
                      )}
                      {step.status === "completed" && (
                        <Badge variant="secondary" className="h-5 text-[11px] gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                          <CheckCircle2 className="size-3" />
                          <span>Xong</span>
                        </Badge>
                      )}
                      {step.status === "pending" && (
                        <span className="text-[11px] text-muted-foreground opacity-70">
                          Chờ
                        </span>
                      )}
                      {step.status === "error" && (
                        <Badge variant="destructive" className="h-5 text-[11px] gap-1">
                          <AlertCircle className="size-3" />
                          <span>Lỗi</span>
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        {canCancel && onCancel && stage !== "done" && (
          <DialogFooter className="m-0 px-5 py-3 border-t border-border bg-muted/30 flex items-center justify-end shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="text-xs h-8"
            >
              Hủy Bỏ (Dừng Lại)
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
