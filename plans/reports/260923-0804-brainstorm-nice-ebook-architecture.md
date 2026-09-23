# Brainstorming Report: NiceEbook Studio Architecture

**Date:** 2026-09-23  
**Status:** Approved by User  
**Outcome:** Tauri v2 + React 19 + Rust Core (Jev Decision Engine + 9router/Cockpit Auto-detect)

---

## 1. Problem Statement & Requirements
- Build desktop app using AI to auto-classify and style ebooks (EPUB format).
- UI aesthetic: Inspired by LinguaGacha (modern dark/light theme, dual pane, sidebar, status bar).
- AI Capabilities:
  - Custom AI endpoints (OpenAI-compatible, Claude, Gemini, DeepSeek).
  - Auto-detection for local AI proxies: 9router (port 20128/8000), Cockpit tools (5000/8080), Ollama (11434).
  - Jev Core integration: Zero API key requirement via System-1 heuristic & rule-based classifier.
- Non-functional requirements:
  - Maximize speed (< 0.5s cold start, instant EPUB parsing).
  - Minimize binary footprint (< 20MB installer) and RAM (< 60MB).

---

## 2. Evaluated Approaches

| Architecture | Pros | Cons | Verdict |
|---|---|---|---|
| **Electron (LinguaGacha stack)** | 100% direct code reuse from LinguaGacha | Heavy binary (150MB+), high RAM (300-500MB), slow cold start | **Rejected** (fails user requirement on size & speed) |
| **Wails v3 (Go + Web)** | Light binary (~20MB), low RAM (~50MB) | Smaller desktop ecosystem, weaker multi-window & native integrations | **Alternative** |
| **Tauri v2 (Rust + Web)** | Minimal binary (~12MB), tiny RAM (~35MB), native webview, Rust CPU speed, rich plugin ecosystem | Requires Rust toolchain | **Selected (Winner)** |

---

## 3. Final Recommended Solution
- **Frontend:** React 19, Vite, Tailwind CSS v4, shadcn/ui, Lucide React, CodeMirror 6, Epub.js.
- **Backend Shell:** Tauri v2 (Rust).
- **Core Modules:**
  - `epub_engine`: Native ZIP + XML parser/repacker using Rust `zip` and `quick-xml`.
  - `jev_core`: System-1 offline classifier executing lexical heuristics for instant genre and style inference.
  - `gateway_scanner`: Async loopback prober detecting 9router, Cockpit, Ollama, LM Studio.
  - `ai_client`: Streaming SSE HTTP client connecting to detected gateway or custom cloud LLMs.

---

## 4. Implementation Considerations & Risks
- **EPUB Specification Validity:** Output EPUB must pass EpubCheck (MIMETYPE first, uncompressed, correct OPF manifest).
- **Local Port Scanning Permissions:** Scanning loopback (`127.0.0.1`) requires non-blocking async requests with short timeouts (100ms) to avoid UI freezing.
- **CSS Scope in EPUB:** Certain e-readers (Kindle mobi vs Kobo vs Apple Books) handle CSS differently; master presets must use universally supported CSS subsets with vendor fallbacks.

---

## 5. Success Metrics & Validation Criteria
- App installer size < 20MB.
- Idling RAM < 60MB.
- Cold start to interactive UI < 500ms.
- 100% functionality of style recommendation when offline (Zero API key / Jev Core).
- Auto-connection to 9router within 300ms if 9router is running locally.
- Exported EPUB opens cleanly in Calibre, Apple Books, and Kindle Previewer.

---

## 6. Next Steps
1. User prompt to initiate Implementation Planning (`/ck:plan`).
2. Scaffold Tauri v2 + React 19 project structure.
3. Implement Rust core modules (`jev_core`, `gateway_scanner`, `epub_engine`).
4. Build LinguaGacha-inspired UI components.
