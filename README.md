<div align="center">

# 📚 NiceEbook Studio

**Next-Generation Desktop Studio for AI-Assisted EPUB Styling, Translation & OCR Conversion.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue.svg?logo=tauri)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg?logo=react)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584.svg?logo=rust)](https://www.rust-lang.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg?logo=tailwindcss)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Tests-Vitest-6E9F18.svg?logo=vitest)](https://vitest.dev/)

*Crafted with high-performance native Rust core and a sleek, modern desktop UI inspired by LinguaGacha.*

---

[Key Features](#-key-features) •
[System Architecture](#-system-architecture) •
[Workflow Pipelines](#-workflow-pipelines) •
[Style Presets](#-style-preset-catalog) •
[Installation & Setup](#-getting-started) •
[Development & Testing](#-development--testing) •
[License](#-license)

</div>

---

## 🌟 Overview

**NiceEbook Studio** is an all-in-one desktop application designed for digital book readers, creators, and translators. It solves the friction of ugly formatting, untranslated foreign web novels, and scanned PDF ebooks.

Powered by **Tauri v2** and **Rust**, NiceEbook Studio boots in under half a second, runs with a minimal RAM footprint (~35MB), and operates completely offline for core styling tasks—while seamlessly unlocking cutting-edge Large Language Models when connected to local or cloud AI gateways.

---

## ⚡ Key Features

### 1. 🧠 System-1 Jev Decision Plane (Zero API Key Required)
- **100% Offline Classification:** Fast, deterministic heuristic engine implemented in native Rust (< 5ms execution).
- **Structural & Lexical Heuristics:** Analyzes dialogue ratio (quotes, em-dashes, corner brackets), quotation block density, and vocabulary patterns.
- **Instant Preset Recommendation:** Automatically maps novel genres (Wuxia, Sci-Fi, Light Novel, Classic Literature) to master CSS stylesheets without querying any external cloud API.

### 2. 🌐 AI Book Translation Engine
- **Surgical XHTML Preservation:** Translates literary content while meticulously preserving EPUB DOM structure, chapter landmarks, ruby tags, and HTML attributes.
- **Smart Language Detection:** Automatically identifies source languages (Chinese, Japanese, Korean, English, French, etc.) with pirate-site watermark stripping.
- **Entity Extraction & Auto-Glossary:** Generates contextual research briefs and terminology glossaries for character names, martial arts techniques, and world-building terms.
- **Bilingual & Monolingual Modes:** Read parallel source and translated text, or replace directly into target language with translated chapter navigation.

### 3. 🔍 Scanned PDF OCR & Format Converter
- **Auto-Detection for Scanned PDFs:** Computes character density and blank/image page ratios to reliably detect scanned books.
- **Dual OCR Engine:**
  - **Local Offline OCR:** In-browser Tesseract.js Web Worker supporting Vietnamese and English with zero network dependency.
  - **Multimodal AI Vision OCR:** Extracts complex pages using Vision LLMs (GPT-4o, Gemini 2.0 / 1.5 Pro, Qwen-VL).
- **Layout Reconstruction:** Coordinate sorting, de-hyphenation, running header/footer stripping, and Vietnamese diacritic repair.
- **1-Click Studio Integration:** Instantly converts PDF, TXT, and Markdown files into standards-compliant EPUB 3 archives and loads them directly into the reader.

### 4. 🔌 Auto-Discovering AI Gateway
- **Loopback Auto-Probing:** Scans `127.0.0.1` upon startup for local models and proxies:
  - `20128` (9router default)
  - `11434` (Ollama)
  - `1234` (LM Studio)
  - `8000` / `3000` / `5000` (Cockpit / Custom endpoints)
- **Universal OpenAI-Compatible API:** Connect to OpenAI, Anthropic (via proxy), Google Gemini, DeepSeek, or custom servers.
- **Resilient Circuit Breaker:** Exponential backoff, timeout handling, and failure tripwires prevent UI freezes during network instability.

### 5. 🤖 Interactive Book Chat Agent
- **Slide-out Assistant Drawer:** Inquire about characters, plot points, lore summaries, or writing styles from the active book.
- **Agent Tools with Guardrails:** Safe execution gates for inspection, styling, and navigation with clear confirmation dialogs.
- **Context-Aware Ingestion:** Automatically injects current chapter text, book metadata, and reading progress into the conversation.

### 6. 🛡️ JEV Security & Reliability Guardrails
- **Pre-Commit Secret Scrubber:** Automatically scrubs leaked API keys and bearer tokens prior to git commits.
- **Network Circuit Breaker:** Halts cascading retries and alerts users when gateway connections degrade.
- **XHTML/HTML Sanitizer:** Neutralizes malicious scripts or dangerous tags from unverified community EPUBs before previewing in the reader.

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        NICE-EBOOK STUDIO (UI)                          │
│             React 19 • Tailwind CSS v4 • Lucide • CodeMirror 6         │
├───────────────────┬────────────────────────────┬───────────────────────┤
│   Sidebar         │   Control & Styling Deck   │   Live EPUB Preview   │
│   - Library Shelf │   - Jev Heuristics Trigger │   - Sandboxed Iframe  │
│   - Presets       │   - Typography Controls    │   - Real-time CSS Hot │
│   - AI Gateway    │   - AI Translation Panel   │     Reloading (CSSOM) │
│   - EPUB Export   │   - Scanned PDF OCR Deck   │   - Page Flipping &   │
│   - Chat Agent    │   - Metadata & Cover Search│     TOC Navigation    │
├───────────────────┴────────────────────────────┴───────────────────────┤
│ Status Bar: [9Router: Online (20128)] [Jev: Heuristics] [Circuit: Safe]│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Tauri IPC Commands & Events
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         TAURI V2 (RUST BACKEND)                        │
├─────────────────┬──────────────────┬─────────────────┬─────────────────┤
│   epub_engine   │     jev_core     │  image_engine   │   port_scanner  │
│   (zip / xml /  │   (Heuristics &  │  (AI Cover Img  │ (Loopback Probe │
│   dom / writer) │   CSS Generator) │   Generation)   │   & AI Client)  │
└─────────────────┴──────────────────┴─────────────────┴─────────────────┘
```

---

## 🔄 Workflow Pipelines

NiceEbook Studio includes an **Ingest Workflow Router** that inspects each uploaded document and automatically selects the optimal processing pipeline:

| Workflow | Input Type | Actions Executed |
|:---|:---|:---|
| **Polish** (`polish`) | Native EPUB (target language) | CSS styling injection, drop-caps, font embedding, clean formatting |
| **Translate** (`translate`) | Native EPUB (foreign language) | Chapter translation, entity extraction, auto-glossary, bilingual reading |
| **OCR** (`ocr`) | Scanned PDF (target language) | Text density check, Tesseract / Vision AI OCR, diacritic repair, EPUB generation |
| **OCR + Translate** (`ocr-translate`) | Scanned PDF (foreign language) | Vision OCR, EPUB assembly, multi-stage language translation pipeline |
| **Convert** (`convert`) | Digital PDF, TXT, Markdown | Clean layout extraction, TOC structure generation, EPUB 3 compilation |
| **Convert + Translate** (`convert-translate`) | Digital PDF, TXT (foreign) | Clean text extraction, structural conversion, and AI chapter translation |

---

## 🎨 Style Preset Catalog

Transform plain ebooks into exquisite, immersive reading editions:

- 📜 **Wuxia / Xianxia (Tiên Hiệp - Cổ Phong):** Warm parchment backgrounds, cinnabar chapter seals, classical Asian typography, elegant divider rules.
- 🌸 **Light Novel (Anime Aesthetic):** Crisp sans-serif fonts, relaxed line-height (1.75), distinctive quote bubbles, optimized for high readability.
- ⚡ **Cyberpunk / Dark Sci-Fi:** Deep OLED black theme, neon mint accents, monospace telemetry headers, sharp geometric chapter dividers.
- 🏛️ **Classic Literature:** European hardcover styling, elegant serif typography (Baskerville/Garamond), ornate drop-caps, balanced justification.
- 🌿 **Modern Minimalist:** Distraction-free typography, subtle margins, optimized for e-ink reading comfort.

---

## 💻 Tech Stack

| Domain | Technology | Purpose |
|:---|:---|:---|
| **Desktop Shell** | [Tauri v2](https://tauri.app/) (Rust) | Native OS WebView, ~12MB binary, ~35MB RAM footprint |
| **Frontend Framework** | [React 19](https://react.dev/) + [Vite 6](https://vitejs.dev/) | Reactive UI state, modern React compiler support |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) + Lucide Icons | Pixel-perfect aesthetic, dark/light theme, seamless transitions |
| **EPUB Preview** | Sandboxed Iframe + DOM parser | 1:1 e-reader rendering, real-time CSS hot injection |
| **Code / CSS Editor** | [CodeMirror 6](https://codemirror.net/) | Syntax highlighting for custom styles and prompt templates |
| **Ebook Processing** | Rust (`zip`, `quick-xml`) | Blazing fast parallel ZIP unbundling, XML DOM repair, EPUB 3 writing |
| **OCR Engine** | Tesseract.js & Multimodal AI Vision | Local offline and cloud AI document character recognition |
| **State Management** | [Zustand 5](https://zustand-demo.pmnd.rs/) | Lightweight, decoupled global application state |

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:

1. **Node.js** (v18.x or v20.x+) and `npm`
2. **Rust & Cargo** (1.78+ recommended):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
3. **Platform Dependencies for Tauri v2**:
   - **Windows:** Microsoft Visual Studio C++ Build Tools & WebView2 (preinstalled on Windows 10/11).
   - **macOS:** Xcode Command Line Tools: `xcode-select --install`.
   - **Linux (Debian/Ubuntu):**
     ```bash
     sudo apt update && sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libglib2.0-dev
     ```

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/hongducdev/nice-ebook.git
   cd nice-ebook
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Run in development mode (with Tauri desktop shell):**
   ```bash
   npm run tauri dev
   ```

   *Alternatively, run frontend-only preview in your browser:*
   ```bash
   npm run dev
   ```

---

## 🧪 Development & Testing

### Running Tests

Run the full automated test suite (frontend unit & service tests):
```bash
npm run test
```

Run Rust core unit tests:
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

### Type Checking & Secret Verification

```bash
# Verify TypeScript types and build
npm run build

# Run pre-commit secret scrubber check
npm run check:secrets
```

### Packaging / Production Build

Compile native installer binaries for your current operating system:
```bash
npm run tauri build
```
The compiled installers (MSI / EXE on Windows, DMG / App on macOS, DEB / AppImage on Linux) will be output in `src-tauri/target/release/bundle/`.

---

## 🤝 Contributing

Contributions, issues, and feature suggestions are welcome!

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feat/amazing-feature`).
3. Commit your Changes (`git commit -m 'feat: add some amazing feature'`).
4. Push to the Branch (`git push origin feat/amazing-feature`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more details.

---

<div align="center">

Crafted with ❤️ by [hongducdev](https://github.com/hongducdev)

</div>
