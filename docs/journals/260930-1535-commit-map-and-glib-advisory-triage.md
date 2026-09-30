---
title: Commit 119cdd7 Workstream Map & glib Advisory Triage
date: '2026-09-30T15:35:38.000Z'
tags:
  - git
  - process
  - security
  - dependencies
  - bisect
---

## Commit 119cdd7 Workstream Map & glib Advisory Triage

## Summary

`119cdd7` (`feat(ingest): route each book into its own pipeline and style it from its own CSS`) is a
single commit carrying **four** workstreams. That was deliberate, not an oversight: three files hold
interleaved hunks from all four, so a file-granularity split would have produced intermediate commits
that do not build or test green — worse for `git bisect` than one honestly coarse commit, because a
lying bisect point wastes more time than a big true one. The commit has already been pushed, so
rewriting it would mean a force-push to `master`; the map below is the cheap alternative.

## The four workstreams in 119cdd7

### 1. Ingest Workflow Router (`plans/260930-ingest-workflow-router/`)
Owns: `src/utils/bookTypeDetector.ts` + test, `src/types/navigation.ts`,
`src/components/workflow/*` (`WorkflowBanner`, `BookPipelineStepper`, `ingestRouteToast`, two test
files), `src/styles/globals.css` (the whole added block is `.workflow-banner*` / `.pipeline-stepper*`),
`src/utils/watermarkCleaner.ts` (new `stripWatermarkTokens`, which exists only to keep pirate-site
footers out of the language sample), `src/App.tsx`, `src/components/layout/{Sidebar,StatusBar}.tsx`,
`src/components/books/BookView.tsx`, `src/components/converter/ConverterView.tsx`,
`docs/system-architecture.md` §E, `docs/journals/260930-0830-ingest-workflow-router.md`.

Store surface: `bookProfile`, `lastIngestRoute`, `workflowSource`, `workflowCompletedSteps`,
`dismissedWorkflowFor`, `autoRouteOnIngest`, `translatedChapters`, `routeAfterBookLoad`,
`restoreProjectWorkflow`, `startRecommendedWorkflow`, `markWorkflowStepComplete`, `dismissWorkflow`,
`resetWorkflowState`, `recomputeProfileLanguage`, `getTranslationCoverage`,
`getUntranslatedChapterCount`.

### 2. "Style theo sách hiện tại" (native styling)
Owns: `src/utils/bookStyleAnalyzer.ts` + test, `src/utils/cssGenerator.ts` + test (selective override
mode), `src/presets/styles.ts` (`derivedFromBook`), `src/components/styles/PresetGallery.tsx`,
`src/components/preview/EpubReaderViewer.tsx`, `src/components/export/ExportModal.tsx`,
`src-tauri/src/epub/{mod,parser,writer}.rs`, `src-tauri/src/lib.rs` (`read_epub_styles`,
`read_chapter_bytes`), `src-tauri/tests/book_style_analysis.rs`.

Store surface: `bookStyleSignature`, `bookStyleCss`, `isAnalyzingBookStyle`, `autoStyleFromBook`,
`setAutoStyleFromBook`, `analyzeBookStyle`, `nativeStylePatch()`.

### 3. Translation glossary seeding + log panel
Owns: `src/components/translation/TranslationLogPanel.tsx` + `translation-log-ui.test.tsx`,
`src/components/translation/BookTranslatorView.tsx`,
`docs/journals/260930-1413-auto-configure-glossary-and-log.md`.

Store surface: `AutoTranslationConfigResult` (`properNamesCount`, `termsCount`, `addedProperNames`,
`addedTerms`, `activeEngineLabel`), `summarizeEntityNames()`, the rewritten entity-seeding block
inside `autoConfigureAllTranslationSettings()`.

### 4. Gateway (api_key wiring + model categorisation)
Owns: `src/utils/gatewayModelCategorizer.ts` + test, `src/components/ai/GatewayView.tsx`,
`src/components/settings/GatewaySettingsModal.tsx`, `src-tauri/src/scanner/mod.rs`
(`DetectedGateway`, computed root URL), `src/services/aiService.test.ts` (added OpenCode routing
describe block).

Store surface: `ConfiguredProviderInfo`, `DetectedGateway.api_key` / `configured_providers`, and the
`apiKey` now threaded into every `AiService` call site instead of `api_key: undefined`.

## The three files that blocked a clean split

| File | Hunks from |
|---|---|
| `src/stores/useAppStore.ts` (+708/−34) | 1, 2, 3, 4 |
| `src/components/translation/BookTranslatorView.tsx` | 1 (workflow wiring), 3 (log panel) |
| `src/stores/useAppStore.test.ts` (+443) | 1, 2, 3 |

Practical consequence for future work: **commit feature-scoped from here on.** Treat `119cdd7` as a
squashed baseline. If one of these four features ever needs reverting, revert by hand (or by
`git revert -n` + editing out the unrelated hunks) rather than `git revert 119cdd7`.

## glib advisory (Dependabot alert #1, GHSA-wrw7-89jp-8q8g)

**Verdict: no reachable fix exists upstream. Dismissed as `tolerable_risk`, not fixed.** The evidence:

- `glib` is Linux-only here. `cargo tree -i glib --target x86_64-pc-windows-msvc` prints *nothing* —
  it is not in the Windows (or macOS) dependency graph at all. It enters only through the GTK3
  backend: `glib 0.18.5 <- gtk 0.18.2 <- tao / wry / muda / tauri-runtime-wry`.
- No fix inside the compatible range. The advisory marks `>= 0.15.0, < 0.20.0` vulnerable and
  `gtk 0.18` requires `glib ^0.18`. The last release of the 0.18 line is **0.18.5 (2023-12-30)**;
  the fix shipped only in **0.20.0**. There is no 0.18.x backport to take.
- No dependency bump helps. Every current upstream release still pins GTK3 0.18:
  `tao 0.37.1`, `wry 0.57.0`, `muda 0.21.0`, `tauri-runtime-wry 2.12.0` → all declare `gtk ^0.18`.
  (The new `gtk 0.19.0`, which requires `glib ^0.22` and *would* clear the advisory, is not accepted
  by any of them.)
- `[patch.crates-io]` cannot bridge it: lifting `glib` to 0.20 violates `gtk 0.18`'s `^0.18`
  requirement and cargo rejects the resolution as semver-incompatible.
- What the bug actually is: `VariantStrIter::impl_get` passed a pointer as `&p` to a variadic C
  function that mutated it in place, so `CStr::from_ptr` could receive `NULL` and crash. Triggering it
  requires iterating a `glib::VariantStr`; Tauri's window/WebView path does not.

Re-check trigger: revisit when `tao` / `wry` move to `gtk 0.19`. To re-verify the claim that no path
exists, re-run the four checks — `cargo tree -i glib --target all` (chain), `cargo tree -i glib
--target x86_64-pc-windows-msvc` (absent on Windows), the `gtk ^0.18` req in `tao`'s latest
`Cargo.toml`, and `crates.io`'s version list for `glib` (no 0.18.x after 0.18.5).

## Notes / Follow-ups

- The 2 env-gated Rust tests in `src-tauri/tests/` (`book_native_styling_reads_and_preserves_the_publishers_css`,
  `realistic_book_converts_with_the_built_in_core`) were **not** run — they require
  `NICEBOOK_SAMPLE_EPUB` / `NICEBOOK_REALISTIC_EPUB`. That is an audit-trail gap: the native-styling
  path has no automated proof against a real publisher EPUB, only against synthetic fixtures.
- Automated only: routing a real foreign EPUB and the native style analysis were validated by
  `tsc --noEmit` (clean), `vitest run` (32 files / 363 tests) and `cargo test` (80 pass) — never
  exercised by hand in the UI.
- A hardcoded `http://100.118.3.52:20128/v1` remains the default gateway URL. It is not a leaked
  credential (it is the project's own 9Router host, already hardcoded in `scanner/mod.rs` and
  `GatewaySettingsModal.tsx`), but an internal IP as a shipped default is a smell: it rotates, and a
  fresh install points at a host that only exists on one network. An empty default plus a settings
  preset would be the cleaner shape.
