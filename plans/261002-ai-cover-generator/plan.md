# Kế Hoạch Triển Khai: Tạo Bìa Sách Bằng AI (AI Book Cover Generator) - NiceEbook Studio

## 1. Mục tiêu & Bối cảnh
Người dùng khi tạo mới hoặc chuyển đổi Ebook (tiểu thuyết, truyện dịch, sách khoa học, văn học, v.v.) thường không có sẵn ảnh bìa chất lượng cao, hoặc bìa gốc bị mờ, dính watermark, hoặc muốn có một tác phẩm bìa nghệ thuật độc bản phù hợp với thể loại sách.
Kế hoạch này bổ sung tính năng **Tạo Bìa Sách Bằng AI (AI Book Cover Generator)** vào NiceEbook Studio với 3 trụ cột:
1. **Engine Tạo Ảnh Đa Tầng**:
   - **Mặc định Miễn phí 100% (Zero-Config)**: Sử dụng Pollinations.ai (FLUX / Turbo) tỉ lệ 2:3 chuẩn Ebook (768x1152), không yêu cầu API Key, người dùng mở app là dùng được ngay.
   - **Hỗ trợ API Chuyên Nghiệp**: Tích hợp với OpenAI (DALL-E 3), SiliconFlow (FLUX.1-schnell, FLUX.1-dev, SD3.5), hoặc Custom OpenAI-Compatible endpoint khi người dùng có cấu hình API Key.
2. **Bộ Phong Cách Nghệ Thuật & Trợ Lý Prompt Thông Minh**:
   - Thư viện 10 phong cách tranh bìa chọn lọc: Sơn dầu Cổ điển, Huyền huyễn/Tiên hiệp, Cyberpunk/Sci-Fi, Light Novel/Anime, Thủy mặc Cổ phong, Trinh thám Noir, Bìa da mạ vàng Vintage, Màu nước Nghệ thuật, Kỳ ảo Tây phương, Tối giản Đồ họa.
   - Trình sinh Prompt tự động từ Tiêu đề, Tác giả, Thể loại và Tóm tắt sách.
   - Tối ưu hóa Prompt bằng AI LLM thông qua AI Gateway hiện có.
3. **Typography Overlay Studio (Gắn Chữ Tựa Đề & Tác Giả Lên Bìa)**:
   - Vì các mô hình AI tạo ảnh thường sinh chữ nguệch ngoạc vô nghĩa, bộ Typography Compositor sử dụng HTML5 Canvas cho phép gắn Tiêu đề, Tác giả, Phụ đề với font chữ nghệ thuật (Serif, Sans, Script), đổ bóng, viền mờ và dải gradient bảo vệ chữ.
   - Đảm bảo chất lượng xuất ảnh sắc nét chuẩn tỉ lệ 2:3, không làm ô nhiễm canvas (tainted canvas) nhờ luôn tải ảnh qua Data URL an toàn.

---

## 2. Thiết kế Kiến Trúc & Biện Pháp An Toàn (Architecture & Invariants)

1. **Rust Backend (`src-tauri/src/lib.rs`)**:
   - Nâng cấp `fetch_image_as_data_url`: hỗ trợ tham số tùy chọn `timeout_secs: Option<u64>` (mặc định 25s, clamp 5-120s) để tránh timeout khi các máy chủ tạo ảnh AI mất từ 15-30s để xử lý. Vẫn bảo toàn 100% cơ chế chống SSRF, ghim IP kết nối và giới hạn 8MB.
   - Bổ sung lệnh `call_image_generation_api`: Gửi request POST tới các endpoint có API key (OpenAI, SiliconFlow, Custom) từ tầng Rust. Giải quyết triệt để vấn đề CORS và bảo mật key trên ứng dụng desktop.
2. **Frontend Service (`src/services/ai/aiCoverService.ts`)**:
   - Quản lý logic gọi các engine (Pollinations, SiliconFlow, OpenAI, Custom).
   - Chuẩn hóa kích thước per-provider:
     - Pollinations: 768x1152 (chuẩn 2:3 Ebook).
     - SiliconFlow: 768x1152 (FLUX) hoặc 1024x1024.
     - OpenAI DALL-E 3: 1024x1792 (portrait) hoặc 1024x1024.
   - Quản lý thư viện preset style prompts, bộ lọc negative prompt tự động loại bỏ chữ lỗi, bàn tay méo, watermark.
   - Invariant đồ họa: **Không bao giờ vẽ trực tiếp remote URL lên canvas**; luôn luôn nạp qua Base64 Data URL thông qua `fetchCoverDataUrl`.
   - Invariant font chữ: Đợi `document.fonts.ready` trước khi `ctx.fillText` để tránh chữ bị render bằng font fallback hệ thống.
3. **Giao Diện Studio (`MetadataModal.tsx` & `BookView.tsx`)**:
   - Thêm tab `ai-cover` ("✨ Tạo bìa AI") vào `MetadataModal.tsx`.
   - Bảng điều khiển tạo bìa:
     - Khung nhập & tùy biến Prompt + Nút "Gợi ý tự động từ sách" + Nút "Tối ưu hóa bằng AI".
     - Bộ chọn Phong cách tranh trực quan (chips có icon).
     - Bộ chọn Engine (Pollinations Miễn phí, SiliconFlow FLUX, OpenAI DALL-E 3, Custom).
     - Bảng điều khiển Typography: Bật/tắt chữ, Font, Vị trí (Trên, Giữa, Dưới), Màu sắc (Vàng kim, Trắng, Đỏ son...), Dải gradient mờ bảo vệ chữ.
     - Bộ sưu tập biến thể đã tạo trong phiên (History Gallery): cho phép click xem lại, chỉnh typography, hoặc bấm "Áp dụng làm ảnh bìa" ngay tức thì.
     - Nút "Hủy bỏ" (Cancel via AbortController) khi đang tạo ảnh, thông báo trạng thái rõ ràng.
   - Cập nhật các điểm kích hoạt nhanh trên `BookView.tsx` để mở thẳng tab Tạo bìa AI.

---

## 3. Các Giai Đoạn Triển Khai (Phases)

### Phase 1: Rust Backend & Security Hardening
- [x] Cập nhật `src-tauri/src/lib.rs`:
  - `fetch_image_as_data_url` hỗ trợ `timeout_secs: Option<u64>`.
  - `call_image_generation_api` cho phép gửi POST JSON có Bearer auth qua Rust HTTP client với chính sách bảo mật URL nghiêm ngặt và ghim DNS IP chống SSRF/Rebinding.
  - Đăng ký command mới trong `invoke_handler`.
  - Viết/cập nhật unit test trong Rust (`cargo test`: 82/82 pass).

### Phase 2: AI Cover Service & Typography Compositor
- [x] Tạo `src/services/ai/aiCoverService.ts`:
  - Interface `CoverGenerationOptions`, `CoverStylePreset`, `TypographyOptions`, `GeneratedCoverItem`.
  - Danh sách 10 preset style chất lượng cao.
  - Hàm `buildCoverPrompt(book, style, customPrompt)`.
  - Hàm `enhancePromptWithAi(gateway, model, book, currentPrompt)`.
  - Hàm `generateCoverImage(options)` gọi Pollinations, SiliconFlow, DALL-E 3 hoặc custom endpoint qua Rust command.
  - Hàm `renderTypographyOnCover(base64DataUrl, typographyOptions)` xử lý Canvas an toàn, load font trước khi vẽ.
- [x] Tạo `src/services/ai/aiCoverService.test.ts` kiểm thử toàn diện:
  - Kiểm thử `buildCoverPrompt`.
  - Kiểm thử logic chọn kích thước và cấu trúc payload từng provider.
  - Kiểm thử mock canvas và kiểm tra lỗi.

### Phase 3: Tích hợp Giao diện AI Cover Studio
- [x] Tạo component con `src/components/metadata/AiCoverTab.tsx` và kiểm thử `AiCoverTab.test.tsx`.
- [x] Cập nhật `src/components/metadata/MetadataModal.tsx`:
  - Mở rộng kiểu `activeTab`: `"metadata" | "covers" | "upload" | "ai-cover"`.
  - Thêm tab icon và nội dung tab `ai-cover`.
  - Tích hợp controls tạo ảnh, preview, typography overlay, và gallery biến thể.
  - Kết nối lưu ảnh vào `coverDataUrl` và tự động lưu sách.
- [x] Cập nhật `src/components/books/BookView.tsx`:
  - Nút nhanh "Tạo Bìa Bằng AI..." dưới ảnh bìa và trong thanh công cụ.

### Phase 4: Kiểm Thử & Tinh Chỉnh (Verification)
- [x] Chạy `cargo test` để xác minh Rust backend (86/86 tests pass — 4 test SSRF mới).
- [x] Chạy `npm test` để xác minh 100% unit tests frontend vượt qua (48 test files, 586 tests pass).
- [x] Chạy `npm run build` (`tsc && vite build`) hoàn thành sạch sẽ không lỗi.
- [x] Thử nghiệm các kịch bản biên: font chữ tiếng Việt, dải gradient bảo vệ chữ, đổ bóng, tải ảnh về máy.

---

## 4. Đính chính & Sửa lỗi sau Code Review (Post-Review Fixes)

Bản kế hoạch ban đầu **đã tuyên bố quá mức** ở 3 điểm. Đã sửa:

| Tuyên bố sai | Thực tế | Cách sửa |
| --- | --- | --- |
| "Ghim DNS IP chống SSRF/Rebinding" cho `call_image_generation_api` | Chỉ áp dụng cho nhánh HTTPS; nhánh HTTP dùng `host.starts_with("127.")` — bypass được bằng domain `127.0.0.1.attacker.example`, rò khóa API dạng plaintext. | Kiểm tra host trên **địa chỉ đã parse**; loại bỏ link-local (169.254.0.0/16). |
| "Đợi `document.fonts.ready` để tránh fallback font" | Vô hiệu: 4/5 font trong picker (Cinzel/Playfair/Montserrat/Dancing Script) **chưa từng được nạp** → mọi lựa chọn serif render giống hệt nhau. | Đổi sang 5 font app thực sự nạp (Literata/Lora/Merriweather/Inter/Be Vietnam Pro) + gọi `document.fonts.load()`. |
| "Kiểm thử mock canvas" | Không có test nào chạy nhánh `enabled: true`; test font cũ chỉ kiểm tra chuỗi có chứa tên font (tautology). | Thêm test khẳng định font đầu tiên phải nằm trong danh sách font đã nạp và mỗi lựa chọn phải khác nhau. |

### Các lỗi nghiêm trọng đã sửa

1. **[CRITICAL] Đổi tiêu đề chương không được lưu** — Tiêu đề chương nằm trong HTML chương (`EbookProject` không có trường riêng). Code cũ chỉ ghi vào `currentBook.chapters[i].title` và chỉ rewrite `<h1>` **khi chương đã có trong `modifiedChapters`**. Chương chưa từng chỉnh sửa → không lưu gì, nhưng vẫn báo "đã lưu thành công". → `updateChapterTitle`/`batchUpdateChapterTitles` nay đọc HTML chương và ghi lại đúng thẻ mà parser dùng (`<h1>` → `<h2>` → `<title>`, chèn `<h1>` nếu chưa có), rồi trả về `boolean`/`number` để agent báo cáo trung thực.
2. **[CRITICAL] Batch dịch không thể dừng** — `stopTranslation` đặt controller về `null`, khiến mọi kiểm tra `translationAbortController?.signal.aborted` sau đó trả `undefined` (falsy) → batch chạy tới hết và tự bật lại `isTranslating`. → Batch giữ controller **cục bộ** và truyền `abortSignal` xuống từng chương.
3. **[IMPORTANT] Hủy tạo bìa AI là no-op** — `GenerateCoverRequest.signal` được khai báo nhưng không dùng. → Luồn signal xuyên suốt `generateCoverImage` → `fetchCoverDataUrl`/`callImageApi`.
4. **[IMPORTANT] Thẻ đề xuất hiển thị sai** — `isActive` dùng cờ toàn cục nên mọi thẻ dịch cũ bật lại "Đang thực thi..." khi có bất kỳ bản dịch nào chạy. → Chỉ `status === "pending"`/`executing` + đối chiếu `chapterIndex`.
5. **[IMPORTANT] Modal Metadata ghi đè chữ đang nhập** — effect đồng bộ theo `currentBook` ghi đè toàn bộ form. → Dùng snapshot + chỉ đồng bộ trường chưa bị người dùng sửa.
6. **[IMPORTANT] `$`/HTML injection khi đổi tiêu đề chương** — `html.replace(re, `<h1$1>${title}</h1>`)` khiến `$&`/`$1` bị khai triển và markup bị chèn thẳng vào EPUB. → Dùng callback + escape `& < > "` khớp tập un-escape của Rust parser.
