# Technical Journal: Brainstorming & Planning NiceEbook Studio

**Date:** 2026-09-23  
**Author:** AI Technical Advisor & Architect  
**Session Focus:** System Architecture, Tech Stack Selection, and Implementation Planning  

---

## 1. Key Decisions Made
- **Desktop Engine Selection:** Selected **Tauri v2 (Rust + Native WebView)** over Electron and Wails. Electron was rejected due to heavy bundle size (150MB+) and high memory usage (300-500MB RAM), while Tauri satisfies user constraints for < 20MB installer and < 60MB RAM footprint.
- **Frontend Framework:** Chosen **React 19 + Vite + Tailwind CSS v4 + shadcn/ui**, directly adopting LinguaGacha's aesthetic design language (dark/light themes, sleek sidebar, dual-pane editor/reader layout).
- **Zero API Key Intelligence (Jev Decision Plane):** Integrated an offline System-1 deterministic heuristic classifier in Rust into the core. It infers ebook genres (Wuxia, Sci-Fi, Romance, Classic, Light Novel) and styling rules via dialogue ratios, paragraph cadence, and vocabulary without needing network or API keys.
- **Local AI Auto-Discovery:** Implemented background loopback async port scanning for **9router** (port 20128/8000/3000), **Cockpit tools** (5000/8080), and **Ollama/LM Studio** (11434/1234) for zero-config free AI enhancement.
- **EPUB Engine:** Built on Rust `zip` and `quick-xml` for sub-100ms parsing and repackaging, compliant with EPUB 3/2 specifications.

---

## 2. Artifacts Created
- `docs/system-architecture.md`: Master architectural blueprint.
- `plans/reports/260923-0804-brainstorm-nice-ebook-architecture.md`: Brainstorming analysis and comparison report.
- `plans/260923-0804-nice-ebook-studio/plan.md`: Official implementation plan scaffolded via ClaudeKit CLI (`ck plan create`).
- `plans/260923-0804-nice-ebook-studio/phase-01-scaffolding-and-setup.md`
- `plans/260923-0804-nice-ebook-studio/phase-02-rust-core-and-jev-engine.md`
- `plans/260923-0804-nice-ebook-studio/phase-03-linguagacha-ui-and-styling.md`
- `plans/260923-0804-nice-ebook-studio/phase-04-epub-preview-and-css-hot-reload.md`
- `plans/260923-0804-nice-ebook-studio/phase-05-ai-gateway-and-9router-auto-discovery.md`
- `plans/260923-0804-nice-ebook-studio/phase-06-epub-export-and-verification.md`

---

## 3. Next Steps
- Execute Phase 1: Initialize Tauri v2 + React 19 + Tailwind v4 workspace (`/ck:cook`).
