# Technical Journal: Dọn Giao Diện Đợt 1 — Phương Án A (Ba Vùng)

**Thời gian:** 2026-10-03 14:28
**Yêu cầu:** "clean lại các giao diện nhưng không ảnh hưởng đến chức năng" → chốt ở cổng 2: **`A` · giữ bo góc 4–8px · nút 28px · làm đợt 1**.
**Phạm vi:** `BookTranslatorView.tsx`, `ConverterView.tsx`, `GatewayView.tsx`, `GatewaySettingsModal.tsx`, `MetadataModal.tsx`, `AiCoverTab.tsx`, `translator-ui-polish.test.tsx`, `src/styles/globals.css` — 8 file, 1175 dòng thêm / 902 dòng bớt.

---

## 1. Cách làm (nhánh `U` của skill ui-ux)

1. **Audit** (cổng chặn): Tailwind v4 + shadcn `radix-nova`, token ở `globals.css`; 34 primitive sẵn có; không có thư viện biểu đồ/bảng/ngày → không cài thêm.
2. **Phong cách theo dự án, không rút về xám** (P4): glass 7/28 file app, bóng 9, ngôn ngữ màu 17, dark mode đã có → giữ.
3. **Brief + việc chính từng màn** → cổng 1 (`ok`).
4. **Wireframe 3 phương án thật** ở `%TEMP%\evon-design\wireframe.html` (A ba vùng / B bảng rộng + drawer / C ưu tiên tiến trình) kèm thanh công cụ (phương án · màn · Màu/Xám · Desktop/375 · trạng thái) và khung lý do → cổng 2 (`A`).
5. **Dựng** theo A; 3 màn giao cho 3 agent song song, màn Dịch thuật tự làm; mỗi agent bắt buộc chạy `tsc` + `npm test` + kiểm sàn chữ.

## 2. Sáu lỗi đo được (probe trên wireframe) và cách sửa

| # | Đo được | Sửa |
| --- | --- | --- |
| 1 | `--muted-foreground #717783` chỉ đạt **3.87–4.38:1** trên nền sáng của chính app (12 chỗ) | `#5c6473` → ~5.0:1 |
| 2 | Nền rê mục nav `#ebeef2 → #edf0f3` (2 mức, như không có hover) | `--ui-table-hover` tường minh `#e9ebee` (sáng) / `#262c35` (tối) |
| 3 | Hàng bảng đang rê `#f1f3f5` ≈ nền trang `#f3f4f6` → card "như bị khuyết" | như trên |
| 4 | Hai token viền lệch nhau trên cùng một đường (`--sidebar-border` vs `--border`) | `--sidebar-border: var(--border)` |
| 5 | Cột bảng bị bóp: "Trạng thái" xuống 2 dòng, chữ chồng số (`table-fixed` + cột `w-px`) | cấp bề rộng thật cho **mọi** cột (52/104/76/48px) |
| 6 | Ở 375px trang rộng 728px: sidebar chen hết chỗ, chữ trong nút rớt dòng, ô tìm kiếm co còn 0px | sidebar ẩn dưới `lg` + nút menu, titlebar còn icon, chip cuộn ngang, ô tìm kiếm chiếm trọn hàng, cột phụ ẩn dưới `sm` |

Probe lặp 5 vòng: **31 mục → 2 mục**, cả 2 là luật hover mờ đã chốt của dự án (giữ, không lật). Một mục tương phản bị **đo lại trực tiếp bằng Playwright**: hàng hover `rgb(233,235,238)` + chữ `#5c6473` = **4.98:1** → dương tính giả của phép mô phỏng hover.

## 3. Thay đổi theo màn

| Màn | Trước → sau |
| --- | --- |
| **Dịch thuật AI** | Cột cấu hình 360px **trái** → **22rem phải** (`border-l`), làm bằng `flex-row-reverse` (không di chuyển JSX, 0 đổi logic). **Bảng chương thành bề mặt chính** trên khu xem trước/nhật ký: `table-fixed`, cột 52/`w-full`/104/48, pill trạng thái, hàng đang mở `--ui-table-selected` ≠ hàng thường `--ui-table-hover`. Bảng đọc dữ liệu sẵn có (`translatedChapters`, `translationProgress`) và gọi đúng 2 handler cũ |
| **Nạp & Chuyển đổi** | `grid lg:grid-cols-12` → `flex lg:flex-row-reverse`; panel tuỳ chọn `lg:w-[22rem] border-l`, cột chính `flex-1 min-w-0`; khối tiến trình OCR chuyển xuống dưới bề mặt chính (giữ nguyên guard `isOcrRunning && ocrProgress`) |
| **Cổng AI & Mô hình** | Lưới 3 card + dialog → **bảng provider** (`table-fixed`, cột 52/`w-full`/15rem/48) + **panel sửa 22rem phải**; `GatewaySettingsModal` **không còn là dialog**, render thành panel thường trú (giữ nguyên `isOpen`/`onClose`/`initialProvider` và toàn bộ handler); chỉ báo "Mô hình đang dùng" ở đầu cột chính |
| **Modal Metadata** | Header cố định + body cuộn + footer ghim; form **lưới 2 cột** (`sm:grid-cols-2`, title/mô tả `sm:col-span-2`), input `h-10`, một slot trợ giúp/lỗi `min-h-4` cho mỗi trường; cột bìa `sm:w-32`; gộp 3 nút bìa trùng lặp; đúng **1 nút đặc** |
| **Cả 4 màn** | Nút giữ **28px** (h-7) và bo góc **4–8px** như đã chốt; nút xoá `bg-rose-500/10 text-rose-700`; **sàn chữ 12px**: 349 → 188 chỗ toàn app, **0 chỗ** trong 6 file của đợt 1 |

## 4. Kiểm chứng

| Cổng | Kết quả |
| --- | --- |
| `npx tsc --noEmit` | **exit 0** |
| `npm test` | **48 files / 556 tests pass** (đầu phiên: 556; +1 test cấu trúc bố cục A) |
| Sàn chữ trong 6 file đợt 1 | **0** chỗ dưới 12px |
| Sàn chữ toàn app | 349 → **188** (188 còn lại thuộc đợt 2) |
| Probe wireframe (5 vòng) | 31 mục → 2 mục (luật hover đã chốt) |
| File tạm | 0 (`git status` chỉ có 8 file của đợt) |
| Probe **app thật** | ⚠️ **không dùng được**: SPA render trắng trong browser vì thiếu runtime Tauri → phần "nhìn bằng mắt" phải do người dùng xác nhận trên app desktop |

Bằng chứng "chỉ đổi hình, không đổi logic" (do agent Metadata dựng, đáng chép lại): diff LCS toàn bộ vùng logic trước `return (` = **đúng 1 dòng thêm** (import `Button`); số lần gọi `if (`/`onClick`/`fileInputRef.click()` y hệt trừ 3 nút trùng đã gộp; diff câu chữ tiếng Việt chỉ mất 4 nhãn trùng + 1 dòng gợi ý 10px.

## 5. Việc còn lại & quyết định đã ghi

- **Đợt 2**: `TypographyControls` 32, `ChapterEnhancerView` 32, `agent/*` 40, `BookView` 15, `EpubReaderViewer` 7, `StatusBar` 8… (188 chỗ dưới 12px) + bố cục A cho các màn đó.
- **Chưa làm**: sidebar rail 72px (ba vùng vẫn đứng với sidebar 256px); `flex-row-reverse` để lại **thứ tự Tab theo DOM** (bàn phím vào panel trước vùng chính) — sửa triệt để phải di chuyển JSX.
- **Cần người dùng xác nhận**: `GatewaySettingsModal` giờ là panel thường trú (không còn mở/đóng như dialog); ở 375px tiêu đề chương bị cắt ngắn (app desktop).
- **Token của wireframe ≠ token thật**: `bg-surface`/`border-strong`/`focus` là tên vai trong wireframe, app dùng `bg-card`/`border-input`/`ring-ring` — 2 agent phải tự dịch. Lần sau đưa bảng ánh xạ ngay trong brief.

## 6. Bài học

1. **Wireframe phải dùng đúng token của app, không chỉ "token".** Dùng tên vai của skill rồi để người dựng tự dịch là chỗ lệch phát sinh.
2. **"Không ảnh hưởng chức năng" phải chứng minh bằng máy**, không bằng lời hứa: diff vùng logic (LCS) + đếm số lần gọi handler trước/sau là bằng chứng rẻ và mạnh.
3. **Giao việc cho agent phải kèm lệnh kiểm chứng cụ thể**; nhờ vậy 2 agent tự phát hiện thêm lỗi lint thật (`onClick` trên div tĩnh, nested ternary) và sửa trước khi trả bài.
4. **Cổng kiểm phải chạy trên toàn bộ file của đợt, không chỉ file agent sửa** — tôi đã sót 55 chỗ chữ dưới 12px ở chính file mình làm, chỉ lộ ra khi rà lại tất cả.
5. **Probe "0 lỗi" trên trang trắng là tín hiệu giả.** Kiểm chứng tự động phải kèm điều kiện: trang có render thật không — nếu không thì nói rõ là chưa kiểm được.
