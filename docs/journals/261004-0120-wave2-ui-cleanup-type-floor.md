# Technical Journal: Dọn Giao Diện Đợt 2 — Nâng Sàn Chữ (Type Floor ≥ 12px)

**Thời gian:** 2026-10-04 01:20  
**Mục tiêu:** Tiếp nối lộ trình Wave 1 (`261003-1428-wave1-ui-cleanup-option-a.md`), nâng sàn chữ tối thiểu lên 12px (`text-xs`) trên 6 file giao diện cốt lõi và shell điều hướng nhằm đảm bảo độ tương phản, chống mỏi mắt và tuân thủ nguyên tắc thiết kế `DESIGN.md`.  
**Phạm vi:** 6 file (`ChapterEnhancerView.tsx`, `BookView.tsx`, `StatusBar.tsx`, `Sidebar.tsx`, `AppTitlebar.tsx`, `EpubReaderViewer.tsx`) — 99 dòng thêm / 99 dòng bớt.

---

## 1. Phân Tích Hiện Trạng & Rà Soát Thực Tế (Inventory)

- Trước đợt 2, lệnh quét tìm kiếm `text-\[(?:[0-9]|10|11)px\]` phát hiện **177 vị trí** có cỡ chữ dưới 12px (chủ yếu là 10px và 11px) nằm rải rác trong app.
- 6 file trọng điểm chiếm tới **83 vị trí**:
  - `ChapterEnhancerView.tsx`: 32 vị trí (các nhãn cấu hình, alert, card preview, badging).
  - `BookView.tsx`: 31 vị trí (badge chương, thẻ gợi ý Jev, metadata NXB/tác giả, stat grid).
  - `StatusBar.tsx`: 8 vị trí (thanh trạng thái dưới đáy 28px).
  - `EpubReaderViewer.tsx`: 7 vị trí (mục lục chương, chip preview bìa, badge trạng thái biên tập).
  - `Sidebar.tsx`: 3 vị trí (badge tab, nhãn theme, status gateway).
  - `AppTitlebar.tsx`: 2 vị trí (badge phiên bản v0.1.0, số lượng chương sách).

---

## 2. Các Thay Đổi Cụ Thể

1. **Chuẩn Hóa Sàn Chữ Lên 12px (`text-xs`):**
   - Thay thế toàn bộ các lớp `text-[10px]` và `text-[11px]` bằng `text-xs` (tương đương 0.75rem / 12px theo root HTML 16px chuẩn của app desktop).
   - Tách biệt rõ ràng: typography người dùng tinh chỉnh trong `TypographyControls.tsx` chỉ áp dụng bên trong `iframe` biệt lập của sách EPUB, không làm biến thiên root font-size của app desktop.
2. **Đồng Bộ Kích Thước Badge & Pill:**
   - Các badge nhỏ trước đây bị bó hẹp trong chiều cao `h-4` hoặc `h-4.5` được nâng lên `h-5` kèm `px-2` để chữ 12px không bị cấn viền trên/dưới.
   - Thêm `min-w-0` và `truncate` trên các container flex của `StatusBar` và `AppTitlebar` để đảm bảo khi cửa sổ thu nhỏ, nội dung co giãn an toàn không vỡ layout.

---

## 3. Kiểm Chứng Kỹ Thuật

| Cổng kiểm tra | Kết quả | Chi tiết |
| --- | --- | --- |
| `npx tsc --noEmit` | **Exit 0** | 0 lỗi kiểu dữ liệu TypeScript |
| `npm test` | **51 files / 585 tests PASS** | 100% test suites vượt qua |
| `BookView.test.tsx` | **5/5 tests PASS** | Không có hồi quy logic xem sách |
| `npm run build` | **PASS (2.28s)** | 2361 module biên dịch hoàn tất sạch sẽ |
| Quét regex mở rộng | **0 vị trí còn lại** | Đạt chuẩn 0 kết quả sub-12px (px/rem/em) trên 6 file |
| Git commit | `bad2837` | Working tree clean |

---

## 4. Tồn Đọng & Bước Kế Tiếp (Đợt 3)

- Còn 95 vị trí sub-12px trên toàn repo, tập trung ở:
  - Hệ thống Agent Chat / Assistant (`ActionProposalCard`, `AgentActiveTaskMonitor`, `BookAgentDrawer`...): 57 vị trí.
  - Modals & Bảng điều khiển (`TranslationLogPanel`: 9, `ProgressModal`: 6, `BookDropzone`: 6, `ExportModal`: 4).
  - Màn hình Splash (`AppSplashScreen`: 3).
- **Lưu ý thực tế:** Việc kiểm tra hiển thị visual trên app desktop thực tế (Tauri WebView2) cần sự xác nhận bằng mắt của người dùng ở các kích thước cửa sổ khác nhau.
