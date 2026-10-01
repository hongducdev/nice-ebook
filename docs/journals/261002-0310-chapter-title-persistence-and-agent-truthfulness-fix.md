# Technical Journal: Khắc Phục "Báo Thực Thi Thành Công Nhưng Chưa Thực Thi" & 10 Lỗi Từ Code Review

**Thời gian:** 2026-10-02 03:10
**Phạm vi:** `useAppStore`, `agentTools`, `agentService`, `ActionProposalCard`, `MetadataModal`, `aiCoverService`, `bookMetadataService`, `AiCoverTab`, `src-tauri/src/lib.rs`, `docs/system-architecture.md`.

---

## 1. Bối cảnh & Vấn đề

Người dùng báo: **"báo thực thi thành công nhưng chưa thực thi"**. Chat Agent hiển thị `✅ Thực thi thành công` và toast `Đã tự động lưu toàn bộ thay đổi trực tiếp vào file sách!`, nhưng thay đổi không hề xuất hiện sau khi mở lại sách.

Một cuộc code review đối kháng (3 tầng) sau đó phát hiện thêm 10 lỗi, trong đó **5 lỗi do chính bản sửa trước đó gây ra** — bao gồm 2 lỗi nghiêm trọng và 2 regression.

## 2. Chẩn Đoán Nguyên Nhân Gốc Rễ

### A. Tiêu đề chương không được lưu (CRITICAL — đúng lỗi người dùng báo)
Tiêu đề chương **không có trường riêng** trong `EbookProject`; nó nằm trong HTML chương. Cả `openProject` (`loadChaptersFromDb(id) || project.modifiedChapters`) lẫn `EpubParser::extract_title_from_html` đều **đọc lại tiêu đề từ markup** mỗi lần load.

Code cũ trong `updateChapterTitle`:
```ts
const existingHtml = modifiedChapters[target.href];
if (existingHtml) { /* rewrite <h1> */ }   // ← không có nhánh else
```
→ Với chương **chưa từng chỉnh sửa**, `modifiedChapters` rỗng ⇒ không ghi gì ⇒ tiêu đề cũ quay lại khi mở lại, nhưng vẫn báo "đã lưu thành công". Bản sửa trước đó chỉ sửa *thông báo*, không sửa *nguyên nhân*.

### B. Batch dịch trở nên không thể dừng (CRITICAL — regression do bản sửa trước)
`stopTranslation` đặt `translationAbortController = null`. Batch dùng optional chaining:
```ts
if (translationAbortController?.signal.aborted) break;   // null ⇒ undefined ⇒ falsy ⇒ KHÔNG break
```
Cộng với việc `translateSingleChapter` bỏ tạo controller khi `isPartOfBatch` ⇒ mọi chương còn lại chạy với `abortSignal: undefined`, và nhánh thành công tự bật lại `isTranslating: true`. Trước bản sửa cũ, mỗi lần retry tạo controller mới nên vẫn dừng được — đây là **hồi quy**.

### C. `$`/HTML injection khi đổi tiêu đề (đã tái hiện được)
```ts
existingHtml.replace(h1Regex, `<h1$1>${trimmed}</h1>`)
```
`String.replace` khai triển `$&`, `$1`, `` $` ``, `$'` **bên trong chuỗi thay thế**. Tái hiện bằng Node:
```text
input:  <h1 class="t">Old Title</h1>
title:  "Phan $1 va $& ket thuc"
output: <h1 class="t">Phan  class="t" va <h1 class="t">Old Title</h1> ket thuc</h1>
```
Và `<script>` được ghi thẳng vào EPUB.

### D. Hủy tạo bìa AI là no-op
`GenerateCoverRequest.signal` được khai báo nhưng `generateCoverImage` **không hề đọc**. Nút "Hủy" hủy một signal không ai lắng nghe ⇒ request vẫn hoàn tất và bắn toast **"Đã tạo ảnh bìa AI thành công!"** *sau* toast "Đã hủy".

### E. Font trong studio gắn chữ không hề được nạp
Picker mời `Cinzel / Playfair Display / Montserrat / Dancing Script / Times New Roman`, nhưng `index.html` chỉ nạp `Be Vietnam Pro, Literata, Lora, Merriweather, Inter, JetBrains Mono` (+ Geist local). ⇒ 4/5 lựa chọn render giống hệt nhau qua fallback Georgia, trong khi **các font app thực sự có lại không được mời**. Kèm theo: không có test nào chạy nhánh `enabled: true`, và test font cũ chỉ kiểm tra chuỗi *có chứa* tên font (tautology) nên không bắt được lỗi này.

### F. Bypass chính sách host trong Rust (rò khóa API)
```rust
|| host.starts_with("127.")
```
Đây là so khớp **tiền tố chuỗi trên hostname**. WHATWG chỉ chuyển IPv4 literal *hoàn chỉnh* thành IP, nên `127.0.0.1.attacker.example` vẫn là **domain** ⇒ qua cổng kiểm tra ⇒ nhánh HTTP không ghim DNS ⇒ gửi `Authorization: Bearer <key>` **dạng plaintext tới host từ xa tuỳ ý**. Ngoài ra `is_link_local()` nằm trong danh sách *cho phép* ⇒ `http://169.254.169.254` (cloud metadata) được chấp nhận.

### G. Các lỗi còn lại
- `batch_translate_chapters` dùng `void ctx.batchTranslateChapters(...)` (fire-and-forget) ⇒ thẻ báo "Đã thực thi" và EPUB được export lại khi chương vẫn đang dịch.
- `ActionProposalCard.isActive` dùng cờ **toàn cục** `isTranslating` ⇒ mọi thẻ dịch cũ bật lại "Đang thực thi..." khi có bất kỳ bản dịch nào chạy, và thẻ `pending` cũ mất nút Chấp nhận/Bỏ qua.
- `MetadataModal` ghi đè toàn bộ form khi `currentBook` đổi ⇒ mất chữ đang nhập, sau đó debounce ghi đè giá trị cũ.
- `move saving`: lỗi ghi file vẫn báo toast thành công; `save_project` hứa ghi file ngay cả khi sách mở từ bộ nhớ; một hành động export EPUB 2–3 lần; alias rỗng `""` xóa trường metadata; `presetAliases["constructor"]` trả về `Object` qua prototype chain.

## 3. Thay Đổi

| # | Sửa | File |
| --- | --- | --- |
| 1 | `updateChapterTitle`/`batchUpdateChapterTitles` thành `async`, **đọc HTML chương** rồi rewrite heading đúng thứ tự parser (`<h1>`→`<h2>`→`<title>`, chèn `<h1>` nếu trống), ghi vào `modifiedChapters` + DB dự án + EPUB; trả về `boolean`/`number` để agent báo cáo trung thực | `useAppStore.ts` |
| 2 | Escape `& < > "` + dùng **callback** thay template string | `useAppStore.ts` |
| 3 | Batch giữ **controller cục bộ**, truyền `abortSignal` xuống từng chương; không bật lại `isTranslating` sau abort | `useAppStore.ts` |
| 4 | `generateCoverImage` tôn trọng `signal` (kiểm tra trước và sau mỗi `await`), luồn xuống `fetchCoverDataUrl`/`callImageApi` | `aiCoverService.ts`, `bookMetadataService.ts` |
| 5 | `batch_translate_chapters` **await** thay vì fire-and-forget | `agentTools.ts` |
| 6 | `isActive` chỉ cho `pending`/`executing` + đối chiếu `chapterIndex` | `ActionProposalCard.tsx` |
| 7 | Snapshot + chỉ đồng bộ trường chưa bị người dùng sửa; refresh snapshot sau khi lưu | `MetadataModal.tsx` |
| 8 | 5 font thực sự được nạp + `document.fonts.load()` trước khi vẽ | `aiCoverService.ts`, `AiCoverTab.tsx` |
| 9 | Kiểm tra host trên **địa chỉ đã parse**; loại bỏ link-local; cap phản hồi 64 MB | `src-tauri/src/lib.rs` |
| 10 | Lỗi ghi file → toast cảnh báo; `save_project` tự lưu và báo kết quả thật; alias `""` = "không cung cấp"; `hasOwnProperty.call`; validate `presetId` với `STYLE_PRESETS` | `agentTools.ts`, `useAppStore.ts` |

**Ghi chú thiết kế quan trọng:** không bao giờ tạo `modifiedChapters[href]` mà không đọc chương — giá trị đó là **toàn bộ tài liệu chương**, nên một giá trị phỏng đoán sẽ xóa thân chương.

## 4. Kiểm Chứng

| Cổng | Kết quả |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm test` | **48 files, 586 tests pass** (trước: 565 — thêm 21 test hồi quy) |
| `cargo test` | **86 pass** (trước: 82 — thêm 4 test SSRF) |
| `npm run build` | thành công |

Test hồi quy mới bao gồm: lưu tiêu đề trên chương chưa từng sửa; fallback `<h2>`; chèn `<h1>`; `$&`/`$1`/`$$` giữ nguyên và `class="t"` không bị nhân đôi; `<script>` bị escape; báo lỗi khi không đọc được chương; không bật lại `isTranslating` sau abort; signal được truyền đúng; từ chối `presetId` không tồn tại và `"constructor"`; alias rỗng không xóa trường; báo lỗi khi không ghi được EPUB; 5 test chính sách host Rust.

## 5. Bài Học

1. **Sửa thông báo không phải sửa lỗi.** Bản sửa trước chỉ đổi chuỗi kết quả và thêm `throw`, nhưng nguyên nhân là *dữ liệu không được ghi*. Phải truy ngược từ "hiển thị sai" tới "trạng thái sai".
2. **Cờ toàn cục không đủ để gắn một tác vụ nền với một thẻ UI cụ thể** — cần đối chiếu theo định danh (`chapterIndex`).
3. **Test tautology tạo cảm giác an toàn giả.** `expect(css).toContain("Cinzel")` luôn đúng kể cả khi font chưa bao giờ tồn tại. Test phải khẳng định *thuộc tính* (font đầu tiên nằm trong danh sách đã nạp) chứ không phải *chuỗi*.
4. **`String.replace` + template string = lỗi tiềm ẩn với `$`.** Dùng callback khi chuỗi thay thế chứa dữ liệu người dùng.
5. **Kiểm tra bảo mật trên hostname phải parse trước.** `starts_with` là so khớp chuỗi, không phải so khớp địa chỉ.
6. **Thay đổi hành vi có chủ đích sẽ làm đỏ test cũ** — cần phân biệt "test mã hóa hành vi sai" (phải sửa test, ví dụ `presetId: "light-novel"` khẳng định false-success) với "hồi quy thật".
