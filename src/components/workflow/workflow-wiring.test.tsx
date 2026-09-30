import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildWorkflowSteps, detectBookProfile } from "../../utils/bookTypeDetector";

// ---------------------------------------------------------------------------
// This file covers the connection between the store and the presentational
// Views — the layer where routing/rendering bugs actually live.
//
// It mocks `useAppStore` because zustand hands React `getInitialState()` as the
// server snapshot: a real store seeded with `setState` would still render empty
// under `react-dom/server`, and jsdom / @testing-library are not installed.
// Mocking the hook lets us assert the gate and the exact props the wrapper
// passes down. Only genuine user interaction (clicking the CTA / dismiss) stays
// uncovered there; that logic is asserted in `src/stores/useAppStore.test.ts`.
// ---------------------------------------------------------------------------

const EN_SAMPLE =
  "The wind was rising and the old man knew that this would be the last time they would ever see " +
  "the shore of that land. He had come here with nothing and he would leave with nothing.";

const VI_SAMPLE =
  "Gió đang nổi lên và ông lão biết rằng đây sẽ là lần cuối cùng họ còn nhìn thấy bờ biển.";

function makeBook(overrides: Record<string, unknown> = {}) {
  return {
    title: "Untitled",
    author: "Anonymous",
    language: "en",
    description: null,
    cover_data_url: null,
    chapter_count: 2,
    file_size_bytes: 1024,
    chapters: [
      { id: "c1", href: "chapter-1.xhtml", title: "Chapter One", preview_text: EN_SAMPLE },
      { id: "c2", href: "chapter-2.xhtml", title: "Chapter Two", preview_text: EN_SAMPLE },
    ],
    sample_text: EN_SAMPLE,
    ...overrides,
  };
}

const startRecommendedWorkflow = vi.fn(() => "translator" as const);
const dismissWorkflow = vi.fn();
const setActiveTab = vi.fn();

let mockState: Record<string, unknown> = {};

vi.mock("../../stores/useAppStore", () => ({
  useAppStore: () => mockState,
}));

const { WorkflowBanner } = await import("./WorkflowBanner");
const { BookPipelineStepper } = await import("./BookPipelineStepper");

function seedStore(overrides: Record<string, unknown> = {}) {
  const currentBook = makeBook();
  mockState = {
    currentBook,
    bookProfile: detectBookProfile(currentBook as never),
    dismissedWorkflowFor: null,
    workflowCompletedSteps: [],
    startRecommendedWorkflow,
    dismissWorkflow,
    setActiveTab,
    ...overrides,
  };
  return mockState;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState = {};
});

describe("WorkflowBanner wiring", () => {
  it("renders nothing when the store has no book", () => {
    mockState = { currentBook: null, bookProfile: null, dismissedWorkflowFor: null };
    expect(renderToStaticMarkup(<WorkflowBanner />)).toBe("");
  });

  it("renders nothing when the store has a book but no profile yet", () => {
    mockState = { currentBook: makeBook(), bookProfile: null, dismissedWorkflowFor: null };
    expect(renderToStaticMarkup(<WorkflowBanner />)).toBe("");
  });

  it("passes the profile, derived steps and CTA through to the view", () => {
    seedStore();
    const html = renderToStaticMarkup(<WorkflowBanner />);

    expect(html).toContain('data-workflow="translate"');
    expect(html).toContain("Tiếng Anh (English)");
    expect(html).toContain("Bắt đầu: Dịch thuật");
  });

  it("maps workflowCompletedSteps into the next-step hint", () => {
    seedStore({ workflowCompletedSteps: ["translate"] });
    const html = renderToStaticMarkup(<WorkflowBanner />);
    expect(html).toContain("Bước tiếp theo:");
    expect(html).toContain("Định kiểu");
  });

  it("hides the banner when the current book identity was dismissed", () => {
    const state = seedStore();
    mockState = {
      ...state,
      dismissedWorkflowFor: (state.bookProfile as { bookIdentity: string }).bookIdentity,
    };
    expect(renderToStaticMarkup(<WorkflowBanner />)).toBe("");
  });

  it("accepts a Vietnamese book without any translate step", () => {
    const currentBook = makeBook({
      title: "Người Lái Đò Sông Đà",
      language: "vi",
      sample_text: VI_SAMPLE,
      chapters: [
        { id: "c1", href: "chapter-1.xhtml", title: "Chương Một", preview_text: VI_SAMPLE },
      ],
    });
    mockState = {
      currentBook,
      bookProfile: detectBookProfile(currentBook as never),
      dismissedWorkflowFor: null,
      workflowCompletedSteps: [],
      startRecommendedWorkflow,
      dismissWorkflow,
      setActiveTab,
    };

    const html = renderToStaticMarkup(<WorkflowBanner />);
    expect(html).toContain("Sách tiếng Việt");
    expect(html).not.toContain("Dịch thuật");
  });
});

describe("BookPipelineStepper wiring", () => {
  it("renders nothing when the store has no profile", () => {
    mockState = { bookProfile: null, workflowCompletedSteps: [], setActiveTab };
    expect(renderToStaticMarkup(<BookPipelineStepper />)).toBe("");
  });

  it("derives the plan from the store profile and marks completed steps", () => {
    seedStore({ workflowCompletedSteps: ["translate"] });
    const html = renderToStaticMarkup(<BookPipelineStepper />);

    const expectedSteps = buildWorkflowSteps(detectBookProfile(makeBook() as never));
    expect(html.match(/pipeline-stepper__item/g)).toHaveLength(expectedSteps.length);
    expect(html.match(/data-state="done"/g)).toHaveLength(1);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it("forwards className onto the rail element", () => {
    seedStore();
    const html = renderToStaticMarkup(<BookPipelineStepper className="mt-3" />);
    expect(html).toContain("pipeline-stepper mt-3");
  });

  it("renders the compact variant when asked", () => {
    seedStore();
    expect(renderToStaticMarkup(<BookPipelineStepper compact />)).toContain(
      "pipeline-stepper--compact"
    );
  });
});
