# Phase 1 — Book Profile Detector & Ingest Routing

**Mục tiêu:** mọi đường nạp sách đi qua một hàm nhận diện duy nhất, và kết quả nhận diện được dùng để định tuyến + thông báo cho người dùng.

**Thời lượng ước tính:** 1 phiên làm việc.

---

## 1.1. Tạo `src/utils/bookTypeDetector.ts`

Hàm thuần, không phụ thuộc React/store.

```ts
import { EpubMetadata } from "../stores/useAppStore";       // hoặc type-only import để tránh vòng lặp
import { LanguageDetector, LanguageDetectionResult } from "./languageDetector";
import { detectBookWatermarks } from "./watermarkCleaner";

export type IngestKind = "epub" | "pdf-digital" | "pdf-scanned" | "txt" | "md";
export type BookWorkflow =
  | "translate" | "polish" | "ocr" | "ocr-translate" | "convert" | "convert-translate";

export interface BookProfile { /* như plan.md §3.2 */ }

export function detectBookProfile(
  meta: EpubMetadata | null,
  ctx: { kind?: IngestKind; sourceName?: string | null; hasWatermarkHint?: boolean } = {}
): BookProfile | null
```

Nội dung:

1. `meta === null` → trả `null`.
2. `kind` mặc định `"epub"`.
3. Ngôn ngữ:
   - Dựng `sample` = `meta.sample_text` nếu đủ dài, ngược lại ghép `title + description + 3 chapter.preview_text` đầu.
   - `const det = LanguageDetector.detectLanguage(sample, meta.language)`.
   - `det.source === "metadata"` và không có heuristic → `confidence = 0.7`, `detectionSource: "metadata"`.
   - Không detect được gì (`det` fallback `"en"` với confidence thấp) → `detectionSource: "unknown"`, `autoRoutable: false`.
4. Watermark: `detectBookWatermarks(meta.chapters)` → `report.hasWatermarks`.
5. `workflow`:
   ```
   const isVi = languageCode === "vi";
   const conv = kind !== "epub";
   const ocr  = kind === "pdf-scanned";
   workflow =
     ocr  && !isVi ? "ocr-translate" :
     ocr  &&  isVi ? "ocr" :
     conv && !isVi ? "convert-translate" :
     conv &&  isVi ? "convert" :
     !isVi          ? "translate" : "polish";
   ```
6. `autoRoutable`: `languageConfidence >= 0.75 || detectionSource === "metadata"` **và** `detectionSource !== "unknown"`.
7. `reasons`: mảng chuỗi tiếng Việt, ví dụ
   - `"Ngôn ngữ nhận diện: Tiếng Anh (English) — độ tin cậy 89%"`
   - `"Phát hiện bản scan (không có lớp văn bản) — cần OCR"`
   - `"Phát hiện watermark nguồn trong 12/40 chương"`
8. `buildWorkflowSteps(profile): WorkflowStep[]` — hàm thuần dẫn xuất:
   | `hasWatermarks` | `kind` | `workflow` | steps |
   |---|---|---|---|
   | + | | | `cleanup` (đầu tiên) |
   | | `pdf-scanned` | | `ocr` |
   | | `pdf-digital`/`txt`/`md` | | `convert` |
   | | | `translate*` | `translate` |
   | | | | `style`, `read` (luôn có ở cuối) |
9. `workflowLabel(profile): string` — nhãn tiếng Việt ngắn để hiện trên chip (`"Dịch thuật"`, `"OCR → Dịch thuật"`, `"Chuyển đổi → Dịch thuật"`).
10. `WORKFLOW_TAB: Record<BookWorkflow, ActiveTab>` — tab mở tự động.
11. `workflowKindFromFile(name, fileType)` — suy `IngestKind` từ tên/kểu file (dùng chung cho `App.tsx` và `ConverterView`), thay vì lặp `endsWith` ở nhiều nơi.

**Bắt buộc:** hàm thuần, không side-effect, không `invoke`, không `localStorage` → test được không cần mock.

## 1.2. Store: state + action (`src/stores/useAppStore.ts`)

Thêm vào `AppState` (khu vực "Book State", sau `isVietnameseBook` ở dòng ~207):

```ts
bookProfile: BookProfile | null;
workflowSource: "auto" | "manual" | null;
workflowCompletedSteps: string[];
dismissedWorkflowFor: string | null;   // khoá nhận diện sách đã bấm "bỏ qua"
autoRouteOnIngest: boolean;
translatedChapters: Record<string, number>;

setAutoRouteOnIngest: (v: boolean) => void;
routeAfterBookLoad: (meta: EpubMetadata, ctx?: { kind?: IngestKind; autoSwitch?: boolean })
  => { profile: BookProfile; tab: ActiveTab } | null;
startRecommendedWorkflow: () => ActiveTab;
markWorkflowStepComplete: (stepId: WorkflowStep["id"]) => void;
dismissWorkflow: () => void;
recomputeProfileLanguage: () => void;
```

Chi tiết:

- `autoRouteOnIngest` khởi tạo từ `localStorage.getItem("lg-auto-route-ingest") !== "false"` (mặc định **true**), setter ghi lại localStorage.
- `routeAfterBookLoad(meta, ctx)`:
  1. `const profile = detectBookProfile(meta, ctx)`; `null` → return `null`.
  2. `set({ bookProfile: profile, workflowSource: get().workflowSource ?? "auto" })`.
  3. Nếu `dismissedWorkflowFor` khác khoá sách mới → reset về `null`.
  4. Nếu người dùng **chưa** chọn quy trình thủ công cho sách này (`workflowSource === "auto"`) và `workflowCompletedSteps` thuộc sách khác → reset `workflowCompletedSteps: []`.
  5. `tab = WORKFLOW_TAB[profile.workflow]`.
  6. Nếu `autoSwitch !== false && get().autoRouteOnIngest && profile.autoRoutable && kind === "epub"`:
     - `setActiveTab(tab)`
     - nếu `tab === "translator"` → gọi `get().autoDetectSourceLanguage()` (đồng bộ, rẻ) và ghi `translationConfig.targetLang = "Tiếng Việt (Vietnamese)"`.
     - toast do **component gọi** hoặc store trả cờ; xem 1.3.
  7. Ghi terminal log: `🧭 [Định tuyến] ...`.
- `startRecommendedWorkflow()`: `set({ workflowSource: "manual" })`, `setActiveTab(WORKFLOW_TAB[...])`, trả về tab.
- `markWorkflowStepComplete(id)`: thêm id (không trùng) vào `workflowCompletedSteps`, đồng thời lưu project đang mở.
- `dismissWorkflow()`: `set({ dismissedWorkflowFor: bookIdentityKey(currentBook) })` với `bookIdentityKey = b => `${b.title}::${b.chapter_count}::${b.file_size_bytes}``.
- `recomputeProfileLanguage()`: chỉ cập nhật `languageCode/languageName/languageConfidence/isVietnamese` khi `workflowSource === "auto"`, tuyệt đối **không** đổi tab.

**Khoá dòng chú ý:** `activeTab` union hiện khai báo trùng ở `useAppStore.ts:185-186` và `Sidebar.tsx:25-26`. Phase này export `export type ActiveTab = ...` từ store và để `Sidebar.tsx` import lại (chỉ đổi khai báo, không đổi logic).

## 1.3. Nối vào các đường nạp sách

| Vị trí | Thay đổi |
|---|---|
| `loadBookFromPath` (`useAppStore.ts:493-534`) | sau `set({...})` và `runJevClassification()`, gọi `get().routeAfterBookLoad(meta, { autoSwitch: true })` |
| `loadBookFromBytes` (`useAppStore.ts:537-570`) | tương tự |
| `openProject` (`useAppStore.ts:1418+`) | gọi `get().routeAfterBookLoad(meta, { autoSwitch: false })` — vẫn `setActiveTab("books")` như cũ |
| `updateBookMetadata` (`~useAppStore.ts:1200-1215`) | gọi `get().recomputeProfileLanguage()` sau khi cập nhật `isVietnameseBook` |
| `ConverterView.handleLoadIntoStudio` (`ConverterView.tsx:812-873`) | **bỏ** `setActiveTab("books")`; để `loadBookFromBytes` tự định tuyến rồi `setActiveTab` theo `WORKFLOW_TAB[profile.workflow]` |
| `App.tsx` drag & drop (`App.tsx:62-72`) | **bỏ** `setActiveTab("books")` sau khi `loadBookFromPath` thành công (store đã lo); thêm toast "Ở lại thư viện" |
| `App.tsx` drag & drop nhánh PDF/TXT/MD (`App.tsx:73-85`) | đổi nhãn toast thành `"Đã mở trình chuyển đổi — quy trình: OCR → Dịch thuật"` dựa trên `workflowKindFromFile` |

## 1.4. `src/components/workflow/WorkflowBanner.tsx` (mới)

Props: `{ profile: BookProfile; onStart: () => void; onDismiss: () => void; className?: string }`.

Hiển thị:
- Chip ngôn ngữ: cờ + tên (`SUPPORTED_LANGUAGES_MAP`) + `độ tin cậy {Math.round(confidence*100)}%`.
- Chip quy trình: `workflowLabel(profile)`.
- Dòng `reasons[0]` + danh sách bước dạng `OCR → Dịch thuật → Xuất bản`.
- Nút chính: **"Bắt đầu: {workflowLabel}"** (`onStart`), nút phụ **"Xem lý do"** (mở rộng danh sách `reasons`), nút × **"Bỏ qua"**.
- `role="status"` + `aria-live="polite"`.
- Tái dùng class sẵn có: `card-surface`, `app-badge`, `app-button app-button--primary`. Thêm 1 block CSS mới `.workflow-banner*` trong `globals.css` (~40 dòng) theo đúng spacing/token của file.

Gắn vào:
- `BookView.tsx` — ngay dưới breadcrumb (trước `workbench-page__stats-grid`, ~dòng 404).
- `BookTranslatorView.tsx` — trên cùng panel cấu hình (~dòng 463).
- `ConverterView.tsx` — trên cùng vùng nội dung, chỉ khi `currentBook` khác rỗng.

Điều kiện hiện: `currentBook && bookProfile && dismissedWorkflowFor !== bookIdentityKey(currentBook)`.

## 1.5. Toast định tuyến (trong `App.tsx` + `BookView.tsx`)

Sau `loadBookFromPath`:
```ts
const tab = useAppStore.getState().bookProfile;         // đọc sau khi action chạy
if (profile?.workflow === "translate" && activeTab === "translator") {
  toast.success(`🇬🇧 Đã nhận diện ${profile.languageName} — đã mở Dịch thuật AI`, {
    id: "ingest-route",
    action: { label: "Ở lại thư viện", onClick: () => useAppStore.getState().setActiveTab("books") },
  });
}
```
Nguyên tắc: toast **chỉ mô tả**, không phải cơ chế định tuyến — định tuyến nằm trong store để test được.

## 1.6. Kiểm thử Phase 1

`src/utils/bookTypeDetector.test.ts` (bắt buộc, phủ toàn bộ nhánh):
1. EPUB VI (metadata `vi` + sample có dấu) → `workflow: "polish"`, `autoRoutable: true`, không có bước `translate`.
2. EPUB EN (metadata `en` + sample tiếng Anh) → `"translate"`, `autoRoutable: true`.
3. EPUB không metadata, sample tiếng Nhật (Kana) → `languageCode: "ja"`, `"translate"`.
4. Sample rỗng + metadata rỗng → `detectionSource: "unknown"`, `autoRoutable: false`.
5. `pdf-scanned` + EN → `"ocr-translate"`, steps `[ocr, translate, style, read]`.
6. `pdf-digital` + VI → `"convert"`.
7. `txt` + ZH → `"convert-translate"`.
8. Watermark + EPUB EN → steps bắt đầu bằng `cleanup`.
9. **Đối chiếu**: với 6 fixture đại diện, `profile.isVietnamese === detectIsVietnameseBook(metaFixtures)` — nếu lệch, test ghi rõ ngoại lệ nào được chấp nhận (metadata nói `vi` nhưng text là tiếng Anh) và assert theo `LanguageDetector`.
10. `workflowKindFromFile`: `.PDF` hoa, `sách.md`, `a.txt`, `x.epub`, `unknown.bin`.

`src/stores/useAppStore.test.ts` (bổ sung):
- `loadBookFromPath` với EPUB EN → `activeTab === "translator"` và `translationConfig.sourceLang` chứa `"English"`.
- `loadBookFromPath` với EPUB VI → `activeTab === "books"`.
- `autoRouteOnIngest = false` → EPUB EN vẫn ở `"books"` nhưng `bookProfile.workflow === "translate"`.
- `dismissWorkflow()` → `dismissedWorkflowFor` khớp khoá sách; nạp sách khác → reset `null`.
- `startRecommendedWorkflow()` → `workflowSource === "manual"`; sau đó nạp metadata mới → không đổi tab.

## 1.7. Định nghĩa hoàn thành

- [ ] `bookTypeDetector.ts` + test đầy đủ, xanh.
- [ ] Store có 11 field/action mới, `translatedChapters` khởi tạo `{}`.
- [ ] 5 đường nạp sách + 2 nhánh drag&drop đã nối qua `routeAfterBookLoad`.
- [ ] `WorkflowBanner` hiện được ở BookView/Translator/Converter, bấm × ẩn đúng.
- [ ] Không còn `setActiveTab("books")` cứng trong `App.tsx` nhánh EPUB và trong `handleLoadIntoStudio`.
- [ ] `npm run test` xanh.

---

## Kết quả thực thi

**Trạng thái:** hoàn tất.

| Bằng chứng | Kết quả |
|---|---|
| `npm run test` | toàn bộ 30 file / 326 test PASS (baseline cùng cây: 27 file / 247 test) |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | `built in 878ms` |

### Sai lệch so với kế hoạch

- **Bỏ việc gắn `WorkflowBanner` vào `ConverterView`** (mục 1.4). Banner gắn với *cuốn sách đang mở*;
  converter đang xử lý một *file khác*, nên hiển thị banner ở đó sẽ nói sai về file đang làm.
  Thay bằng `ingest-detect-strip` phạm vi file (Phase 2.5) + nhãn CTA `"Nạp Vào Studio & Dịch Thuật"`.
- **Bỏ bước OCR/convert khỏi `markWorkflowStepComplete`** (mục 2.2). Sau khi OCR, EPUB tạo ra được
  phân loại lại là EPUB nên các bước đó đã ở phía sau quy trình; ghi nhận chúng vào profile mới là
  vô nghĩa. Việc hoàn thành OCR/chuyển đổi được thể hiện bằng progress modal + strip của converter.
- **Thay mini-steps và toggle React của banner bằng `<details>` gốc** — không cần state, chạy được
  trong SSR, nội dung vẫn nằm trong markup cho assistive tech.
- **Tách `WorkflowBannerView` / `BookPipelineStepperView` thuần** khỏi wrapper gắn store. Lý do:
  zustand truyền `getInitialState()` làm `getServerSnapshot`, nên không có jsdom thì component gắn
  store luôn render rỗng. Test render `*View` và thêm `workflow-wiring.test.tsx` (mock `useAppStore`)
  để phủ phần nối store↔View (gate + mapping props).

### Phát hiện ngoài kế hoạch (đã sửa)

- **Lỗi định tuyến thật:** `LanguageDetector` coi "2 ký tự dấu tiếng Việt đầu tiên" là quyết định, nên
  một dòng watermark `Nguồn: truyenfull.vn` đủ để đánh dấu cả sách tiếng Trung là tiếng Việt → bỏ qua
  dịch thuật. Sửa bằng `stripWatermarkTokens()` (thêm vào `watermarkCleaner.ts`) gọi trước khi nhận diện,
  kèm test hồi quy.
- **Dương tính giả watermark:** heuristic "lỗi tách dấu tiếng Việt" khớp cả dấu nháy tiếng Anh (`Mia's`).
  Nay chỉ áp dụng cho sách tiếng Việt; marker thư viện vẫn bắt mọi ngôn ngữ (có fixture chứng minh).
- **Thứ tự khôi phục tiến trình trong `openProject`:** nay gói trong `restoreProjectWorkflow()`
  (định tuyến trước, khôi phục sau) + test round-trip save → close → reopen.
- **Nguồn chân lý cho `translatedChapters`:** `translatedChapters` chỉ được ghi trong
  `translateSingleChapter`; `resetChapterTranslation` và `resetChapterOverrides` xoá tương ứng.
  BookTranslatorView, Sidebar và `batchTranslateChapters` đều đi qua `getTranslationCoverage()`
  (fallback có kiểm soát cho dự án cũ).

### Chưa xác minh

- **Chưa chạy app Tauri thật.** Các kịch bản kiểm tra thủ công chưa được thực thi — kết luận về hành vi
  runtime vẫn là suy luận từ test tĩnh.
- Tương tác click trên banner/stepper không được test ở tầng component (không có DOM); logic tương ứng
  được test ở tầng store.
