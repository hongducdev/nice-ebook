---
title: Book Project Chat Agent Assistant
description: >-
  Implementation roadmap for an AI Chat Agent in NiceEbook Studio that
  understands the current book project, answers questions, inspects chapters,
  and safely performs automated actions with an explicit user confirmation gate.
status: completed
priority: P1
branch: main
tags:
  - desktop
  - tauri
  - react
  - ai-agent
  - tool-calling
  - safety-gate
blockedBy: []
blocks: []
created: '2026-09-28T01:00:00.000Z'
createdBy: 'ck:cook'
source: skill
---

# Kế Hoạch Triển Khai: Trợ Lý Chat Agent Tương Tác Dự Án Sách (Book Project Chat Agent)

## 1. Mục tiêu & Triết lý Thiết kế
Người dùng muốn có một **Trợ lý Chat Agent** thông minh có khả năng:
- Trò chuyện, giải đáp thắc mắc về nội dung, nhân vật, bối cảnh của cuốn sách hiện tại.
- Tự động kiểm tra trạng thái dự án (metadata, chương, tiến độ dịch, kiểu dáng, watermark).
- Giúp tự động hóa các tác vụ trong Studio (chỉnh sửa metadata, đổi preset phong cách, tra cứu trích đoạn, quản lý glossary, chuyển trang).

### Các nguyên tắc an toàn & Kiến trúc cốt lõi:
1. **Mô hình Phê duyệt Hành động (Authority & Confirmation Gate)**:
   - Các công cụ đọc (Read-only tools): `get_project_status`, `read_chapter_excerpt`, `list_chapters`, `navigate_tab` được tự động thực thi an toàn.
   - Các công cụ thay đổi dữ liệu (Mutating tools): `update_metadata`, `apply_style_preset`, `manage_glossary` **BẮT BUỘC** hiển thị thẻ xác nhận (Confirmation Card) kèm chi tiết thay đổi để người dùng bấm "Chấp nhận" hoặc "Hủy". Mô hình AI chỉ đề xuất, người dùng là người phê duyệt cuối cùng.
2. **Phòng chống Prompt Injection từ nội dung sách**:
   - Nội dung chương sách được bọc trong thẻ dữ liệu cách ly (`<book_content_data>`), prompt hệ thống nghiêm cấm thực thi bất kỳ chỉ thị nào nằm trong nội dung tác phẩm.
   - Có unit test khẳng định nội dung độc hại trong chương sách không thể lừa agent kích hoạt công cụ phá hoại.
3. **Tương thích đa mô hình (Robust Tool Calling Protocol)**:
   - Sử dụng định dạng JSON Tool Action rõ ràng (`{"action": "tool_name", "parameters": {...}}`), tương thích tốt với cả các mô hình cục bộ (Ollama, LM Studio, Qwen, Llama) lẫn mô hình đám mây (DeepSeek, GPT-4o, Claude).
   - Có cơ chế suy giảm duyên dáng (graceful degradation): tối đa 3 vòng lặp, timeout có thể hủy (AbortController), nếu JSON lỗi thì chuyển sang trả lời hội thoại thông thường.
4. **Phân kỳ theo giai đoạn (Phased Slicing - KISS/YAGNI)**:
   - **Phase A**: Giao diện Drawer trợ lý + Vòng lặp chat an toàn + Bộ công cụ Đọc/Điều hướng (Read-only tools).
   - **Phase B**: Các công cụ thay đổi dữ liệu có Thẻ xác nhận (Confirmation-gated Mutation tools).
   - **Phase C**: Tích hợp gọi tác vụ nền (Background job triggering) & Gợi ý nhanh (Quick Prompt chips).

---

## 2. Lộ trình triển khai (Phased Roadmap)

### Phase 1: Tool Registry & Project Action Facade (`src/services/agent/`)
- **`agentTools.ts`**:
  - Định nghĩa danh mục công cụ được phép (Allowlist of safe tools).
  - Phân loại rõ: `isMutating: boolean` (yêu cầu xác nhận).
  - Bộ kiểm tra tham số nghiêm ngặt (schema parameter validator).
- **`agentService.ts`**:
  - Vòng lặp đàm thoại AI (sử dụng Tauri command `call_ai_completion`).
  - Bộ phân tích Tool Action JSON kèm regex recovery.
  - Bộ giới hạn token lịch sử chat (giữ tối đa 12 lượt hội thoại gần nhất).
  - Giới hạn cứng tối đa 3 lần lặp tool/turn để chống lặp vô hạn.
- **Kiểm thử Unit Test**:
  - Test tool parser với JSON chuẩn và JSON bọc trong markdown code fence.
  - Test kiểm tra validation tham số (báo lỗi rõ ràng khi thiếu trường).
  - Test phòng chống prompt injection: nội dung chương sách có câu lệnh giả mạo không kích hoạt mutating tool.

### Phase 2: Zustand Store Integration (`src/stores/useAppStore.ts`)
- Mở rộng state:
  - `agentChatMessages`: danh sách tin nhắn (`id`, `role: 'user' | 'assistant' | 'system'`, `content`, `proposedAction?`, `actionStatus?: 'pending' | 'approved' | 'rejected' | 'executed'`).
  - `isAgentDrawerOpen: boolean`, `toggleAgentDrawer()`.
  - `isAgentThinking: boolean`.
  - `sendAgentMessage(text: string)`.
  - `confirmProposedAction(messageId: string, approved: boolean)`.
  - `clearAgentChat()`.
- Kiểm thử Store Test:
  - Test gửi tin nhắn, nhận phản hồi, và cơ chế duyệt action proposal.

### Phase 3: Giao diện BookAgentDrawer (`src/components/agent/BookAgentDrawer.tsx`)
- Ngăn kéo trợ lý (Slide-out Drawer) hiện đại phong cách LinguaGacha:
  - Mở/đóng mượt mà từ bất kỳ màn hình nào trong ứng dụng.
  - Nút mở trợ lý trên AppTitlebar và Sidebar.
  - Danh sách tin nhắn hỗ trợ định dạng Markdown, hiển thị avatar người dùng & trợ lý NiceEbook.
  - **Thẻ xác nhận hành động (Action Proposal Card)**: Hiển thị trực quan:
    - Tiêu đề hành động (ví dụ: "Cập nhật tác giả & năm xuất bản").
    - Bảng đối chiếu Trước ➔ Sau (Diff preview).
    - 2 nút bấm: "Chấp nhận thực thi" (màu primary) và "Bỏ qua" (màu neutral).
  - **Gợi ý thao tác nhanh (Quick Action Chips)**:
    - "Tóm tắt chương hiện tại"
    - "Kiểm tra tình trạng dự án sách"
    - "Đổi phong cách sang Light Novel"
    - "Thêm thuật ngữ vào Glossary"
    - "Mở màn hình Đọc thử"

### Phase 4: Kiểm thử toàn diện & Hồi quy
- Toàn bộ Vitest test suites frontend pass 100%.
- Toàn bộ Rust cargo tests backend pass 100%.
- `npm run build` thành công, sạch lỗi TypeScript.
