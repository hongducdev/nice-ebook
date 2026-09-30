# NiceEbook Studio - System Architecture & Specification

## 1. Problem Statement & Requirements
- **Goal:** Lightweight, high-performance desktop application for automatic AI-assisted ebook styling and beautification (specifically EPUB).
- **UI Paradigm:** LinguaGacha-inspired aesthetic (dark/light theme, dual-pane editor/preview, task manager, live log stream, model selector).
- **Core Requirements:**
  - Fast startup (< 0.5s), minimal RAM (< 60MB), installer < 20MB.
  - Zero-key capability: System-1 Jev Decision Plane (fast heuristic & rule-based classifier) running 100% offline without API key.
  - Auto-discovery: Background scanning for local AI gateways (9router, Cockpit tools, Ollama, LM Studio) on loopback ports.
  - Custom AI Providers: Flexible OpenAI-compatible endpoints, custom headers, models, system prompts.
  - EPUB Engine: Parse, style injection (CSS + fonts + drop caps + scene dividers), live preview, valid EPUB 2/3 repackaging.

## 2. Technology Stack Selection

| Component | Selected Technology | Rationale |
|-----------|--------------------|-----------|
| **Desktop Shell** | **Tauri v2 (Rust)** | Native OS WebView, ~12MB installer, ~35MB RAM, outperforms Electron (150MB+, 400MB RAM). |
| **Frontend Framework** | **React 19 + Vite** | Reuses LinguaGacha component architecture and modern React ecosystem. |
| **Styling & UI Kit** | **Tailwind CSS v4 + shadcn/ui + Lucide** | Pixel-accurate LinguaGacha visual fidelity, dark/light theme, smooth animations. |
| **EPUB Previewer** | **Epub.js + Iframe Sandbox** | 1:1 e-reader rendering fidelity, live CSS hot-reloading. |
| **Code / CSS Editor** | **CodeMirror 6** | Ultra-lightweight, syntax highlighting for CSS and prompts. |
| **Backend Core** | **Rust** | Rayon multi-threading for instant EPUB unzipping, regex parsing, port scanning, SSE client. |

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                 NICE-EBOOK STUDIO (UI)                      │
│        (React 19 + Tailwind v4 + shadcn/ui + Lucide)        │
├─────────────────┬─────────────────────────┬─────────────────┤
│  Sidebar        │  Control & Style Panel  │  Live Preview   │
│  - Books        │  - AI Auto-detect       │  - Epub.js      │
│  - Presets      │  - Custom CSS / Font    │  - Page flip    │
│  - AI Gateway   │  - Typography sliders   │  - Realtime CSS │
├─────────────────┴─────────────────────────┴─────────────────┤
│ Status Bar: [9Router: Online (20128)] [Jev: Heuristics]     │
└──────────────────────────────┬──────────────────────────────┘
                               │ Tauri IPC Commands & Events
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     TAURI V2 (RUST CORE)                    │
├────────────────┬──────────────┬──────────────┬──────────────┤
│  epub_engine   │   jev_core   │ port_scanner │  ai_client   │
│  (zip/xml)     │  (System-1)  │ (9router)    │  (reqwest)   │
└────────────────┴──────────────┴──────────────┴──────────────┘
```

## 4. Subsystems Detail

### A. Jev Core (System-1 Decision Plane - Zero API Key)
- Fast deterministic classifier in Rust (< 5ms execution time).
- Lexical & structural heuristics:
  - Dialogue ratio (detects dialogue punctuation: quotes, em-dashes, corner brackets).
  - Poetry / quotation block density.
  - Vocabulary keyword frequency (Wuxia, Sci-Fi, Romance, Classic, Light Novel).
- Maps classified profile to predefined master CSS presets without contacting cloud services.

### B. Gateway Scanner (9router & Cockpit Auto-Discovery)
- Async port scan on `127.0.0.1` at startup:
  - Ports probed: `20128` (9router default), `8000`, `3000`, `5000` (Cockpit), `8080`, `11434` (Ollama), `1234` (LM Studio).
  - Health check endpoint: `GET /v1/models` or root ping.
  - Auto-selects active provider and notifies UI via Tauri event.

### C. EPUB Processing Engine
- Reads EPUB container (`mimetype`, `META-INF/container.xml`, `.opf` package, `.ncx` / `nav.xhtml`).
- Injects generated CSS and font definitions into spine documents.
- Preserves table of contents, cover image, and metadata.
- Exports standards-compliant EPUB file.
- Provides `create_new_epub` Rust command for instant ground-up EPUB 3 archive construction from raw chapters.

### D. Ebook Converter & Scanned PDF OCR Pipeline
- Ingests PDF, TXT, and Markdown files.
- Automatic Scanned PDF Detection: calculates text character density (< 50 chars/page or > 75% empty pages flags scanned image PDF).
- Digital PDF Extraction: layout coordinate sorting, de-hyphenation, running header/footer removal.
- Scanned PDF OCR Engine:
  - Local Tesseract.js Web Worker (100% offline, zero-cloud, multi-language with Vietnamese & English).
  - AI Vision OCR via configured AI Gateway multi-modal models (GPT-4o, Gemini, Qwen-VL).
  - High-DPI canvas rasterization (2.0x DPI scale).
  - Vietnamese diacritic repair and OCR speckle cleaning.
- 1-click Studio Integration: converts and directly loads new EPUB into NiceEbook Studio reader & Jev styling.

### E. Ingest Workflow Router (Per-Book-Type Pipeline)
- Single classification point for every ingested book: `src/utils/bookTypeDetector.ts` (pure, no I/O).
- Inputs are observations only — origin kind (`epub` | `pdf-digital` | `pdf-scanned` | `txt` | `md`),
  language from `LanguageDetector`, and watermark detection.
- Output is `BookProfile` = observations + exactly one derived `BookWorkflow` enum:
  `polish` | `translate` | `ocr` | `ocr-translate` | `convert` | `convert-translate`.
- Workflow **steps** are never stored; `buildWorkflowSteps(profile)` derives them, so the plan cannot
  drift from the profile. Watermark removal is a *step* (`cleanup`), not a workflow, so a scanned,
  watermarked, foreign PDF has one unambiguous pipeline.
- Language authority: `LanguageDetector` is canonical. Watermark tokens (pirate-site domains and
  Vietnamese promo phrases) are stripped from the detection sample first, because a single
  `Nguồn: truyenfull.vn` footer would otherwise flag a whole Chinese book as Vietnamese and skip
  translation. `detectIsVietnameseBook()` remains only as a fallback when no evidence exists.
- Routing gates, in order: auto-switch requested -> manual choice locked -> user preference off ->
  confidence below threshold -> native Vietnamese -> switch tab. A foreign EPUB opens Dịch thuật AI,
  a scanned PDF opens the converter; `openProject` never hijacks the tab.
- Progress is tracked by *completed step ids* (not an index, which cannot represent branchy pipelines)
  plus `translatedChapters: Record<href, timestamp>` so translation counters are O(1) and never read
  chapter content. Both persist on `EbookProject` as optional fields (old projects need no migration).
- UI surfaces: `WorkflowBanner` + `BookPipelineStepper` (pure `*View` components, store-wired
  wrappers), dynamic sidebar badges, a compact status-bar chip, and a file-scoped detection strip in
  the converter (deliberately separate from the book-scoped banner).

## 5. Style Preset Catalog
1. **Wuxia / Xianxia (Tiên Hiệp - Cổ Phong):** Parchment tones, seal marks, classical header motifs.
2. **Light Novel / Anime Vibe:** Clean sans-serif, relaxed line-height (1.75), distinctive dialogue blocks.
3. **Cyberpunk / Sci-Fi:** OLED Dark theme, neon accents, mono metadata headers, sharp dividers.
4. **Classic Literature:** European hardcover styling, elegant serif typography, ornate drop-caps.
