# Phase 01: Secret Scrubber & Git Pre-Commit Guard

## Mục tiêu
Ngăn chặn tuyệt đối việc rò rỉ API Keys (OpenRouter, OpenAI, Anthropic, Gemini, AWS, v.v.) và các tệp nhạy cảm vào git commit và giao diện hiển thị.

## Nhiệm vụ
- [ ] 1. Tạo `src/utils/secretScrubber.ts`:
  - Kế thừa các mẫu Regex độ chính xác cao từ `JevGuarAgent`: OpenRouter (`sk-or-v1-`), OpenAI (`sk-`), Anthropic (`sk-ant-`), Google Gemini (`AIzaSy`), GitHub tokens, Private Keys, generic Bearer tokens.
  - Cung cấp hàm `detectSecrets(content: string): DetectedSecret[]`.
  - Cung cấp hàm `maskSecrets(content: string): string` (che giấu dạng `sk-or****1234`).
- [ ] 2. Tạo unit test `src/utils/secretScrubber.test.ts` kiểm tra các trường hợp nhận diện và làm sạch secrets.
- [ ] 3. Tạo script `scripts/check-secrets.mjs` để kiểm tra các file đã staged hoặc toàn bộ repo trước khi commit.
- [ ] 4. Thêm script `"check:secrets": "node scripts/check-secrets.mjs"` vào `package.json`.
- [ ] 5. Thiết lập hook pre-commit (hoặc chỉ dẫn kích hoạt) để tự động ngăn chặn commit file `.env` hoặc file chứa secret thực tế.
