---
title: Phase 2 - Scanned PDF Detection and Local OCR
description: >-
  Implement scan detection heuristics, offload Tesseract.js OCR to Web Worker,
  render high-DPI canvas slices, clean OCR noise, and repair Vietnamese diacritics.
status: completed
priority: P1
branch: main
tags:
  - ocr
  - tesseract
  - web-worker
  - scanned-pdf
  - vietnamese-diacritics
blockedBy:
  - phase-01-rust-epub-builder-and-text-converter.md
blocks:
  - phase-03-ai-vision-ocr-and-studio-ui-integration.md
created: '2026-09-25T12:00:00.000Z'
createdBy: 'ck:cook'
source: skill
---

## Phase 2: Scanned PDF Detection and Local OCR

### Objectives
1. Implement scan detection algorithm:
   - Sample pages from PDF.
   - Calculate characters-per-page ratio and empty text-layer ratio.
   - Flag as scanned image PDF when characters < 50/page or > 80% empty.
2. Build Web Worker Tesseract OCR engine (`src/services/converter/ocrWorkerEngine.ts`):
   - Offload heavy OCR processing to worker.
   - Support `vie`, `eng`, `vie+eng`, `chi_sim`, `jpn`.
   - Stream progress per page (0% to 100%).
3. Canvas rasterization (200-250 DPI target) with memory-safe page recycling.
4. Vietnamese diacritic repair and OCR noise cleaning:
   - Fix split tone marks (`a '` -> `á`, `o ~` -> `õ`).
   - Clean speckles and stray characters.
5. Unit tests for scan detector, diacritic repair, and noise reduction.

### Deliverables
- `src/services/converter/scanDetector.ts` + tests.
- `src/services/converter/ocrWorkerEngine.ts`.
- `src/services/converter/ocrPostProcessor.ts` + tests.
