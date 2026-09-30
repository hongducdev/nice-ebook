---
title: AI Book Translator - Studio Translation Engine
description: >-
  Implementation roadmap for Book Translation in NiceEbook Studio,
  featuring surgical XHTML preservation, robust Rust-backed AI gateway dispatch,
  chunked block translation, literary tone presets, bilingual parallel reading mode,
  glossary management, and full Studio integration.
status: completed
priority: P1
branch: main
tags:
  - desktop
  - tauri
  - rust
  - react
  - translation
  - ai-gateway
  - epub
  - bilingual
blockedBy: []
blocks: []
created: '2026-09-28T00:00:00.000Z'
createdBy: 'ck:cook'
source: skill
---

# Kế Hoạch Triển Khai: Chức Năng Dịch Sách AI (Book Translator Studio)

## 1. Mục tiêu & Bối cảnh
Người dùng có nhu cầu dịch sách điện tử (EPUB, tài liệu chuyển đổi từ PDF/TXT/MD) từ các ngôn ngữ nước ngoài (tiếng Anh, tiếng Trung, tiếng Nhật, tiếng Pháp,...) sang **tiếng Việt** (hoặc giữa các ngôn ngữ khác).

### Thách thức kỹ thuật chính:
1. **Bảo toàn 100% cấu trúc XHTML của EPUB**:
   EPUB là tập hợp các file XHTML nghiêm ngặt (`content.opf`, `toc.ncx`, `nav.xhtml`, các file chương). Việc đưa toàn bộ mã nguồn HTML vào LLM thường làm hỏng thẻ đóng, mất thuộc tính CSS, mất ảnh, chú thích chân trang hoặc phá vỡ cấu trúc XML.
   -> **Giải pháp**: Xây dựng cơ chế **Surgical Block Replacement** (thay thế văn bản phẫu thuật). Trích xuất các block văn bản (`<p>`, `<h1>`-`<h6>`, `<blockquote>`), gán ID định danh duy nhất (`p_0`, `p_1`...), dịch theo mẻ (chunk 10-15 đoạn để giữ ngữ cảnh liền mạch), sau đó thay thế chính xác phần nội dung văn bản bên trong, giữ nguyên vẹn 100% cấu trúc thẻ bao bọc, header, footer, ảnh và doctype.

2. **An toàn mạng & Loại bỏ rủi ro CORS (Rust-backed Egress)**:
   Để tránh các lỗi CORS của trình duyệt Webview và bảo đảm an toàn kết nối, việc gọi AI Gateway / LLM (OpenAI-compatible, LM Studio, Ollama `http://localhost`, DeepSeek, OpenRouter...) được thực hiện thông qua Tauri Command trong Rust (`call_ai_completion`) với cấu hình timeout, stream abort và quản lý kết nối chuẩn mực.

3. **Chế độ hiển thị đa dạng**:
   - **Chỉ bản dịch (Replace Mode)**: Thay thế hoàn toàn văn bản gốc bằng bản dịch tiếng Việt mượt mà.
   - **Song ngữ đối chiếu (Bilingual Mode)**: Giữ đoạn gốc và chèn ngay đoạn dịch kế tiếp (`<div class="bilingual-pair"><p class="bilingual-orig">...</p><p class="bilingual-trans">...</p></div>`), được định kiểu thẩm mỹ theo phong cách LinguaGacha, cực kỳ giá trị cho người học ngoại ngữ hoặc đối chiếu thuật ngữ.

4. **Văn phong & Thuật ngữ (Tone Presets & Custom Glossary)**:
   - Các preset văn phong chuyên sâu: Văn học/Tiểu thuyết, Kiếm hiệp/Hán Việt, Phi hư cấu & Khoa học, Light Novel.
   - Bảng thuật ngữ / Tên nhân vật (Glossary): Cho phép người dùng cố định tên nhân vật hoặc thuật ngữ kỹ thuật, tự động đưa vào prompt và hậu xử lý để bản dịch nhất quán 100% qua tất cả các chương.

---

## 2. Lộ trình triển khai (Phased Roadmap)

### Phase 1: Surgical XHTML Chapter Translator & Rust AI Dispatch
- **Backend Rust (`src-tauri/src/lib.rs`)**:
  - Thêm lệnh `call_ai_completion(base_url, api_key, model, messages, temperature, max_tokens)` sử dụng `reqwest` của Rust: hỗ trợ cả `http://localhost` (Ollama, LM Studio) lẫn HTTPS remote (DeepSeek, OpenAI, etc.), timeout có thể cấu hình, trả về chuỗi phản hồi hoặc lỗi chi tiết.
- **Frontend Core Utility (`src/utils/chapterTranslator.ts`)**:
  - `ChapterTranslator.extractTranslatableBlocks(html)`: trích xuất các block văn bản có nội dung thực tế (`<p>`, `<h1>`-`<h6>`, `<blockquote>`, `<li>`), gán block ID ổn định.
  - `ChapterTranslator.chunkBlocks(blocks, maxCharsOrItems)`: gom nhóm 10-15 block/mẻ (khoảng 800 - 1500 ký tự) để gửi lên LLM giữ tính liên kết ngữ cảnh.
  - `ChapterTranslator.applyTranslations(originalHtml, translationsMap, mode: 'replace' | 'bilingual')`: thay thế phẫu thuật nội dung text node, bảo toàn nguyên vẹn doctype, `<head>`, metadata, thẻ ảnh `<img>`, svg, id, class.
  - `ChapterTranslator.applyGlossary(text, glossary)`: chuẩn hóa thuật ngữ và danh xưng.
- **Kiểm thử**:
  - Test round-trip trên chương XHTML thực tế (khẳng định EPUB sau khi dịch không bị lỗi cú pháp XHTML, các thẻ ảnh và chú thích nguyên vẹn).
  - Test chunk boundary & block ID mapping (thứ tự và số lượng block bảo toàn).
  - Test abort mid-batch (không ghi đè chương dở dang).

### Phase 2: Translation Service & Specialized Prompt Engine
- **Prompt Engine (`src/services/prompts/bookTranslator.ts`)**:
  - Hệ thống system prompt tối ưu hóa cho dịch sách theo phong cách LinguaGacha.
  - Tích hợp Tone Presets: `literary` (văn học), `wuxia` (kiếm hiệp / Hán Việt), `academic` (khoa học / phi hư cấu), `light_novel` (trẻ trung, đối thoại tự nhiên).
  - Cấu trúc phản hồi JSON nghiêm ngặt dạng `[{"id": "p_0", "text": "..."}]` để dễ dàng map ngược vào HTML.
- **Translation Orchestrator (`src/services/translation/translationService.ts`)**:
  - `translateChapter(...)`: nhận vào HTML chương sách, thực hiện chia chunk, gọi `call_ai_completion` (kèm fallback model nếu cấu hình), map kết quả vào HTML.
  - Hỗ trợ báo cáo tiến độ chi tiết từng mẻ (`onProgress`, `onLog`).
  - Hỗ trợ AbortController để dừng ngay lập tức khi người dùng bấm Hủy/Tạm dừng.
- **Kiểm thử**:
  - Unit tests cho prompt generator và parser phản hồi JSON.
  - Mock test cho `TranslationService` xử lý lỗi mạng, retry và fallback.

### Phase 3: Zustand Store Integration & State Management
- **Store (`src/stores/useAppStore.ts`)**:
  - Mở rộng kiểu `AppState`:
    - `activeTab`: bổ sung tab `"translator"`.
    - `translationConfig`: `{ sourceLang: string, targetLang: string, mode: "replace" | "bilingual", styleTone: string, glossary: Record<string, string>, batchSize: number }`.
    - `translationProgress`: `{ currentChapterIdx: number, totalChapters: number, currentChapterTitle: string, currentBlock: number, totalBlocks: number, percent: number }`.
    - `isTranslating: boolean`.
  - Actions:
    - `setTranslationConfig(...)`.
    - `translateSingleChapter(chapterIdx)`: dịch 1 chương và cập nhật vào `modifiedChapters`.
    - `batchTranslateChapters(chapterIndices)`: dịch hàng loạt chương theo phạm vi lựa chọn với khả năng tạm dừng/tiếp tục.
    - `stopTranslation()`: kích hoạt AbortController.
    - `resetChapterTranslation(href)`: khôi phục chương về bản gốc.
  - Tự động lưu `modifiedChapters` vào IndexedDB dự án (`saveChaptersToDb`).

### Phase 4: UI BookTranslatorView & Toàn bộ tích hợp Studio
- **Giao diện Dịch thuật (`src/components/translation/BookTranslatorView.tsx`)**:
  - Thiết kế theo chuẩn LinguaGacha:
    - Bảng điều khiển cấu hình: Cặp ngôn ngữ (Anh/Trung/Nhật/Pháp -> Việt,...), Chế độ (Chỉ bản dịch / Song ngữ đối chiếu), Văn phong (Văn học, Kiếm hiệp,...), Danh sách thuật ngữ tùy chỉnh (Glossary).
    - Bộ chọn phạm vi: Toàn bộ sách / Các chương chưa dịch / Chương hiện tại / Khoảng chương tùy biến.
    - Thanh tiến độ động: Hiển thị % tiến độ, số từ/phút, thời gian ước tính, trạng thái từng chương (Chưa dịch, Đang dịch, Đã dịch, Lỗi).
    - Cửa sổ Log Terminal: Nhật ký xử lý từng mẻ dịch trực quan.
    - Khung xem trước song ngữ trực tiếp (Original vs Translated side-by-side hoặc interlinear).
    - Thao tác nhanh: "Áp dụng vào sách", "Đọc thử ngay (Chuyển sang Reader)", "Xuất EPUB bản dịch".
- **Tích hợp Shell & Giao diện**:
  - `Sidebar.tsx`: Thêm mục "Dịch thuật AI" với icon `Languages` / `Globe` và badge trạng thái.
  - `BookView.tsx`: Thêm nút thao tác nhanh "Dịch sách AI" bên cạnh các nút AI hiện có.
  - `App.tsx`: Đăng ký render `<BookTranslatorView />` khi `activeTab === "translator"`.
  - `globals.css`: Thêm kiểu hiển thị CSS cho đoạn văn song ngữ (`.bilingual-pair`, `.bilingual-original`, `.bilingual-translated`).

### Phase 5: Kiểm Thử Toàn Diện & Xuất Bản
- Chạy toàn bộ test suites (`npm run test` + `cargo test`).
- Kiểm tra `npm run build` không lỗi TypeScript.
- Kiểm tra tính tương thích khi xuất file EPUB / Kindle AZW3 có chứa nội dung đã dịch (cả chế độ Replace và Bilingual).

---

## 3. Tiêu chí thành công (Acceptance Criteria)
1. Dịch được các file EPUB thực tế từ tiếng nước ngoài sang tiếng Việt mượt mà.
2. Cấu trúc XHTML của file EPUB được bảo toàn 100% (không rách thẻ, không mất ảnh, không lỗi XML).
3. Hỗ trợ chế độ Song ngữ (Bilingual) đối chiếu từng đoạn văn thẩm mỹ trên trình đọc và khi xuất file.
4. Quản lý Glossary hoạt động chính xác, đảm bảo tên nhân vật và thuật ngữ đồng nhất xuyên suốt cuốn sách.
5. Có thể Tạm dừng/Dừng bất kỳ lúc nào mà không làm hỏng dữ liệu chương đang dịch.
6. 100% test suites (Rust + Frontend) đều vượt qua, không có hồi quy.
