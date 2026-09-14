# HomeDesign — Báo Cáo Kiểm Toán & Bàn Giao Sprint (Sprint 01 - Phase 02)

> **Dự án**: HomeDesign Clone (`monet88/homedesign`)  
> **Thời điểm**: 2026-09-14  
> **Trạng thái**: Đã nghiệm thu & đẩy lên GitHub (Commit `b13482b`)  
> **Cột mốc**: **Sprint 01 — Phase 02: Public Demo Stabilization & AI Provider Hardening (Issue #72, ADR 0008)**

---

## 1. 🎯 Mục Tiêu (Objective)

1. **Khắc phục triệt để lỗi P0 Blocker**: Schema mismatch giữa migration D1 (`migrations/0011_public_demo_provider_usage.sql`) và mã nguồn runtime (`src/lib/ai/demo-usage.ts`). Lỗi này gây crash 500 toàn bộ luồng gọi AI trên Public Demo (`homedesign.monet.uno`).
2. **Kiểm toán hành vi người dùng (Behavioral Audit)**: Dùng phương pháp `behavior-model-debugger` để rà soát toàn diện trải nghiệm người dùng, va chạm luật chơi (Invariant Collisions), các điểm nghẽn UX khi hết hạn mức (Quota Cap) hoặc lỗi AI.
3. **Thiết lập chu trình phát triển độc lập (Self-Contained Local Dev)**: Giúp nhà phát triển tự do code, debug, kiểm thử E2E và preview ngay trên máy mà không bị phụ thuộc hay phải chờ đợi duyệt PR từ GitHub.
4. **Bàn giao phiên làm việc (Session Handoff)**: Đóng gói toàn bộ bối cảnh, kết quả kiểm thử và câu lệnh Prompt chuẩn để chuyển sang phiên mới không bị nhầm lẫn.

---

## 2. 🛠️ Việc Đã Làm (What Was Done)

### A. Sửa lỗi P0 Schema Mismatch (Ticket #72)
* **Nguyên nhân gốc**: Migration `0011` định nghĩa bảng `demo_daily_provider_usage` với các cột `day_key`, `submission_count`, `created_at`, `updated_at`. Tuy nhiên code runtime và test mock lại query vào bảng `demo_provider_usage` với các cột `usage_date`, `usage_count`.
* **Khắc phục**:
  * Chuẩn hóa toàn bộ câu lệnh SQL trong `src/lib/ai/demo-usage.ts` khớp 100% với Migration `0011`.
  * Giữ nguyên cơ chế bảo vệ concurrency bằng atomic update: `WHERE submission_count < limit`.
  * Đồng bộ lại test suite trong `src/lib/ai/demo-usage.wtest.ts`.

### B. Vận hành Git & Clean Workspace (Theo `/vibe-git-manager`)
* Chuyển an toàn thư mục `node_modules` về thư mục gốc `E:\monetwork\homework` (tiết kiệm thời gian, không cần chạy lại `npm install`).
* Fast-forward merge commit `b13482b` vào nhánh `main`.
* Xóa sạch worktree phụ `homework-demo-provider-usage-schema` và nhánh local tạm.
* Đẩy thành công cả 2 nhánh lên GitHub bằng token xác thực:
  * Nhánh PR: `fix/demo-provider-usage-schema` (https://github.com/monet88/homedesign/pull/new/fix/demo-provider-usage-schema)
  * Nhánh chính: `origin/main` (Đồng bộ trực tiếp, working tree sạch 100%).

---

## 3. 📊 Kết Quả & Bằng Chứng Xác Minh (Verification Evidence)

Mọi cổng kiểm soát chất lượng (Quality Gates) đều đã vượt qua thực tế trên máy:

| Cổng Kiểm Duyệt | Lệnh Chạy | Kết Quả Thực Tế |
|---|---|:---:|
| **Focused Worker Pool** | `npx vitest run src/lib/ai/demo-usage.wtest.ts --config vitest.workers.config.ts` | **12/12 PASS** (4.77s) |
| **Typecheck** | `npm run typecheck` (`tsc --noEmit`) | **0 Error** |
| **Full Unit Test Suite** | `npm test` (`vitest run --config vitest.config.ts`) | **459 passed / 3 skipped** (27 suites) |
| **Git Push Dry-run & Live** | `git push origin main` | **bca7718..b13482b (SUCCESS)** |

---

## 4. 🧠 Báo Cáo Kiểm Toán Toàn Diện (Theo `/behavior-model-debugger`)

### A. Ma trận Tính năng Hiện tại (Feature Matrix)
1. **Đã hoàn thiện & Có Test (Done & Verified)**:
   * **Interior / Exterior Redesign**: Upload ảnh 50MB, chọn Style presets, Room Type, Palette, Aspect Ratio, Custom prompt (tối đa 300 ký tự), Before/After comparison slider.
   * **Floor Plan 5-Stage Pipeline**: Source Upload -> Marker Placement -> Room Recognition & Brief -> 2D Furniture Layout -> 3D Photorealistic Render -> 360° Panorama (Pannellum viewer).
   * **Double-Entry Credit Ledger**: Quản lý Quota, Holds, Grants, Usage và Releases theo sổ cái kế toán kép bất biến.
   * **Storage-First Quarantine (R2)**: Upload hạ cánh tại `quarantined` trước, queue `asset-validate` kiểm tra magic bytes rồi mới chuyển sang `ready`.
   * **Provider Abstraction**: Tự động chuyển đổi mượt mà giữa `FakeProviderAdapter` (offline/test) và `GeminiFlashImageAdapter` (kết nối endpoint `https://cliproxy.monet.uno/v1` với model `gemini-3.1-flash-image`).
   * **Admin Panel (`/admin`)**: Quản lý người dùng, phân quyền RBAC, kiểm tra kết nối AI Provider Health Check, điều chỉnh Credits thủ công.
2. **Đang thực hiện (In-Progress - Sprint 01 Phase 02)**:
   * Ổn định môi trường Public Demo (`homedesign.monet.uno`): Google-only OAuth, fail-closed quota 50 lượt/ngày.
3. **Chưa thực hiện (Future Backlog - Phase 03)**:
   * Tích hợp cổng thanh toán thật (Stripe / Polar / SePay VietQR). Hiện tại đang dùng `Mock Payment`.
   * Thư viện mẫu nâng cao & Hệ thống template thiết kế.

### B. Tái tạo Mô hình Hành vi (Reconstructed Behavioral Model)
* **Luồng Polling & Ngắt quãng**:
  * Client gọi API tạo AI Task -> Nhận `taskId` -> Bắt đầu poll mỗi 1.5 - 2 giây.
  * Nếu người dùng đóng tab hoặc chuyển trang: Task trên server vẫn tiếp tục chạy độc lập và lưu kết quả vào database. Khi người dùng quay lại trang dự án, dữ liệu tự động đồng bộ (Resume processing tasks).
* **Luồng Hết Hạn Mức Demo (Cap Reached = 50 submissions/ngày)**:
  * Adapter chặn ngay tại chỗ (Fail Closed), trả về `DEMO_DAILY_LIMIT_REACHED`.
  * Task đổi trạng thái sang `failed`, Credit Hold được giải phóng ngay lập tức (không kẹt credit).
  * Frontend bắt mã lỗi và hiển thị Toast thông báo, dừng spinner loading.

### C. Danh mục Nâng cấp Độ Mượt (Ergonomics & Polish Checklist)
- [ ] **Thân thiện hóa mã lỗi**: Đổi thông báo toast từ mã kỹ thuật `DEMO_DAILY_LIMIT_REACHED` thành câu tiếng Việt tự nhiên: *"Hạn mức trải nghiệm Demo hôm nay đã hết (50 lượt). Vui lòng quay lại vào ngày mai!"*.
- [ ] **Kế thừa biến môi trường `wrangler.jsonc`**: Bổ sung `EMAIL_DELIVERY_MODE: "test-outbox"` vào khối `env.demo` để triệt tiêu hoàn toàn cảnh báo của Wrangler CLI.

---

## 5. 🚦 Lộ Trình Tiếp Theo (Theo `/vibe-engineering-workflow`)

Dự án hiện đang ở vị trí chính xác:
* **Giai đoạn hiện tại**: **Sprint 01 — Phase 02: Public Demo Stabilization (Issue #72)**
* **Hành động tiếp theo (Next Steps)**:
  1. **Bước 1**: Kiểm tra preflight deploy của Cloudflare Demo (xác nhận lại domain `homedesign.monet.uno` và biến môi trường).
  2. **Bước 2**: Chạy thử luồng sinh ảnh thật qua `https://cliproxy.monet.uno/v1` trên môi trường Demo.
  3. **Bước 3 (Chuyển Phase)**: Bắt đầu lập kế hoạch cho **Sprint 02 / Phase 03**: Tích hợp thanh toán thật và thương mại hóa nền tảng.

---

## 6. 🤝 Bản Hợp Đồng Bàn Giao Cho Session Mới (Handoff Prompt)

Khi mở session mới, Đại Ka chỉ cần copy toàn bộ đoạn văn bản bên dưới và dán vào khung chat:

```text
Chào bạn, tôi là Đại Ka. Hãy đọc kỹ file docs/audit-and-sprint-handover.md và CONTEXT.md để nắm bối cảnh dự án HomeDesign.

Hiện trạng dự án:
- Chúng ta đang ở Sprint 01 - Phase 02: Public Demo Stabilization & AI Provider Hardening (Issue #72).
- Commit mới nhất trên main là b13482b (đã fix triệt để P0 schema mismatch cho bảng demo_daily_provider_usage).
- Đã chạy pass toàn bộ 459 unit tests, 12 worker pool tests, typecheck sạch sẽ.
- Local dev đã sẵn sàng với AUTH_BYPASS=1 tại http://localhost:3000.

Nhiệm vụ của session này:
1. Áp dụng các kỹ năng /vibe-engineering-workflow, /vibe-git-manager, /behavior-model-debugger.
2. Kiểm tra lại khối env.demo trong wrangler.jsonc để chuẩn hóa các biến môi trường cho bản deploy homedesign.monet.uno.
3. Polish thông điệp UX khi chạm ngưỡng DEMO_DAILY_LIMIT_REACHED trên frontend.
4. Hướng dẫn tôi bật server local test giao diện và chuẩn bị bước kế tiếp của Phase 02.
Hãy trả lời bằng tiếng Việt, xưng hô với tôi là "Đại Ka" và giữ nguyên các thuật ngữ chuyên môn tiếng Anh.
```
