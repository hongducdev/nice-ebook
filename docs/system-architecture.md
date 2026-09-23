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

## 5. Style Preset Catalog
1. **Wuxia / Xianxia (Tiên Hiệp - Cổ Phong):** Parchment tones, seal marks, classical header motifs.
2. **Light Novel / Anime Vibe:** Clean sans-serif, relaxed line-height (1.75), distinctive dialogue blocks.
3. **Cyberpunk / Sci-Fi:** OLED Dark theme, neon accents, mono metadata headers, sharp dividers.
4. **Classic Literature:** European hardcover styling, elegant serif typography, ornate drop-caps.
