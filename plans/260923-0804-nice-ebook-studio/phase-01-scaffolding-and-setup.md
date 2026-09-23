---
phase: 1
title: "Scaffolding and Setup"
status: in-progress
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Scaffolding and Setup

## Overview
Scaffold the Tauri v2 desktop application workspace with React 19, Vite, Tailwind CSS v4, and shadcn/ui components. Configure build pipelines, icons, window configuration, and base theme styling.

## Requirements
- Functional:
  - Initialize Tauri v2 project structure with Rust backend and Vite React frontend.
  - Setup Tailwind CSS v4 with custom dark/light theme variables matching LinguaGacha aesthetics.
  - Configure Tauri window decorations, minimum dimensions (1024x700), transparency/acrylic effects if supported.
- Non-functional:
  - Clean dev build and cold start verification.
  - Development live-reload for both frontend and Tauri commands.

## Architecture
- Root workspace hosting frontend configuration (`package.json`, `vite.config.ts`, `tsconfig.json`).
- `src-tauri/` holding `Cargo.toml`, `tauri.conf.json`, and backend modules.
- Modern React component directory layout with Lucide icon integrations.

## Related Code Files
- Create:
  - `package.json`
  - `vite.config.ts`
  - `tsconfig.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/src/main.rs`
  - `src/main.tsx`
  - `src/App.tsx`
  - `src/styles/globals.css`

## Implementation Steps
1. Initialize Tauri v2 + React Vite template via `npm create tauri-app@latest` or manual structured layout.
2. Install dependencies: `lucide-react`, `clsx`, `tailwind-merge`, `sonner`, `@tailwindcss/vite`.
3. Configure `globals.css` with dark theme palette (deep zinc `#09090b`, muted border `#27272a`, accent violet/indigo `#6366f1`).
4. Setup Tauri window settings in `tauri.conf.json` (title: "NiceEbook Studio", width: 1200, height: 800, minWidth: 960, minHeight: 640).
5. Verify `npm run tauri dev` builds and launches an empty window cleanly.

## Success Criteria
- [ ] Tauri app launches successfully with dev server.
- [ ] Dark theme background and typography render without layout shifts.
- [ ] Baseline memory footprint < 45MB verified in Task Manager.
