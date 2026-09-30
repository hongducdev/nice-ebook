---
title: Auto-Configure Glossary Coverage & Detailed Translation Log
date: '2026-09-30T07:13:10.000Z'
tags:
  - translation
  - glossary
  - proper-names
  - logging
  - zustand
  - ux
---

## Auto-Configure Glossary Coverage & Detailed Translation Log

## Summary

The translator's one-click **Tự Động Thiết Lập Toàn Bộ** used to pin only entities that appeared
`count >= 3` times and already had an AI-proposed translation, so a rare-but-load-bearing proper name
(a one-off "Qing Yuan Peak", an honorific, a late-arriving character) never entered the Glossary and
drifted chapter to chapter. It now pins **every** newly detected entity, split into proper names vs
terminology, and the translation log window grew type filters, search and an auto-scroll toggle so a
long run stays readable.

## Key Changes

1. **`useAppStore.autoConfigureAllTranslationSettings()`** — the seeding rule was replaced:
   - Old: `count >= 3 && !isExistingInGlossary && suggestedTranslation !== name` → silently dropped
     rare entities.
   - New: every candidate with `!isExistingInGlossary` is seeded. The frequency threshold is gone
     entirely; the only reason to skip now is *already present in the user's glossary*.
   - **Identity-pinning is decided by three explicit category branches, never by an `else`.**
     `person` / `place` with no AI proposal → pinned source → source; "keep the original spelling" is a
     valid and consistent policy for a name. `term` with no proposal → **skipped**, because pinning
     `"Spirit Root" => "Spirit Root"` would order the model to emit the English word inside a
     Vietnamese text. An **unknown** category (the AI can emit one through its loose `category` cast)
     with no proposal → also **skipped**, since an unknown entity is far more likely a technique, item
     or organisation than a name, and the same "don't force the source word" reasoning applies. Each
     skip is counted and logged separately, so the policy is observable instead of silent.
   - Note this is not a coverage regression for terms: the old rule
     (`count >= 3 && suggestedTranslation !== name`) also excluded untranslated terms. The change makes
     that existing behaviour explicit, counted and logged rather than accidental.
   - The result object now reports `properNamesCount`, `termsCount`, `addedProperNames`,
     `addedTerms` and `activeEngineLabel`, so the UI never has to re-derive what happened.

2. **Step 0: engine reporting, not engine mutation.** Auto-configure logs which gateway + model will
   actually run the translation (`selectedModel` → `activeGateway.models[0]` → local default) and
   warns when nothing is configured. It deliberately does **not** rewrite the user's global
   `selectedModel` — silently repointing the AI model is a side effect the user did not ask for.

3. **Detailed, observable logs.** Auto-configure now emits a per-step trail: engine line, the pinned
   proper names, the pinned terms, the identity-mapped names, the skipped untranslated terms, a
   `Glossary: quét N · đã có sẵn N · thêm mới N · bỏ qua N` receipt, and a final summary carrying
   tone + language + proper names + terms + engine. Nothing is silently truncated.

4. **`src/components/translation/TranslationLogPanel.tsx` (new, pure)** — extracted from the 1300-line
   `BookTranslatorView` so it can be rendered without a store or jsdom:
   - `filterLogs(logs, filter, search)` and `countLogs(logs)` are pure and separately tested.
   - Filter chips (Tất cả / Thành công / Thông tin / Cảnh báo / Chi tiết) each carry a live count;
     a search box matches case-insensitively across all types; an auto-scroll toggle lets the user
     park the viewport while reading mid-run.
   - Each line gains a `OK / WARN / INFO / ····` badge and the region is `role="log"` with an
     `aria-label`; the copy button now copies *what is visible* and says so.

## Verification

- `npx tsc --noEmit` clean; `npm run build` succeeds.
- `npx vitest run` → 31 files / 337 tests pass (was 30 / 327), including:
  - a store test proving a `count: 1` proper name **is** seeded (would fail under the old
    `count >= 3` rule), that an untranslated *term* and an untranslated *unknown-category* entity are
    **not** identity-pinned while an unknown-category entity *with* a real proposal is seeded, and
    that pre-existing user glossary entries survive untouched;
  - `translation-log-ui.test.tsx` — 10 render/logic tests over `renderToStaticMarkup` covering chip
    counts, type filtering, search filtering, the empty state, the no-match state and the auto-scroll
    label.

## Notes / Follow-ups
- `extractBookEntities` still caps at 25 candidates (`extractCandidates(..., 25)`). "All" currently
  means "all of what the scanner surfaces". Raising the cap also raises AI token cost, so it was left
  alone; a future setting could expose it.
- The auto-config summary now opens the Glossary panel and switches to the terminal tab so the result
  of the run is visible. If that proves intrusive, both are one-line reversals in `handleAutoConfigureAll`.
