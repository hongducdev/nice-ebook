import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useAppStore } from "../../stores/useAppStore";
import {
  buildWorkflowSteps,
  detectBookProfile,
} from "../../utils/bookTypeDetector";
import { BookPipelineStepperView, BookPipelineStepper } from "./BookPipelineStepper";
import { WorkflowBannerView, WorkflowBanner } from "./WorkflowBanner";

// The repo has no jsdom / testing-library, so these tests render to a static
// markup string with `react-dom/server`.
//
// Why the `*View` components rather than the store-wired wrappers: zustand's
// `useStore` passes `selector(api.getInitialState())` as React's
// `getServerSnapshot`, so a server render always sees the *initial* state and a
// store-driven component would render as empty no matter what a test seeds.
// The wrappers are therefore kept deliberately thin (read store -> render View),
// and all markup logic lives in the pure Views below, which is also better
// component design. Store-level routing behaviour is covered in
// `src/stores/useAppStore.test.ts`.

const EN_SAMPLE =
  "The wind was rising and the old man knew that this would be the last time they would ever see " +
  "the shore of that land. He had come here with nothing and he would leave with nothing.";

const ZH_SAMPLE =
  "风吹起，老人知道这将是他们最后一次看到那片土地的海岸。他来时一无所有，走时也一无所有。";

const VI_SAMPLE =
  "Gió đang nổi lên và ông lão biết rằng đây sẽ là lần cuối cùng họ còn nhìn thấy bờ biển.";

function chapter(index: number, title: string, preview: string) {
  return { id: `c${index}`, href: `chapter-${index}.xhtml`, title, preview_text: preview };
}

function book(overrides: Record<string, unknown> = {}) {
  return {
    title: "Untitled",
    author: "Anonymous",
    language: "en",
    description: null,
    cover_data_url: null,
    chapter_count: 3,
    file_size_bytes: 1024,
    chapters: [
      chapter(1, "Chapter One", EN_SAMPLE),
      chapter(2, "Chapter Two", EN_SAMPLE),
      chapter(3, "Chapter Three", EN_SAMPLE),
    ],
    sample_text: EN_SAMPLE,
    ...overrides,
  };
}

function renderBanner(
  meta: Record<string, unknown>,
  completedSteps: string[] = [],
  context: { isScannedPdf?: boolean } = {}
) {
  const profile = detectBookProfile(meta as never, context)!;
  return renderToStaticMarkup(
    <WorkflowBannerView
      profile={profile}
      steps={buildWorkflowSteps(profile)}
      completedSteps={completedSteps}
      onStart={() => {}}
      onDismiss={() => {}}
    />
  );
}

function renderStepper(
  meta: Record<string, unknown>,
  completedSteps: string[] = [],
  context: { isScannedPdf?: boolean } = {},
  compact = false
) {
  const profile = detectBookProfile(meta as never, context)!;
  return renderToStaticMarkup(
    <BookPipelineStepperView
      steps={buildWorkflowSteps(profile)}
      completedSteps={completedSteps}
      compact={compact}
    />
  );
}

describe("WorkflowBannerView", () => {
  it("announces the language, workflow, pipeline and CTA", () => {
    const html = renderBanner(book());

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Tiếng Anh (English)");
    expect(html).toContain("Dịch thuật → Định kiểu → Xuất bản");
    expect(html).toContain("Bắt đầu: Dịch thuật");
    expect(html).toContain("Bước tiếp theo:");
    expect(html).toContain("Vì sao?");
  });

  it("shows the full OCR pipeline for a scanned foreign PDF", () => {
    const html = renderBanner(
      book({ language: "", title: "海边故事", sample_text: ZH_SAMPLE, chapters: [] }),
      [],
      { isScannedPdf: true }
    );

    expect(html).toContain("OCR → Dịch thuật → Định kiểu → Xuất bản");
    expect(html).toContain("Bắt đầu: OCR → Dịch thuật");
  });

  it("shows a Vietnamese book without any translation step", () => {
    const html = renderBanner(
      book({
        title: "Người Lái Đò Sông Đà",
        language: "vi",
        sample_text: VI_SAMPLE,
        chapters: [chapter(1, "Chương Một", VI_SAMPLE)],
      })
    );

    expect(html).toContain("Sách tiếng Việt");
    expect(html).toContain("Định kiểu → Xuất bản");
    expect(html).not.toContain("Dịch thuật");
  });

  it("advances the next-step hint after a completed step", () => {
    const html = renderBanner(book(), ["translate"]);
    expect(html).toContain("Bước tiếp theo:");
    expect(html).toContain("Định kiểu");
  });

  it("reports completion when every step is done and offers a re-entry CTA", () => {
    const html = renderBanner(book(), ["translate", "style", "read"]);
    expect(html).toContain("đã hoàn thành toàn bộ quy trình");
    expect(html).toContain("Mở lại quy trình");
  });

  it("surfaces the watermark chip and prepends the cleanup step", () => {
    const html = renderBanner(
      book({
        chapter_count: 2,
        chapters: [
          chapter(1, "Chapter One", `${EN_SAMPLE} Nguồn: dtv-ebook.com`),
          chapter(2, "Chapter Two", EN_SAMPLE),
        ],
      })
    );

    expect(html).toContain("Watermark 1 chương");
    expect(html).toContain("Làm sạch → Dịch thuật → Định kiểu → Xuất bản");
  });

  it("renders the detection reasons inside a native disclosure", () => {
    const html = renderBanner(book());
    expect(html).toContain("<details");
    expect(html).toContain("Ngôn ngữ nhận diện");
  });

  it("marks low-confidence detection honestly", () => {
    const html = renderBanner(
      book({ title: "", language: "", description: null, sample_text: "", chapter_count: 1, chapters: [chapter(1, "", "")] })
    );
    expect(html).toContain("chưa đủ dữ liệu");
    expect(html).toContain("Chưa đủ dữ liệu văn bản");
  });
});

describe("BookPipelineStepperView", () => {
  it("renders one item per derived step with exactly one current step", () => {
    const html = renderStepper(book(), ["translate"]);

    expect(html.match(/pipeline-stepper__item/g)).toHaveLength(3);
    expect(html).toContain('role="list"');
    expect(html).toContain('aria-label="Quy trình xử lý sách"');
    expect(html.match(/data-state="done"/g)).toHaveLength(1);
    expect(html.match(/data-state="current"/g)).toHaveLength(1);
    expect(html.match(/data-state="pending"/g)).toHaveLength(1);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it("renders four steps for a scanned foreign PDF", () => {
    const html = renderStepper(
      book({ language: "", title: "海边故事", sample_text: ZH_SAMPLE, chapters: [] }),
      ["ocr"],
      { isScannedPdf: true }
    );

    expect(html.match(/pipeline-stepper__item/g)).toHaveLength(4);
    expect(html.match(/data-state="done"/g)).toHaveLength(1);
    expect(html).toContain("Dịch thuật");
  });

  it("shows no current step once the whole plan is done", () => {
    const html = renderStepper(book(), ["translate", "style", "read"]);
    expect(html.match(/data-state="done"/g)).toHaveLength(3);
    expect(html).not.toContain('aria-current="step"');
  });

  it("renders a compact variant for the status bar", () => {
    const html = renderStepper(book(), [], {}, true);
    expect(html).toContain("pipeline-stepper--compact");
  });

  it("omits step descriptions in the compact variant", () => {
    const full = renderStepper(book());
    const compact = renderStepper(book(), [], {}, true);
    expect(full).toContain("pipeline-stepper__description");
    expect(compact).not.toContain("pipeline-stepper__description");
  });
});

// Smoke test of the store-wired wrappers. They cannot be asserted against a
// seeded store (see the note above), but they must at least render nothing when
// there is no book, and must delegate to the Views otherwise.
describe("store-wired wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ currentBook: null, bookProfile: null });
  });

  it("render nothing without a book", () => {
    expect(renderToStaticMarkup(<WorkflowBanner />)).toBe("");
    expect(renderToStaticMarkup(<BookPipelineStepper />)).toBe("");
  });
});
