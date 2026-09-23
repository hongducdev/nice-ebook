---
phase: 6
title: EPUB Export and Verification
status: completed
priority: P1
effort: 2h
dependencies:
  - '2'
  - '4'
  - '5'
---

# Phase 6: EPUB Export and Verification

## Overview
Implement EPUB packaging and export in Rust, embedding newly generated stylesheets, embedded fonts, and decorative assets. Verify standards compliance (EpubCheck) and produce production desktop release bundles.

## Requirements
- Functional:
  - Repackage modified EPUB:
    - Inject custom CSS into EPUB manifest (`content.opf`) and link into each XHTML spine file.
    - Embed selected custom web fonts (`.woff2` / `.otf`) if specified.
    - Preserve existing navigation (`toc.ncx` and `nav.xhtml`), images, and metadata.
    - Write uncompressed `mimetype` as the first entry in the ZIP container (strict EPUB spec).
  - Native file save dialog allowing user to choose output location.
  - Export success modal with 1-click "Open in Folder" and "Open with Default Reader".
- Non-functional:
  - Export speed: Complete repacking in < 200ms for standard 2MB-10MB books.
  - Zero corruption: EPUB opens without errors in Apple Books, Calibre, Kobo, and Kindle.

## Architecture
```
src-tauri/src/epub/
├── writer.rs              # EPUB repackager implementing strict ZIP spec
└── validator.rs           # Basic OPF and mimetype sanity checker
```

## Related Code Files
- Modify: `src-tauri/src/epub/writer.rs`
- Create:
  - `src-tauri/src/epub/validator.rs`
  - `src/components/export/ExportModal.tsx`

## Implementation Steps
1. Implement `repackage_epub` command in Rust:
   - Reads original EPUB container.
   - Updates `content.opf` manifest with new CSS/font items.
   - Inserts `<link rel="stylesheet" ...>` into `<head>` of all spine XHTML files.
   - Re-compresses with `mimetype` stored uncompressed at byte offset 38.
2. Build `ExportModal.tsx` in frontend with options (embed fonts, minify CSS, output file name).
3. Connect native file save dialog via Tauri dialog plugin (`@tauri-apps/plugin-dialog`).
4. Validate exported files with sample books against Kindle Previewer and Calibre.
5. Configure Tauri build pipeline (`cargo tauri build`) and verify installer size (< 20MB).

## Success Criteria
- [ ] Exported EPUB file opens cleanly in Apple Books, Kindle, and Calibre with custom styles applied.
- [ ] Packaging completes in under 300ms.
- [ ] Release installer (.exe / .msi) generated with size < 20MB.
