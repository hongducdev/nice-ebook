import { Cpu, Activity, Sparkles, Layers, Zap, Route } from "lucide-react";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
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
    <footer className="h-7 border-t border-border px-3 flex items-center justify-between bg-muted/30 text-xs text-muted-foreground select-none shrink-0 z-20">
      <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
        {/* Gateway connection status */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-medium text-foreground">Gateway:</span>
          {activeGateway ? (
            <Badge variant="outline" className="h-5 text-xs px-2 gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{activeGateway.name} ({activeGateway.latency_ms}ms)</span>
            </Badge>
          ) : (
            <Badge variant="secondary" className="h-5 text-xs px-2">
              <span>Lõi Offline (Cục bộ)</span>
            </Badge>
          )}
        </div>

        <Separator orientation="vertical" className="h-3 shrink-0" />

        {/* Content Genre Classification Badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-medium text-foreground">Phân loại:</span>
          {jevDecision ? (
            <Badge variant="outline" className="h-5 text-xs px-2 font-mono gap-1 border-primary/40 text-primary">
              <Sparkles size={11} />
              <span>{jevDecision.genre_label} ({(jevDecision.confidence * 100).toFixed(0)}%)</span>
            </Badge>
          ) : (
            <Badge variant="secondary" className="h-5 text-xs px-2 gap-1">
              <Zap size={11} />
              <span>Tự động nhận diện</span>
            </Badge>
          )}
        </div>

        <Separator orientation="vertical" className="h-3 shrink-0" />

        {/* Active Preset */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-medium text-foreground">Phong cách:</span>
          <span className="text-foreground font-mono text-xs flex items-center gap-1">
            <Layers size={11} className="text-primary" />
            <span>{activePreset.name}</span>
          </span>
        </div>

        {bookProfile && planSteps.length > 0 && (
          <>
            <Separator orientation="vertical" className="h-3 shrink-0" />
            <button
              type="button"
              onClick={() => setActiveTab(WORKFLOW_TAB[bookProfile.workflow])}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer shrink-0"
              title={`Quy trình: ${planSteps.map((step) => step.label).join(" → ")}`}
            >
              <span className="font-medium text-foreground">Quy trình:</span>
              <Badge variant="outline" className="h-5 text-xs px-2 font-mono gap-1 border-primary/40 text-primary">
                <Route size={11} />
                <span>
                  {workflowLabel(bookProfile)} · {planCounter}
                </span>
              </Badge>
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground shrink-0 ml-2">
        <span className="flex items-center gap-1">
          <Cpu size={12} className="text-primary" />
          <span>Tauri v2 + Rust</span>
        </span>
        <Separator orientation="vertical" className="h-3" />
        <span className="flex items-center gap-1">
          <Activity size={12} className="text-emerald-500" />
          <span>RAM ~38MB</span>
        </span>
      </div>
    </footer>
  );
}
