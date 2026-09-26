---
title: Ebook Converter & Scanned PDF OCR Tool
description: >-
  Implementation roadmap for Ebook Conversion in NiceEbook Studio,
  specifically PDF to EPUB conversion with digital text extraction,
  automatic scanned PDF detection, local Tesseract Web Worker OCR,
  and AI Vision OCR with seamless Studio integration.
status: completed
priority: P1
branch: main
tags:
  - desktop
  - tauri
  - rust
  - react
  - pdf
  - epub
  - ocr
  - tesseract
  - ai-vision
blockedBy: []
blocks: []
created: '2026-09-25T12:00:00.000Z'
createdBy: 'ck:cook'
source: skill
---

## Ebook Converter & Scanned PDF OCR Tool Implementation Plan

## Overview
Expand NiceEbook Studio with a comprehensive ebook conversion engine, specializing in **PDF to EPUB** (as well as TXT and Markdown to EPUB). The engine automatically classifies whether an uploaded PDF has selectable digital text or is a scanned image PDF. For scanned PDFs, it provides a dedicated OCR tool featuring both **Local Tesseract.js (offline, zero-key, multi-language with Vietnamese & English)** running in a Web Worker, and **AI Vision OCR** leveraging existing local/remote AI gateways.

## Staged Architecture

### Phase 1: Rust EPUB 3 Builder & Digital Conversion Engine
- **Rust EPUB 3 Generator (`src-tauri/src/epub/writer.rs`, `lib.rs`)**:
  - `create_new_epub` command taking title, author, language, chapters HTML, CSS, cover.
  - Strict EPUB 3/2 compliance: uncompressed `mimetype` first, `META-INF/container.xml`, `content.opf`, `toc.ncx`, `nav.xhtml`, and valid XHTML spine documents.
  - Returns raw bytes `Vec<u8>` or writes directly to file.
- **Digital Text & PDF Extractor (`src/services/converter/`)**:
  - TXT & Markdown parser with chapter marker detection (`Chương`, `Chapter`, `# Heading`, etc.).
  - Digital PDF text extractor using `pdfjs-dist` (with explicit Vite worker URL).
  - Running header/footer removal across pages (eliminating repeating page numbers, book titles).
  - Line-merge & de-hyphenation (`tự-\ndo` -> `tự do`).
  - Unit tests with mock & fixture data.

### Phase 2: Scanned PDF Detection & Local Web Worker OCR Pipeline
- **Scanned PDF Classification**:
  - Inspects page text layers. If average characters/page < 50 or > 80% pages have empty text layer, classify as `Scanned PDF`.
  - Display clear warning & guidance for scanned documents.
- **Local Tesseract.js OCR Worker**:
  - Offload CPU-heavy OCR to Web Worker (`tesseract.js`).
  - Render PDF pages to high-DPI HTML5 canvas (200-250 DPI target).
  - Multi-language support: `vie` (Tiếng Việt), `eng` (English), `vie+eng`, `chi_sim`, `jpn`.
  - Per-page recognition progress stream (0% - 100%).
  - OCR post-processing: remove noise artifacts, repair Vietnamese diacritics, join line wraps.
  - Page-range selection (`1-10`, `custom`, `all`) to avoid memory pressure on large scans.

### Phase 3: AI Vision OCR & LinguaGacha Converter UI
- **AI Vision OCR**:
  - For complex or degraded scans, use configured AI Gateway / OpenCode vision models (`gpt-4o`, `gemini`, `qwen-vl`, `llava`).
  - Sends high-res page image with specialized OCR & markdown formatting prompt.
- **Converter UI & Workflow (`ConverterView.tsx`)**:
  - 3-step workflow: Upload & Inspection -> OCR / Chapter Review -> Generate & Export.
  - Side-by-side verification: Scanned page preview on left, recognized/editable text on right.
  - One-click **"Nạp vào Studio"**: loads newly generated EPUB directly into reader & Jev Core styling.
  - One-click **"Lưu file EPUB"**: export to local disk.
  - Sidebar navigation item & Drag & Drop routing for `.pdf`, `.txt`, `.md` files.

## Phases

| Phase | Name | Status | Effort |
|---|---|---|---|
| 1 | [Rust EPUB Builder and Digital Converter](./phase-01-rust-epub-builder-and-text-converter.md) | Completed | 2h |
| 2 | [Scanned PDF Detection and Local OCR](./phase-02-scanned-pdf-detector-and-tesseract-ocr.md) | Completed | 2h |
| 3 | [AI Vision OCR and Converter UI](./phase-03-ai-vision-ocr-and-studio-ui-integration.md) | Completed | 2h |
