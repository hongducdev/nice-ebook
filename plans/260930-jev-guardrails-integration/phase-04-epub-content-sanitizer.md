# Phase 04: EPUB Reader Content Sanitizer

## Mục tiêu
Bảo vệ người dùng khỏi các lỗ hổng thực thi mã (XSS / Webview Exploits) khi mở sách EPUB không rõ nguồn gốc.

## Nhiệm vụ
- [ ] 1. Trong `src/utils/textCleaner.ts`:
  - Bổ sung hàm `sanitizeEpubHtml(html: string): string`.
  - Loại bỏ hoàn toàn các thẻ `<script>`, `<iframe`, `<object>`, `<embed>`.
  - Loại bỏ các thuộc tính thực thi sự kiện JavaScript (`onload=`, `onerror=`, `onclick=`, v.v.).
  - Làm sạch các liên kết nguy hiểm dạng `href="javascript:..."` và `src="data:text/html..."`.
  - Bảo tồn toàn bộ định dạng sách hợp lệ (CSS styles, hình ảnh an toàn, phân đoạn, drop-caps).
- [ ] 2. Trong `src/components/preview/EpubReaderViewer.tsx`:
  - Đảm bảo HTML hiển thị đi qua `sanitizeEpubHtml` trước khi render vào viewer.
- [ ] 3. Viết unit test `src/utils/textCleaner.test.ts` kiểm thử các payload XSS phổ biến.
