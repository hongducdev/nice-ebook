import { describe, expect, it } from "vitest";
import type { ChapterItem, EpubMetadata } from "../stores/useAppStore";
import { detectIsVietnameseBook } from "./vietnameseHelper";
import {
  AUTO_ROUTE_CONFIDENCE_THRESHOLD,
  WORKFLOW_LABELS,
  WORKFLOW_TAB,
  bookIdentityKey,
  buildWorkflowSteps,
  currentStepIndex,
  deriveWorkflow,
  detectBookProfile,
  isTranslationWorkflow,
  suggestOcrLanguage,
  workflowKindFromFile,
  workflowLabel,
} from "./bookTypeDetector";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EN_SAMPLE =
  "The wind was rising and the old man knew that this would be the last time they would ever see " +
  "the shore of that land. He had come here with nothing and he would leave with nothing, but that " +
  "was the way of the world and there was no point in arguing with it.";

const VI_SAMPLE =
  "Gió đang nổi lên và ông lão biết rằng đây sẽ là lần cuối cùng họ còn nhìn thấy bờ biển của " +
  "vùng đất ấy. Ông đã đến đây với hai bàn tay trắng và rồi ông cũng sẽ ra đi như thế, nhưng đó là " +
  "lẽ thường tình của cuộc đời và chẳng ích gì khi phải tranh cãi với nó.";

const ZH_SAMPLE =
  "风吹起，老人知道这将是他们最后一次看到那片土地的海岸。他来时一无所有，走时也一无所有，" +
  "但这就是世事运转的方式，与它争辩毫无意义。";

function chapter(index: number, title: string, preview: string): ChapterItem {
  return {
    id: `ch-${index}`,
    href: `chapter-${index}.xhtml`,
    title,
    preview_text: preview,
  };
}

function makeBook(overrides: Partial<EpubMetadata> = {}): EpubMetadata {
  const base: EpubMetadata = {
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
  };
  return { ...base, ...overrides };
}

function makeVietnameseBook(overrides: Partial<EpubMetadata> = {}): EpubMetadata {
  return makeBook({
    title: "Người Lái Đò Sông Đà",
    language: "vi",
    sample_text: VI_SAMPLE,
    chapters: [
      chapter(1, "Chương Một: Khởi Hành", VI_SAMPLE),
      chapter(2, "Chương Hai: Dòng Sông", VI_SAMPLE),
      chapter(3, "Chương Ba: Bến Bờ", VI_SAMPLE),
    ],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// workflowKindFromFile
// ---------------------------------------------------------------------------

describe("workflowKindFromFile", () => {
  it("recognises every supported extension regardless of casing", () => {
    expect(workflowKindFromFile("book.epub")).toBe("epub");
    expect(workflowKindFromFile("BOOK.EPUB")).toBe("epub");
    expect(workflowKindFromFile("scan.pdf")).toBe("pdf-digital");
    expect(workflowKindFromFile("Scan.PDF")).toBe("pdf-digital");
    expect(workflowKindFromFile("notes.txt")).toBe("txt");
    expect(workflowKindFromFile("sách.md")).toBe("md");
    expect(workflowKindFromFile("sách.markdown")).toBe("md");
  });

  it("prefers the explicit fileType over the name", () => {
    expect(workflowKindFromFile("weird-name", "pdf")).toBe("pdf-digital");
    expect(workflowKindFromFile("weird-name", "md")).toBe("md");
  });

  it("falls back to the native epub format for unknown input", () => {
    expect(workflowKindFromFile("archive.bin")).toBe("epub");
    expect(workflowKindFromFile(null)).toBe("epub");
    expect(workflowKindFromFile(undefined, null)).toBe("epub");
  });
});

// ---------------------------------------------------------------------------
// Vietnamese EPUB
// ---------------------------------------------------------------------------

describe("detectBookProfile — Vietnamese EPUB", () => {
  it("routes to the polish workflow and never asks for translation", () => {
    const profile = detectBookProfile(makeVietnameseBook())!;

    expect(profile.kind).toBe("epub");
    expect(profile.isVietnamese).toBe(true);
    expect(profile.languageCode).toBe("vi");
    expect(profile.workflow).toBe("polish");
    expect(profile.autoRoutable).toBe(true);
    expect(isTranslationWorkflow(profile.workflow)).toBe(false);
  });

  it("produces a step list with no translate step", () => {
    const profile = detectBookProfile(makeVietnameseBook())!;
    const stepIds = buildWorkflowSteps(profile).map((step) => step.id);

    expect(stepIds).not.toContain("translate");
    expect(stepIds).not.toContain("ocr");
    expect(stepIds).not.toContain("convert");
    expect(stepIds).toEqual(["style", "read"]);
  });

  it("still detects Vietnamese when metadata language is missing", () => {
    const profile = detectBookProfile(makeVietnameseBook({ language: "" }))!;
    expect(profile.languageCode).toBe("vi");
    expect(profile.detectionSource).toBe("heuristic");
    expect(profile.workflow).toBe("polish");
  });
});

// ---------------------------------------------------------------------------
// Foreign EPUB
// ---------------------------------------------------------------------------

describe("detectBookProfile — foreign language EPUB", () => {
  it("routes an English book to translation", () => {
    const profile = detectBookProfile(makeBook())!;

    expect(profile.languageCode).toBe("en");
    expect(profile.isVietnamese).toBe(false);
    expect(profile.workflow).toBe("translate");
    expect(profile.autoRoutable).toBe(true);
    expect(profile.languageFlag).toBe("🇬🇧");
  });

  it("includes the translate step between nothing and styling", () => {
    const profile = detectBookProfile(makeBook())!;
    const stepIds = buildWorkflowSteps(profile).map((step) => step.id);
    expect(stepIds).toEqual(["translate", "style", "read"]);
  });

  it("detects Japanese from kana even with no metadata", () => {
    const japanese =
      "風が吹いてきた。老人はこれが彼らがその土地の岸を見る最後の機会になることを知っていた。" +
      "彼は何も持たずに来て、何も持たずに去るだろう。";
    const profile = detectBookProfile(
      makeBook({
        title: "海辺の物語",
        language: "",
        sample_text: japanese,
        chapters: [chapter(1, "第一章", japanese), chapter(2, "第二章", japanese)],
      })
    )!;

    expect(profile.languageCode).toBe("ja");
    expect(profile.workflow).toBe("translate");
    expect(profile.languageFlag).toBe("🇯🇵");
  });

  it("detects Chinese from Hanzi with no metadata", () => {
    const profile = detectBookProfile(
      makeBook({
        title: "海边故事",
        language: "",
        sample_text: ZH_SAMPLE,
        chapters: [chapter(1, "第一章", ZH_SAMPLE), chapter(2, "第二章", ZH_SAMPLE)],
      })
    )!;

    expect(profile.languageCode).toBe("zh");
    expect(profile.workflow).toBe("translate");
  });

  it("a Vietnamese title does not stamp a foreign body as Vietnamese", () => {
    const profile = detectBookProfile(
      makeBook({
        title: "Đắc Nhân Tâm",
        chapters: [
          chapter(1, "Part One", EN_SAMPLE),
          chapter(2, "Part Two", EN_SAMPLE),
          chapter(3, "Part Three", EN_SAMPLE),
        ],
      })
    )!;

    expect(profile.languageCode).toBe("en");
    expect(profile.workflow).toBe("translate");
  });
});

// ---------------------------------------------------------------------------
// No usable evidence
// ---------------------------------------------------------------------------

describe("detectBookProfile — insufficient evidence", () => {
  it("reports the detection as unknown and refuses to auto-route", () => {
    const profile = detectBookProfile(
      makeBook({
        title: "",
        language: "",
        description: null,
        sample_text: "",
        chapter_count: 1,
        chapters: [chapter(1, "", "")],
      })
    )!;

    expect(profile.detectionSource).toBe("unknown");
    expect(profile.autoRoutable).toBe(false);
    expect(profile.languageConfidence).toBeLessThan(AUTO_ROUTE_CONFIDENCE_THRESHOLD);
    expect(profile.reasons[0]).toContain("Chưa đủ dữ liệu");
  });

  it("trusts a clear dc:language when there is no text sample", () => {
    const profile = detectBookProfile(
      makeBook({
        title: "",
        language: "fr",
        description: null,
        sample_text: "",
        chapter_count: 1,
        chapters: [chapter(1, "", "")],
      })
    )!;

    expect(profile.languageCode).toBe("fr");
    expect(profile.detectionSource).toBe("metadata");
    expect(profile.languageConfidence).toBe(0.85);
    expect(profile.autoRoutable).toBe(true);
    expect(profile.workflow).toBe("translate");
  });

  it("returns null when there is no book at all", () => {
    expect(detectBookProfile(null)).toBeNull();
    expect(detectBookProfile(undefined)).toBeNull();
    expect(buildWorkflowSteps(null)).toEqual([]);
    expect(workflowLabel(null)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Converter-origin books
// ---------------------------------------------------------------------------

describe("detectBookProfile — converter origin", () => {
  it("routes a scanned Vietnamese PDF through OCR", () => {
    const profile = detectBookProfile(makeVietnameseBook(), {
      kind: "pdf-digital",
      isScannedPdf: true,
    })!;

    expect(profile.kind).toBe("pdf-scanned");
    expect(profile.workflow).toBe("ocr");
    expect(buildWorkflowSteps(profile).map((step) => step.id)).toEqual(["ocr", "style", "read"]);
  });

  it("routes a scanned Chinese PDF through OCR then translation", () => {
    const profile = detectBookProfile(
      makeBook({
        title: "海边故事",
        language: "",
        sample_text: ZH_SAMPLE,
        chapters: [chapter(1, "第一章", ZH_SAMPLE), chapter(2, "第二章", ZH_SAMPLE)],
      }),
      { kind: "pdf-digital", isScannedPdf: true }
    )!;

    expect(profile.kind).toBe("pdf-scanned");
    expect(profile.workflow).toBe("ocr-translate");
    expect(buildWorkflowSteps(profile).map((step) => step.id)).toEqual([
      "ocr",
      "translate",
      "style",
      "read",
    ]);
  });

  it("routes a digital Vietnamese PDF through conversion", () => {
    const profile = detectBookProfile(makeVietnameseBook(), { kind: "pdf-digital" })!;
    expect(profile.workflow).toBe("convert");
    expect(buildWorkflowSteps(profile).map((step) => step.id)).toEqual(["convert", "style", "read"]);
  });

  it("routes a Chinese TXT through conversion then translation", () => {
    const profile = detectBookProfile(
      makeBook({
        title: "海边故事",
        language: "",
        sample_text: ZH_SAMPLE,
        chapters: [chapter(1, "第一章", ZH_SAMPLE)],
      }),
      { kind: "txt", sourceName: "book.txt" }
    )!;

    expect(profile.kind).toBe("txt");
    expect(profile.workflow).toBe("convert-translate");
    expect(buildWorkflowSteps(profile).map((step) => step.id)).toEqual([
      "convert",
      "translate",
      "style",
      "read",
    ]);
  });

  it("routes Vietnamese Markdown through conversion", () => {
    const profile = detectBookProfile(makeVietnameseBook(), {
      kind: "md",
      sourceName: "notes.md",
    })!;
    expect(profile.kind).toBe("md");
    expect(profile.workflow).toBe("convert");
  });
});

// ---------------------------------------------------------------------------
// Watermarks are a step, not a workflow
// ---------------------------------------------------------------------------

describe("detectBookProfile — watermarks", () => {
  const watermarkedChapters = [
    chapter(1, "Chương 1", "Nội dung chương một. Nguồn: dtv-ebook.com"),
    chapter(2, "Chương 2", "Nội dung chương hai. Nguồn: dtv-ebook.com"),
    chapter(3, "Chương 3", "Nội dung chương ba."),
  ];

  it("prepends a cleanup step to the Vietnamese workflow", () => {
    const profile = detectBookProfile(
      makeVietnameseBook({ chapters: watermarkedChapters, sample_text: VI_SAMPLE })
    )!;

    expect(profile.workflow).toBe("polish");
    expect(profile.hasWatermarks).toBe(true);
    expect(profile.watermarkChapters).toBe(2);
    expect(buildWorkflowSteps(profile).map((step) => step.id)).toEqual([
      "cleanup",
      "style",
      "read",
    ]);
    expect(profile.reasons.some((r) => r.includes("watermark"))).toBe(true);
  });

  it("prepends a cleanup step to a translation workflow", () => {
    const profile = detectBookProfile(
      makeBook({
        chapters: [
          chapter(1, "Chapter 1", `${EN_SAMPLE} Nguồn: dtv-ebook.com`),
          chapter(2, "Chapter 2", EN_SAMPLE),
        ],
      })
    )!;

    expect(profile.workflow).toBe("translate");
    expect(profile.hasWatermarks).toBe(true);
    expect(buildWorkflowSteps(profile)[0].id).toBe("cleanup");
  });

  // (d) from the completion review: the watermark gate was tightened to ignore
  // ordinary English apostrophes, so these fixtures prove the tightening did
  // NOT introduce false negatives on non-Vietnamese books. Library markers are
  // language-independent and must still be caught in every script.
  it.each([
    ["dtv-ebook.com", "English body", "en", EN_SAMPLE],
    ["truyenfull.vn", "English body", "en", EN_SAMPLE],
    ["tangthuvien", "Chinese body", "", ZH_SAMPLE],
    ["Chúc các bạn đọc truyện vui vẻ", "Chinese body", "", ZH_SAMPLE],
    ["Nguồn: dtv-ebook.com — Chúc các bạn đọc truyện vui vẻ", "English body", "en", EN_SAMPLE],
  ])("still detects the %s marker on a non-Vietnamese book", (marker, label, language, body) => {
    const profile = detectBookProfile(
      makeBook({
        title: language === "" ? "海边故事" : "Untitled",
        language,
        sample_text: body,
        chapter_count: 2,
        chapters: [
          chapter(1, "Chapter One", `${body} ${marker}`),
          chapter(2, "Chapter Two", body),
        ],
      })
    )!;

    expect(label).toBeTruthy();
    expect(profile.isVietnamese).toBe(false);
    expect(profile.hasWatermarks).toBe(true);
    expect(profile.watermarkChapters).toBe(1);
    expect(buildWorkflowSteps(profile)[0].id).toBe("cleanup");
  });

  it("a Vietnamese watermark footer cannot outvote a foreign body", () => {
    // Regression guard: `LanguageDetector` treats the first two Vietnamese
    // diacritics anywhere in the sample as decisive, so an un-stripped watermark
    // line used to flip a whole Chinese book to Vietnamese — silently skipping
    // the translation the user asked for.
    const profile = detectBookProfile(
      makeBook({
        title: "海边故事",
        language: "",
        sample_text: ZH_SAMPLE,
        chapter_count: 2,
        chapters: [
          chapter(1, "第一章", `${ZH_SAMPLE} Nguồn: truyenfull.vn — Chúc các bạn đọc truyện vui vẻ`),
          chapter(2, "第二章", ZH_SAMPLE),
        ],
      })
    )!;

    expect(profile.languageCode).toBe("zh");
    expect(profile.isVietnamese).toBe(false);
    expect(profile.workflow).toBe("translate");
    expect(profile.hasWatermarks).toBe(true);
  });

  it("does not mistake ordinary English apostrophes for broken Vietnamese diacritics", () => {
    const profile = detectBookProfile(
      makeBook({
        chapters: [
          chapter(1, "Chapter One", "Mia's dog don't like it when the weather turns cold."),
          chapter(2, "Chapter Two", "Amanda's cat isn't here, so we can't stay."),
        ],
        sample_text: "Mia's dog don't like it when the weather turns cold. Amanda's cat isn't here.",
      })
    )!;

    expect(profile.hasWatermarks).toBe(false);
    expect(buildWorkflowSteps(profile).map((step) => step.id)).toEqual([
      "translate",
      "style",
      "read",
    ]);
  });

  it("flags missing chapter titles as a reason to run AI editing", () => {
    const profile = detectBookProfile(
      makeVietnameseBook({
        chapters: [chapter(1, "", VI_SAMPLE), chapter(2, "Chương Hai", VI_SAMPLE), chapter(3, "", VI_SAMPLE)],
        chapter_count: 3,
      })
    )!;

    expect(profile.reasons.some((r) => r.includes("2 chương thiếu tiêu đề"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deriveWorkflow table
// ---------------------------------------------------------------------------

describe("deriveWorkflow", () => {
  it("covers the full kind x language matrix", () => {
    expect(deriveWorkflow("epub", true)).toBe("polish");
    expect(deriveWorkflow("epub", false)).toBe("translate");
    expect(deriveWorkflow("pdf-scanned", true)).toBe("ocr");
    expect(deriveWorkflow("pdf-scanned", false)).toBe("ocr-translate");
    expect(deriveWorkflow("pdf-digital", true)).toBe("convert");
    expect(deriveWorkflow("pdf-digital", false)).toBe("convert-translate");
    expect(deriveWorkflow("txt", true)).toBe("convert");
    expect(deriveWorkflow("txt", false)).toBe("convert-translate");
    expect(deriveWorkflow("md", true)).toBe("convert");
    expect(deriveWorkflow("md", false)).toBe("convert-translate");
  });

  it("upgrades a digital PDF to scanned when told to", () => {
    expect(deriveWorkflow("pdf-digital", true, true)).toBe("ocr");
    expect(deriveWorkflow("pdf-digital", false, true)).toBe("ocr-translate");
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe("step bookkeeping", () => {
  it("reports the first incomplete step", () => {
    const steps = buildWorkflowSteps(detectBookProfile(makeBook())!);
    expect(currentStepIndex(steps, [])).toBe(0);
    expect(currentStepIndex(steps, ["translate"])).toBe(1);
    expect(currentStepIndex(steps, ["translate", "style"])).toBe(2);
    expect(currentStepIndex(steps, ["translate", "style", "read"])).toBe(3);
    expect(currentStepIndex([], [])).toBe(-1);
  });

  it("builds a stable identity key", () => {
    expect(bookIdentityKey(makeBook())).toBe("Untitled::3::1024");
    expect(bookIdentityKey(null)).toBe("");
  });

  it("labels translation workflows", () => {
    expect(isTranslationWorkflow("translate")).toBe(true);
    expect(isTranslationWorkflow("ocr-translate")).toBe(true);
    expect(isTranslationWorkflow("convert-translate")).toBe(true);
    expect(isTranslationWorkflow("polish")).toBe(false);
    expect(isTranslationWorkflow("ocr")).toBe(false);
    expect(isTranslationWorkflow(null)).toBe(false);
  });

  it("suggests a Tesseract language pack per language", () => {
    expect(suggestOcrLanguage("vi")).toBe("vie+eng");
    expect(suggestOcrLanguage("zh")).toBe("chi_sim");
    expect(suggestOcrLanguage("ja")).toBe("jpn");
    expect(suggestOcrLanguage("en")).toBe("eng");
    expect(suggestOcrLanguage("xx")).toBe("eng");
  });

  it("has a label and a tab for every workflow", () => {
    const workflows = Object.keys(WORKFLOW_LABELS) as Array<keyof typeof WORKFLOW_LABELS>;
    expect(workflows).toHaveLength(6);
    for (const workflow of workflows) {
      expect(WORKFLOW_TAB[workflow]).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Reconciliation with the legacy boolean detector
//
// `detectBookProfile` uses `LanguageDetector` (confidence + evidence) while
// `detectIsVietnameseBook` uses a looser any-field-means-Vietnamese rule. They
// must agree on every unambiguous fixture; where they legitimately differ the
// richer detector wins and the case is pinned below.
// ---------------------------------------------------------------------------

describe("reconciliation with detectIsVietnameseBook", () => {
  const agreeingFixtures: Array<{ name: string; book: EpubMetadata }> = [
    { name: "Vietnamese EPUB", book: makeVietnameseBook() },
    { name: "Vietnamese EPUB without metadata", book: makeVietnameseBook({ language: "" }) },
    { name: "English EPUB", book: makeBook() },
    { name: "English EPUB without metadata", book: makeBook({ language: "" }) },
  ];

  it.each(agreeingFixtures)("agrees on $name", ({ book }) => {
    const profile = detectBookProfile(book)!;
    expect(profile.isVietnamese).toBe(detectIsVietnameseBook(book));
  });

  it("documents the accepted divergence: Vietnamese metadata on a foreign body", () => {
    // `detectIsVietnameseBook` returns true here purely because dc:language says
    // "vi"; the richer detector trusts the actual body text instead. This is the
    // intended behaviour and the reason `LanguageDetector` is canonical.
    const misleading = makeBook({ language: "vi", sample_text: EN_SAMPLE });

    expect(detectIsVietnameseBook(misleading)).toBe(true);
    expect(detectBookProfile(misleading)!.languageCode).toBe("en");
  });
});
