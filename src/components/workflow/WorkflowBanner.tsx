import { ChevronDown, Sparkles, X } from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import {
  type BookProfile,
  type WorkflowStep,
  buildWorkflowSteps,
  currentStepIndex,
  workflowLabel,
} from "../../utils/bookTypeDetector";

const SOURCE_LABELS: Record<string, string> = {
  metadata: "metadata sách",
  heuristic: "phân tích văn bản",
  combined: "metadata + văn bản",
  unknown: "chưa đủ dữ liệu",
};

/**
 * Pure presentation of the ingest routing decision.
 *
 * Split from the store-wired `WorkflowBanner` below so it can be asserted with
 * `react-dom/server` — the repo has no jsdom, and zustand reads
 * `getInitialState()` during SSR, so store-driven rendering is not testable there.
 */
export function WorkflowBannerView({
  profile,
  steps,
  completedSteps,
  onStart,
  onDismiss,
}: {
  profile: BookProfile;
  steps: WorkflowStep[];
  completedSteps: readonly string[];
  onStart?: () => void;
  onDismiss?: () => void;
}) {
  if (steps.length === 0) return null;

  const label = workflowLabel(profile);
  const confidence = Math.round(profile.languageConfidence * 100);
  const activeIndex = currentStepIndex(steps, completedSteps);
  const allDone = activeIndex >= steps.length;

  return (
    <section
      className="workflow-banner"
      data-workflow={profile.workflow}
      role="status"
      aria-live="polite"
    >
      <div className="workflow-banner__icon" aria-hidden="true">
        <Sparkles size={16} />
      </div>

      <div className="workflow-banner__body">
        <div className="workflow-banner__chips">
          <span className="workflow-banner__chip workflow-banner__chip--lang">
            <span aria-hidden="true">{profile.languageFlag}</span>
            <span>{profile.languageName}</span>
            <span className="workflow-banner__chip-meta">{confidence}%</span>
          </span>
          <span className="workflow-banner__chip workflow-banner__chip--workflow">{label}</span>
          <span className="workflow-banner__chip workflow-banner__chip--source">
            {SOURCE_LABELS[profile.detectionSource] ?? profile.detectionSource}
          </span>
          {profile.hasWatermarks && (
            <span className="workflow-banner__chip workflow-banner__chip--warn">
              Watermark {profile.watermarkChapters} chương
            </span>
          )}
        </div>

        <p className="workflow-banner__summary">
          <span className="workflow-banner__pipeline">
            {steps.map((step) => step.label).join(" → ")}
          </span>
          {allDone ? (
            <> — đã hoàn thành toàn bộ quy trình cho cuốn sách này.</>
          ) : (
            <>
              {" · Bước tiếp theo: "}
              <strong>{steps[activeIndex]?.label}</strong>
              {steps[activeIndex] ? ` — ${steps[activeIndex].description}` : ""}
            </>
          )}
        </p>

        {/* Native disclosure: no component state, works during SSR, and the
            content stays in the markup for assistive tech. */}
        <details className="workflow-banner__why">
          <summary>
            <ChevronDown size={12} aria-hidden="true" />
            <span>Vì sao?</span>
          </summary>
          <ul className="workflow-banner__reasons">
            {profile.reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </details>
      </div>

      <div className="workflow-banner__actions">
        <button
          type="button"
          className="app-button app-button--primary text-xs"
          onClick={onStart}
          title={`Mở tab phù hợp cho quy trình: ${label}`}
        >
          {allDone ? "Mở lại quy trình" : `Bắt đầu: ${label}`}
        </button>

        <button
          type="button"
          className="workflow-banner__dismiss"
          onClick={onDismiss}
          aria-label="Bỏ qua gợi ý quy trình cho cuốn sách này"
          title="Bỏ qua gợi ý cho cuốn sách này"
        >
          <X size={14} />
        </button>
      </div>
    </section>
  );
}

/**
 * Prominent, dismissible notice explaining what the app detected about the
 * freshly loaded book and offering a one-click entry into the right workflow.
 *
 * Renders nothing when there is no book, no profile, or when the user already
 * dismissed the banner for this exact book.
 */
export function WorkflowBanner() {
  const {
    currentBook,
    bookProfile,
    dismissedWorkflowFor,
    workflowCompletedSteps,
    startRecommendedWorkflow,
    dismissWorkflow,
  } = useAppStore();

  if (!currentBook || !bookProfile) return null;
  if (dismissedWorkflowFor === bookProfile.bookIdentity) return null;

  const steps = buildWorkflowSteps(bookProfile);

  return (
    <WorkflowBannerView
      profile={bookProfile}
      steps={steps}
      completedSteps={workflowCompletedSteps}
      onStart={() => startRecommendedWorkflow()}
      onDismiss={() => dismissWorkflow()}
    />
  );
}
