---
phase: 5
title: AI Gateway and 9Router Auto-Discovery
status: completed
priority: P1
effort: 3h
dependencies:
  - '2'
  - '3'
  - '4'
---

# Phase 5: AI Gateway and 9Router Auto-Discovery

## Overview
Connect the frontend to Tauri's local gateway discovery service, implement deep styling generation via 9router / Cockpit / Cloud AI providers, and support Server-Sent Events (SSE) streaming for real-time prompt generation.

## Requirements
- Functional:
  - Startup auto-discovery: App triggers `scan_ai_gateways` on launch, reporting found endpoints to the UI.
  - Active Gateway Selector: Allows switching between Auto-Detected (9router/Cockpit), Jev Offline Core, and Custom Cloud endpoints (OpenAI, Claude, Gemini, DeepSeek).
  - AI Deep Redesign action:
    - Extracts book synopsis, table of contents, and sample chapter text.
    - Sends prompt to active AI provider requesting customized CSS theme rules, color schemes, font pairing ideas, and custom chapter header SVG/ornaments.
    - Parses AI response (JSON / CSS) and applies it to the active style state.
  - Streaming token output and log monitor in the status drawer (LinguaGacha style).
- Non-functional:
  - Graceful degradation: If 9router is stopped or connection drops, UI automatically falls back to Jev Core without crashing.
  - Request timeout and abort controller support.

## Architecture
```
src/services/
├── aiService.ts           # Unified AI invocation client
├── providers/
│   ├── jevProvider.ts     # Offline Jev Core invoker
│   ├── localGateway.ts    # 9router / Cockpit / Ollama invoker
│   └── cloudProvider.ts   # Custom OpenAI-compatible invoker
└── prompts/
    └── ebookStyling.ts    # System prompts & few-shot examples
```

## Related Code Files
- Create:
  - `src/services/aiService.ts`
  - `src/services/providers/jevProvider.ts`
  - `src/services/providers/localGateway.ts`
  - `src/services/providers/cloudProvider.ts`
  - `src/services/prompts/ebookStyling.ts`
  - `src/components/settings/GatewaySettingsModal.tsx`

## Implementation Steps
1. Wire `scan_ai_gateways` Tauri command to app initialization lifecycle.
2. Build `GatewaySettingsModal.tsx` enabling manual URL override, custom API key, and model selection.
3. Design structured prompts in `ebookStyling.ts` ensuring LLM outputs strictly parseable JSON/CSS for styling parameters.
4. Implement `aiService.ts` handling request routing, fallback chains, and streaming token updates to the UI log bar.
5. Implement "AI Tinh chỉnh" (AI Deep Style) button in the main control panel.
6. Verify fallback test: disable internet/9router -> verify Jev Core handles styling seamlessly.

## Success Criteria
- [ ] 9router or local gateway is detected on launch and auto-selected.
- [ ] Clicking "AI Deep Style" streams reasoning/output and automatically applies new CSS to the reader.
- [ ] Offline fallback operates with zero errors when no gateway or API key is available.
