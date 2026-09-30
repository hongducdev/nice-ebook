# Technical Journal: Màn Hình Loading Khởi Động & Củng Cố Toàn Diện Ứng Dụng

**Thời gian:** 2026-09-30 16:40  
**Phạm vi:** Trải nghiệm khởi động ứng dụng (Splash Screen), Kiểm thử độ bao phủ toàn diện Navigation, Phân tách thẻ media HTML Sanitizer, Gắn nhãn Bước 6.

---

## 1. Bối cảnh & Yêu cầu

1. **Trải nghiệm khởi động:** Ứng dụng khi mở trên desktop Tauri hoặc trình duyệt web cần có màn hình tải mở đầu (Splash Screen) mượt mà, phản ánh tiến trình quét các cổng AI Proxy cục bộ, hiển thị nhận diện thương hiệu và chuyển cảnh mềm mại (không nháy màn hình).
2. **Độ bao phủ điều hướng (Navigation Exhaustiveness):** Đảm bảo toàn bộ 10 tab `ActiveTab` đều xuất hiện chính xác trong `Sidebar.tsx`, không để lọt bất kỳ màn hình nào trở thành "dead UI".
3. **Phân tách bộ lọc HTML (Sanitizer Discrimination):** Trong khi xuất bản Kindle cần loại bỏ thẻ media (`video`, `audio`, `canvas`) do thiết bị Kindle không hỗ trợ, trình đọc preview của Studio trong WebView có thể hỗ trợ phát media an toàn (khi đã tắt `allow-scripts`).

---

## 2. Các Thay Đổi Kiến Trúc Chính

### A. Màn Hình Loading Khởi Động (`src/components/layout/AppSplashScreen.tsx`)
- Tạo component `AppSplashScreen`:
  - Hiển thị logo ứng dụng `/app-icon.png` kèm hiệu ứng glow đồng bộ màu chủ đạo `--primary`.
  - Thanh tiến trình mượt mà (smooth progress bar) hiển thị 3 mốc:
    - 30%: Khởi tạo môi trường Studio...
    - 65%: Quét các cổng AI Proxy cục bộ...
    - 100%: Hoàn tất khởi động, sẵn sàng làm việc!
  - Thời gian hiển thị tối thiểu và transition fade-out 300ms tránh giật lag.
- Tích hợp vào `src/App.tsx` điều phối cùng vòng đời `scanGateways()`.
- Bổ sung bộ kiểm thử `src/components/layout/AppSplashScreen.test.tsx`.

### B. Kiểm Thử Độ Bao Phủ Navigation (`src/components/layout/Sidebar.test.tsx`)
- Trích xuất hàm thuần `buildNavigationGroups()` trong `Sidebar.tsx`.
- Viết test kiểm tra 100% các tab trong union `ActiveTab` (`books`, `presets`, `editor`, `reader`, `ai`, `settings`, `ai-editor`, `converter`, `kindle`, `translator`) đều có mặt và duy nhất trong `navigationGroups`, cùng với hành động mở `agent` drawer.

### C. Tinh Chỉnh HTML Sanitizer (`src/utils/htmlSanitizer.ts`)
- Tách biệt 2 tập hợp:
  - `READER_BLOCKED_ELEMENTS`: Chỉ chặn các phần tử thực thi mã nguy hiểm (`script`, `iframe`, `object`, `embed`, form elements), giữ lại `audio`, `video`, `canvas` cho sách EPUB đa phương tiện.
  - `KINDLE_BLOCKED_ELEMENTS`: Bổ sung thêm các phần tử không tương thích với thiết bị đọc sách Kindle.
- Bổ sung test kiểm thử tính năng giữ lại media trong `src/utils/htmlSanitizer.test.ts`.

### D. Đồng Bộ Nhãn Bước 6 (`src/components/preview/EpubReaderViewer.tsx`)
- Thêm nhãn "Bước 6: Đọc Thử & Kiểm Tra" vào thanh lệnh của trình xem sách để bảo đảm chuỗi thứ tự 1-7 không bị gián đoạn.

---

## 3. Bằng Chứng Nghiệm Thu & Kiểm Thử

| Lệnh kiểm tra | Kết quả | Ghi chú |
| :--- | :--- | :--- |
| `npm run check:secrets` | **PASS** | Quét 52 tệp nguồn, 0 rò rỉ secret. |
| `npm run test` (Vitest) | **37 passed (409 tests)** | 100% tests vượt qua. |
| `npx tsc --noEmit` | **Exit code 0** | Hoàn toàn sạch lỗi TypeScript. |
| `npm run build` | **Build completed in 1.59s** | Đóng gói production Vite + React 19 thành công. |
