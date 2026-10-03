# Technical Journal: Kế Thừa Phong Cách Gốc, Tự Động Phân Trang & Hàn Gắn Tiếng Việt

**Thời gian:** 2026-10-04 00:42  
**Mục tiêu:** Nâng cấp toàn diện bộ điều khiển dàn trang (`TypographyControls`), tự động kế thừa định dạng nguyên bản từ EPUB gốc (không rò rỉ preset Kiếm hiệp), khắc phục lỗi vỡ dấu tiếng Việt (NFD/rách khoảng trắng âm tiết) và tự động chia tách cấu trúc trang sách (Title, Author, Disclaimer, Chapter) chuẩn e-reader.  
**Phạm vi:** 15 file (`TypographyControls.tsx`, `TypographyControls.test.tsx`, `styles.ts`, `chapterPaginator.ts`, `chapterPaginator.test.ts`, `vietnameseHelper.ts`, `vietnameseHelper.test.ts`, `bookTranslator.ts`, `bookTranslator.test.ts`, `translationService.ts`, `useAppStore.ts`, `useAppStore.test.ts`, `cssGenerator.ts`, `htmlSanitizer.ts`, `chapterTranslator.ts`) — 2205 dòng thêm / 608 dòng bớt.

---

## 1. Bối Cảnh & Vấn Đề Thực Tế Cần Giải Quyết

1. **Rò rỉ Preset Kiếm Hiệp vào Bản Gốc:** Khi người dùng chọn "Bản Gốc" (`book-native`), hệ thống trước đây sử dụng `STYLE_PRESETS[0]` ("Kiếm Hiệp Cổ Điển") làm fallback ngầm định, khiến một số thuộc tính (font, canh lề, màu sắc) của truyện tiên hiệp/cổ trang bị rỉ sang các sách phi hư cấu hoặc văn học phương Tây.
2. **Lỗi Trắng Nền / Chữ Đen Nền Đen trên Kindle & Kobo:** Nhiều file EPUB gốc nhúng cứng mã màu `#161618` hoặc màu nền cố định trong stylesheet CSS, khi đưa vào chế độ Dark Mode của Kindle/Kobo dẫn đến thảm họa hiển thị (chữ đen trên nền đen).
3. **Lỗi Phân Rã Unicode & Dấu Cách Rách Âm Tiết Tiếng Việt:** Dữ liệu ebook OCR hoặc chuyển đổi từ các trang mạng thường gặp lỗi phân rã Unicode (NFD thay vì NFC), dấu huyền/sắc bị văng ra thành dấu nháy đơn/ngã (`tâ`m`, `vê``), hoặc phụ âm cuối bị tách rời khỏi nguyên âm có dấu (`Ấ y`, `Chế t`, `Cuố n`, `gố c`).
4. **Cấu Trúc Trang Sách Bị Nhồi Nhét Vào Một Màn:** Tiêu đề sách, tác giả, lời tựa bản quyền, và phần mở đầu chương bị dồn cục vào cùng một dòng hoặc một trang, không có ngắt trang (`page-break`) chuẩn EPUB.
5. **Dịch Thuật Bị Tóm Tắt & Bỏ Sót CJK:** Quá trình dịch sách AI đối với các đoạn CJK (Trung/Nhật/Hàn) đôi khi bị LLM tóm tắt cắt ngắn bất thường (độ dài tiếng Việt nhỏ hơn 65% văn bản gốc) hoặc để sót các cụm chữ Hán chưa dịch (tên riêng, thành ngữ).

---

## 2. Giải Pháp Kỹ Thuật

### A. Tách Biệt Hoàn Toàn `DEFAULT_NATIVE_FALLBACK` & Chống Rò Rỉ Preset
- Khởi tạo hằng số `DEFAULT_NATIVE_FALLBACK` độc lập với ID `book-native`, tên "Bản Gốc Tự Động", sử dụng font hệ thống trung tính và `Literata` / `Noto Serif`.
- Cập nhật `nativeStylePatch` trong `useAppStore.ts` để tự động kế thừa chính xác `fontSize` và `textAlign` đo được từ chữ ký sách gốc (`bookStyleSignature`).
- Bổ sung bộ lọc chống xung đột màu nền (`background-color: transparent !important; color: inherit !important`) khi AI phát hiện stylesheet có thuộc tính cố định nguy hiểm.

### B. Module Tự Động Phân Trang Cấu Trúc Sách (`chapterPaginator.ts`)
- Tự động nhận diện ngữ nghĩa từng đoạn văn bản:
  - **Trang Tiêu Đề:** Nhận biết Title & Author để tạo trang bìa/lót chuẩn với `break-after: page`.
  - **Trang Bản Quyền / Lời Tựa:** Nhận diện các cảnh báo bản quyền, nguồn gốc (như "Kỳ Thư Võng", "Tuyên bố miễn trừ...") đóng khung thành trang riêng.
  - **Trang Thân Bài Chương:** Định vị chính xác tiêu đề chương (`Chương X`, `Hồi Y`, `Chapter Z`) và phân tách phần nội dung dẫn chuyện.
  - Chèn vạch ngăn trang trực quan cho Web Preview và ẩn đi trong môi trường máy đọc sách thật (`@media print, amzn-mobi, amzn-kf8`).

### C. Hàn Gắn Dấu & Chuẩn Hóa Typography Tiếng Việt (`vietnameseHelper.ts`)
- Hàm thuần `healVietnameseTypographyAndDiacritics`:
  - Chuẩn hóa Unicode `normalize("NFC")`.
  - Hàn gắn dấu thanh bị văng tách (`GRAVE_MAP`, `ACUTE_MAP`).
  - Sử dụng Regex Unicode Property Escapes (`\p{L}`) để gắn liền nguyên âm có dấu với phụ âm cuối bị gõ lệch khoảng trắng (`(?<![\p{L}\p{N}])([\p{L}]*?[áàả...])\s+([cmnpt]|ng|ch|nh|[iyu])(?!\p{L})`).

### D. Tái Thiết Bộ Điều Khiển `TypographyControls.tsx`
- Tích hợp Base UI components và Pistachio OKLCH tokens từ `DESIGN.md`.
- Trình xem trước Live XHTML Preview nhúng trong `iframe` biệt lập:
  - Hỗ trợ chuyển đổi nhanh 3 chủ đề đọc: Ban ngày (Day - Trắng), Hoài niệm (Sepia - Giấy ngà), Ban đêm (Night - Nền tối chống mỏi mắt).
  - Tự động phóng to/thu nhỏ kích thước xem trước (Desktop, Tablet, Mobile).
  - Bảng AI Style Audit hiển thị trực quan các cảnh báo, điểm số (Score 0-100) và 1-click sửa toàn diện.

### E. Nâng Cấp Bộ Dịch Thuật LinguaGacha Chống Tóm Tắt & Phục Hồi CJK
- Tinh chỉnh chunking với mật độ chú ý cao: hạ từ 2000 ký tự xuống 1200 ký tự (~8 khối văn bản) để tránh hiện tượng LLM mỏi ngữ cảnh sinh tóm tắt ở đuôi đoạn.
- Bổ sung `isTranslationTruncated` để phát hiện đoạn dịch bị cắt ngắn (< 65% độ dài gốc CJK).
- Bổ sung `extractUntranslatedFragments` và `buildCorrectionPrompt` để bóc tách chính xác các mảnh CJK chưa dịch và gửi lời nhắc sửa lỗi chuyên biệt.
- Chặn triệt để việc gán identity-pinning chữ Hán trong `autoConfigureGlossary`: nếu tên riêng chứa CJK mà AI chưa đề xuất bản dịch, bỏ qua thay vì gán nguyên chữ Hán thô vào glossary.

---

## 3. Kiểm Chứng & Đo Lường

| Tiêu chí | Kết quả | Ghi chú |
| --- | --- | --- |
| `npx tsc --noEmit` | **Exit 0** | Hoàn toàn sạch type lỗi |
| `npm test` | **51 test files / 585 tests pass** | 100% test pass (+29 tests mới) |
| `TypographyControls.test.tsx` | **5/5 tests pass** | Test render, đổi theme, chọn preset, iframe preview |
| `chapterPaginator.test.ts` | **3/3 tests pass** | Test tách Title/Author/Disclaimer/Chapter và phân trang |
| `vietnameseHelper.test.ts` | **Pass** | Test hàn gắn NFD->NFC, rách dấu và khoảng trắng |
| `bookTranslator.test.ts` | **Pass** | Test nhận diện CJK echo, phát hiện tóm tắt, tạo correction prompt |
| Commit Git | `fd6ffc74967102760e9913431f0cb61d470bce7a` | Clean working tree |

---

## 4. Quyết Định Kiến Trúc & Bài Học

1. **Iframe Preview là lớp bảo vệ bắt buộc cho CSS sách:** Render trực tiếp XHTML vào DOM của app dễ làm rò rỉ các luật CSS toàn cục (`html, body`) của sách vào UI desktop. Dùng `iframe` với `srcdoc` giúp cô lập 100% môi trường rendering của EPUB.
2. **Không bao giờ dùng preset phong cách cụ thể làm fallback cho "Bản Gốc":** Người đọc muốn bản gốc phải nhận được đúng những gì nhà xuất bản thiết kế; việc gán ngầm "Kiếm Hiệp" làm hỏng trải nghiệm của các thể loại khác.
3. **Bắt buộc kiểm tra tỷ lệ độ dài đối với bản dịch CJK -> Việt:** Do đặc thù chữ tượng hình cô đọng, tiếng Việt luôn dài hơn 1.5–3 lần. Nếu văn bản dịch ngắn hơn 65% văn bản gốc, 100% là do LLM đã tóm tắt hoặc bỏ sót câu.
4. **Hàn gắn tiếng Việt phải diễn ra trước bước phân tích ngữ nghĩa:** Nếu các từ khóa như `Chương`, `Ấy`, `Bản quyền` bị rách dấu hoặc tách khoảng trắng, regex cấu trúc sẽ trượt hoàn toàn.
