# Kế Hoạch Triển Khai: Tự Động Nhận Diện Ngôn Ngữ, Thuật Ngữ, Tên Riêng & Contextual Research Grounding (Trạng thái: Hoàn Thành)

## Kết Quả Kiểm Thử & Nghiệm Thu
- [x] **Language Detection**: `LanguageDetector` đạt 100% pass trên 11 bài test (Anh, Trung, Nhật, Hàn, Nga, Pháp, Đức, Tây Ban Nha, Việt Nam).
- [x] **Entity Extraction & AI Proposal**: `EntityExtractor` đạt 100% pass trên 4 bài test (Heuristic X-Ray reuse, AI translation proposal, graceful offline degradation, deterministic conflict merge).
- [x] **Contextual Research Brief**: `BookResearchService` đạt 100% pass trên 4 bài test (Hard-cap <= 1200 chars tại ranh giới câu, tagged boundary isolation, prompt injection).
- [x] **Toàn bộ Test Suite**: 24 test suites Vitest (213 tests) passed 100%, 75/75 Rust tests passed 100%, `npm run build` thành công trong 1.30s.

## 1. Mục tiêu & Yêu cầu
Bổ sung 3 năng lực nâng cao cho Trình Dịch Sách AI (Book Translator):
1. **Tự động nhận diện ngôn ngữ gốc (Auto Language Detection)**:
   - Tận dụng `dc:language` từ metadata EPUB làm nguồn tham chiếu chính.
   - Kết hợp thuật toán Heuristic phân tích dải ký tự Unicode (CJK, Hiragana/Katakana, Hangul, Cyrillic, và bộ ký tự dấu tiếng Việt nghiêm ngặt từ `vietnameseHelper.ts`).
   - Phân tích tần suất stop-words (tiếng Anh, Pháp, Đức, Tây Ban Nha) với ngưỡng sàn (confidence floor).
   - Trả về cấu trúc rõ ràng: `{ languageCode, languageName, confidence, source }` để UI hiển thị và tự động chọn 1-click.

2. **Tự động nhận diện thuật ngữ & tên riêng (Auto Entity & Terminology Extraction)**:
   - Tái sử dụng bộ máy quét heuristic sẵn có từ `xrayService.ts` (`extractXRayHeuristic`: quét danh xưng honorifics, lời thoại dialogue, cụm danh từ phrase candidates).
   - Lọc và chuẩn hóa (dedup case/whitespace, giới hạn top 20 thực thể phổ biến nhất).
   - Gọi AI đề xuất bản dịch chuẩn tiếng Việt / phiên âm Hán-Việt / danh xưng nhân vật dựa trên bối cảnh tác phẩm.
   - Bảng duyệt UI: Người dùng xem trước, chỉnh sửa và chủ động bấm "Thêm vào Glossary" (không tự động ghi đè thuật ngữ người dùng đã tùy chỉnh).

3. **Nghiên cứu bối cảnh tác phẩm & Đối chiếu dịch thuật (Contextual Research Brief Grounding)**:
   - Nghiên cứu bối cảnh tác phẩm (Setting, thời đại, hệ thống nhân vật và quy tắc xưng hô: huynh/muội, anh/em, chú/cháu, nàng/chàng).
   - Tạo "Hồ sơ nghiên cứu tác phẩm" (Research Brief) có giới hạn độ dài nghiêm ngặt (hard-cap <= 1800 ký tự / ~350 từ) để không tốn token của từng chunk.
   - Phân định rõ ràng ranh giới dữ liệu tham khảo (chống prompt injection từ nội dung sách thô).
   - Cho phép người dùng chỉnh sửa, lưu vào dự án, và bật/tắt tùy chọn đưa vào prompt dịch từng chương.

---

## 2. Kế hoạch từng bước

### Bước 1: Bộ nhận diện ngôn ngữ (`src/utils/languageDetector.ts`)
- Tái sử dụng `isVietnameseText`, `isVietnameseLanguage` từ `vietnameseHelper.ts`.
- Viết unit test cho các ngôn ngữ: Anh, Trung, Nhật, Hàn, Pháp, Đức, Nga, Tây Ban Nha, Việt Nam.

### Bước 2: Trích xuất thực thể & Đề xuất dịch thuật ngữ (`src/services/translation/entityExtractor.ts`)
- Tái sử dụng `extractXRayHeuristic` từ `xrayService.ts`.
- Gửi top candidates tới AI Gateway (`call_ai_completion`) để dịch tên và thuật ngữ.
- Unit test cho việc trích xuất và ánh xạ kết quả.

### Bước 3: Nghiên cứu tác phẩm & Bơm ngữ cảnh (`src/services/translation/bookResearchService.ts`)
- Hàm `generateResearchBrief`: tổng hợp thông tin bối cảnh & xưng hô nhân vật.
- Hard token cap (cắt ngắn an toàn ở ranh giới câu, tối đa 1800 ký tự).
- Tích hợp vào `buildUserPrompt` trong `bookTranslator.ts`.
- Unit test kiểm tra hard cap và prompt formatting.

### Bước 4: Tích hợp Giao diện (`BookTranslatorView.tsx`) & Store (`useAppStore.ts`)
- Nút "Tự động nhận diện ngôn ngữ" kèm badge hiển thị độ tin cậy.
- Modal / Panel "Quét thuật ngữ & Tên riêng tự động" có checkbox chọn lọc.
- Panel "Hồ sơ nghiên cứu ngữ cảnh (Research Brief)" cho phép xem/sửa/tạo mới.

### Bước 5: Kiểm thử toàn diện & Hồi quy
- Vitest frontend (toàn bộ test suites pass).
- Cargo test backend (75 tests pass).
- `npm run build` clean.
