---
title: Phase 1 - Rust EPUB Builder and Digital Converter
description: >-
  Implement Rust EPUB 3 generator command and digital document conversion
  for TXT, Markdown, and text-based PDFs with running header/footer stripping
  and line-wrap de-hyphenation.
status: completed
priority: P1
branch: main
tags:
  - rust
  - epub
  - pdf
  - text-converter
blockedBy: []
blocks:
  - phase-02-scanned-pdf-detector-and-tesseract-ocr.md
created: '2026-09-25T12:00:00.000Z'
createdBy: 'ck:cook'
source: skill
---

## Phase 1: Rust EPUB Builder and Digital Converter

### Objectives
1. Implement `create_new_epub` in `src-tauri/src/epub/writer.rs` and register it in `src-tauri/src/lib.rs`.
2. Generate valid EPUB 3 archives with `mimetype`, `container.xml`, `content.opf`, `nav.xhtml`, `toc.ncx`, and valid chapter XHTMLs.
3. Add TXT & Markdown parsing to extract chapters and metadata.
4. Add Digital PDF text extraction with `pdfjs-dist`:
   - Group text items into lines and paragraphs.
   - Remove running headers & footers across pages.
   - De-hyphenate words broken by line endings (`tự-\ndo` -> `tự do`).
   - Detect chapter markers (`Chương \d+`, `Chapter \d+`, etc.).
5. Provide comprehensive unit tests for Rust EPUB generation and TypeScript text cleaners.

### Deliverables
- `src-tauri/src/epub/writer.rs`: `create_new_epub` function and unit tests.
- `src-tauri/src/lib.rs`: Tauri command `create_new_epub`.
- `src/services/converter/textCleaner.ts`: Running header/footer removal, de-hyphenation, paragraph reconstructor.
- `src/services/converter/textCleaner.test.ts`: Vitest unit tests.
- `src/services/converter/digitalPdfExtractor.ts`: Extraction logic using `pdfjs-dist`.
- `src/services/converter/txtMarkdownExtractor.ts`: TXT/MD chapter splitter.
