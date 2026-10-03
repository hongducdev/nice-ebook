# Technical Journal: Model Đã Chọn Không Được Kích Hoạt Sau Khi Khởi Động Lại

**Thời gian:** 2026-10-03 11:17
**Triệu chứng (người dùng báo):** "phần model khi mới đầu đã chọn model nhưng không active để sử dụng, phải vào ấn tay để chọn một lần nữa".
**Phạm vi:** `src/stores/useAppStore.ts` (`scanGateways`), `src/components/ai/GatewayView.tsx`, `src/services/ai/linguaGachaProviders.ts`, `src/stores/modelActivation.test.ts` (mới), `src/services/ai/linguaGachaProviders.test.ts`, `docs/system-architecture.md`.

---

## 1. Bằng Chứng Đầu Vào (không đoán)

App đang chạy (PID 29708) nên không thể đọc `localStorage` của WebView2 qua JS. Đọc trực tiếp leveldb (`%LOCALAPPDATA%\com.niceebook.studio\EBWebView\Default\Local Storage\leveldb`):

- `lg-selected-model` = **`gemini-2.5-pro`** → người dùng ĐÃ chọn và đã được lưu.
- `nice-ebook-configured-providers-v1` = mảng có entry mặc định `prov_deepseek_default` ("DeepSeek Official") + một provider Gemini (`base_url` dạng proxy, `gcli…`).
- `lg-active-gateway-name` không đọc được (bảng mới bị nén snappy) — nhưng `LOG.old` cho biết cả origin chỉ có **8 key**, và bảng đọc được chỉ chứa các key model/providers/theme/sidebar → dấu hiệu cờ kích hoạt gateway không còn.
- Từ chối kết luận mò: dựng lại đường đi bằng test (mục 2).

## 2. Chẩn Đoán Nguyên Nhân Gốc (kèm tái hiện)

**RC-A — `scanGateways()` chỉ khôi phục gateway theo tên đã lưu hoặc cờ `isActive`.** Khi cả hai đều thiếu mà `lg-selected-model` vẫn còn, app khởi động với `activeGateway === null`: model vẫn nằm trong state nhưng **không có gateway nào để dùng**, nên request rơi về `http://localhost:11434` + tên model cloud ⇒ thất bại/âm thầm chuyển sang lõi offline Jev. Chỉ cần người dùng vào tab "Cổng AI & Mô hình" bấm một lần là xong — đúng câu "phải vào ấn tay để chọn một lần nữa".

Tái hiện (test tạm, chạy trên code TRƯỚC khi sửa):
```text
CASE 3 AFTER SCAN: {"activeGateway":null,"selectedModel":"gemini-2.5-pro", ...}
AssertionError: expected null not to be null   ← FAIL
```

**RC-B — nút kích hoạt provider xóa sạch danh sách provider đã lưu.** `GatewayView` có effect chạy khi mount/`isModalOpen`; khi `activeGateway` còn null nó gọi `handleActivateProvider()`, mà handler lại map trên **state** `configuredProviders` — lúc đó vẫn là `[]` — rồi `saveConfiguredProviders(updated)` ⇒ ghi `[]` vào storage. Danh sách provider (kèm cờ `isActive`) bị xóa, tạo ra đúng điều kiện của RC-A ở lần khởi động sau. Cũng vì thế entry `prov_deepseek_default` (seed mặc định, `isActive: false`) xuất hiện trong storage thật.

**RC-C — model người dùng chọn bị thay thế âm thầm.** `scanGateways` cũ: nếu model đã lưu không nằm trong `models` của gateway đang hoạt động thì đổi sang `models[0]`, không log, không lưu lại. Với provider do người dùng cấu hình (`availableModels` có thể thiếu model họ tự nhập), model họ chọn biến mất khỏi trạng thái "đang dùng".

## 3. Thay Đổi

| # | Sửa | File |
| --- | --- | --- |
| 1 | Tách logic provider thành hàm thuần: `activateProviderInList()` (giữ nguyên mọi provider, chỉ đổi cờ active), `buildGatewayModelList()` (model đã chọn luôn đứng đầu, dedupe, không bao giờ bị bỏ), `findProviderOwningModel()` (chỉ nhận provider có bằng chứng dương) | `linguaGachaProviders.ts` |
| 2 | `scanGateways`: một helper `configuredProviderToGateway()` dùng chung cho mọi nhánh (chống lệch logic); thứ tự chọn gateway là **tên gateway đã lưu → provider đang active → provider sở hữu model đã chọn → gateway cục bộ đầu tiên**; provider cấu hình tay (`port === 0`) không bao giờ bị bỏ model; mọi lần thay thế model đều ghi terminal log | `useAppStore.ts` |
| 3 | `scanGateways`: nếu không có gì phục vụ được model đã lưu ⇒ log cảnh báo rõ thay vì âm thầm chạy lõi offline | `useAppStore.ts` |
| 4 | `GatewayView`: `handleActivateProvider` đọc danh sách **tươi từ storage** + `activateProviderInList` (không còn ghi đè bằng state cũ); dùng `buildGatewayModelList`; giữ model người dùng nếu provider có model đó | `GatewayView.tsx` |
| 5 | `GatewayView`: effect tự kích hoạt chờ `isScanningGateways` xong, phụ thuộc `[isModalOpen, isScanningGateways, activeGateway]` và có `useRef` chặn chạy lại (không "undo" thao tác người dùng chủ động tắt gateway) | `GatewayView.tsx` |
| 6 | Test hồi quy mới cho luồng khởi động + test hàm thuần | `modelActivation.test.ts` (mới), `linguaGachaProviders.test.ts` |
| 7 | Ghi lại quy tắc khôi phục gateway/model vào tài liệu kiến trúc | `docs/system-architecture.md` |
| 8 | Tách quyết định tự kích hoạt thành hàm thuần `shouldAutoActivateProvider()` (chỉ trả về provider khi: chưa thử, scan đã xong, chưa có gateway, có provider gắn cờ active) — làm khóa `useRef` trong component chỉ được "đốt" đúng lúc thật sự kích hoạt | `linguaGachaProviders.ts`, `GatewayView.tsx` |
| 9 | Tách đường ghi kích hoạt thành `persistProviderActivation()` (đọc list đã lưu → biến đổi → ghi lại) và test trực tiếp trên storage | `linguaGachaProviders.ts` |
| 10 | Thay "mốc ngầm" `port === 0` bằng cờ tường minh `is_user_configured` trên `DetectedGateway` (đặt tại cả 3 nơi tạo gateway cấu hình tay) | `useAppStore.ts`, `GatewayView.tsx`, `GatewaySettingsModal.tsx` |
| 11 | Cảnh báo ngay trong tab Cổng AI khi model đã lưu không có gateway nào phục vụ (thay vì chỉ ghi terminal log) | `GatewayView.tsx` |

## 4. Kiểm Chứng

| Cổng | Kết quả |
| --- | --- |
| Tái hiện trước khi sửa | case 3 **FAIL** (`activeGateway === null` dù có provider + model đã chọn) |
| `npx tsc --noEmit` | exit 0 |
| `npm test` | **48 files, 555 tests pass**, 0 fail (trước: 47/541 → +1 file, +14 test) |
| Test tập trung 2 file mới/sửa | **18/18 pass** (`modelActivation.test.ts` + `linguaGachaProviders.test.ts`) |
| `npm run build` | thành công |

Test mới: 5 test ở `modelActivation.test.ts` (khôi phục provider theo model; provider thắng gateway cục bộ không liên quan; tên gateway đã lưu vẫn là ưu tiên cao nhất; không bỏ model riêng của provider khỏi danh sách; cảnh báo khi không có gì phục vụ model) + 9 test hàm thuần (kích hoạt không xóa danh sách; id lạ là no-op; model đã chọn đứng đầu & dedupe; model do người dùng gõ vẫn xuất hiện; `findProviderOwningModel` không nhận provider vô can và vẫn khớp provider chỉ khai `selectedModel`; `shouldAutoActivateProvider` đúng ở 5 trạng thái render; `persistProviderActivation` giữ đủ provider khi đọc lại từ storage và tự thêm provider chưa lưu).

**Test cũ hỏng trước, xanh sau:** 4/5 test trong `modelActivation.test.ts` fail trên code TRƯỚC khi sửa (đã ghi lại log tái hiện ở mục 2); test còn lại ("tên gateway đã lưu là ưu tiên cao nhất") là chốt chống hồi quy thứ tự ưu tiên.

## 5. Bài Học

1. **`useState` là ảnh chụp, không phải nguồn sự thật.** Ghi `save...()` từ state trong effect mount = ghi `[]`. Mọi handler ghi storage phải đọc lại dữ liệu tươi (hoặc dùng functional update).
2. **"Không có gateway" và "không dùng được model" là cùng một triệu chứng nhưng hai nguyên nhân khác nhau.** Phải tách: (a) khôi phục gateway, (b) không được bỏ model người dùng chọn.
3. **Thứ tự ưu tiên phải dựa trên mức độ "người dùng nói rõ":** tên gateway đã lưu > provider gắn cờ active > provider sở hữu model đã chọn > gateway tự quét được. Nếu để gateway cục bộ "tình cờ đang chạy" thắng, model cloud của người dùng lại bị treo.
4. **Âm thầm thay thế là lỗi.** Mọi lần thay model phải có log; người dùng cần biết vì sao model họ chọn không còn hiệu lực.
5. **Đọc được dữ liệu thật của app là bằng chứng mạnh nhất** — `lg-selected-model = "gemini-2.5-pro"` trong leveldb thu hẹp ngay phạm vi nghi vấn, thay vì suy đoán từ giao diện.
6. **Test phải chạy trên code trước khi sửa.** File repro tạm (fail) chính là bằng chứng "test thật sự bắt được lỗi"; giữ lại dưới dạng suite hồi quy vĩnh viễn.
7. **Khóa "chỉ chạy một lần" (useRef) phải được đốt từ kết quả của một quyết định thuần, không phải từ đầu effect.** Nếu đốt sớm ở render chưa sẵn sàng, effect mất lượt duy nhất và lỗi cũ tái hiện dưới dạng mới — đã tách thành `shouldAutoActivateProvider()` + test 5 trạng thái.
8. **Đừng dùng "giá trị ma thuật" làm cờ ngữ nghĩa** (`port === 0` để ám chỉ "provider do người dùng cấu hình") — thay bằng trường tường minh `is_user_configured`.
9. **Bằng chứng "đã sửa" phải đi tới đúng đường ghi dữ liệu.** Test hàm thuần chỉ chứng minh hàm *có thể* giữ danh sách; cần test `persistProviderActivation()` đọc lại từ storage để chứng minh wiring (load → transform → save) thật sự không xóa provider.
