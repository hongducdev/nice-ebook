import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Sparkles, 
  Cpu, 
  BookCheck,
  FileText
} from "lucide-react";

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
        return <BookCheck size={18} className="text-[var(--primary)]" />;
      case "extracting":
        return <FileText size={18} className="text-[var(--primary)]" />;
      case "ocr":
        return <Sparkles size={18} className="text-amber-500" />;
      case "done":
        return <CheckCircle2 size={18} className="text-emerald-500" />;
      case "error":
        return <AlertCircle size={18} className="text-rose-500" />;
      default:
        return <Loader2 size={18} className="text-[var(--primary)] animate-spin" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="card-surface rounded-[var(--ui-radius-card)] w-full max-w-md overflow-hidden shadow-2xl border border-[var(--border)] bg-[var(--card)]">
        {/* Modal Header */}
        <div className="h-11 px-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--ui-titlebar-surface)]">
          <div className="flex items-center gap-2">
            {getStageIcon()}
            <span className="font-semibold text-xs text-[var(--foreground)]">{title}</span>
          </div>

          {canCancel && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              title="Hủy bỏ tiến trình"
              className="w-7 h-7 rounded flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4">
          {/* Main Status Callout */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))] border border-[var(--primary)]/30 flex items-center justify-center text-[var(--primary)] shrink-0 shadow-xs">
              {stage === "done" ? (
                <CheckCircle2 size={22} className="text-emerald-500" />
              ) : stage === "error" ? (
                <AlertCircle size={22} className="text-rose-500" />
              ) : (
                <Loader2 size={22} className="animate-spin" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-[var(--foreground)] truncate leading-tight">
                {statusText}
              </h4>
              {subText && (
                <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">
                  {subText}
                </p>
              )}
            </div>
          </div>

          {/* Progress Bar Container */}
          <div className="flex flex-col gap-1.5 bg-[var(--background)] p-3 rounded-lg border border-[var(--border)]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted-foreground)] font-medium">Tiến độ thực hiện</span>
              <span className="font-mono font-semibold text-[var(--primary)]">
                {isIndeterminate ? "Đang xử lý..." : `${clampedPercent}%`}
              </span>
            </div>

            <div className="w-full bg-[var(--secondary)] h-2 rounded-full overflow-hidden relative">
              {isIndeterminate ? (
                <div className="h-full bg-[var(--primary)] w-1/3 rounded-full animate-indeterminate" />
              ) : (
                <div
                  className="h-full bg-gradient-to-r from-[var(--primary)] to-indigo-500 rounded-full transition-all duration-200"
                  style={{ width: `${clampedPercent}%` }}
                />
              )}
            </div>
          </div>

          {/* Stepper Stages (if provided) */}
          {steps && steps.length > 0 && (
            <div className="flex flex-col gap-2 pt-1 border-t border-[var(--border)]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                Các bước thực hiện
              </span>
              <div className="flex flex-col gap-1.5">
                {steps.map((step, idx) => (
                  <div
                    key={step.id || idx}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded bg-[var(--background)]/50 border border-[var(--border)]/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono font-bold bg-[var(--secondary)] text-[var(--muted-foreground)]">
                        {idx + 1}
                      </span>
                      <span
                        className={`${
                          step.status === "running"
                            ? "text-[var(--foreground)] font-semibold"
                            : step.status === "completed"
                            ? "text-emerald-500 line-through opacity-85"
                            : "text-[var(--muted-foreground)]"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>

                    <div>
                      {step.status === "running" && (
                        <span className="flex items-center gap-1 text-[11px] text-[var(--primary)] font-medium">
                          <Loader2 size={12} className="animate-spin" />
                          <span>Đang chạy</span>
                        </span>
                      )}
                      {step.status === "completed" && (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-500 font-medium">
                          <CheckCircle2 size={12} />
                          <span>Xong</span>
                        </span>
                      )}
                      {step.status === "pending" && (
                        <span className="text-[11px] text-[var(--muted-foreground)] opacity-70">
                          Chờ
                        </span>
                      )}
                      {step.status === "error" && (
                        <span className="flex items-center gap-1 text-[11px] text-rose-500 font-medium">
                          <AlertCircle size={12} />
                          <span>Lỗi</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
            {canCancel && onCancel && stage !== "done" && (
              <button
                type="button"
                onClick={onCancel}
                className="app-button app-button--secondary text-xs px-4"
              >
                <span>Hủy Bỏ (Dừng Lại)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
