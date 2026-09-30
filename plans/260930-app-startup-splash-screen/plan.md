---
title: App Startup Loading & Splash Screen
description: >-
  Add a polished, smooth startup loading / splash screen for NiceEbook Studio,
  displaying brand identity, initialization progress, and graceful transition.
  Includes navigation exhaustiveness tests and HTML sanitizer refinement.
status: completed
priority: P1
branch: main
tags:
  - ui
  - ux
  - splash-screen
  - desktop
  - tauri
  - react
blockedBy: []
blocks: []
created: '2026-09-30T16:25:00.000Z'
createdBy: 'ck:cook'
source: skill
---

# Kế Hoạch: Bổ Sung Màn Hình Loading (Splash Screen) Khi Khởi Động App

## 1. Mục tiêu & Trải nghiệm người dùng

Khi người dùng mở ứng dụng NiceEbook Studio (trên desktop Tauri hoặc Web):
1. **Ấn tượng ban đầu chuyên nghiệp (First-Time Experience):**
   - Hiển thị logo ứng dụng `/app-icon.png` kèm hiệu ứng glow nhẹ nhàng.
   - Hiển thị tên phần mềm `NiceEbook Studio` và phiên bản `v0.1.0`.
2. **Minh bạch tiến trình khởi tạo (Initialization Transparency):**
   - Thanh tiến trình mượt mà (smooth progress bar) hiển thị các bước:
     - `1/3`: Khởi tạo môi trường Studio & nạp cấu hình...
     - `2/3`: Quét các cổng AI Proxy cục bộ (9Router, Ollama, Cockpit)...
     - `3/3`: Hoàn tất khởi động, sẵn sàng làm việc!
3. **Chuyển cảnh mượt mà (Graceful Transition):**
   - Đảm bảo thời gian hiển thị tối thiểu (~600ms) để tránh hiện tượng giật màn hình (1-frame flash).
   - Tự động fade-out (transition opacity 300ms) đưa người dùng vào giao diện chính.

## 2. Kế hoạch các Phase triển khai

| Phase | Nội dung | File chính | Trạng thái |
| :---: | :--- | :--- | :---: |
| **01** | **Màn hình Loading Startup (Splash Screen):** Tạo component `AppSplashScreen`, quản lý tiến trình khởi tạo và hiệu ứng mượt mà. | `src/components/layout/AppSplashScreen.tsx`, `src/App.tsx`, test | Hoàn tất |
| **02** | **Củng cố kiểm thử & Hoàn thiện đồng bộ (Hardening):** Test kiểm chứng độ bao phủ toàn diện của tất cả các tab trong `Sidebar.tsx`, tách biệt thẻ media cho reader trong `htmlSanitizer.ts`, gắn nhãn Bước 6 trong `EpubReaderViewer.tsx`. | `src/components/layout/Sidebar.test.tsx`, `src/utils/htmlSanitizer.ts`, `EpubReaderViewer.tsx` | Hoàn tất |

## 3. Tiêu chí nghiệm thu

1. Khi mở ứng dụng, màn hình loading hiển thị đẹp mắt, đồng bộ màu sắc dark/light với thiết kế LinguaGacha.
2. Quá trình quét gateway và khởi tạo được phản ánh chính xác trên thanh tiến trình.
3. Chuyển cảnh fade-out mượt mà, không giật lag.
4. Test suite Vitest đạt 100% PASS (bao gồm các test mới).
5. Build production hoàn thành không có lỗi.
