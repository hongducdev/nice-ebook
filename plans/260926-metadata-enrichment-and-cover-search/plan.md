# Kế Hoạch Triển Khai: Tự Động Bổ Sung Metadata & Tìm Kiếm Ảnh Bìa Đẹp (Nice Ebook Studio)

## 1. Mục tiêu
Bổ sung giải pháp tự động tìm kiếm, làm giàu metadata (tựa đề chuẩn, tác giả, mô tả nội dung, năm xuất bản, nhà xuất bản, thể loại, ISBN) và tìm kiếm ảnh bìa sách chất lượng cao từ nhiều nguồn trực tuyến đa dạng (Goodreads, Fable, Wattpad, Google Books, Open Library) kết hợp AI Gateway cho sách tiếng Việt và truyện mạng, đồng thời ghi lại chính xác vào file EPUB khi xuất bản.

---

## 2. Phạm vi & Giới hạn thiết kế (Scope & Architecture Decisions)
1. **Metadata Enrichment Đa Nguồn**:
   - Tự động làm sạch tên file / tựa sách rác (loại bỏ `[dtv-ebook.com]`, `(Full)`, `sachvui`, ký tự gạch dưới, đuôi file `.epub`, v.v.).
   - Hỗ trợ cả sách xuất bản lẫn truyện mạng/Webnovel:
     - **Goodreads API**: Hỗ trợ tìm kiếm tác phẩm văn học, tiểu thuyết dịch, trinh thám (như Keigo Higashino), điểm đánh giá cộng đồng, tóm tắt và ảnh bìa gốc độ nét cao (loại bỏ hậu tố thumbnail `._SY..._`).
     - **Fable API**: Hỗ trợ kho sách quốc tế, lời giới thiệu/synopsis trau chuốt, mã ISBN và ảnh bìa HD.
     - **Wattpad API**: Chuyên biệt cho truyện mạng, fanfiction, light novel, truyện dịch; tự động lấy Văn án, tác giả, tình trạng (Hoàn thành / Đang ra), thể loại và ảnh bìa 1024px HD.
     - **Google Books & Open Library API**: Bổ sung kho dữ liệu sách xuất bản và văn học cổ điển.
   - **AI Metadata Assistant (Hỗ trợ chuyên biệt tiếng Việt & Truyện mạng)**: Tự động đọc trích đoạn chương đầu để nhận diện sách xuất bản hay truyện mạng, chuẩn hóa chính tả tiếng Việt có dấu, xác định thể loại (Ngôn tình, Tiên hiệp, Đam mỹ, Huyền huyễn...) và trích xuất/viết lại Văn án chuẩn mực.
   - **Diff & Confirm UI**: Không ghi đè âm thầm dữ liệu đang có của người dùng. Cho phép xem trước các trường tìm được (check/uncheck) trước khi áp dụng.

2. **Cover Image Search**:
   - Tìm kiếm nhiều phiên bản bìa sách từ Goodreads, Fable, Wattpad, Google Books, Open Library.
   - Hiển thị thư viện lưới ảnh bìa (Cover Gallery) kèm thông số kích thước/độ phân giải (1024px HD, Goodreads HD...).
   - Xem trước và chọn ảnh bìa chỉ với 1 click.
   - Cho phép tải ảnh trực tiếp từ máy hoặc dán URL ảnh bìa ngoài.

3. **Backend & Network Security (Rust)**:
   - Command Rust `fetch_image_as_data_url`:
     - Giới hạn scheme: chỉ `http` hoặc `https`.
     - Chặn triệt để SSRF: từ chối toàn bộ dải IP riêng (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16), IPv6 loopback, link-local, ULA, IPv4-mapped IPv6 `::ffff:x.x.x.x`.
     - Phân giải DNS bất đồng bộ và **ghim IP kết nối (`.resolve()`)** để chống hoàn toàn nguy cơ DNS Rebinding / TOCTOU.
     - Xử lý chuyển hướng thủ công tối đa 3 lần, kiểm tra DNS và ghim IP độc lập cho từng chặng.
     - Đọc stream có giới hạn (tối đa 8MB) và kiểm tra Content-Length sớm để chống DoS / tràn bộ nhớ.
   - Command Rust `fetch_external_json`:
     - Cho phép frontend desktop tải dữ liệu JSON từ các nguồn được phép (`*.goodreads.com`, `*.fable.co`, `*.wattpad.com`, `*.openlibrary.org`, `*.googleapis.com`) vượt qua hạn chế CORS.
     - Giới hạn kích thước phản hồi tối đa 2MB.
   - Nâng cấp `export_epub` & `EpubWriter::repackage_archive`:
     - Cập nhật an toàn `<dc:title>`, `<dc:creator>`, `<dc:language>`, `<dc:description>` trong `content.opf`.
     - Giữ nguyên `dc:identifier`, `dc:date` và các namespace hiện hữu.
     - Xử lý 2 nhánh ảnh bìa: thay thế file bìa cũ hoặc chèn file bìa mới vào manifest/metadata OPF nếu sách trước đó chưa có bìa.
     - Cập nhật `docTitle`, `docAuthor` trong `toc.ncx` (nếu có).

---

## 3. Trạng thái thực hiện (Status: Completed)
- [x] Triển khai `bookMetadataService.ts` với Goodreads, Fable, Wattpad, Google Books, Open Library.
- [x] Triển khai `aiMetadataEnricher.ts` hỗ trợ sách xuất bản và văn án truyện mạng.
- [x] Triển khai `fetch_image_as_data_url` và `fetch_external_json` trong `src-tauri/src/lib.rs` kèm bộ kiểm tra SSRF và domain allowlist.
- [x] Giàn lại layout responsive cho `MetadataModal.tsx`, khắc phục lỗi vỡ tràn ngang, cắt chữ button, và co rúm trường ISBN.
- [x] Chuẩn hóa toàn bộ icon trạng thái loading sang `Loader2` có hiệu ứng xoay tròn.
- [x] Cập nhật `BookView.tsx`, `ConverterView.tsx`, `AppTitlebar.tsx`.
- [x] Toàn bộ 26 unit tests trong Rust backend và 107 unit tests trong Vitest frontend đều vượt qua thành công (100% pass).
