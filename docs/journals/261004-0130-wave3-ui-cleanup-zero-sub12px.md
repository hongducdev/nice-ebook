# Technical Journal: Dọn Giao Diện Đợt 3 — Hoàn Thành Sạch Sẽ Sàn Chữ (Zero Sub-12px)

**Thời gian:** 2026-10-04 01:30  
**Mục tiêu:** Hoàn tất 100% mục tiêu sàn chữ (Type Floor ≥ 12px / `text-xs`) trên toàn bộ ứng dụng NiceEbook Studio, xử lý 95 vị trí sub-12px cuối cùng nằm trong hệ thống Agent Assistant, các Modal và bảng điều khiển công cụ.  
**Phạm vi:** 15 file (`ActionProposalCard.tsx`, `AgentActiveTaskMonitor.tsx`, `AgentModelSelector.tsx`, `BookAgentDrawer.tsx`, `BookAgentFullView.tsx`, `ChatMessageContent.tsx`, `BookDropzone.tsx`, `ProgressModal.tsx`, `ExportModal.tsx`, `BookTranslatorView.tsx`, `TranslationLogPanel.tsx`, `AppSplashScreen.tsx`, `CodeMirrorCss.tsx`, `TypographyControls.tsx`, `App.tsx`) — 105 dòng thêm / 105 dòng bớt.

---

## 1. Phân Tích & Rà Soát Chi Tiết

Trước khi thực hiện đợt 3, toàn bộ thanh shell, navigation và các màn hình chính (Đợt 1 & 2) đã được nâng lên `text-xs`. 95 vị trí cuối cùng được phân bố như sau:
1. **Hệ thống Trợ lý Agent AI (57 vị trí):**
   - `ActionProposalCard.tsx` (19): Thẻ xác nhận đề xuất hành động, thanh tiến trình thời gian thực, bảng diff.
   - `AgentActiveTaskMonitor.tsx` (13): Thanh theo dõi tiến trình nền (Dịch AI, Tối ưu hóa AI, Workflow Job).
   - `AgentModelSelector.tsx` (8): Nhãn danh mục mô hình, chip Caveman token optimizer, nút quản lý cổng AI.
   - `BookAgentDrawer.tsx` (7): Ngăn kéo chat trợ lý, gợi ý thao tác nhanh, badge `Agent AI`.
   - `BookAgentFullView.tsx` (6): Màn hình chat toàn khổ, phím tắt Enter/Shift+Enter, chip gợi ý.
   - `ChatMessageContent.tsx` (4): Bảng Markdown, inline code, thanh tiêu đề code block và pre code.
2. **Modals & Bảng Điều Khiển (38 vị trí):**
   - `TranslationLogPanel.tsx` (9): Bộ lọc log, ô tìm kiếm trong log, mốc thời gian timestamp `[time]`, chip mã đoạn `[p_0]`.
   - `BookDropzone.tsx` (6): 3 thẻ giới thiệu tính năng dưới khung kéo thả file.
   - `ProgressModal.tsx` (6): Các bước thực hiện stepper (Đang chạy, Xong, Chờ, Lỗi).
   - `ExportModal.tsx` (4): Huy hiệu số chương, đường dẫn file xuất ra, ghi chú tiêu chuẩn EPUB 3.
   - `BookTranslatorView.tsx` (4): Số luồng dịch song song, pill trạng thái chương (Đang dịch, Đã dịch, Chưa dịch).
   - `AppSplashScreen.tsx` (3): Huy hiệu phiên bản, phần trăm thanh tiến trình.
   - `CodeMirrorCss.tsx` (3): Tên file `style.css`, nút Reset và Copy CSS.
   - `TypographyControls.tsx` (1): Badge trạng thái kiểm định (Đạt / Lưu ý / Cần sửa).
   - `App.tsx` (1): Badge Pistachio Design trong Cài đặt & Giới thiệu.

---

## 2. Giải Pháp Chuẩn Hóa

- **Nâng toàn diện lên `text-xs` (12px):** Thay thế toàn bộ `text-[9px]`, `text-[10px]`, `text-[11px]` bằng `text-xs` hoặc kích thước lớn hơn tương ứng với cấu trúc flex.
- **Đồng bộ hóa các thành phần tương tác:**
  - Nút bấm và badge nhỏ được nâng chiều cao từ `h-4`/`h-4.5`/`h-5` lên `h-5.5` hoặc `h-6`/`h-7` kèm `px-2` hoặc `px-2.5` để văn bản 12px hiển thị cân đối, không cấn viền.
  - Các input tìm kiếm nhỏ (như trong log viewer) được nâng lên `h-6 text-xs pl-6` để con trỏ gõ chữ không bị cắt ngọn.
  - Inline code và code header trong `ChatMessageContent` được chuẩn hóa `text-xs font-mono`.

---

## 3. Kiểm Chứng Kỹ Thuật Toàn Diện

| Cổng kiểm tra | Kết quả | Chi tiết |
| --- | --- | --- |
| `npx tsc --noEmit` | **Exit 0** | 0 lỗi kiểu dữ liệu TypeScript |
| `npm test` | **51 files / 585 tests PASS** | 100% test suites vượt qua |
| `npm run build` | **PASS (1.71s)** | 2361 module Vite biên dịch trơn tru |
| Quét regex toàn app (`text-\[(?:0\.[0-7]...\|[0-9]px)\]`) | **0 KẾT QUẢ** | Không còn bất kỳ vị trí sub-12px nào trong toàn bộ thư mục `src/` |
| Git commit | `8150be2` | Working tree clean |

---

## 4. Tổng Kết Toàn Bộ Chiến Dịch Dọn Giao Diện (Waves 1-3)

- **Wave 1:** Xây dựng lại bố cục 3 vùng (Layout A) cho các màn hình chính (Dịch thuật AI, Chuyển đổi Ebook, Cổng AI & Model, Modal Metadata).
- **Wave 2:** Nâng sàn chữ trên Navigation Shell (`StatusBar`, `Sidebar`, `AppTitlebar`), trình đọc `EpubReaderViewer`, `BookView` và `ChapterEnhancerView`.
- **Wave 3:** Hoàn tất xóa sạch 100% cỡ chữ sub-12px trên toàn bộ các modal, bảng điều khiển và hệ thống Agent AI.
- **Thành quả:** Đạt chuẩn độ tương phản WCAG 2.1 AA / AAA, xóa sạch lỗi mỏi mắt do chữ quá nhỏ, giao diện sắc nét và nhất quán theo chuẩn Pistachio Design System.
