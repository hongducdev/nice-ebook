---
title: Jev Guardrails Integration - Security, Gatekeeping & Resilience
description: >-
  Port and adapt key guardrail mechanisms from JevGuarAgent (JOG) into nice-ebook:
  Secret Scrubber & Git Pre-Commit Guard, Book Agent Tool Gatekeeper, Network Timeout
  & Circuit Breaker for AI Gateways, and EPUB Reader Content Sanitizer.
status: completed
priority: P1
branch: main
tags:
  - security
  - guardrails
  - agent
  - tauri
  - react
  - jev
blockedBy: []
blocks: []
created: '2026-09-30T08:45:00.000Z'
createdBy: 'ck:cook'
source: skill
---

# Kế Hoạch: Tích Hợp Jev Guardrails (JOG) vào nice-ebook

## 1. Bối cảnh & Mục tiêu

Dự án `nice-ebook` chia sẻ triết lý kiến trúc với `JevGuarAgent` (JOG): kết hợp xử lý nhanh offline (System-1 qua Rust Native) với trí tuệ nhân tạo (System-2 qua Cloud LLM).
Khi ứng dụng mở rộng tính năng AI (Book Chat Agent, AI Translation hàng trăm chương, kết nối nhiều gateway AI, nạp file EPUB từ internet), các rủi ro bảo mật và độ ổn định thực tế xuất hiện:
1. **Rò rỉ API Keys / Secrets**: Lập trình viên hoặc AI Agent vô tình hardcode key hoặc commit `.env` vào repository.
2. **Book Chat Agent rủi ro do Indirect Prompt Injection**: File sách có thể chứa nội dung đánh lừa Agent gọi các tool phá hoại hoặc làm rò rỉ secret.
3. **Treo kết nối & Đốt token khi dịch sách**: Thiếu network timeout và thiếu cơ chế circuit breaker khi gateway bên thứ ba bị gián đoạn.
4. **XSS trong EPUB Reader**: File EPUB chứa mã độc `<script>` hoặc inline event handlers chạy trong ngữ cảnh Tauri WebView.

## 2. Các Phase Triển Khai (Lần lượt)

| Phase | Nội dung | File chính | Trạng thái |
| :---: | :--- | :--- | :---: |
| **01** | **Secret Scrubber & Git Pre-Commit Guard**: Quét và che giấu API keys, chặn commit secret vào repo. | `src/utils/secretScrubber.ts`, `scripts/check-secrets.mjs`, tests | Hoàn tất |
| **02** | **Book Agent Tool Gatekeeper**: Cơ chế phán quyết ALLOW / WARN / BLOCK cho Book Chat Agent và lọc output. | `src/services/agent/agentTools.ts`, `src/services/agent/agentService.ts`, tests | Hoàn tất |
| **03** | **Network Timeout & Circuit Breaker**: Bọc `AbortSignal.timeout` và circuit breaker ngắt tự động fallback về `jev-verdict-2.0`. | `src/services/translation/translationService.ts`, `src/services/aiService.ts`, tests | Hoàn tất |
| **04** | **EPUB Content Sanitizer**: Làm sạch HTML EPUB chống XSS và script độc hại trước khi render vào viewer. | `src/utils/textCleaner.ts`, `src/components/preview/EpubReaderViewer.tsx`, tests | Hoàn tất |

## 3. Tiêu chí nghiệm thu (Acceptance Criteria)

1. `npm run test` vượt qua 100% (363 test cũ + toàn bộ test mới cho 4 phase).
2. Lệnh `npm run check:secrets` quét và phát hiện chính xác các API keys mẫu (OpenRouter, OpenAI, Anthropic, Google, v.v.).
3. Book Agent từ chối hoặc cảnh báo trước các thao tác có tác dụng phụ / nguy hiểm, tự động che giấu bí mật nếu có trong câu trả lời.
4. Mọi HTTP request tới AI gateway đều có timeout tối đa, không bao giờ bị treo vô tận; tự động ngắt và kích hoạt offline fallback khi lỗi liên tục.
5. EPUB viewer loại bỏ sạch `<script>` và các event nguy hiểm (`onerror=`, `onload=`, `javascript:`) mà không làm hỏng CSS hiển thị sách.
