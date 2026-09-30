# Technical Journal: Khắc Phục Triệt Để & Tối Ưu Khả Năng Hiển Thị Ảnh Bìa Sách (Book Cover)

**Thời gian:** 2026-09-30 18:20  
**Phạm vi:** Trình đọc EPUB (`EpubReaderViewer`), Quản lý dự án (`BookView`), Bộ giải nén Rust (`parser.rs`), Lưu trữ IndexedDB (`chapterStorage.ts`), Store điều phối (`useAppStore.ts`).

---

## 1. Bối cảnh & Vấn đề

Người dùng phản ánh: *"các phần cover hiện chưa có thể xem được ở trên app"*.
Qua quy trình chẩn đoán (Diagnose) đa tầng, phát hiện 4 nguyên nhân gốc rễ:
1. **Thiếu vắng hiển thị trên Workbench (`BookView.tsx`):** Khi cuốn sách đang mở (`currentBook`), màn hình chính chỉ có 4 thẻ thống kê và danh sách chương. Không hề có thẻ visual card hay preview ảnh bìa của cuốn sách đang làm việc.
2. **Trình đọc thử (`EpubReaderViewer.tsx`) thiếu mục xem Bìa:** Khi đọc thử, viewer chỉ nạp các file XHTML trong spine. Nếu file EPUB không có file XHTML bìa riêng trong spine, người dùng không thể xem ảnh bìa trong viewer và menu mục lục (TOC) cũng không có mục "Trang bìa".
3. **Cơ chế nén tự động xóa mất ảnh bìa khi lưu (`useAppStore.ts`):** `saveProjectsToStorage` tự động gán `coverDataUrl: null` cho bất kỳ ảnh bìa nào lớn hơn 100KB để tránh lỗi tràn dung lượng `localStorage` (5MB). Hầu hết ảnh bìa HD (300KB - 800KB) bị xóa thành `null` sau khi reload hoặc lưu dự án.
4. **Rust EPUB Parser bỏ sót ảnh bìa của các chuẩn EPUB cũ / phi chuẩn:** `parser.rs` chỉ tìm kiếm cover khi item có `properties="cover-image"` (EPUB 3) hoặc `<meta name="cover">`. Hàng loạt file EPUB 2 xuất từ Sigil, Calibre, Wattpad hay dtv-ebook dùng `id="cover"`, `id="cover-image"`, hoặc tên file `cover.jpg` / `bia.png` đều bị bỏ sót, trả về `cover_data_url: None`.

---

## 2. Giải Pháp & Thay Đổi Kiến Trúc

### A. Mở rộng Lưu trữ IndexedDB cho Ảnh Bìa (`src/utils/chapterStorage.ts`)
- Nâng cấp `DB_VERSION = 2`, tạo object store `project_covers`.
- Bổ sung các hàm lưu trữ bất đồng bộ: `saveCoverToDb(projectId, coverDataUrl)`, `loadCoverFromDb(projectId)`, `deleteCoverFromDb(projectId)`.
- Dung lượng lưu trữ IndexedDB không bị giới hạn 5MB như `localStorage`, đảm bảo lưu trữ ảnh bìa gốc chất lượng cao an toàn 100%.

### B. Hydrate & Đồng bộ Ảnh Bìa trong Store (`src/stores/useAppStore.ts`)
- Khi tạo dự án mới (`createProject`) hoặc cập nhật metadata (`updateBookMetadata`), tự động ghi `cover_data_url` vào IndexedDB.
- Khi mở lại dự án (`openProject`), tự động nạp `dbCover` từ IndexedDB bù đắp lại trường hợp `coverDataUrl` bị lược bỏ trong `localStorage`.
- Dọn dẹp sạch sẽ khi xóa dự án (`deleteProject`).

### C. Nâng Cấp Heuristic Nhận Diện Bìa Sách trong Rust (`src-tauri/src/epub/parser.rs`)
- Mở rộng thuật toán tìm kiếm cover đa tầng trong `parse_archive`:
  1. Thử `cover_id` từ OPF manifest chuẩn.
  2. Heuristic 1: Tìm manifest item có ID `cover`, `cover-image`, `cover_image`, `coverimage` định dạng ảnh.
  3. Heuristic 2: Tìm manifest item có đường dẫn `href` chứa `cover` hoặc `bia` định dạng ảnh (`.jpg`, `.jpeg`, `.png`, `.webp`).
  4. Hỗ trợ fallback nạp ảnh từ đường dẫn tương đối hoặc tuyệt đối trong file ZIP.
- Viết unit test `test_parse_bytes_heuristic_cover_detection` trong Rust (đạt 81/81 test pass).

### D. Thêm Hero Showcase Bìa Sách trên Workbench (`src/components/books/BookView.tsx`)
- Thêm **Active Book Showcase & Cover Hero Banner** ngay trên đầu trang quản lý sách:
  - Hiển thị ảnh bìa sắc nét tỉ lệ 2:3 với hiệu ứng hover zoom.
  - Nút phóng to xem toàn màn hình (Modal Lightbox).
  - Nút đổi nhanh ảnh bìa chuyển thẳng sang tab Gallery của `MetadataModal`.
  - Hiển thị badge trạng thái "Đã gắn Bìa Sách" hoặc nút "+ Thêm ảnh bìa" nếu sách chưa có bìa.

### E. Tích Hợp Xem Bìa Trong Trình Đọc Thử (`src/components/preview/EpubReaderViewer.tsx`)
- Thêm mục **Trang Bìa Tác Phẩm (Cover)** cố định ở đầu danh mục TOC dropdown.
- Cho phép lật trang về trước từ Chương 1 để xem Trang Bìa.
- Render trang bìa sách responsive trong iframe với ảnh bìa độ nét cao, bóng đổ trang sách và thông tin tác phẩm.

---

## 3. Bằng Chứng Nghiệm Thu & Kiểm Thử

| Hạng mục kiểm tra | Kết quả | Chi tiết |
| :--- | :--- | :--- |
| `cargo test --lib` (Rust) | **81 passed (1 suite)** | Test heuristic phát hiện cover vượt qua 100%. |
| `npx tsc --noEmit` (TypeScript) | **Exit code 0** | Không có bất kỳ lỗi type hay cú pháp nào. |
| `npx vitest run` (Unit Tests) | **39 passed (419 tests)** | 100% tests toàn bộ dự án vượt qua. |
| Cơ chế lưu IndexedDB | **Đã kiểm chứng** | Ảnh bìa không còn bị quota localStorage xóa mất. |
