---
title: Workflow Optimization & Chat Agent Orchestration Studio
description: >-
  Tối ưu hóa toàn diện luồng vận hành của các chức năng (EPUB preview, AI translation,
  chapter enhancer, converter/OCR, Kindle companion, export) và mở rộng năng lực
  điều khiển tự trị cho Book Chat Agent thông qua bộ công cụ đa năng, background job runner
  và vòng lặp tương tác mượt mà.
status: in-progress
priority: P1
branch: main
tags:
  - workflow
  - chat-agent
  - orchestration
  - state-management
  - agent-tools
  - tauri
  - react
created: '2026-09-30T10:00:00.000Z'
createdBy: 'ck:cook'
source: skill
---

# Kế Hoạch: Tối Ưu Hóa Quy Trình Chức Năng & Năng Lực Điều Khiển Tự Trị của Chat Agent

## 1. Bối cảnh & Mục tiêu

Ứng dụng `nice-ebook` có đầy đủ các module mạnh mẽ: Preview/Styling EPUB, AI Translation, Chapter Enhancer, Converter/OCR, Kindle Companion (WordWise/X-Ray) và Export Modal. Tuy nhiên:
1. **Chat Agent bị thiếu công cụ thực thi cốt lõi**: Hiện tại agentTools chỉ có 7 công cụ cơ bản (xem metadata, xem mục lục, đổi tab, đổi font/style, trích đoạn). Agent chưa thể trực tiếp ra lệnh dịch chương, chuẩn hóa văn bản, trích xuất thực thể X-Ray, chạy OCR hay kích hoạt xuất sách.
2. **Đứt gãy vòng lặp sau khi người dùng xác nhận ActionProposal**: Khi user bấm "Chấp thuận & Áp dụng" một đề xuất thay đổi, đề xuất được áp dụng nhưng Agent không nhận được tín hiệu hoàn tất để tiếp tục câu thoại hoặc chuyển bước tiếp theo trong kế hoạch.
3. **Thiếu bộ điều phối Job tập trung (Unified Workflow & Job Runner)**: Các tác vụ dài như dịch hàng loạt chương, AI enhance, trích xuất X-Ray phân mảnh trong các state cục bộ, dễ bị gián đoạn khi chuyển view và Agent không có cách tra cứu tiến độ trạng thái chung.

**Mục tiêu**:
- Chuẩn hóa toàn bộ các luồng thao tác qua hệ thống điều phối mượt mà.
- Nâng cấp Chat Agent thành "Trợ lý điều phối toàn năng" (Full Orchestration Agent) có khả năng đọc trạng thái, đề xuất hành động cho mọi tính năng, và tự động phản hồi sau khi hoàn tất.
- Đảm bảo 100% tuân thủ Jev Guardrails (bảo mật dữ liệu, kiểm duyệt path traversal/injection, phân loại ALLOW / WARN / BLOCK).

## 2. Lộ Trình Triển Khai (Phases)

| Phase | Tên Phase & Nội dung chính | File chính | Trạng thái |
| :---: | :--- | :--- | :---: |
| **01** | **Unified Workflow & Job Runner Slice**: Thêm slice quản lý job nền và dispatchers tập trung vào Zustand store. | `src/stores/useAppStore.ts`, `src/services/workflow/workflowJobService.ts`, tests | Pending |
| **02** | **Full-Spectrum Agent Tool Catalog & Jev Guardrail Gatekeeper**: Mở rộng 6 công cụ mới cho Chat Agent (dịch thuật, enhance, kindle xray, export, tra cứu job). | `src/services/agent/agentTools.ts`, `src/services/agent/agentTools.test.ts` | Pending |
| **03** | **Agent Loop Closure & Context-Aware Drawer UX**: Đóng vòng lặp tự động sau khi duyệt ActionProposal, bổ sung quick-actions theo ngữ cảnh view hiện tại. | `src/services/agent/agentService.ts`, `src/components/agent/BookAgentDrawer.tsx`, tests | Pending |
| **04** | **Kiểm thử tích hợp & Nghiệm thu toàn diện**: Unit tests cho toàn bộ tools mới, workflow jobs và kịch bản agent điều phối. | `src/services/agent/*.test.ts`, `npm test` | Pending |

## 3. Tiêu chí nghiệm thu (Acceptance Criteria)

1. Chat Agent có thể thực thi hoặc đề xuất hành động qua 13 công cụ (7 công cụ cũ + 6 công cụ mới: `translate_chapter`, `enhance_chapter`, `extract_xray_entities`, `export_book`, `get_workflow_status`, `import_content_snippet`).
2. Mọi thao tác có tác động thay đổi sách (Mutating Tools) đều đi qua Jev Guardrail, sinh ActionProposal rõ ràng với mô tả và diff trực quan.
3. Sau khi người dùng xác nhận đề xuất (Confirm), Agent tự động nhận kết quả và gửi thông báo xác nhận mượt mà trong hội thoại mà không cần user gõ lại.
4. Drawer hiển thị các phím tắt lệnh nhanh (Quick Action Pills) thông minh thích ứng theo màn hình đang xem.
5. Toàn bộ test suite chạy pass 100%, không hồi quy (regression-free), compile `tsc` không có lỗi.
