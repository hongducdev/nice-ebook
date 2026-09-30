# Technical Journal: Hoàn Tất Chuyển Đổi Shadcn/UI & Khắc Phục Lỗi Cắt Nội Dung Thẻ (Card Clipping)

**Thời gian:** 2026-09-30 20:34
**Phạm vi:** `GatewayView`, `TypographyControls`, `BookView`, `BookDropzone`, `ChapterEnhancerView`, `BookTranslatorView`, `PresetGallery`, `chapterStorage.test`, `globals.css` (đối chiếu).

---

## 1. Bối cảnh & Vấn đề

Công việc chuyển đổi UI sang shadcn/ui (style `radix-nova`) bị dừng giữa chừng: `npx tsc --noEmit` báo 5 lỗi cú pháp JSX, và sau khi build xanh người dùng phát hiện **nội dung bị cắt** ở thẻ cài đặt (ảnh chụp: `AI Gateway & Model`, `Cơ Chế Dự Phòng (Fallback)`, `Tự Động Cấu Hình Toàn Diện`).

## 2. Chẩn Đoán Nguyên Nhân Gốc Rễ

### A. Lỗi cú pháp do chuyển đổi dở dang
- `GatewayView.tsx`: thiếu `</div>` đóng `.model-page__category-copy` và thiếu `)}` đóng nhánh `{category.models.length > 0 && (<Button …>)}`.
- `TypographyControls.tsx`: thiếu một `</div>` đóng cột phải sau `</Card>`.
- Rà thêm 6 import không dùng (`BookDropzone`: `Zap`/`CardContent`/`Badge`; `BookView`: `CardContent`/`CardHeader`/`CardTitle`/`CardFooter`; `chapterStorage.test`: `vi`/`beforeEach`).

### B. Nguyên nhân lỗi cắt nội dung (quan trọng nhất)
Lớp CSS cũ `.card-surface` trong `globals.css` **có `flex-shrink: 0`**. Component `Card` của shadcn **không có** thuộc tính này, nhưng lại có `overflow-hidden`.

Hệ quả: trong các cột `flex flex-col` bị giới hạn chiều cao (ví dụ `w-[380px] … flex flex-col … overflow-y-auto`), các thẻ Card bị `flex-shrink` **bóp nhỏ hơn chiều cao nội dung**, và `overflow-hidden` của chính Card **cắt cụt nội dung** thay vì để cột cuộn.

Bằng chứng định lượng: thẻ `AI Gateway & Model` bị co từ **104px → 32px** (`scrollHeight=104`, `clientHeight=32`).

## 3. Thay Đổi

### A. Sửa lỗi cú pháp + import
Khôi phục đúng cấu trúc JSX và dọn import không dùng.

### B. Hoàn tất chuyển đổi `BookView.tsx` sang shadcn
- `lg-button--primary` → `Button` (mặc định); `--secondary` → `variant="outline"`; `--ghost` → `variant="ghost"`; `--destructive` → `variant="destructive"`.
- `app-badge`/`app-button`/`card-surface` → `Badge`/`Button`/`Card` (+ `CardHeader`/`CardTitle`/`CardContent`).
- Toàn bộ `[var(--…)]` → token ngữ nghĩa (`bg-card`, `text-muted-foreground`, `border-border`, `text-primary`, `text-destructive`…).
- Giữ nguyên các lớp layout (`.workbench-page`, `.app-table`, `.command-bar`, `.file-drop-zone`).

### C. Khắc phục triệt để lỗi cắt nội dung
Bổ sung `shrink-0` cho các `Card` là **con trực tiếp** của cột flex bị giới hạn chiều cao:
- `ChapterEnhancerView.tsx` ×3 (AI Gateway & Model, Cơ Chế Dự Phòng, Làm Sạch Watermark)
- `BookTranslatorView.tsx` ×3 (Tự Động Cấu Hình, Research Brief, Glossary)
- `PresetGallery.tsx` ×1 ("Theo sách hiện tại")
- `BookView.tsx` ×1 (Hero Showcase Bìa Sách)

### D. Ghi chú phạm vi
- `MetadataModal.tsx` (1314 dòng) **vẫn dùng lớp legacy**; một bản chuyển đổi sâu (Dialog + Tabs + Input/Textarea/Label/Checkbox) đã được thử nhưng **được revert có chủ đích** vì đang dở dang và làm hỏng build. Cần thực hiện ở commit riêng.
- CSS legacy trong `globals.css` **chưa xóa** vì `MetadataModal` còn dùng và grep không thấy được class dựng động qua `cn()`/template literal.

## 4. Bằng Chứng Nghiệm Thu

| Hạng mục | Kết quả | Chi tiết |
| :--- | :--- | :--- |
| `npx tsc --noEmit` | **Exit 0** | Không còn lỗi type/cú pháp. |
| `npx vitest run` | **39 files / 419 tests passed** | Bằng đúng baseline trước khi sửa. |
| `npm run build` | **Thành công** | `tsc && vite build`. |
| Đo `scrollHeight > clientHeight` | **0/12 (ai-editor), 0/3 (translator), 0/5 (books), 0/6 (presets), 0/1 (gateway), 0/5 (kindle), 0 (MetadataModal, ExportModal, settings)** | Quét qua Chrome DevTools Protocol trên dev server thật; cột cài đặt cuộn đúng (`scrollHeight 1329 / clientHeight 825`). |
| Đối chứng nhân–quả (A/B) | **Bỏ `shrink-0` tại runtime → card co 104px→32px, `clipped=true`; khôi phục → `clipped=false`** | Chứng minh quan hệ nhân–quả của fix. |
| Audit cắt nội dung toàn app | **0 glyph bị cắt** | 6 badge có `scrollHeight` vượt 2px nhưng chỉ do `py-0.5` bị nén (`glyphClippedPx = 0`); các `line-clamp-*` là cắt có chủ đích. |
| `git diff` `MetadataModal.tsx` | **6 insertions / 2 deletions** | Xác nhận revert khôi phục đúng trạng thái trước đó, không mất công việc cũ. |

### Phương pháp verify trực quan
Dùng harness CDP tự viết (không thêm dependency), seed một sách giả vào store đang chạy qua `await import('/src/stores/useAppStore.ts')` + `setState`, rồi đo/ chụp từng tab và từng modal được mở bằng chính nút trên UI. Dev server của người dùng ở cổng 1420 **được giữ nguyên, không kill**.

## 5. Rủi Ro Còn Lại

- `MetadataModal.tsx` vẫn là bề mặt duy nhất chưa dùng shadcn → mục tiêu "tối đa shadcn" chưa đạt 100%.
- `ProgressModal` chỉ hiển thị khi đang chuyển đổi nên chưa đo được bằng harness (không có `<Card>` nên không thuộc lớp lỗi này).
- Các `<button>` thô còn lại là cố ý: nút phủ trên ảnh bìa, thumbnail bìa có thể bấm, và link văn bản.
