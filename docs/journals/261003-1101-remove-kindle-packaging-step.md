# Technical Journal: Loại Bỏ Bước 6 "Gói Kindle & Xuất Bản"

**Thời gian:** 2026-10-03 11:01
**Yêu cầu:** "loại bỏ bước 6 gói kindle và xuất bản" — chọn phương án **B: xóa hẳn tính năng**, chạy `--auto --review`.
**Phạm vi:** `src/components/kindle`, `src/services/kindle`, `src/services/translation`, `src/stores/useAppStore.ts`, `src/components/{export,preview,agent,layout}`, `src/utils/{cssGenerator,htmlSanitizer,bookTypeDetector}`, `src/types/{navigation,workflow}`, `src-tauri/src/{lib.rs,kindle}`, `src-tauri/{Cargo.toml,tauri.conf.json}`, `package.json`, `README.md`.

---

## 1. Bối cảnh & Vấn đề

Quy trình Ebook trong sidebar đang có 6 bước (sau khi gộp "Thư viện phong cách" vào "Định kiểu"):

`1. Nạp & Chuyển đổi → 2. Dịch thuật AI → 3. Biên tập & Soát lỗi → 4. Định kiểu & Kiểu chữ → 5. Đọc thử & Kiểm tra → 6. Gói Kindle & Xuất bản`

Người dùng muốn bỏ bước 6. Đây **không phải một sửa lỗi** mà là xóa một tính năng xuyên suốt nhiều tầng, nên bước scout phải trả lời trước hai câu: (a) bước 6 gồm những gì, (b) có thứ gì *khác* đang phụ thuộc vào code của nó không.

## 2. Chẩn Đoán Phạm Vi (dependency map)

Bề mặt tính năng: mục sidebar → tab `kindle` → `KindleCompanionView` (Word Wise / X-Ray / SDR) → `services/kindle/*` → 4 lệnh Rust (`export_kindle_book`, `export_kindle_sdr`, `kindle_engine_info`, `convert_epub_to_kindle`) → crate `epub3-kindle` + `rusqlite`.

Hai phụ thuộc **không thuộc Kindle** đã bị phát hiện và phải xử lý riêng:

1. **`xrayService.ts` chứa heuristic dùng chung cho luồng dịch thuật.** `EntityExtractor.extractCandidates` (glossary & tên riêng, `src/services/translation/entityExtractor.ts`) và `extractBookEntities` trong store đều gọi `extractXRayHeuristic` + type `ChapterTextSource`. Xóa thẳng thư mục Kindle sẽ **âm thầm làm hỏng chất lượng trích xuất glossary** — người dùng không yêu cầu điều đó. Cờ `isExtractingEntities` cũng vậy: nó thuộc luồng dịch thuật, không phải X-Ray.
2. **`export_epub` + `EpubWriter` có tham số `extra_chapters` chung** (chèn chương mới vào manifest/spine/NCX/nav). Nó *được tạo ra* cho phụ lục X-Ray nhưng bản thân là năng lực writer chung, nên được giữ.

Kiểm tra bổ sung trước khi xóa:

- `src-tauri/capabilities/default.json` chỉ có `core:default`/`opener:default`/`dialog:default` ⇒ không có allowlist lệnh nào cần gỡ.
- Store không dùng middleware `persist` (localStorage) ⇒ không cần `migrate`/`version` cho `xrayData`/`wordWiseSettings`.
- `rusqlite` và `epub3-kindle` chỉ được dùng bởi module `kindle` ⇒ gỡ được khỏi `Cargo.toml`.
- `presets` (đợt refactor trước) vẫn nằm trong `ActiveTab` kèm redirect trong `App.tsx` ⇒ giữ nguyên, không đụng.

## 3. Thay Đổi

| # | Thay đổi | File |
| --- | --- | --- |
| 1 | Di chuyển heuristic sang module trung lập: `extractEntityCandidates` / `mapEntityOccurrences` / `ChapterTextSource` / `EntityCandidate` (đổi tên khỏi "X-Ray"), hành vi giữ nguyên | **mới** `src/services/translation/entityHeuristic.ts` |
| 2 | Trỏ lại import heuristic; cập nhật chú thích | `entityExtractor.ts`, `entityExtractor.test.ts` |
| 3 | Xóa toàn bộ tính năng Kindle ở frontend | **xóa** `src/components/kindle/KindleCompanionView.tsx`, `src/services/kindle/{xrayService,wordWiseService,wordWiseDict,kindleExportService}.ts` + 3 file test |
| 4 | Bỏ state/actions Kindle trong store (interface + initial state + ~164 dòng impl + wiring agent ctx) | `src/stores/useAppStore.ts` |
| 5 | Bỏ tab `kindle`: union `ActiveTab`, mục sidebar "6. Gói Kindle & Xuất bản", import + route | `src/types/navigation.ts`, `Sidebar.tsx`, `App.tsx` |
| 6 | ExportModal viết lại thành **EPUB-only**: bỏ chế độ mặc định "Bản Kindle", AZW3/MOBI, toggle Word Wise/X-Ray, panel readiness + sửa link/TOC + cảnh báo converter. Nút "Xuất bản" ở titlebar vẫn gọi `export_epub` như cũ | `src/components/export/ExportModal.tsx` |
| 7 | Reader: bỏ ngăn kéo X-Ray, nút bật/tắt, memo lọc thực thể theo chương và 2 nút "Mở Kindle Companion Studio" | `src/components/preview/EpubReaderViewer.tsx` |
| 8 | Agent: bỏ tool `extract_xray_entities` (định nghĩa/đề xuất/thực thi), `xrayData` khỏi `ReadOnlyStoreContext`, `"kindle"` khỏi 2 enum tab, dòng prompt X-Ray, quick-action `kindle:`, panel "Kindle X-Ray Extraction Active" + prop `isExtractingEntities`; thu hẹp `export_book` còn `["epub"]` | `agentTools.ts` (+test), `agentService.ts`, `ActionProposalCard.tsx`, `AgentActiveTaskMonitor.tsx` (+test), `BookAgentDrawer.tsx` |
| 9 | Bỏ `"kindle_xray"` khỏi `WorkflowJobType`; test dùng `"export"` | `src/types/workflow.ts`, `workflowJobService.test.ts` |
| 10 | Bỏ 2 khối CSS Word Wise; bỏ `KINDLE_BLOCKED_ELEMENTS`/`BLOCKED_ELEMENTS` (giữ `READER_BLOCKED_ELEMENTS`); sửa mô tả bước "xuất EPUB / Kindle" | `cssGenerator.ts`, `htmlSanitizer.ts`, `bookTypeDetector.ts` |
| 11 | Test: bỏ test parity Step‑7 của `KindleCompanionView`; Sidebar test còn **9 mục (8 tab + agent)** | `translator-ui-polish.test.tsx`, `Sidebar.test.tsx` |
| 12 | Gỡ `pub mod kindle`, 4 lệnh + đăng ký handler, `use kindle::{...}` | `src-tauri/src/lib.rs` |
| 13 | Xóa module Rust + integration test thủ công | **xóa** `src-tauri/src/kindle/*` (8 file), `src-tauri/tests/realistic_kindle_book.rs` |
| 14 | Gỡ dependency `epub3-kindle`, `rusqlite` (Cargo.lock cập nhật); giữ `extra_chapters` nhưng đổi fixture test khỏi tên Kindle (`xray_appendix.xhtml` → `extra_chapter.xhtml`, "Dramatis Personae" → "Phu Luc Nhan Vat") | `Cargo.toml`, `epub/writer.rs` |
| 15 | Cập nhật mô tả/README: bỏ mục Kindle, đánh số lại, sửa sơ đồ kiến trúc + bảng tech stack (bỏ dòng `rusqlite`) | `package.json`, `Cargo.toml`, `tauri.conf.json`, `README.md` |
| 16 | Test hồi quy mới cho heuristic đã di chuyển | **mới** `src/services/translation/entityHeuristic.test.ts` |

**Ghi chú thiết kế:** giữ `extra_chapters` là chủ ý — nó là cơ chế để `export_epub` vẫn ghi được chương mới (và để dự án cũ còn `xray_appendix.xhtml` tiếp tục render/hiển thị bình thường), test cũ cho năng lực này vẫn xanh.

> **Lưu ý về working tree:** các file `PresetGallery.tsx` (đã xóa), `TypographyControls.tsx`, `aiService.ts`/`aiService.test.ts`, `BookView.tsx`, `useAppStore.test.ts`, `ebookStyling.ts`/`ebookStyling.test.ts` **đã ở trạng thái modified/untracked từ trước** (đợt gộp "Thư viện phong cách" → "Định kiểu" của phiên trước), không thuộc thay đổi này.

## 4. Kiểm Chứng

| Cổng | Kết quả |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm test` | **47 files, 541 tests pass** (0 fail) |
| `cargo test` (toàn bộ target, chạy trong target dir riêng) | lib **45 pass / 0 fail**, main 0, `book_style_analysis` 1 ignored (manual gate) |
| `cargo check --all-targets` | sạch, không warning |
| `npm run build` (`tsc && vite build`) | thành công |
| Grep hậu kiểm | 0 tham chiếu tới module/lệnh đã xóa (`xrayData`, `wordWise*`, `buildKindleEdition`, `KINDLE_BLOCKED_ELEMENTS`, `export_kindle_*`, `convert_epub_to_kindle`, `epub3-kindle`, `rusqlite`…). Chỉ còn các nhắc "Kindle" mang tính ngữ cảnh: ghi chú Send‑to‑Kindle trong ExportModal, nhãn khung thiết bị "(iPhone / Kindle)" ở reader, regex cắt đuôi tên file `.mobi/.azw3` khi tìm metadata, và hướng dẫn tương thích CSS e-reader. |

Số liệu file test khớp: HEAD có **48** file test; working tree có 2 file test mới chưa track (`ebookStyling.test.ts` từ phiên trước + `entityHeuristic.test.ts` của đợt này) ⇒ baseline hiệu dụng 49; sau khi xóa 3 file test Kindle và thêm 1 file mới ⇒ **47** (đúng như `npm test` báo).

Test hồi quy mới: trích tên theo honorific (`Mr. Dursley`) và dialogue attribution (`said Watson`); chặn stop-word thật sự (chuỗi "The garden" lặp **2 lần** nên chỉ bộ lọc stop-word mới loại được — không phải test tautology); giữ nguyên `occurrencesCount`/`excerpts` phục vụ dịch thuật; cap số ứng viên; `mapEntityOccurrences` đếm đúng theo chương.

## 5. Bài Học

1. **"Xóa một bước UI" hiếm khi chỉ là xóa một dòng menu.** Trước khi xóa phải grep *biểu tượng* chứ không chỉ *từ khóa*: `xrayService` là nơi chứa heuristic dùng chung cho dịch thuật, còn `export_epub`/`EpubWriter` dùng chung tham số `extra_chapters`. Nếu xóa thẳng, tính năng dịch vẫn "chạy" nhưng glossary mất khả năng trích xuất — lỗi câm.
2. **Stateless bằng chứng:** đếm file test phải lấy từ `git ls-tree HEAD` thay vì tự suy luận, vì working tree có sẵn file test chưa track từ phiên khác.
3. **File đang bị khóa vẫn kiểm chứng được:** ứng dụng dev đang chạy giữ `nice-ebook.exe` ⇒ `cargo test` báo `Access is denied`. Giải pháp không cần tắt app: chạy `cargo test` trong `CARGO_TARGET_DIR` riêng, rồi xóa thư mục đó để không để lại GB rác.
4. **Tên riêng bị giới hạn bởi regex sẵn có:** heuristic chỉ khớp `[A-Z][a-z]+`, nên "McGonagall" chỉ ra "Mc" và bị loại (`length > 2`). Đây là *hành vi hiện hữu*, không phải lỗi mới; test phải khóa hành vi thật (`Watson`, `Dursley`) chứ không khóa kỳ vọng chủ quan.
5. **Xóa tính năng cũng cần "prevention":** giữ test exhaustiveness của Sidebar (assert đúng 9 mục) để một mục điều hướng không còn màn hình tương ứng sẽ đỏ ngay, thay vì lặng lẽ trỏ vào tab chết.
