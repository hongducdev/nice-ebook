# Phase 02: Full-Spectrum Agent Tool Catalog & Jev Guardrail Gatekeeper

## Mục tiêu
Nâng cấp `src/services/agent/agentTools.ts` từ 7 công cụ cơ bản lên 13 công cụ đầy đủ, bao phủ toàn bộ chức năng cốt lõi của nice-ebook:
1. `get_workflow_status` (Read-only): Tra cứu các tác vụ nền đang chạy (translation, enhancement, OCR...).
2. `translate_chapter` (Mutating): Yêu cầu dịch chương chỉ định từ ngôn ngữ nguồn sang đích qua AI Gateway.
3. `enhance_chapter` (Mutating): Kích hoạt chuẩn hóa ngữ pháp, typography, sửa tiêu đề H1 và xóa rác/watermark cho chương.
4. `extract_xray_entities` (Mutating): Phân tích và trích xuất nhân vật/địa danh cho Kindle X-Ray.
5. `export_book` (Mutating): Kích hoạt quy trình xuất sách đóng gói (EPUB/AZW3/MOBI) với cấu hình chỉ định.
6. `import_content_snippet` (Mutating): Cho phép agent chèn trực tiếp ghi chú, lời tựa hoặc sửa nhanh một đoạn trong chương sách.

## Chi tiết công việc
- [ ] Mở rộng enum/definitions trong `AGENT_TOOLS` với đầy đủ JSON schema và mô tả chi tiết cho 6 công cụ mới.
- [ ] Bổ sung luật Jev Guardrail kiểm tra tham số của các công cụ mới (ngăn chặn path traversal khi export, ngăn chặn inject chuỗi độc hại).
- [ ] Cập nhật `executeReadOnlyTool` cho `get_workflow_status` đọc trực tiếp từ Store.
- [ ] Cập nhật `createActionProposal` cho 5 mutating tools mới để tạo visual diff/preview chi tiết, dễ hiểu cho người dùng duyệt.
- [ ] Cập nhật `executeApprovedAction` để kích hoạt đúng action trong Store và Services tương ứng.
- [ ] Viết unit tests kiểm thử toàn diện 13 tools trong `src/services/agent/agentTools.test.ts`.
