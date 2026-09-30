# Phase 2 — Pipeline Stepper, Badges & Contextual UI per Workflow

**Mục tiêu:** người dùng luôn thấy mình đang ở bước nào của quy trình, và mỗi màn hình chỉ hiện những gì thuộc quy trình đó.

**Thời lượng ước tính:** 1 phiên làm việc.

---

## 2.1. `src/components/workflow/BookPipelineStepper.tsx` (mới)

Props: `{ profile: BookProfile; completedSteps: string[]; currentIndex?: number; onSelect: (tab: ActiveTab) => void; compact?: boolean }`.

- Gọi `buildWorkflowSteps(profile)` từ `bookTypeDetector.ts` (dẫn xuất, không lưu state).
- Trạng thái mỗi bước: `done` (nằm trong `completedSteps`) / `current` (bước chưa xong đầu tiên) / `pending`.
- Hiển thị số thứ tự, icon lucide (`Trash2` / `ScanText` / `FileOutput` / `Languages` / `Palette` / `BookOpenCheck`), nhãn, tooltip = `description`.
- Bấm bước: `done | current` → nhảy tab; `pending` → hiện `toast.info("Cần hoàn thành bước trước")` nếu bước trước chưa xong, ngược lại cho nhảy.
- `compact` dùng ở `StatusBar`, bản đầy đủ dùng ở đầu `BookView`.
- `role="list"` + `aria-current="step"`.
- CSS: `.pipeline-stepper`, `.pipeline-stepper__item[data-state]` trong `globals.css` (~50 dòng), theo token màu `--primary` / `--muted-foreground` / `--success`.

## 2.2. Ghi nhận hoàn thành bước

| Bước | Ghi ở đâu |
|---|---|
| `cleanup` | `cleanWatermarksInBook()` khi `removedCount > 0` |
| `ocr` | `ConverterView` sau khi OCR xong và người dùng bấm "Nạp vào Studio" |
| `convert` | `ConverterView.handleLoadIntoStudio` (cùng chỗ trên) |
| `translate` | `batchTranslateChapters()` khi tất cả chương đã dịch; `translateSingleChapter` chỉ cập nhật `translatedChapters` |
| `style` | `runAiDeepStyling()` thành công |
| `read` | `EpubReaderViewer` mount lần đầu cho sách đó |

Quy tắc: chỉ đánh dấu `done` khi **toàn bộ** phạm vi sách xong (ví dụ `translate`: `Object.keys(translatedChapters).length >= currentBook.chapter_count`).

## 2.3. `translatedChapters` — đếm chương chưa dịch với chi phí O(1)

- `translateSingleChapter` (`useAppStore.ts:1579-1750`): sau khi `applyTranslations` thành công, `translatedChapters[chapter.href] = <timestamp lấy từ caller>`.
  - **Lưu ý:** `Date.now()` bị chặn trong script workflow nhưng **không** bị chặn trong app; dùng `Date.now()` bình thường ở đây.
- `resetChapterTranslation` (`useAppStore.ts:1884-1896`): xoá `translatedChapters[href]`.
- `resetChapterOverrides` (`:847-855`) và `closeActiveProject` (`:1567`): reset cả `bookProfile`, `workflowCompletedSteps`, `dismissedWorkflowFor`, `translatedChapters`.
- Selector rẻ: `untranslatedCount = currentBook.chapter_count - Object.keys(translatedChapters).length` (min 0).

## 2.4. Badge theo ngữ cảnh ở `Sidebar.tsx`

Hiện `Sidebar` chỉ có `currentBook`, `modifiedChapters`, `activeGateway`. Bổ sung:

| Mục | Badge |
|---|---|
| `translator` | `{untranslatedCount} ch.` (tone `success`) khi `bookProfile?.workflow` là `"translate"`/`"ocr-translate"`/`"convert-translate"`; `"Đã dịch"` (neutral) khi `untranslatedCount === 0` và `translatedChapters` không rỗng |
| `converter` | `"Đang chờ"` (success) khi `pendingConverterFile !== null`, ngược lại `"PDF / OCR"` như cũ |
| `books` | `chapter_count` như cũ + dấu `•` khi `bookProfile?.workflow === "polish"` và có bước chưa xong |
| `reader` | `"Bản dịch"` (success) khi đang bật `mode === "bilingual"` và có chương đã dịch |

Bỏ badge hard-code `"Mới"` ở `translator` (`Sidebar.tsx:110-112`) — nay đã có badge động có ý nghĩa hơn.

## 2.5. Tinh chỉnh UI theo từng quy trình

### `BookView.tsx`
- **Thay stat card "Dung lượng sách"** (`BookView.tsx:418-430`): giữ dung lượng làm giá trị chính, đổi dòng `workbench-page__stat-card-unit` thành `{languageName} · {confidence}%` và thêm chip workflow nhỏ bên dưới.
- **Thêm `<BookPipelineStepper />`** ngay trên `workbench-page__stats-grid` (chỉ khi có `bookProfile`).
- **Command bar**: nút "Dịch Sách AI" (`BookView.tsx:660-668`) được đánh dấu `data-recommended="true"` (viền `--primary`) khi `bookProfile.workflow` kết thúc bằng `translate`; các nút không phải bước kế tiếp hạ xuống kiểu ghost. Không ẩn nút — chỉ đổi độ ưu tiên thị giác.
- **Empty state**: đổi mô tả dropzone thành liệt kê 5 loại được nhận (`EPUB · PDF · PDF scan · TXT · MD`) + câu "Hệ thống sẽ tự nhận diện ngôn ngữ và chọn quy trình phù hợp."

### `BookTranslatorView.tsx`
- Chỉ chạy `autoDetectSourceLanguage()` **một lần** khi vào tab lần đầu cho mỗi sách (dùng `useEffect` + ref khoá theo `bookIdentityKey`) — không chạy lại mỗi render.
- Hiện khối "Ngữ cảnh quy trình" trên panel cấu hình: ngôn ngữ nguồn đã nhận diện, `detectionSource`, chip `workflowLabel`.
- **Không** tự chạy `autoConfigureAllTranslationSettings` (tốn AI) — giữ nguyên nút "Tự động cấu hình tất cả" để người dùng chủ động.
- Khi `untranslatedCount === 0` và đã dịch > 0 chương: hiện banner xanh "Đã dịch xong toàn bộ" + CTA "Đọc bản dịch" / "Xuất EPUB".
- Khi `sourceLang === targetLang`: đã có `isSameLangWarning` (`:380-384`) — nâng lên thành banner chặn ở đầu panel với nút "Đổi chiều dịch".

### `ConverterView.tsx`
- Sau `handleProcessRawFile` (`:219-286`), hiện banner kết quả nhận diện: "PDF scan, ước tính 214 trang · Quy trình đề xuất: OCR → Dịch thuật (tiếng Trung)".
- Nhánh OCR: mặc định `ocrLanguage` suy từ ngôn ngữ nhận diện (`vie+eng` cho VI, `chi_sim+eng` cho ZH, `jpn+eng` cho JA) thay vì luôn `vie+eng`.
- `handleLoadIntoStudio` (`:812-873`): đổi nút thành `"Nạp vào Studio & {bước kế tiếp}"` — ví dụ "Nạp vào Studio & Dịch thuật" khi EPUB tạo ra là ngoại ngữ.

### `StatusBar.tsx`
- Thêm cụm bên trái: stepper thu gọn (`compact`) + nhãn quy trình khi có `bookProfile`.

### `EpubReaderViewer.tsx`
- Khi `translatedChapters[href]` tồn tại: hiện chip "Bản dịch AI" ở header chương.

### `globals.css`
- Thêm `.workflow-banner*`, `.pipeline-stepper*`, `.workflow-context-*` (~120 dòng tổng), chỉ dùng biến CSS sẵn có, hỗ trợ cả `data-theme="light"`.

## 2.6. Kiểm thử Phase 2

- `src/components/workflow/WorkflowBanner.test.tsx`: render với profile translate → có CTA đúng nhãn; bấm CTA gọi `onStart`; bấm × gọi `onDismiss`; `aria-live` có mặt.
- `src/components/workflow/BookPipelineStepper.test.tsx`: với `ocr-translate` → 4 bước đúng thứ tự; bước đã xong có `data-state="done"`; bước hiện tại có `aria-current="step"`; bấm bước `pending` → không gọi `onSelect`.
- `useAppStore.test.ts`: `translateSingleChapter` thêm href vào `translatedChapters`; `resetChapterTranslation` xoá; `untranslatedCount` đúng sau khi dịch 1/3 chương.

## 2.7. Định nghĩa hoàn thành

- [ ] Stepper hiện đúng bước cho cả 6 workflow, bấm nhảy tab được.
- [ ] Badge sidebar phản ánh trạng thái thật, không còn `"Mới"` tĩnh.
- [ ] BookView/Translator/Converter/StatusBar đổi theo `bookProfile`.
- [ ] `translatedChapters` được ghi/xoá đúng chỗ; không đọc nội dung chương để đếm.
- [ ] `npm run test` xanh.

---

**Trạng thái:** hoàn tất. Xem mục "Kết quả thực thi" cuối `phase-01-profile-detector-and-routing.md` để biết sai lệch và phát hiện ngoài kế hoạch.

### Sai lệch riêng của Phase 2

- **2.2 bỏ dòng `ocr` và `convert`.** Sau khi OCR, EPUB tạo ra được phân loại lại là EPUB nên hai bước
  đó đã ở phía sau quy trình; đánh dấu chúng trên profile mới là vô nghĩa (và sẽ khiến stepper hiển thị
  một bước không tồn tại trong kế hoạch). Việc hoàn thành OCR/chuyển đổi được thể hiện bằng progress
  modal + `ingest-detect-strip` của `ConverterView`.
- **2.5 `StatusBar` dùng chip gọn thay vì stepper.** Thanh trạng thái cao 28px; stepper đầy đủ sẽ tràn.
  Chip `Quy trình: X · 2/3` bấm được để nhảy tab.
- **2.6 test component:** không có jsdom/`@testing-library` trong repo, nên chỉ render được component
  thuần bằng `react-dom/server`. Đã tách `*View` và thêm `workflow-wiring.test.tsx`.
- **Thêm `getTranslationCoverage()`** để Sidebar, stepper và BookTranslatorView dùng đúng một định
  nghĩa "đã dịch" (trước đó là ba nơi với hai nghĩa khác nhau).
