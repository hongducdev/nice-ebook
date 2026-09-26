---
title: Phase 3 - AI Vision OCR and Converter UI Integration
description: >-
  Implement AI Vision OCR with Gateway/OpenCode models, build LinguaGacha-styled
  ConverterView, and integrate with Sidebar navigation and Dropzone routing.
status: completed
priority: P1
branch: main
tags:
  - ai-vision
  - react
  - ui
  - navigation
  - studio-integration
blockedBy:
  - phase-02-scanned-pdf-detector-and-tesseract-ocr.md
blocks: []
created: '2026-09-25T12:00:00.000Z'
createdBy: 'ck:cook'
source: skill
---

## Phase 3: AI Vision OCR and Converter UI Integration

### Objectives
1. Implement AI Vision OCR method in `AiService` (`extractTextFromPageVision`):
   - Accepts base64 canvas image data URL.
   - Formulates specialized prompt for high-fidelity OCR, typography structure, and dialogue reconstruction.
   - Compatible with any Vision-capable endpoint (OpenAI, 9router, Ollama, OpenCode).
2. Build `src/components/converter/ConverterView.tsx`:
   - Step 1: File dropzone & inspection dashboard (scanned vs digital badge, page count, metadata).
   - Step 2: Interactive review & OCR workspace:
     - Scanned page image preview on left.
     - Live OCR recognition progress bar.
     - Editable extracted text editor on right.
     - Page range selector (`1-10`, `custom`, `all`).
     - Engine toggle: Local Tesseract (offline) vs AI Vision.
   - Step 3: Chapter generation preview & export:
     - "Nạp vào Studio": loads EPUB into store, switches to reader & Jev Core styling.
     - "Lưu file EPUB": saves directly to disk.
     - "Xuất TXT/MD": downloads extracted text.
3. Integrate with `Sidebar.tsx` navigation and `BookDropzone.tsx` & `App.tsx` drag-and-drop routing.
4. Run full test suite (`npm test`, `cargo test`, `npm run build`).

### Deliverables
- `src/components/converter/ConverterView.tsx` & subcomponents.
- `src/services/aiService.ts` vision OCR expansion.
- `src/stores/useAppStore.ts` converter state hooks.
- `src/components/layout/Sidebar.tsx` navigation entry.
- `src/components/books/BookDropzone.tsx` & `src/App.tsx` drop routing.
