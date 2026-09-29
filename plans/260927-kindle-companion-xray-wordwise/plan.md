# Kế Hoạch Triển Khai: Kindle Companion — X-Ray & Word Wise Studio

## 1. Mục tiêu & Bối cảnh
Người dùng mong muốn bổ sung 2 tính năng tuyệt vời của máy đọc sách Kindle vào các sách điện tử chưa có:
1. **Word Wise**: Hiển thị chú thích giải nghĩa ngắn gọn ngay trên đầu các từ tiếng Anh nâng cao/khó để người đọc không bị gián đoạn mạch đọc.
2. **X-Ray**: Bách khoa toàn thư của cuốn sách, hiển thị hồ sơ nhân vật (People), thuật ngữ/địa danh (Terms), và ngữ cảnh xuất hiện (Occurrences/Excerpts) xuyên suốt các chương.

Do sách nạp ngoài (sideloaded) hoặc gửi qua *Send-to-Kindle* không được Amazon tạo sẵn dữ liệu này trên máy chủ, giải pháp của **NiceEbook Studio** là chủ động phân tích và tạo dữ liệu Word Wise & X-Ray với 2 hình thức:
- **Universal EPUB Native (Khuyên dùng)**: Nhúng thẻ HTML5 `<ruby>` cho Word Wise (hỗ trợ cả **Anh - Anh** lẫn **Anh - Việt**) và tạo chương phụ lục X-Ray Dramatis Personae. Hoạt động 100% khi gửi qua *Send-to-Kindle*, xem trên máy Kindle, Kobo, Apple Books và chính trình đọc NiceEbook.
- **Kindle Native Sidecar (`.sdr`)**: Tạo thư mục sidecar chứa database SQLite `LanguageLayer.en.<ASIN>.kll` và `XRAY.entities.<ASIN>.asc` theo đúng đặc tả của Kindle dành cho người dùng chép cáp USB.

---

## 2. Lộ trình triển khai (Phased Roadmap)

### Phase 1: Universal Word Wise Engine & Ruby Annotations
- **Mục tiêu**: Xây dựng module nhận diện từ vựng khó, tra cứu định nghĩa song ngữ (EN & VI) và biến đổi văn bản HTML chương sách bằng thẻ `<ruby>`.
- **Thành phần**:
  1. `src/services/kindle/wordWiseDict.ts`:
     - Bộ từ điển từ vựng chọn lọc phân cấp theo khung chuẩn CEFR (B2, C1, C2) với định nghĩa ngắn gọn, súc tích (Anh - Anh và Anh - Việt).
     - Bộ lemmatizer cơ bản xử lý chia thì, số nhiều (`-s`, `-es`, `-ed`, `-ing`, `-ly`).
  2. `src/services/kindle/wordWiseService.ts`:
     - Quét và nhận diện từ vựng trong các node văn bản của chương sách.
     - Cơ chế nhúng thẻ an toàn: chỉ chèn vào text nodes, không bao giờ can thiệp vào thẻ HTML, thuộc tính, thẻ `<code>`, `<pre>`, `<script>`, `<style>`.
     - Cấu trúc thẻ: `<ruby class="kindle-wordwise" data-difficulty="{level}">{word}<rt>{gloss}</rt></ruby>`.
     - Cơ chế gỡ bỏ (strip/unwrap): khôi phục lại nguyên bản HTML 100% không làm mất ký tự hay làm vỡ cấu trúc.
     - Tích hợp AI Contextual Enhancer (qua AI Gateway) khi người dùng muốn AI tinh chỉnh nghĩa chính xác theo ngữ cảnh của câu.
  3. Kiểm thử: Vitest unit test cho lemmatizer, bộ lọc độ khó, chèn thẻ an toàn và gỡ bỏ sạch sẽ.

### Phase 2: Universal X-Ray Engine & Dramatis Personae
- **Mục tiêu**: Phân tích nhân vật, thuật ngữ bằng AI/Heuristics và lập chỉ mục xuất hiện xuyên suốt tác phẩm.
- **Thành phần**:
  1. `src/services/kindle/xrayService.ts`:
     - Trích xuất nhân vật (tên, bí danh/aliases, vai trò, mô tả ngắn gọn).
     - Trích xuất thuật ngữ/địa danh quan trọng.
     - Quét vị trí xuất hiện (Occurrences) và trích đoạn tiêu biểu (Excerpts) trong từng chương.
     - Bộ sinh phụ lục `xray_appendix.xhtml`: Tạo trang Dramatis Personae & World Guide thiết kế chuẩn mực với avatar chữ cái, thẻ nhân vật, danh sách thuật ngữ và liên kết tra cứu.
  2. Kiểm thử: Vitest unit test cho việc dò quét nhân vật, trích xuất đoạn trích, và cấu trúc HTML phụ lục.

### Phase 3: Giao diện Kindle Companion Studio & Trình Đọc X-Ray
- **Mục tiêu**: Cung cấp giao diện trực quan cho người dùng tương tác, tùy biến và trải nghiệm khi đọc.
- **Thành phần**:
  1. `src/components/kindle/KindleCompanionView.tsx`:
     - Thêm mục vào Sidebar: "Kindle & Đọc nâng cao".
     - **Tab Word Wise**: Thanh trượt mức độ khó (1-5), chọn ngôn ngữ (Anh - Anh hoặc Anh - Việt), khung xem trước trực tiếp (Live Preview), nút "Áp dụng vào sách" và "Gỡ bỏ chú thích".
     - **Tab X-Ray**: Thống kê số nhân vật, thuật ngữ; danh sách thẻ nhân vật có thể xem/sửa/thêm mới; nút "Quét tự động bằng AI"; nút "Nhúng phụ lục vào sách".
     - **Tab Kindle Native (.sdr)**: Cấu hình mã ASIN, hướng dẫn chép USB, xuất file sidecar.
  2. Tích hợp vào `EpubReaderViewer.tsx`:
     - Thêm nút bật nhanh ngăn kéo (drawer) X-Ray trên thanh công cụ đọc sách.
     - Khi đọc bất kỳ chương nào, người đọc bấm nút là thấy ngay danh sách nhân vật xuất hiện trong chương đó.

### Phase 4: Kindle Native SDR Packager (Rust Backend)
- **Mục tiêu**: Hỗ trợ xuất trực tiếp thư mục `<book>.sdr` chứa database SQLite cho người dùng Kindle chép qua cáp USB.
- **Thành phần**:
  1. Kích hoạt `rusqlite = { version = "0.32", features = ["bundled"] }` trong `src-tauri/Cargo.toml`.
  2. `src-tauri/src/kindle/mod.rs` & `xray_db.rs`:
     - Tạo database `XRAY.entities.<ASIN>.asc` theo chuẩn: `PRAGMA user_version = 1`, các bảng `book_metadata`, `entity`, `entity_description`, `entity_excerpt`, `excerpt`, `occurrence`, `source`, `string`, `type`, và các chỉ mục B-tree.
  3. `src-tauri/src/kindle/wordwise_db.rs`:
     - Tạo database `LanguageLayer.en.<ASIN>.kll` theo chuẩn: bảng `metadata` và `glosses`.
  4. Command Tauri: `export_kindle_sdr` để ghi trực tiếp ra đĩa hoặc ổ Kindle.
  5. Kiểm thử: Rust unit tests kiểm tra cấu trúc bảng, khóa chính, PRAGMA user_version, và dữ liệu ghi ra.

---

### Phase 5: Bộ chuyển đổi Kindle nội bộ (thay thế Calibre)
- **Yêu cầu mới từ người dùng**: quá trình chuyển đổi phải là **core riêng của ứng dụng**, không phụ thuộc vào Calibre cài sẵn trên máy.
- **Thành phần**:
  1. Thêm `epub3-kindle = { version = "0.4", default-features = false }` (giấy phép MIT, thuần Rust) vào `src-tauri/Cargo.toml` — loại bỏ hoàn toàn phụ thuộc Calibre/kindlegen.
  2. `src-tauri/src/kindle/converter.rs`: module chuyển đổi nội bộ, hỗ trợ `.azw3` (KF8) và `.mobi` (Dual MOBI), ánh xạ lỗi theo từng giai đoạn sang thông báo tiếng Việt, thu thập cảnh báo không nghiêm trọng.
  3. Xoá `src-tauri/src/kindle/calibre.rs` cùng hai lệnh `kindle_calibre_status` / `convert_epub_to_azw3` (không còn phụ thuộc tiến trình ngoài).
  4. Hỗ trợ chương mới trong `EpubWriter` (`extra_chapters`): ghi tệp mới và đăng ký vào manifest/spine/NCX/nav; đồng thời chương ghi đè có `href` chưa tồn tại cũng được nâng thành chương mới (sửa lỗi phụ lục X-Ray trước đây bị bỏ im lặng).
  5. Command Tauri `export_kindle_book`: dựng EPUB tối ưu trong thư mục tạm rồi chuyển đổi, luôn dọn tệp tạm trên mọi nhánh lỗi.
  6. UI `ExportModal.tsx`: chọn định dạng xuất **Bản Kindle** (AZW3 / MOBI / EPUB cho Send-to-Kindle) kèm tuỳ chọn nhúng chú thích từ vựng và phụ lục tra cứu.
- **Bằng chứng kiểm chứng** (đã chạy thực tế, không phải giả định):
  - Sách thật 24 chương tiếng Việt, 72 thẻ `<ruby>`, ảnh bìa, CSS ngoài, phụ lục: 24.134 byte → 47.053 byte AZW3 trong **0,06 giây**.
  - Đọc lại bằng Calibre (chỉ dùng làm **trọng tài độc lập**, không phải phụ thuộc runtime): **72/72 thẻ ruby**, đủ 3 nghĩa tiếng Việt (phù du / tỉ mỉ / phổ biến khắp nơi), phụ lục Dramatis Personae với 2 thẻ nhân vật, 7.174 ký tự có dấu, ảnh bìa — đều nguyên vẹn.
  - Phát hiện đã kiểm chứng: chuyển đổi Kindle **loại bỏ thuộc tính `class`** trên `<ruby>` và bỏ `font-size` trên `<rt>`, nhưng **giữ `data-kindle-wordwise`** → do đó CSS dùng selector theo thuộc tính làm hook bền vững.
- **Giới hạn còn lại (nói rõ, không tô hồng)**:
  - Chưa kiểm chứng hiển thị trên máy Kindle thật (không có thiết bị). Bằng chứng dừng ở mức "trình đọc độc lập đọc được và cấu trúc chú thích nguyên vẹn".
  - Chú thích từ vựng hiển thị theo chuẩn **ruby**, KHÔNG kích hoạt công cụ Word Wise độc quyền của Amazon.
  - Đường dẫn `.sdr` (Phase 4) vẫn chưa kiểm chứng trên thiết bị và byte offset sẽ không khớp với tệp AZW3 do bộ chuyển đổi nội bộ tạo ra.

### Phase 5 — Các hạng mục đã đóng sau rà soát
1. **Nguồn gốc thư viện**: đã đọc trực tiếp mã nguồn crate đã tải về — giấy phép **MIT** (`LICENSE`, "Copyright (c) 2026 cbz-tools"), khai báo `license = "MIT"` trong manifest.
2. **Không gọi tiến trình ngoài**: rà soát toàn bộ `src/**/*.rs` của crate — không có `Command::new`/spawn. Kết quả grep ban đầu chỉ khớp `std::process::id()` (dùng để đặt tên tệp tạm), không phải gọi tiến trình con.
3. **`default-features = false` an toàn**: feature `cli` là feature rỗng (`cli = []`) và `[[bin]]` có `required-features = ["cli"]` → tắt feature chỉ loại bỏ binary CLI, không ảnh hưởng thư viện KF8.
4. **Cảnh báo W004 đã phân loại**: sách thử chỉ có duy nhất một `url()` là `@import` webfont Google Fonts từ xa; không có `@font-face`, không có font/ảnh cục bộ. Việc loại bỏ là đúng và vô hại.
5. **CSS theo thuộc tính đi vào tận container**: bài test `test_word_wise_glosses_reach_the_kindle_container` nay khẳng định cả `ruby-position` **trên các record KF8 đã chuyển đổi** (không phải trên EPUB nguồn).
6. **Ranh giới command đã có test**: tách `build_kindle_ready_epub_and_convert_staged` để kiểm tra dọn tệp tạm theo **đúng đường dẫn cụ thể** ở cả 3 nhánh (build lỗi, chuyển đổi lỗi, thành công). Bản test đếm toàn cục ban đầu **bị flaky do test chạy song song** — đã sửa; chạy lại 2 lần liên tiếp đều 48/48 pass.
7. **Mâu thuẫn giữa hai đường xuất**: ghi rõ trong UI — `.sdr` và AZW3 do ứng dụng tạo là **hai chế độ loại trừ nhau**, không ghép sidecar với tệp do core tạo.
8. **Ràng buộc được THỰC THI, không chỉ là văn bản**: `package_kindle_sdr` nay từ chối tạo sidecar nếu không thấy tệp sách đi kèm trong thư mục đích (`find_companion_book_file` tìm `.azw3/.mobi/.azw/.kfx`, có fallback không phân biệt hoa thường). Người dùng chỉ có thể bỏ qua bằng cách chủ động tích chọn "Tôi sẽ tự chép kèm tệp sách" (`allow_missing_book_file`). Kết quả trả về bổ sung `paired_book_file` để UI hiển thị rõ sidecar thuộc về tệp sách nào. Có 4 unit test cho hành vi này.
9. **Bằng chứng sau refactor được tạo lại từ đầu**: xoá artifact cũ, chạy lại cổng kiểm thử trên sách thật, ghi lại SHA-256 (`05EB3F53…`) rồi mới đọc lại bằng trọng tài độc lập — tránh việc dùng số liệu cũ để "hợp thức hoá" artifact mới.
10. **Không hồi quy đường xuất EPUB thường**: 14 test có sẵn của `epub::writer` (bao gồm `test_chapter_overrides_repackaging`, `test_e2e_epub_zip_conformance_and_mimetype_order`, `test_repackage_file_in_place_overwrite`) đều pass; thay đổi chỉ mang tính bổ sung (tham số mới tuỳ chọn, mặc định `None`).

---

## 4. Trạng thái thực hiện (Status: Completed)
- [x] **Phase 1: Universal Word Wise Engine**: Đã hoàn thành `wordWiseDict.ts` và `wordWiseService.ts`, kiểm thử 13 unit tests Vitest đạt 100% pass.
- [x] **Phase 2: Universal X-Ray Engine**: Đã hoàn thành `xrayService.ts` với trích xuất Heuristic, dò quét Occurrences/Excerpts, và sinh phụ lục `xray_appendix.xhtml` (Dramatis Personae), kiểm thử 3 unit tests Vitest đạt 100% pass.
- [x] **Phase 3: Kindle Companion Studio UI & Reader Integration**: Đã hoàn thành `KindleCompanionView.tsx`, tích hợp thanh điều hướng Sidebar, định tuyến App.tsx và ngăn kéo X-Ray Drawer trong `EpubReaderViewer.tsx`.
- [x] **Phase 4: Kindle Native SDR Packager**: Đã hoàn thành module Rust `src-tauri/src/kindle/` (`xray_db.rs`, `wordwise_db.rs`, `sdr_packager.rs`), lệnh Tauri `export_kindle_sdr`, và 3 unit tests trong Rust (`cargo test`) đạt 100% pass.
- [x] **Toàn bộ hệ thống**: 30/30 unit tests Rust pass, 18/18 test suites (129 unit tests) frontend pass, `tsc && vite build` thành công không có lỗi.

