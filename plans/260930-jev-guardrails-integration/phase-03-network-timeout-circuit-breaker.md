# Phase 03: Network Timeout & Circuit Breaker for AI Pipelines

## Mục tiêu
Ngăn chặn hiện tượng treo ứng dụng và vòng lặp đốt token khi dịch sách bằng cách áp đặt timeout mạng và bộ ngắt mạch (Circuit Breaker) tự động kích hoạt fallback về `jev-verdict-2.0` (Rust offline).

## Nhiệm vụ
- [ ] 1. Tạo `src/services/ai/circuitBreaker.ts`:
  - Quản lý trạng thái: `CLOSED` (bình thường), `OPEN` (đang ngắt do lỗi liên tục $\ge 3$ lần), `HALF_OPEN` (thử nghiệm lại sau thời gian cooldown).
  - Tự động ghi nhận thất bại và chuyển hướng sang offline fallback.
- [ ] 2. Cập nhật `src/services/translation/translationService.ts` và `src/services/aiService.ts`:
  - Bắt buộc mọi lệnh `fetch()` gọi API phải có `signal: AbortSignal.timeout(timeoutMs)`.
  - Tích hợp Circuit Breaker: nếu gateway ngoài bị gián đoạn, tự động thông báo và chuyển hướng sang chế độ offline an toàn.
- [ ] 3. Bổ sung unit test `src/services/ai/circuitBreaker.test.ts`.
