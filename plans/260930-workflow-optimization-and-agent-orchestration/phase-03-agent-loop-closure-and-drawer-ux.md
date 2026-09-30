# Phase 03: Agent Loop Closure & Context-Aware Drawer UX

## Mục tiêu
Khắc phục điểm nghẽn trải nghiệm lớn nhất:
1. Khi người dùng phê duyệt một `ActionProposal` trong Drawer, hệ thống không chỉ áp dụng thay đổi vào State mà còn tự động gửi thông báo hệ thống/kết quả ngược lại vào ngữ cảnh hội thoại của Agent (`onActionApproved` callback), giúp Agent phản hồi tiếp ("Đã dịch xong chương 1 theo yêu cầu của bạn, bạn có muốn dịch tiếp chương 2 không?") mà không bị "im lặng".
2. Bổ sung thanh Gợi ý Lệnh Thông Minh (Contextual Action Pills) trong `BookAgentDrawer.tsx` dựa theo tab hiện tại (ví dụ: ở Tab Translation thì gợi ý "Dịch chương hiện tại sang tiếng Việt", ở Tab Preview gợi ý "Tối ưu typography font Bookerly", ở Tab Enhancer gợi ý "Sửa lỗi chính tả & chuẩn hóa H1").

## Chi tiết công việc
- [ ] Nâng cấp `confirmAgentAction` trong `useAppStore.ts` hoặc `agentService.ts`: Sau khi áp dụng thành công mutating action, sinh tin nhắn hệ thống thông báo kết quả và kích hoạt tiếp `sendAgentMessage` ở chế độ background feedback.
- [ ] Cập nhật `BookAgentDrawer.tsx`:
  - Thiết kế bộ Contextual Quick Action Pills linh hoạt theo `activeTab` (Reader, Translator, Enhancer, Converter, Kindle).
  - Tối ưu hiển thị ActionProposal Card với nút "Chấp thuận & Áp dụng" phản hồi tức thì và hiệu ứng loading mượt mà.
- [ ] Tích hợp thông báo Toast qua Sonner với nút tắt mở nhanh Drawer khi có gợi ý từ Agent.
