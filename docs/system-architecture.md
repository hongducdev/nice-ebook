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

### F. Chat Agent Tool Dispatch (Guardrailed Mutations)
- `AgentToolDispatcher` splits tools into `isMutating: false` (executed automatically inside the
  agent loop) and `isMutating: true` (may only produce an `ActionProposal` that a human must approve).
  Mutating tools are structurally unreachable from the loop.
- **A mutating tool must throw when it did not do the work.** Every branch of
  `executeApprovedAction` verifies its result (boolean / count / non-empty payload) and rejects the
  proposal with a specific reason otherwise. Returning a success string regardless of outcome was
  the original "báo thực thi thành công nhưng chưa thực thi" defect: the user was told a save
  happened when nothing had been written.
- Model output is normalized, never trusted: parameter aliases (`title`/`book_title`/`ten_sach`,
  `chapterIndex`/`chapter` 0- or 1-based) are resolved, an **empty string is treated as "not
  provided"** so a half-filled echo cannot wipe a field, and enum values (`presetId`) are validated
  against `STYLE_PRESETS` via `hasOwnProperty.call` (a bare `obj[key]` lookup resolves
  `"constructor"` through the prototype chain).
- `save_project` owns its own save and reports the *real* outcome; `confirmAgentAction` skips its
  post-action save for that tool so the EPUB is not re-exported twice. A failed
  `autoSaveMetadataToFile` produces a warning toast, never a success toast.
- Long-running tools are **awaited**, not fire-and-forget, so a proposal cannot render as
  "Đã thực thi" while work is still in flight. `ActionProposalCard` only shows the live state for
  `status === "pending"` (or `executing`) and correlates a single-chapter job by `chapterIndex`, so
  historical cards do not flip back to a spinner during an unrelated translation.

### G. Chapter Title Persistence Invariant (easy to regress)
- A chapter title lives **in the chapter HTML**, not in a dedicated field: `EbookProject` stores only
  `modifiedChapters: Record<href, html>`, and both `openProject`
  (`loadChaptersFromDb(id) || project.modifiedChapters`) and `EpubParser::extract_title_from_html`
  re-derive the title from the chapter markup on every load.
- Therefore a retitle is persisted **only** by rewriting the heading inside `modifiedChapters[href]`.
  `updateChapterTitle` / `batchUpdateChapterTitles` read the chapter (via
  `modifiedChapters[href] ?? readChapter`) and rewrite it, then write it back to the project DB and
  the EPUB. Mutating only `currentBook.chapters[i].title` is discarded on the next load.
- Heading precedence must mirror the Rust parser exactly: first **non-empty** of
  `<h1>` → `<h2>` → `<title>`; when none exists an `<h1>` is inserted so the title becomes
  discoverable. Never fabricate an override without reading the chapter - `modifiedChapters[href]`
  is the *whole* chapter document, so a guessed value would delete the chapter body.
- The rewrite uses `String.replace(regex, fn)` with an ES5-style callback and escapes `& < > "`.
  A **template-string replacement is a bug**: `String.replace` expands `$&`, `$1`, `` $` `` and `$'`
  inside a string replacement, which corrupts the output for any title containing `$`, and unescaped
  markup would inject into the exported EPUB. The escape set matches
  `EpubParser::strip_html_tags`' un-escape set so titles round-trip unchanged.

### H. Network Security Policy (Rust commands)
- `call_image_generation_api` (and `call_ai_completion`) allow plaintext HTTP **only** for
  localhost / RFC1918 / RFC6598-CGNAT (Tailscale) targets; public hosts must use HTTPS.
- The host test must operate on a **parsed** address or an exact hostname literal. A string-prefix
  test such as `host.starts_with("127.")` is a security hole: WHATWG only converts a *complete*
  IPv4 literal into an IP, so `127.0.0.1.attacker.example` stays a **domain**, passes the prefix
  test, and receives `Authorization: Bearer <key>` in plaintext over HTTP.
- Link-local (`169.254.0.0/16`, i.e. the cloud metadata range) is deliberately **excluded** from the
  local allowance, matching `fetch_image_as_data_url` / `fetch_external_json`.
- HTTPS endpoints additionally get `validate_safe_image_url` + DNS pinning (all resolved addresses
  checked) to defeat DNS rebinding. Response bodies are read with an explicit byte cap
  (64 MB here, 8 MB / 2 MB for the image and JSON fetchers) so a hostile endpoint cannot exhaust
  memory.

## 5. Style Preset Catalog
1. **Wuxia / Xianxia (Tiên Hiệp - Cổ Phong):** Parchment tones, seal marks, classical header motifs.
2. **Light Novel / Anime Vibe:** Clean sans-serif, relaxed line-height (1.75), distinctive dialogue blocks.
3. **Cyberpunk / Sci-Fi:** OLED Dark theme, neon accents, mono metadata headers, sharp dividers.
4. **Classic Literature:** European hardcover styling, elegant serif typography, ornate drop-caps.
