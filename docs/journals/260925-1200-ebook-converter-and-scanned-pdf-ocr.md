---
title: Ebook Converter & Scanned PDF OCR Tool Implementation
date: '2026-09-25T12:00:00.000Z'
tags:
  - converter
  - pdf
  - epub
  - ocr
  - tesseract
  - ai-vision
  - rust
---

## Ebook Converter & Scanned PDF OCR Tool Implementation

## Summary
Successfully implemented a complete Ebook Conversion system for NiceEbook Studio with specialized support for **PDF to EPUB** (both Digital Text PDF and Scanned Image PDF with OCR), as well as TXT and Markdown to EPUB.

## Key Changes
1. **Rust Core EPUB Builder (`src-tauri/src/epub/writer.rs`, `lib.rs`)**:
   - Implemented `create_new_epub` command taking chapters, CSS, metadata, and optional cover image.
   - Generates 100% standards-compliant EPUB 3 archives with uncompressed `mimetype` first, `container.xml`, `content.opf`, `nav.xhtml`, `toc.ncx`, and valid XHTML spine chapters.
   - Tested and verified round-trip compatibility with `EpubParser::parse_bytes`.

2. **Digital PDF & Document Extraction (`src/services/converter/`)**:
   - `digitalPdfExtractor.ts`: Coordinates `pdfjs-dist` text item extraction with geometric layout sorting (Y-descending, X-ascending).
   - `scanDetector.ts`: Evaluates text density to detect whether a PDF is digital text or a scanned image (<50 chars/page or >75% empty pages).
   - `textCleaner.ts`: Removes recurring running headers and footers across pages, merges line wraps, and de-hyphenates split words (`tự-\nđộng` -> `tự động`).
   - `txtMarkdownExtractor.ts`: Parses YAML frontmatter, extracts titles, and splits chapters.

3. **Scanned PDF & OCR Tool (`ocrWorkerEngine.ts`, `ocrPostProcessor.ts`, `aiService.ts`)**:
   - High-DPI canvas rasterization (2.0x DPI scale target).
   - Dual OCR Engines:
     - Local offline Web Worker Tesseract.js (Vietnamese, English, Chinese, Japanese) with per-page progress stream (0%-100%) and abort signal.
     - AI Vision OCR via configured AI Gateway multi-modal endpoints (GPT-4o, Gemini, Qwen-VL).
   - Vietnamese diacritic repair and OCR noise cleaning (removing speckles, fixing separated accents).

4. **UI & Studio Integration (`ConverterView.tsx`, `Sidebar.tsx`, `BookDropzone.tsx`, `App.tsx`)**:
   - 3-step workflow: Upload & Inspection -> OCR Workspace with side-by-side scanned page preview & editable text -> Preview & Generate EPUB.
   - Added "Chuyển Đổi Ebook" tab to LinguaGacha sidebar.
   - Seamless Drag & Drop routing for `.pdf`, `.txt`, `.md` files.
   - One-click "Nạp Vào Studio Làm Đẹp": immediately loads newly created EPUB into reader & triggers Jev Core styling.

## Verification
- 19 Rust unit tests pass (`cargo test`).
- 83 Vitest unit tests pass (`npm test`).
- Production build clean (`npm run build` completed in 844ms with worker bundling).
- E2E conversion tests verify both digital PDF and scanned PDF detection and extraction.
