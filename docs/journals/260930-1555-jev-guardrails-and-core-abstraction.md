# Technical Journal: Tích Hợp Jev Guardrails & Trừu Tượng Hóa Lõi Ứng Dụng

**Thời gian:** 2026-09-30 15:55  
**Phạm vi:** An ninh & Bảo mật (Secret Scrubber, Pre-commit Hook, EPUB Sanitizer), Book Agent Gatekeeper, Circuit Breaker & Timeouts, Trừu tượng hóa UI (Chuyển Jev vào lõi ngầm).

---

## 1. Bối cảnh & Vấn đề

1. **Rò rỉ Bí mật (Credential Leaks):** Dự án làm việc với nhiều cổng AI (OpenRouter, OpenAI, Gemini, Anthropic). Nguy cơ vô tình commit API keys hoặc file `.env` vào repository là rất lớn nếu không có lớp kiểm định chủ động.
2. **Book Chat Agent Security:** Khi nạp tệp sách lạ từ Internet, nguy cơ Indirect Prompt Injection có thể khiến Agent thực thi các tool với tham số độc hại (Path Traversal, Command Injection) hoặc vô tình làm lộ API keys trong nội dung phản hồi chat.
3. **Độ ổn định Gateway & Timeouts:** Các tác vụ dịch thuật và gọi mô hình cần cơ chế ngắt mạch (Circuit Breaker) và timeout mạng (`AbortSignal.timeout`) để tránh treo UI hoặc vòng lặp đốt token khi gateway bên ngoài gặp sự cố.
4. **Bảo mật Viewer EPUB:** Trình đọc EPUB WebView không được phép thực thi script nhúng từ sách để tránh tiếp cận Tauri IPC surface.
5. **Trải nghiệm Người dùng (UI Clutter):** Các nhãn kỹ thuật nội bộ như "Jev Core", "Jev Verdict", "Jev Heuristic", "openJev v2.0" hiển thị trên quá nhiều bề mặt UI (Titlebar, Status Bar, Sidebar, BookView, GatewayView, ConverterView), gây rối rắm cho người dùng cuối. Người dùng chỉ cần hệ thống tự động hoạt động mượt mà, thông minh và đáng tin cậy.

---

## 2. Các Thay Đổi Kiến Trúc Chính

### A. Secret Scrubber & Pre-Commit Hook (`src/utils/secretScrubber.ts` & `scripts/check-secrets.mjs`)
- Đồng bộ 14 mẫu regex nhận diện API Key độ chính xác cao giữa `secretScrubber.ts` và `check-secrets.mjs`:
  - OpenRouter (`sk-or-v1-`), OpenAI (`sk-`), Anthropic (`sk-ant-api`), Google Gemini (`AIzaSy`), GitHub tokens, Private RSA/SSH keys, Database URIs, Generic Bearer/JWT tokens, AWS Access & Secret Keys, Slack, Stripe, Hardcoded Passwords, `.env` assignments.
- Cung cấp hàm `detectSecrets()` và `maskSecrets()` để che giấu an toàn các chuỗi nhạy cảm (dạng `sk-o****1234`).
- `scripts/check-secrets.mjs` trong chế độ `--staged` đọc trực tiếp blob từ Git index (`git show :<file>`) để ngăn chặn việc bypass khi working copy bị xóa trước khi commit. Đã kiểm chứng thực tế exit code 1 khi phát hiện staged secret.
- Script cài đặt tự động `scripts/install-hooks.mjs` kết nối vào `"prepare"` trong `package.json`.

### B. Tool Execution Gatekeeper (`src/services/agent/agentTools.ts` & `agentService.ts`)
- Thêm cơ chế thẩm định an toàn `evaluateToolCall(toolName, params)`:
  - `ALLOW`: Thao tác đọc an toàn với tham số hợp lệ.
  - `WARN`: Thao tác thay đổi trạng thái (bắt buộc tạo `ActionProposal` để người dùng xác nhận).
  - `BLOCK`: Phát hiện ký tự nguy hiểm với regex có word boundaries (`\brm\s+-[a-z]*r[a-z]*\b`, `\bDROP\s+TABLE\b`, script tags), và path traversal (`(?:^|[/\\])\.\.[/\\]`, `/etc/passwd`). Không chặn nhầm văn bản thông thường (ví dụ: `Transform -Rebirth...`).
- Tự động bọc `maskSecrets()` trên toàn bộ dữ liệu đầu ra của tool và phản hồi chat của trợ lý AI trước khi hiển thị cho người dùng.

### C. Circuit Breaker Pattern & Network Timeouts (`src/services/ai/circuitBreaker.ts`)
- State machine 3 trạng thái: `CLOSED` -> `OPEN` (khi lỗi liên tục $\ge 3$) -> `HALF_OPEN` (thử lại sau 10s cooldown).
- Tích hợp trực tiếp vào `translationService.ts` (bọc `invoke("call_ai_completion")` của từng candidate model) và `aiService.ts` (bọc gateway fetch kèm `signal: AbortSignal.timeout(45000)`).
- Hỗ trợ fail-fast và fallback tự động sang chế độ xử lý cục bộ (`jev-verdict-2.0` trên Rust) mà không làm treo ứng dụng hay đốt token.

### D. EPUB Content Sanitizer & Iframe Hardening (`src/utils/textCleaner.ts` & `EpubReaderViewer.tsx`)
- Tokenizer XHTML an toàn không dùng regex thô, loại bỏ hoàn toàn các thẻ thực thi `<script>`, `<iframe>`, `<object>`, `<embed>`, inline event handlers (`onload`, `onerror`), và các URI nguy hiểm `javascript:`.
- Hạ cấp sandbox của reader iframe trong `EpubReaderViewer.tsx`: gỡ bỏ hoàn toàn `allow-scripts` (`sandbox="allow-same-origin"`), ngăn chặn triệt để mã nhúng trong EPUB thực thi hoặc tiếp cận Tauri IPC surface.

### E. Trừu Tượng Hóa & Ẩn Jev Vào Core Của Ứng Dụng
- Giữ nguyên 100% thuật toán hiệu năng cao trong lõi Rust (`src-tauri/src/jev/`) và state quản lý (`runJevClassification`, `jevDecision`).
- Tinh chỉnh toàn bộ bề mặt giao diện người dùng sang thuật ngữ tự nhiên, chuyên nghiệp:
  - `AppTitlebar`: "Jev Scan" -> "Tự động phân tích".
  - `StatusBar`: "Jev Zero-Key Core" -> "Lõi Offline (Cục bộ)"; "Jev Core:" -> "Phân loại:".
  - `Sidebar`: "○ Jev Offline Ready" -> "○ Lõi Offline sẵn sàng".
  - `BookView`: "Phân loại Jev Core" -> "Thể loại tác phẩm"; "Jev Heuristic" -> "Phân tích nhanh".
  - `BookDropzone`: "Jev Core (Offline)" -> "Xử lý cục bộ (Offline)".
  - `PresetGallery`: "Jev Đề Xuất" -> "Gợi ý phù hợp".
  - `GatewayView`: "Jev Core (System-1 Decision Engine)" -> "Lõi Xử Lý Cục Bộ (Tự động 100% Offline)".
  - `ChapterEnhancerView`: "⚡ Jev Verdict 2.0 (Siêu tốc ~15ms)" -> "⚡ Tự động Offline (~15ms)"; "openJev v2.0" -> "Offline Core".
  - `ConverterView`: "bộ phân loại Jev Core" -> "phân loại nội dung tự động"; "Jev Core Decision:" -> "Phân loại nội dung:".
  - `BookTranslatorView`: "AI + Jev 1-Click" -> "Tự động 1-Click".
  - `App.tsx`: Làm sạch mô tả trong cài đặt ("tích hợp lõi phân loại và chuẩn hóa siêu tốc chạy trực tiếp trong Rust", "chế độ xử lý cục bộ (Offline)").
  - `aiService.ts`: Chuyển đổi toàn bộ log stream và model test message sang "Lõi Offline Cục Bộ" và "⚡ [Xử Lý Cục Bộ] Native Engine" đồng bộ với `aiService.test.ts`.

### F. Đồng Bộ Hóa Toàn Diện UI Theo Quy Trình Xử Lý Ebook (Pipeline UX)
- **Tái cấu trúc Sidebar (`Sidebar.tsx`):** Chia tách rõ ràng thành 2 nhóm:
  - *Quy trình Ebook (7 bước tuần tự):* 1. Nạp & Chuyển đổi (`converter`) $\rightarrow$ 2. Dịch thuật AI (`translator`) $\rightarrow$ 3. Biên tập & Soát lỗi (`ai-editor`) $\rightarrow$ 4. Thư viện phong cách (`presets`) $\rightarrow$ 5. Kiểu chữ & Bố cục (`editor`) $\rightarrow$ 6. Đọc thử & Kiểm tra (`reader`) $\rightarrow$ 7. Gói Kindle & Xuất bản (`kindle`).
  - *Dự án & Hệ thống:* Tổng quan sách (`books`), Cổng AI & Mô hình (`ai`), Trợ lý Chat AI (`agent`), Cài đặt ứng dụng (`settings`).
- **Thanh tiến trình đồng bộ toàn cục (`App.tsx`):** Nhúng `BookPipelineStepper` (chế độ compact) vào đầu khung làm việc `workspace-frame` khi có sách đang mở (`currentBook`). Giúp người dùng ở bất kỳ màn hình nào cũng nắm bắt được trạng thái quy trình và chuyển bước 1 chạm.
- **Chuẩn hóa Header các màn hình:** Đồng bộ hóa tiêu đề các màn hình theo tiền tố các bước (Bước 1 $\rightarrow$ Bước 7) tạo trải nghiệm định hướng mạch lạc, chuyên nghiệp.
---

## 3. Bằng Chứng Kiểm Thử & Nghiệm Thu

| Lệnh kiểm tra | Kết quả | Ghi chú |
| :--- | :--- | :--- |
| `npm run check:secrets` | **PASS** | Quét 35 tệp nguồn, 0 rò rỉ secret. Chế độ `--staged` đã kiểm chứng block thành công exit code 1. |
| `npm run test` (Vitest) | **35 passed (403 tests)** | Toàn bộ 363 test cũ + 40 test mới đều xanh 100%. |
| `npx tsc --noEmit` | **Exit code 0** | Không có bất kỳ lỗi kiểu dữ liệu TypeScript hay biến thừa (TS6133) nào. |
| `npm run build` | **Build completed in 1.28s** | Đóng gói production Vite + React 19 thành công. |
