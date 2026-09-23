---
phase: 4
title: "EPUB Preview and CSS Hot Reload"
status: pending
priority: P1
effort: "3h"
dependencies: ["2", "3"]
---

# Phase 4: EPUB Preview and CSS Hot Reload

## Overview
Implement an integrated EPUB reader and live previewer with real-time CSS hot-reloading using Epub.js and an embedded CodeMirror 6 editor.

## Requirements
- Functional:
  - Embed Epub.js reading renderer inside an isolated sandboxed container.
  - Page navigation controls (Previous, Next, Chapter Table of Contents, Page Slider).
  - Dynamic CSS injection: updating CSS sliders (line height, margins, font family, drop caps) or typing in CodeMirror hot-reloads the preview without reloading the book.
  - Reader viewing modes: Single page, Spread (two-page), Continuous scroll, Night/Sepia/Paper backgrounds.
- Non-functional:
  - Instant style update latency (< 50ms between slider change and preview render).
  - Smooth chapter transitions and no memory leaks across book reloads.

## Architecture
```
src/components/preview/
├── EpubViewer.tsx         # Epub.js wrapper component
├── ReaderToolbar.tsx      # TOC, pagination, reading mode toggles
├── ReaderTheme.ts         # Base CSS injection engine
└── CodeMirrorCss.tsx      # CodeMirror 6 editor for manual CSS tweaks
```

## Related Code Files
- Install: `epubjs`, `@codemirror/lang-css`, `@uiw/react-codemirror`
- Create:
  - `src/components/preview/EpubViewer.tsx`
  - `src/components/preview/ReaderToolbar.tsx`
  - `src/components/preview/CodeMirrorCss.tsx`
  - `src/utils/cssGenerator.ts`

## Implementation Steps
1. Install `epubjs` and `@uiw/react-codemirror`.
2. Implement `EpubViewer.tsx` rendering chapters extracted via Tauri memory buffer or local blob URL.
3. Hook `rendition.hooks.content` to register custom stylesheet overrides dynamically.
4. Implement `cssGenerator.ts` combining base typography presets with user tweaks (drop-cap glyph, indent, line-height).
5. Build `CodeMirrorCss.tsx` to allow power users to review or edit generated CSS in real time.
6. Verify two-way synchronization: adjusting preset sliders modifies the CSS code in the editor, and editing the CSS code re-renders the reader preview.

## Success Criteria
- [ ] EPUB renders smoothly with functional pagination and TOC.
- [ ] Modifying typography sliders or CSS live-reloads the reader instantly.
- [ ] Drop-cap styles and custom chapter title decorations render accurately.
