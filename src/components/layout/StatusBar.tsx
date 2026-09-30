import { Cpu, Activity, Sparkles, Layers, Zap, Route } from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import {
  WORKFLOW_TAB,
  buildWorkflowSteps,
  currentStepIndex,
  workflowLabel,
} from "../../utils/bookTypeDetector";

export function StatusBar() {
  const {
    activeGateway,
    jevDecision,
    activePreset,
    bookProfile,
    workflowCompletedSteps,
    setActiveTab,
  } = useAppStore();

  const planSteps = buildWorkflowSteps(bookProfile);
  const planIndex = currentStepIndex(planSteps, workflowCompletedSteps);
  // A single chip fits the 28px bar far better than a full stepper would.
  const planCounter = planSteps.length > 0 ? `${Math.min(planIndex + 1, planSteps.length)}/${planSteps.length}` : "";

  return (
    <footer className="h-7 border-t border-[var(--sidebar-border)] px-3 flex items-center justify-between bg-[var(--ui-titlebar-surface)] text-[11px] text-[var(--muted-foreground)] select-none flex-shrink-0 z-20">
      <div className="flex items-center gap-3">
        {/* Gateway connection status */}
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-[var(--foreground)]">Gateway:</span>
          {activeGateway ? (
            <span className="app-badge app-badge--success h-[18px] text-[10px] px-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{activeGateway.name} ({activeGateway.latency_ms}ms)</span>
            </span>
          ) : (
            <span className="app-badge app-badge--neutral h-[18px] text-[10px] px-1.5">
              <span>Jev Zero-Key Core</span>
            </span>
          )}
        </div>

        <span className="text-[var(--border)]">|</span>

        {/* Jev System-1 Decision Badge */}
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-[var(--foreground)]">Jev Core:</span>
          {jevDecision ? (
            <span className="app-badge app-badge--brand h-[18px] text-[10px] px-1.5 font-mono">
              <Sparkles size={10} />
              <span>{jevDecision.genre_label} ({(jevDecision.confidence * 100).toFixed(0)}%)</span>
            </span>
          ) : (
            <span className="app-badge app-badge--neutral h-[18px] text-[10px] px-1.5">
              <Zap size={10} />
              <span>Heuristic Ready</span>
            </span>
          )}
        </div>

        <span className="text-[var(--border)]">|</span>

        {/* Active Preset */}
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-[var(--foreground)]">Phong cách:</span>
          <span className="text-[var(--foreground)] font-mono text-[11px] flex items-center gap-1">
            <Layers size={11} className="text-[var(--primary)]" />
            <span>{activePreset.name}</span>
          </span>
        </div>

        {bookProfile && planSteps.length > 0 && (
          <>
            <span className="text-[var(--border)]">|</span>
            <button
              type="button"
              onClick={() => setActiveTab(WORKFLOW_TAB[bookProfile.workflow])}
              className="flex items-center gap-1.5 hover:text-[var(--foreground)] transition-colors"
              title={`Quy trình: ${planSteps.map((step) => step.label).join(" → ")}`}
            >
              <span className="font-medium text-[var(--foreground)]">Quy trình:</span>
              <span className="app-badge app-badge--brand h-[18px] text-[10px] px-1.5 font-mono">
                <Route size={10} />
                <span>
                  {workflowLabel(bookProfile)} · {planCounter}
                </span>
              </span>
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 font-mono text-[10px] text-[var(--muted-foreground)]">
        <span className="flex items-center gap-1">
          <Cpu size={12} className="text-[var(--primary)]" />
          <span>Tauri v2 + Rust</span>
        </span>
        <span className="text-[var(--border)]">|</span>
        <span className="flex items-center gap-1">
          <Activity size={12} className="text-emerald-500" />
          <span>RAM ~38MB</span>
        </span>
      </div>
    </footer>
  );
}
