---
phase: 2
title: Rust Core and Jev Engine
status: completed
priority: P1
effort: 4h
dependencies:
  - '1'
---

# Phase 2: Rust Core and Jev Engine

## Overview
Implement the high-performance Rust backend engines: EPUB unpacker/parser, Jev System-1 Decision Plane (zero-key offline heuristic classifier), and async loopback port scanner for local gateways (9router, Cockpit, Ollama).

## Requirements
- Functional:
  - `epub_engine`: Read `.epub` files (ZIP container), parse `META-INF/container.xml`, extract `.opf` metadata, manifest, and spine items.
  - `jev_core`: Scan first 3-5 chapters of text content, compute dialogue ratio, paragraph cadence, chapter title patterns, and lexical keywords to output structured genre/style probabilities (`Wuxia`, `LightNovel`, `SciFi`, `Classic`, `Modern`).
  - `gateway_scanner`: Probe local loopback ports concurrently (`20128`, `8000`, `3000`, `5000`, `8080`, `11434`) using lightweight HTTP client to detect active AI endpoints.
- Non-functional:
  - Execution speed: Jev classification < 10ms for a 1MB EPUB.
  - Port scanner timeout: 150ms per port, non-blocking async execution.

## Architecture
```
src-tauri/src/
├── main.rs                 # Tauri app entry & command handlers
├── lib.rs                  # Module exports
├── epub/
│   ├── mod.rs              # EPUB abstraction
│   ├── parser.rs           # OPF / XML / XHTML parser
│   └── writer.rs           # EPUB repacker
├── jev/
│   ├── mod.rs              # System-1 classifier interface
│   ├── heuristics.rs       # Dialogue, punctuation, keyword weights
│   └── presets.rs          # Preset rule mappings
└── scanner/
    └── mod.rs              # Async 9router/Cockpit prober
```

## Related Code Files
- Modify: `src-tauri/Cargo.toml` (add `zip`, `quick-xml`, `reqwest`, `serde`, `serde_json`, `tokio`, `regex`)
- Create:
  - `src-tauri/src/epub/mod.rs`
  - `src-tauri/src/epub/parser.rs`
  - `src-tauri/src/jev/mod.rs`
  - `src-tauri/src/jev/heuristics.rs`
  - `src-tauri/src/scanner/mod.rs`

## Implementation Steps
1. Add dependencies in `Cargo.toml`.
2. Implement `EpubReader` struct in `src-tauri/src/epub/parser.rs` with methods to list chapters, extract raw text, and extract spine documents.
3. Build `JevClassifier` in `src-tauri/src/jev/heuristics.rs` measuring dialogue punctuation, formatting indicators, and vocabulary dictionaries.
4. Implement `scan_local_gateways` async command in `src-tauri/src/scanner/mod.rs` checking `http://127.0.0.1:{port}/v1/models` or root ping.
5. Expose Tauri IPC commands: `read_epub_meta`, `classify_epub_jev`, `scan_ai_gateways`.
6. Add unit tests for EPUB parsing and Jev classification.

## Success Criteria
- [ ] Sample EPUB loads and extracts metadata + chapters in < 50ms.
- [ ] Jev classifier accurately identifies genre and returns styling recommendations without any network access.
- [ ] Gateway scanner detects running 9router / Ollama instance in < 300ms.
