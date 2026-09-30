---
title: Ingest Workflow Router - Per-Book-Type Pipeline & Contextual UX
date: '2026-09-30T02:30:00.000Z'
tags:
  - ingest
  - workflow
  - language-detection
  - translation
  - ocr
  - ux
  - zustand
---

## Ingest Workflow Router - Per-Book-Type Pipeline & Contextual UX

## Summary
Added a single classification point for every ingested ebook, so the app now recognises **what kind of
book was just added** and routes the user into the right workflow instead of silently dropping foreign
books into the library. A foreign-language EPUB now opens Dịch thuật AI automatically with the source
language pre-filled; a scanned PDF opens the converter; a Vietnamese book stays in the library with a
prompt to style and export.

## Key Changes

1. **`src/utils/bookTypeDetector.ts` (new, pure)** — the single decision point.
   - `detectBookProfile(meta, ctx)` → `BookProfile` holding only *observations* (`bookIdentity`, `kind`,
     language + confidence + evidence source, watermark facts) plus exactly one derived `BookWorkflow`
     enum: `polish | translate | ocr | ocr-translate | convert | convert-translate`.
   - Workflow **steps** are derived by `buildWorkflowSteps(profile)`, never stored — a stored copy would
     be a second source of truth that could drift from the profile.
   - Watermark removal is modelled as a *step* (`cleanup`), not a peer workflow, so a scanned,
     watermarked, foreign PDF has one unambiguous pipeline instead of contradictory precedence rules.
   - `deriveWorkflow`, `workflowKindFromFile`, `suggestOcrLanguage`, `bookIdentityKey`,
     `currentStepIndex`, `WORKFLOW_TAB`, `workflowLabel`.

2. **Routing in `useAppStore.ts`** — `routeAfterBookLoad()` with explicit, ordered gates:
   auto-switch requested → manual choice locked → user preference off → confidence below 0.75 →
   native Vietnamese → switch tab. A manual choice sticks (`workflowSource: "manual"`) and detection can
   never override it. `openProject` routes with `autoSwitch: false`: opening a saved project must not
   hijack the tab. Editing metadata refreshes the language facts only.

3. **Per-book progress state.** Completion is tracked as a *set of completed step ids* rather than an
   index, because an index cannot represent a branchy pipeline (`OCR → maybe translate`). Translation
   coverage uses `translatedChapters: Record<href, timestamp>` so counters are O(1) and never re-read
   chapter content. Both persisted on `EbookProject` as **optional** fields — no schema bump, and
   projects saved before this feature open normally via `??` defaults.
   `restoreProjectWorkflow()` puts routing and restoring in one function so the ordering invariant
   cannot be broken by a future reorder.

4. **UI.** `WorkflowBanner` (detected language + confidence + evidence + workflow + CTA + dismiss) and
   `BookPipelineStepper` (done / current / pending, clickable), each split into a pure `*View` plus a
   thin store-wired wrapper; native `<details>` for the "why?" disclosure; dynamic sidebar badges
   (untranslated chapter count, pending converter file, bilingual reading); compact `Quy trình: X · 2/3`
   chip in the status bar; a file-scoped detection strip in the converter; a workflow-context strip and
   an "all chapters translated" panel in the translator. Settings gained an
   **auto-route** toggle and a **reset workflow progress** action.

## Bugs found and fixed along the way

- **A Vietnamese watermark line could outvote a whole foreign book.** `LanguageDetector` treats the
  first two Vietnamese diacritics anywhere in the sample as decisive, so a single
  `Nguồn: truyenfull.vn` footer flipped an entire Chinese book to Vietnamese and silently skipped the
  translation the user wanted. Added `stripWatermarkTokens()` in `watermarkCleaner.ts` (reusing the
  canonical domain/phrase lists) and applied it to the detection sample only.
- **Watermark false positives on English books.** The "broken Vietnamese diacritics" heuristic matches
  ordinary Latin apostrophes (`Mia's`, `don't`). It is now only believed for Vietnamese books, while
  library markers (`dtv-ebook`, `truyenfull`, …) are still caught in any language.
- **Three readers, two meanings of "translated".** The sidebar badge, the stepper and the translator
  panel each derived it differently. All now go through `getTranslationCoverage()`, which uses
  `translatedChapters` and falls back to `modifiedChapters` for legacy projects, reporting
  `isLegacyFallback` so the approximation is visible rather than silent.
- **Duplicated `ActiveTab` union** in `useAppStore.ts` and `Sidebar.tsx` → single source in
  `src/types/navigation.ts`.

## Decisions worth recording

- **Banner, not silent hijack (mostly).** The user explicitly asked for auto-switching, so it is ON by
  default — but only above a confidence threshold, it is disableable in Settings, and the toast carries
  an "Ở lại thư viện" escape hatch.
- **`LanguageDetector` is canonical; `detectIsVietnameseBook` is a documented fallback.** The two
  diverge in exactly one case (metadata says `vi`, body is foreign). The legacy helper only decides when
  `detectionSource === "unknown"`. It can be deleted once its 12 remaining call sites read
  `bookProfile.isVietnamese`; a reconciliation test pins the divergence until then.
- **The converter's banner is file-scoped, not book-scoped.** `bookProfile` describes the book open in
  the Studio; the converter's workbench usually holds a different file.

## Verification
- `npm run test` → 30 files / **326 tests pass** (baseline on the same working tree before this work:
  27 files / 247 tests). New: `bookTypeDetector.test.ts` (39), `useAppStore.test.ts` +14,
  `workflow-ui.test.tsx` (14), `workflow-wiring.test.tsx` (10).
- `npx tsc --noEmit` → exit 0. `npm run build` (`tsc && vite build`) → built successfully.
- **Not verified:** the app was never launched as a Tauri desktop session, so runtime behaviour is
  inferred from tests rather than observed. Click interactions on the banner are covered at the store
  layer, not the component layer (the repo has no jsdom / testing-library).
