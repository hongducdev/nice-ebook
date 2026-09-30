# Phase 02: Book Agent Tool Gatekeeper

## Mục tiêu
Bảo vệ Book Chat Agent khỏi Prompt Injection và các hành vi phá hoại thông qua cơ chế thẩm định quyền thực thi công cụ (Tool Execution Gatekeeper) và làm sạch dữ liệu đầu ra (Output Scrubber).

## Nhiệm vụ
- [ ] 1. Trong `src/services/agent/agentTools.ts`:
  - Thêm ma trận thẩm định an toàn (Verdict Matrix) cho các công cụ:
    - `ALLOW`: Công cụ đọc an toàn (`search_book_content`, `get_chapter_summary`, `get_reading_progress`).
    - `WARN`: Công cụ sửa đổi (`update_book_metadata`) - yêu cầu xác nhận hoặc ghi log cảnh báo.
    - `BLOCK`: Phát hiện tham số bất thường, path traversal (`../`), hoặc lệnh độc hại.
  - Tích hợp `maskSecrets` vào kết quả trả về của các công cụ để LLM không thể đọc trộm key từ context.
- [ ] 2. Trong `src/services/agent/agentService.ts`:
  - Thực thi kiểm tra Gatekeeper trước khi gọi `executeTool`.
  - Nếu công cụ bị `BLOCK`, từ chối chạy và trả về lý do an toàn cho Agent xử lý.
- [ ] 3. Cập nhật và bổ sung unit test `src/services/agent/agentTools.test.ts` để kiểm chứng hành vi Gatekeeper.
