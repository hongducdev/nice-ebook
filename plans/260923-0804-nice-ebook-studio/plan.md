---
title: NiceEbook Studio Implementation Plan
description: >-
  Implementation roadmap for NiceEbook Studio: a lightweight, high-performance
  desktop application for AI-assisted EPUB styling with LinguaGacha-inspired UI,
  offline Jev Decision Plane, and 9router auto-discovery.
status: in-progress
priority: P1
branch: main
tags:
  - desktop
  - tauri
  - rust
  - react
  - tailwind
  - epub
  - ai
  - 9router
  - jev
blockedBy: []
blocks: []
created: '2026-09-23T01:04:53.530Z'
createdBy: 'ck:plan'
source: skill
---

# NiceEbook Studio Implementation Plan

## Overview
NiceEbook Studio is a modern, ultra-lightweight (< 20MB installer, < 60MB RAM) desktop application designed for automated ebook styling and typography enhancement. It delivers a LinguaGacha-class aesthetic, an offline System-1 Jev Decision Plane for zero-API-key heuristic genre/style inference, automatic local discovery of 9router/Cockpit AI proxies, and live EPUB preview with instantaneous CSS hot-reloading.

## Architecture Highlights
- **Shell & Core:** Tauri v2 (Rust) providing native Windows/macOS webview, low memory footprint, and native speed.
- **Frontend UI:** React 19, Vite, Tailwind CSS v4, shadcn/ui, Lucide Icons, and CodeMirror 6.
- **Offline Intelligence (Jev Core):** Deterministic lexical classifier in Rust analyzing structural properties (dialogue ratios, poetry, vocabulary) to infer genre and styling rules with zero network calls and zero API keys.
- **Local AI Auto-Discovery:** Async loopback scanning for 9router (`20128`, `8000`, `3000`), Cockpit tools (`5000`, `8080`), and local runners (Ollama, LM Studio).
- **EPUB Engine:** Robust parsing, spine CSS injection, and repackaging adhering strictly to EPUB 3/2 specifications.

## Phases

| Phase | Name | Status | Effort |
|---|---|---|---|
| 1 | [Scaffolding and Setup](./phase-01-scaffolding-and-setup.md) | Completed | 2h |
| 2 | [Rust Core and Jev Engine](./phase-02-rust-core-and-jev-engine.md) | Completed | 4h |
| 3 | [LinguaGacha UI and Styling](./phase-03-linguagacha-ui-and-styling.md) | Pending | 4h |
| 4 | [EPUB Preview and CSS Hot Reload](./phase-04-epub-preview-and-css-hot-reload.md) | Pending | 3h |
| 5 | [AI Gateway and 9Router Auto-Discovery](./phase-05-ai-gateway-and-9router-auto-discovery.md) | Pending | 3h |
| 6 | [EPUB Export and Verification](./phase-06-epub-export-and-verification.md) | Pending | 2h |

## Dependencies
- Prerequisites: Node.js (v20+), Rust toolchain (`cargo`, `rustc`), Windows C++ Build Tools / WebView2.
- Local gateway detection targets: 9router / Cockpit / Ollama (optional at runtime; app gracefully falls back to Jev Core).
