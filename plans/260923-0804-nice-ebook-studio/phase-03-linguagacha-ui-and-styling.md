---
phase: 3
title: LinguaGacha UI and Styling
status: completed
priority: P1
effort: 4h
dependencies:
  - '1'
---

# Phase 3: LinguaGacha UI and Styling

## Overview
Develop the user interface heavily inspired by LinguaGacha: sidebar navigation, master book list, style preset gallery, real-time status bar, and customizable control panels with dark/light themes.

## Requirements
- Functional:
  - Sidebar: Navigation items (Books, Presets, AI Models, Settings).
  - Main Panel: Split-screen interface with collapsible control panels.
  - Style Preset Cards: Visual cards showing preview of Wuxia, Light Novel, Sci-Fi, Classic, and Custom CSS.
  - Status Bar: Real-time badge indicators for active local AI (9router / Cockpit / Offline Jev), current memory, and task status.
  - Toast Notifications: Sonner toast for operations (file loaded, style applied, export ready).
- Non-functional:
  - Responsive layout down to 1024px width.
  - Smooth 60fps animations for panels and tab transitions.

## Architecture
```
src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── StatusBar.tsx
│   ├── books/
│   │   ├── BookDropzone.tsx
│   │   └── BookMetaView.tsx
│   ├── styles/
│   │   ├── PresetGallery.tsx
│   │   ├── TypographyControls.tsx
│   │   └── CssEditor.tsx
│   └── settings/
│       └── ProviderConfigModal.tsx
└── stores/
    └── useAppStore.ts       # Zustand or lightweight state manager
```

## Related Code Files
- Create:
  - `src/stores/useAppStore.ts`
  - `src/components/layout/Sidebar.tsx`
  - `src/components/layout/StatusBar.tsx`
  - `src/components/books/BookDropzone.tsx`
  - `src/components/styles/PresetGallery.tsx`
  - `src/components/styles/TypographyControls.tsx`
  - `src/presets/styles.ts`

## Implementation Steps
1. Setup state management (`zustand`) holding current book, active style preset, detected AI gateways, and UI status.
2. Build `Sidebar.tsx` featuring LinguaGacha-style icon navigation, active indicator pill, and app logo.
3. Build `BookDropzone.tsx` supporting native file drag-and-drop (`.epub`).
4. Build `PresetGallery.tsx` displaying rich cards with font samples, color swatches, and genre tags.
5. Build `StatusBar.tsx` showing connection badges (`● 9Router: Active`, `● Jev: Offline Ready`) and progress meters.
6. Connect theme toggle (Dark / Light) with persistent user preference.

## Success Criteria
- [ ] UI layout matches LinguaGacha aesthetic fidelity with high polish.
- [ ] Dragging and dropping an EPUB triggers Tauri file read and updates metadata view.
- [ ] Selecting different presets updates the active style state reactively.
