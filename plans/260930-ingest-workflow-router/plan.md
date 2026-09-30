---
title: Ingest Workflow Router - Per-Book-Type Pipeline & Contextual UX
description: >-
  Detect the type of every ebook on ingest (EPUB VI / EPUB ngoại ngữ / PDF
  digital / PDF scan / TXT / MD, có hay không watermark) and route the user
  into the correct pipeline automatically, with a workflow banner, pipeline
  stepper and context-aware navigation.
status: completed
priority: P1
branch: main
tags:
  - desktop
  - tauri
  - react
  - workspace
  - translation
  - converter
  - ux
blockedBy: []
blocks: []
created: '2026-09-30T01:35:00.000Z'
createdBy: 'ck:cook'
source: skill
---

# Kế Hoạch: Chuẩn hóa quy trình theo từng loại Ebook (Ingest Workflow Router)

## 1. Vấn đề hiện tại

Khi thả / nạp một file sách, ứng dụng **chỉ phân nhánh theo phần mở rộng file**:

| Đường vào | Hành vi hiện tại | Vấn đề |
|---|---|---|
| `App.tsx:58-105` (drag & drop Tauri) | `.epub` → `books`, `.pdf/.txt/.md` → `converter`, còn lại báo lỗi | Không quan tâm sách tiếng gì |
| `BookView.tsx:104-196` | chỉ nhận `.epub` | PDF/TXT/MD bị từ chối |
| `ConverterView.tsx:812-873` | Xuất EPUB → `loadBookFromBytes` → `setActiveTab("books")` | Sách ngoại ngữ sau OCR/chuyển đổi vẫn bị đẩy vào thư viện thay vì sang Dịch thuật |
| `openProject` (`useAppStore.ts:1418+`) | luôn `activeTab: "books"` | Không gợi ý bước tiếp theo |

- `detectIsVietnameseBook()` (`vietnameseHelper.ts:96`) **đã chạy trên mọi lần nạp** nhưng kết quả chỉ dùng để chọn font và in nhãn ở 1 stat card. Không có quyết định điều hướng nào dựa trên nó.
- `LanguageDetector.detectLanguage()` (`languageDetector.ts:198`) trả về `{languageCode, languageName, confidence, source}` nhưng **chỉ được gọi từ 1 nút bấm tay** trong `BookTranslatorView`.
- Không tồn tại khái niệm "trạng thái quy trình" của một cuốn sách. Chỉ có các boolean tạm thời toàn cục (`isLoadingBook`, `isAnalyzingJev`, `isAiGenerating`).

Hệ quả: người dùng nạp một EPUB tiếng Anh → ứng dụng im lặng → người dùng phải tự đoán là phải vào tab "Dịch thuật AI", tự bấm "Nhận diện tự động", tự bấm "Tự động cấu hình tất cả".

## 2. Mục tiêu

1. **Một điểm quyết định duy nhất**: mọi đường nạp sách đều đi qua `detectBookProfile()` để sinh ra `BookProfile` + `workflow`.
2. **Tự chuyển đúng quy trình**: sách ngoại ngữ → tự mở Dịch thuật AI; PDF scan → OCR; PDF/TXT/MD → chuyển đổi; (có thể tắt bằng preference).
3. **Minh bạch**: banner nói rõ *đã nhận diện được gì*, *độ tin cậy*, *vì sao*, kèm CTA và nút bỏ qua.
4. **Theo dõi tiến trình theo sách**: stepper hiển thị bước đã xong / đang làm / còn lại, bấm để nhảy tab.
5. **Không phá vỡ hành vi cũ**: 247 test hiện tại phải xanh; project cũ (thiếu field mới) phải mở được.

## 3. Thiết kế

### 3.1. Nguồn chân lý: `LanguageDetector`

`LanguageDetector.detectLanguage()` trở thành **nguồn chân lý duy nhất** cho ngôn ngữ.
`detectIsVietnameseBook()` vẫn giữ (12 call site) nhưng chỉ còn là tiện ích tương thích; đề xuất thêm test đối chiếu để đảm bảo hai bên không lệch nhau.

> Ghi chú: `detectIsVietnameseBook` có ngưỡng dễ dãi (chỉ cần `là Vietnamese` ở title **hoặc** description **hoặc** sample_text). `detectBookProfile` dùng `detectLanguage` với điểm tin cậy, nên khi lệch nhau thì profile là bên đúng.

### 3.2. Mô hình dữ liệu (không trùng lặp field)

`BookProfile` **chỉ chứa các sự kiện quan sát được** + một enum workflow. Danh sách bước là **hàm dẫn xuất**, không lưu trong state (tránh 2 nguồn chân lý):

```ts
export type IngestKind = "epub" | "pdf-digital" | "pdf-scanned" | "txt" | "md";
export type BookWorkflow =
  | "translate"          // EPUB ngoại ngữ
  | "polish"             // EPUB tiếng Việt
  | "ocr"                // PDF scan tiếng Việt
  | "ocr-translate"      // PDF scan ngoại ngữ
  | "convert"            // PDF digital / TXT / MD tiếng Việt
  | "convert-translate"; // PDF digital / TXT / MD ngoại ngữ

export interface BookProfile {
  kind: IngestKind;
  languageCode: string;          // "vi" | "en" | "zh" | ...
  languageName: string;
  languageConfidence: number;    // 0..1
  detectionSource: "metadata" | "heuristic" | "combined" | "unknown";
  isVietnamese: boolean;
  hasWatermarks: boolean;
  workflow: BookWorkflow;
  reasons: string[];             // giải thích cho người dùng
  autoRoutable: boolean;         // confidence đủ cao để tự chuyển tab
}

export interface WorkflowStep {
  id: "cleanup" | "ocr" | "convert" | "translate" | "style" | "read";
  label: string;
  tab: ActiveTab;
  description: string;
}
```

- `needsOcr / needsConversion / needsTranslation` **không** lưu — suy ra từ `kind` + `languageCode`.
- `hasWatermarks` **không** phải một workflow riêng: xóa watermark là **một bước** trong pipeline (`id: "cleanup"`), chỉ xuất hiện khi `hasWatermarks === true`.
- `buildWorkflowSteps(profile)` là hàm thuần, dẫn xuất mảng bước + `currentStepIndex`.

### 3.3. Quy tắc định tuyến

| Loại | Điều kiện | workflow | Tab mở tự động |
|---|---|---|---|
| EPUB tiếng Việt | `languageCode === "vi"` | `polish` | `books` (như cũ) |
| EPUB ngoại ngữ | `languageCode !== "vi"` | `translate` | `translator` ⚡ |
| PDF digital | có text layer | `convert` / `convert-translate` | `converter` |
| PDF scan tiếng Việt | `scanDetector` báo scan | `ocr` | `converter` |
| PDF scan ngoại ngữ | scan + không phải VI | `ocr-translate` | `converter` → sau khi xong `translator` |
| TXT / MD | — | `convert` / `convert-translate` | `converter` |
| Sau convert/OCR | ngôn ngữ EPUB tạo ra | kế thừa quy tắc EPUB | `translator` nếu ngoại ngữ ⚡ |

**Chống "cướp màn hình"** (rủi ro UX đã nhận diện):
- Chỉ tự chuyển khi `autoRoutable === true` (độ tin cậy ngôn ngữ ≥ 0.75, hoặc đến từ metadata `dc:language` rõ ràng).
- Preference `autoRouteOnIngest` (mặc định **bật**), lưu `localStorage` key `lg-auto-route-ingest`.
- Mỗi lần tự chuyển đều có toast kèm nút **"Ở lại thư viện"** để quay về.
- Khi `autoRouteOnIngest === false`: giữ ở tab mặc định và hiện banner CTA 1 bấm.
- Không bao giờ tự chuyển tab từ `openProject` (người dùng đã chủ động chọn dự án) và từ `updateBookMetadata`.

### 3.4. Tính lại profile — không phá việc đang làm

- Profile được tính **một lần cho mỗi lần nạp sách** (`loadBookFromPath`, `loadBookFromBytes`, `openProject`).
- `workflowSource: "auto" | "manual"`. Khi người dùng tự chọn quy trình hoặc tự nhảy tab → đặt `"manual"`; mọi lần tính lại sau đó **không được ghi đè** lựa chọn thủ công.
- `updateBookMetadata` chỉ cập nhật lại **sự kiện ngôn ngữ** (`languageCode`, `isVietnamese`) nếu `workflowSource === "auto"`, và **không đổi tab**.

### 3.5. Tiến trình theo sách (thay cho `workflowStepIndex`)

Không dùng một index nguyên (không biểu diễn được nhánh rẽ). Dùng **tập bước đã hoàn thành**:

```ts
translatedChapters: Record<string, number>;   // href -> timestamp (nguồn đếm rẻ, O(1))
workflowId: BookWorkflow | null;
workflowCompletedSteps: string[];             // ["cleanup","ocr","translate"]
```

- `currentStep` = bước đầu tiên trong `buildWorkflowSteps(profile)` **không** nằm trong `workflowCompletedSteps`.
- `translatedChapters` được ghi trong `translateSingleChapter` (sau `applyTranslations` thành công) và xóa trong `resetChapterTranslation`.
- Lưu vào `EbookProject` dưới dạng **field optional** → project cũ đọc lên là `undefined`, xử lý bằng `?? {}` / `?? []`. Không cần migration cứng, nhưng phải có default.

## 4. Lộ trình

| Phase | Nội dung | File |
|---|---|---|
| **1** | Detector thuần + store routing + banner | `src/utils/bookTypeDetector.ts` (+test), `useAppStore.ts`, `App.tsx`, `WorkflowBanner.tsx` |
| **2** | Stepper + badge sidebar + tinh chỉnh UI từng quy trình | `BookPipelineStepper.tsx`, `Sidebar.tsx`, `BookView.tsx`, `BookTranslatorView.tsx`, `ConverterView.tsx`, `globals.css` |
| **3** | Lưu trữ bền vững + test hồi quy + build verify | `EbookProject` schema, test suites, `npm run build` |

Chi tiết từng phase: [`phase-01-profile-detector-and-routing.md`](./phase-01-profile-detector-and-routing.md), [`phase-02-stepper-and-contextual-ux.md`](./phase-02-stepper-and-contextual-ux.md), [`phase-03-persistence-and-verification.md`](./phase-03-persistence-and-verification.md).

## 5. Tiêu chí nghiệm thu

1. Thả một EPUB tiếng Anh → ứng dụng tự nhận diện **Tiếng Anh (English)** kèm độ tin cậy, tự mở tab **Dịch thuật AI**, đã điền sẵn `sourceLang`/`targetLang`, có toast + đường quay lại Thư viện.
2. Thả một EPUB tiếng Việt → **không** chuyển sang Dịch thuật; hiện banner "Sách tiếng Việt — sẵn sàng định kiểu" với CTA sang Thư viện phong cách.
3. Thả một PDF scan tiếng Trung → mở tab Chuyển đổi, banner nói rõ quy trình `OCR → Dịch thuật → Xuất bản`.
4. Sau khi chuyển đổi/OCR xong bằng nút "Nạp vào Studio", nếu EPUB tạo ra là ngoại ngữ thì **tự chuyển sang Dịch thuật AI**, không còn đẩy thẳng vào thư viện.
5. Banner có nút **bỏ qua** (ẩn cho tới khi đổi sách) và nút **bắt đầu quy trình**; bấm bắt đầu → nhảy đúng tab, đánh dấu `workflowSource = "manual"`.
6. Stepper hiển thị đúng bước hiện tại; khi dịch xong 1 chương thì `translatedChapters` tăng và badge sidebar cập nhật mà không cần đọc lại nội dung chương.
7. Tắt preference `autoRouteOnIngest` → không còn tự chuyển tab, chỉ còn banner.
8. `npm run test` xanh toàn bộ (247 test cũ + test mới) và `npm run build` (`tsc && vite build`) không lỗi.
9. Mở lại một project cũ (localStorage không có field mới) → hoạt động bình thường, không crash.

## 6. Rủi ro & đối sách

| Rủi ro | Đối sách |
|---|---|
| Tự chuyển tab gây cảm giác bị cướp quyền | Ngưỡng tin cậy + preference tắt được + toast có nút quay lại + banner luôn có nút bỏ qua |
| Hai bộ nhận diện ngôn ngữ lệch nhau | Chốt `LanguageDetector` là canonical, thêm test đối chiếu trên corpus fixture |
| `activeTab` union bị khai báo trùng ở `useAppStore.ts:185` và `Sidebar.tsx:25` | Export type `ActiveTab` từ store, `Sidebar` import lại (thay đổi nhỏ, giảm churn) |
| `mid-flight` thay đổi của gateway (7 file đang modified/untracked) | Không chạm vào các file đó; baseline đã đo trên cây hiện tại: 247/247 pass |
| Chi phí tính profile trên sách lớn | `detectLanguage` chỉ dùng `sample_text` + tối đa preview 3 chương đã có sẵn từ Rust, không parse lại EPUB |
| Đếm chương chưa dịch tốn kém | Dùng `translatedChapters` (href → timestamp), số học O(1), không đọc nội dung |

## 7. Ngoài phạm vi (không làm trong lần này)

- Không đổi backend Rust (`src-tauri/`) — mọi dữ liệu cần thiết đã có trong `EpubMetadata`.
- Không thêm tab mới (tái dùng 10 tab hiện có).
- Không đổi luồng OCR/AI hiện có, chỉ đổi *điểm đến* sau khi xong.
- Không refactor `useAppStore.ts` (2.109 dòng) ngoài các vùng cần thiết.

---

## 8. Kết quả thực thi

**Trạng thái:** hoàn tất cả 3 phase.

| Bằng chứng | Kết quả |
|---|---|
| `npm run test` | **30 file / 326 test — PASS** (baseline trên cùng cây làm việc trước khi bắt đầu: 27 file / 247 test) |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | `✓ built in 878ms` |
| Test mới | `bookTypeDetector.test.ts` (39), `useAppStore.test.ts` +14 (routing, round-trip, coverage), `workflow-ui.test.tsx` (14), `workflow-wiring.test.tsx` (10) |
| Phạm vi thay đổi | 13 file trong `src/` + 5 file mới. Không chạm `src-tauri/`, `GatewayView.tsx`, `GatewaySettingsModal.tsx`, `aiService.test.ts`, `gatewayModelCategorizer.*` — đó là thay đổi dở dang có trước (đã xác nhận bằng `git status` chạy **trước** khi bắt đầu, và hai hunk trong `lib.rs` chỉ nói về policy HTTP/HTTPS của AI gateway) |

### Sai lệch so với kế hoạch (có chủ đích)

1. **Không gắn `WorkflowBanner` vào `ConverterView`.** Banner gắn với *cuốn sách đang mở*, còn converter đang xử lý một *file khác* — hiển thị sẽ gây hiểu sai. Thay bằng `ingest-detect-strip` (phạm vi file).
2. **Không đánh dấu bước `ocr`/`convert`.** Sau khi OCR, EPUB tạo ra được phân loại là EPUB, nên các bước đó đã ở phía sau quy trình; chỉ ghi nhận `cleanup`/`translate`/`style`/`read`.
3. **Bỏ mini-steps và toggle React trong banner**, thay bằng `<details>` gốc — không cần state, chạy được trong SSR, tốt hơn cho a11y.
4. **Tách `*View` component thuần khỏi wrapper gắn store.** Lý do kỹ thuật: `zustand` truyền `getInitialState()` làm `getServerSnapshot`, nên khi không có jsdom thì component gắn store luôn render rỗng. Test render `*View` + `workflow-wiring.test.tsx` mock `useAppStore` để phủ phần nối store↔View.

### Phát hiện ngoài kế hoạch (đã sửa)

- **Lỗi định tuyến thật:** `LanguageDetector` coi "2 ký tự dấu tiếng Việt đầu tiên" là quyết định, nên **một dòng watermark `Nguồn: truyenfull.vn` đủ để đánh dấu cả một sách tiếng Trung là tiếng Việt** → bỏ qua dịch thuật. Đã sửa bằng `stripWatermarkTokens()` trong `watermarkCleaner.ts`, gọi trước khi nhận diện. Test hồi quy: `bookTypeDetector.test.ts` → `languageCode === "zh"`, `workflow === "translate"`.
- **Dương tính giả watermark:** heuristic "lỗi tách dấu tiếng Việt" khớp cả dấu nháy tiếng Anh (`Mia's`). Nay chỉ áp dụng cho sách tiếng Việt, còn marker thư viện (`dtv-ebook`, `truyenfull`, ...) vẫn bắt mọi ngôn ngữ (có fixture chứng minh không mất dương tính thật).
- **Thứ tự `openProject`:** việc khôi phục tiến trình nằm rời rạc sau khi định tuyến, dễ bị phá khi sửa code. Nay gói trong `restoreProjectWorkflow()` (định tuyến rồi mới khôi phục) + test round-trip save → close → reopen.
- **Ba nơi đếm "đã dịch" với hai nghĩa khác nhau.** Nay tất cả đi qua `getTranslationCoverage()`; dự án cũ (chưa có `translatedChapters`) dùng fallback `modifiedChapters` kèm cờ `isLegacyFallback`.

### Chưa xác minh

- **Chưa chạy app Tauri thật** (không có phiên GUI). 7 kịch bản kiểm tra thủ công ở §3.4 phase-03 **chưa được thực thi** — mọi kết luận về hành vi runtime vẫn là suy luận từ test tĩnh.
- Tương tác người dùng trên `WorkflowBanner` (bấm CTA / bấm ×) không được test ở tầng component vì không có DOM; logic tương ứng được test ở tầng store.
- i18n: toàn bộ chuỗi mới là tiếng Việt hard-code, đúng theo hiện trạng của app.
