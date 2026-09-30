import {
  BookOpenCheck,
  FileOutput,
  Languages,
  Palette,
  ScanText,
  Trash2,
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import type { ActiveTab } from "../../types/navigation";
import {
  type WorkflowStep,
  type WorkflowStepId,
  buildWorkflowSteps,
  currentStepIndex,
} from "../../utils/bookTypeDetector";

const STEP_ICONS: Record<WorkflowStepId, typeof Trash2> = {
  cleanup: Trash2,
  ocr: ScanText,
  convert: FileOutput,
  translate: Languages,
  style: Palette,
  read: BookOpenCheck,
};

/**
 * Pure presentation of the workflow progress rail.
 *
 * Split from the store-wired `BookPipelineStepper` below: the repo has no jsdom,
 * and zustand returns `getInitialState()` during a server render, so a
 * store-driven component cannot be asserted with `react-dom/server`.
 */
export function BookPipelineStepperView({
  steps,
  completedSteps,
  compact = false,
  className = "",
  onSelect,
}: {
  steps: WorkflowStep[];
  completedSteps: readonly string[];
  compact?: boolean;
  className?: string;
  onSelect?: (tab: ActiveTab) => void;
}) {
  if (steps.length === 0) return null;

  const activeIndex = currentStepIndex(steps, completedSteps);
  const done = new Set(completedSteps);

  return (
    <ol
      className={["pipeline-stepper", compact ? "pipeline-stepper--compact" : "", className]
        .filter(Boolean)
        .join(" ")}
      role="list"
      aria-label="Quy trình xử lý sách"
    >
      {steps.map((step, index) => {
        const Icon = STEP_ICONS[step.id];
        const state = done.has(step.id) ? "done" : index === activeIndex ? "current" : "pending";

        return (
          <li key={step.id} className="pipeline-stepper__item" data-state={state}>
            <button
              type="button"
              className="pipeline-stepper__button"
              aria-current={state === "current" ? "step" : undefined}
              title={step.description}
              onClick={() => onSelect?.(step.tab)}
            >
              <span className="pipeline-stepper__marker" aria-hidden="true">
                <Icon size={compact ? 11 : 13} />
              </span>
              <span className="pipeline-stepper__text">
                <span className="pipeline-stepper__label">{step.label}</span>
                {!compact && (
                  <span className="pipeline-stepper__description">{step.description}</span>
                )}
              </span>
            </button>
            {index < steps.length - 1 && (
              <span className="pipeline-stepper__connector" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Horizontal progress rail for the workflow of the book currently open.
 *
 * The step list is derived from `buildWorkflowSteps(profile)` — it is never
 * stored, so it cannot drift. Completion is tracked by step id (not by an index),
 * which keeps it correct for branchy workflows such as `OCR -> Dịch thuật`.
 */
export function BookPipelineStepper({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { bookProfile, workflowCompletedSteps, setActiveTab } = useAppStore();

  if (!bookProfile) return null;
  const steps = buildWorkflowSteps(bookProfile);

  return (
    <BookPipelineStepperView
      steps={steps}
      completedSteps={workflowCompletedSteps}
      compact={compact}
      className={className}
      onSelect={setActiveTab}
    />
  );
}
