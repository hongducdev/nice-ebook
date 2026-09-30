# Phase 3 — Persistence, Settings & Verification

**Mục tiêu:** trạng thái quy trình sống sót qua các phiên, project cũ không bị vỡ, và có bằng chứng kiểm thử thực sự.

**Thời lượng ước tính:** nửa phiên làm việc.

---

## 3.1. Mở rộng `EbookProject` (tương thích ngược)

`src/stores/useAppStore.ts:88-115` — thêm **field optional**, KHÔNG cần migration cứng vì project cũ đọc lên là `undefined`:

```ts
export interface EbookProject {
  /* ...các field hiện có... */
  workflowId?: BookWorkflow | null;
  workflowSource?: "auto" | "manual" | null;
  workflowCompletedSteps?: string[];
  translatedChapters?: Record<string, number>;
  detectedLanguageCode?: string | null;
}
```

Nơi đọc phải dùng default: `project.translatedChapters ?? {}`, `project.workflowCompletedSteps ?? []`.

`PROJECTS_STORAGE_KEY = "nice-ebook-projects-v1"` (`:345`) **giữ nguyên** — thêm field optional không cần bump version. Ghi chú vào `saveProjectsToStorage` rằng schema đã có 5 field optional thêm ở phiên bản này.

Bổ sung vào `saveActiveProject()` (đang được gọi ở `translateSingleChapter`, `autoConfigureAllTranslationSettings`, v.v.) và vào `openProject()` (khôi phục `bookProfile` thô từ 5 field đó rồi chạy `routeAfterBookLoad(meta, { autoSwitch: false })`, sau đó ghi đè `workflowCompletedSteps`/`translatedChapters` đã lưu).

## 3.2. Preference người dùng trong `App.tsx` Settings tab

Thêm một `setting-card-row` vào màn Cài đặt (`App.tsx:246-252`, cạnh "Chủ đề giao diện"):

- Tiêu đề: **"Tự động chuyển quy trình khi nạp sách"**
- Mô tả: "Khi nạp một sách ngoại ngữ, tự động mở Dịch thuật AI. PDF scan tự mở OCR. Tắt để chỉ hiện gợi ý."
- Điều khiển: `segmented-toggle` sẵn có với 2 mục **Bật / Tắt** ↔ `autoRouteOnIngest` / `setAutoRouteOnIngest`.

Ngoài ra: thêm hàng thứ hai **"Xoá trạng thái quy trình của sách hiện tại"** với nút reset (`workflowCompletedSteps: []`, `dismissedWorkflowFor: null`) để người dùng làm lại từ đầu.

## 3.3. Kiểm thử hồi quy (bắt buộc)

1. **`src/utils/bookTypeDetector.test.ts`** — như Phase 1.6, chạy độc lập.
2. **`src/stores/useAppStore.test.ts`** — thêm nhóm `describe("ingest workflow routing")`:
   - EPUB EN → `activeTab === "translator"`, `bookProfile.workflow === "translate"`.
   - EPUB VI → `activeTab === "books"`.
   - `autoRouteOnIngest = false` → `activeTab === "books"`, profile vẫn `"translate"`.
   - Profile confidence thấp → không auto-switch dù preference bật.
   - `openProject` → luôn `"books"`, nhưng `bookProfile` đã set.
   - `startRecommendedWorkflow()` → `workflowSource === "manual"`; sau đó `routeAfterBookLoad` không được đổi `workflowCompletedSteps` của sách đó.
   - `translatedChapters` tăng/giảm đúng.
3. **Tương thích project cũ**: dựng một object `EbookProject` **thiếu** 5 field mới, gọi `openProject` → không throw, `workflowCompletedSteps` là `[]`.
4. **Test component** cho `WorkflowBanner` và `BookPipelineStepper` (Phase 2.6).
5. **Test đối chiếu hai bộ nhận diện**: corpus fixture nhỏ, assert `detectBookProfile(f).isVietnamese` khớp `detectIsVietnameseBook(f)` trên các ca rõ ràng; ghi rõ ngoại lệ được chấp nhận (metadata `vi` nhưng text ngoại ngữ) và assert theo `LanguageDetector`.

## 3.4. Xác minh (bằng chứng, không phải suy luận)

| Lệnh | Kỳ vọng |
|---|---|
| `npm run test` | Toàn bộ file test xanh; số test **> 247** (baseline đã đo trên cây hiện tại: 247/247) |
| `npm run build` (`tsc && vite build`) | Không lỗi TypeScript, build thành công |
| `git diff --stat` | Không có thay đổi ngoài phạm vi (đặc biệt không chạm `src-tauri/`, `GatewayView.tsx`, `GatewaySettingsModal.tsx`, `gatewayModelCategorizer.*` — đang có thay đổi dở dang của việc khác) |

Kiểm tra thủ công (ghi lại kết quả, không chỉ "đã xem"):
1. Thả EPUB tiếng Anh → tab Dịch thuật, `sourceLang` = English, toast có nút "Ở lại thư viện".
2. Thả EPUB tiếng Việt → ở Thư viện, banner "Sách tiếng Việt".
3. Tắt preference → thả lại EPUB tiếng Anh → ở Thư viện nhưng có banner CTA.
4. Bấm CTA trong banner → nhảy tab đúng, `workflowSource = "manual"`.
5. Bấm × trên banner → ẩn; đổi sang sách khác → banner hiện lại.
6. Dịch 1/3 chương → badge sidebar `2 ch.`, stepper đánh dấu bước hiện tại chưa xong.
7. Khởi động lại app → mở lại project → stepper và số chương đã dịch vẫn đúng.

## 3.5. Dọn dẹp & tài liệu

- Chạy `project-manager` subagent: đồng bộ ngược trạng thái tất cả phase file + `plan.md` → `completed`.
- Chạy `docs-manager` subagent: cập nhật `./docs` nếu có mô tả luồng nạp sách.
- Chạy `/ck:journal` ghi lại quyết định thiết kế (đặc biệt: vì sao chọn banner + ngưỡng tin cậy thay vì chuyển tab im lặng; vì sao `LanguageDetector` là canonical).
- Hỏi người dùng trước khi commit qua `git-manager` (repo đang có thay đổi dở dang của việc gateway, cần tách commit sạch).

## 3.6. Định nghĩa hoàn thành

- [ ] `EbookProject` có 5 field optional, project cũ mở được (có test).
- [ ] Preference `autoRouteOnIngest` điều khiển được từ màn Cài đặt và có hiệu lực thật.
- [ ] `npm run test` + `npm run build` có output xanh được trích dẫn lại.
- [ ] 7 bước kiểm tra thủ công đã chạy và ghi lại kết quả.
- [ ] `plan.md` + 3 phase file đồng bộ trạng thái `completed`.
- [ ] Journal entry đã ghi.

---

**Trạng thái:** hoàn tất (trừ 7 kịch bản kiểm tra thủ công — chưa chạy app Tauri thật).

- 3.1 `EbookProject` có 5 field optional; project cũ mở được (có test); khôi phục tiến trình nay nằm
  trong `restoreProjectWorkflow()` với test round-trip save → close → reopen.
- 3.2 preference `autoRouteOnIngest` + nút "Xoá tiến trình" đã có trong tab Cài đặt.
- 3.3 test hồi quy: `bookTypeDetector.test.ts` 39 test, `useAppStore.test.ts` +14, `workflow-ui.test.tsx`
  14, `workflow-wiring.test.tsx` 10.
- 3.4 xác minh: `npm run test` 30 file / 326 test PASS; `npx tsc --noEmit` exit 0;
  `npm run build` `built in 878ms`.
- 3.5 `docs/system-architecture.md` đã thêm mục "E. Ingest Workflow Router (Per-Book-Type Pipeline)".
- 3.6 journal: `docs/journals/260930-0830-ingest-workflow-router.md`.
