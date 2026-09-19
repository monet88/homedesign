# 📜 BÁO CÁO TOÀN DIỆN: SPRINT 11 — PHASE 04
## BEHAVIORAL AUDIT, SECURITY REFACTOR & BÀN GIAO CHUYỂN GIAO SPRINT 12 (V2 ROADMAP)

> **Dự án:** HomeDesign AI Architecture Studio  
> **Vị trí hiện tại:** **SPRINT 11 — PHASE 04: HOÀN TẤT BEHAVIORAL AUDIT, WORKSPACE SECURITY CHO AUTO-LINK & CHUYỂN GIAO SPRINT 12**  
> **Phiên bản phát hành:** `v1.0.1` Commercial Release (Release Tag `v1.0.1` trên GitHub)  
> **Thời gian chốt bàn giao:** 2026-09-19 15:00 (UTC+7)  
> **Nhánh phát triển:** `main`  
> **Base Anchor (Rollback Point):** `d54d069` (v1.0.1 Tag)  
> **Live Production URL:** [https://design.7app.online](https://design.7app.online) (Cloudflare Version `3a132754-d14f-4f46-841d-85e8890c3bc6`)  
> **Tour Mẫu Thực Tế Ảo:** [https://design.7app.online/tour/demo-penthouse](https://design.7app.online/tour/demo-penthouse)  
> **Trạng thái kiểm thử:** **708 / 708 unit tests PASSED (100%)** • `npm run wrangler:test` **269/269 tests PASSED** • `tsc --noEmit` **0 errors** • Cloudflare Worker Bundle **2.17 MB / 3.0 MB**  
> **Quy trình tuân thủ:** `/behavior-model-debugger` • `/vibe-engineering-workflow` • `/vibe-git-manager`  

---

## 1. 🎯 MỤC TIÊU CỦA SPRINT 11 PHASE 04 (OBJECTIVES)

1. **Audit chuyên sâu trải nghiệm người dùng (`/behavior-model-debugger`):**
   - Đóng vai người dùng khó tính (Kiến trúc sư, Chủ đầu tư, Khách xem tour) để kiểm tra toàn bộ các tính năng vừa xây dựng: Interactive 360° VR Tour Studio, Batch Panorama Generator, Auto-Link Portals Engine, CAD QR Code Exporter, SePay VietQR / Stripe Payments.
   - Tìm kiếm các va chạm luật chơi tiềm ẩn (**Invariant Collisions**) và các điểm gãy UX khi nhiều tính năng phối hợp.
2. **Refactor bảo mật đa người dùng (Multi-tenant Workspace Security):**
   - Rà soát các luồng gọi API của Tour 360 để đảm bảo tính nhất quán tuyệt đối giữa quyền sở hữu cá nhân (`userId`) và quyền thành viên nhóm (`workspace_members`).
   - Khắc phục triệt để điểm khuyết quyền hạn tại engine tự động liên kết phòng `autoLinkTourScenes()`.
3. **Thiết lập tài liệu Handoff & Master Prompt cho Session mới:**
   - Đóng gói toàn bộ hiện trạng kỹ thuật, kết quả kiểm thử, mốc neo rollback an toàn để Đại Ka có thể khởi động Session mới bước vào **Sprint 12 (v2 Client Portal & Subscription)** mà không bị nhầm lẫn hay mất mát ngữ cảnh.

---

## 2. 🔍 KẾT QUẢ AUDIT MÔ HÌNH HÀNH VI (`/behavior-model-debugger`)

### A. Tái tạo mô hình tương tác (Behavioral Reconstruction):
- **Phân biệt Drag xoay vs. Click ghim toạ độ:**
  + Trong [`src/components/panorama/panorama-tour-viewer.tsx`](file:///e:/monetwork/hmdesign/src/components/panorama/panorama-tour-viewer.tsx), khi người dùng ở chế độ ghim toạ độ (`isPickingCoord`), hệ thống tính toán khoảng cách di chuyển chuột `dx = |clientX - startX|` và `dy = |clientY - startY|`.
  + Ngưỡng phân định: `dx < 6 && dy < 6`. Nếu người dùng rê chuột xoay 360°, hệ thống bỏ qua; chỉ khi bấm click dứt khoát thì toạ độ `mouseEventToCoords()` mới được ghi nhận. Tránh hoàn toàn việc click nhầm khi đang xoay góc nhìn.
- **Tương tác di động & Cảm biến con quay hồi chuyển (Gyroscope):**
  + Tương thích hoàn toàn với cơ chế bảo mật iOS 13+ qua `DeviceOrientationEvent.requestPermission()`.
  + Có thông báo thân thiện và tự động fallback nếu thiết bị hoặc trình duyệt không hỗ trợ con quay hồi chuyển.
- **Chế độ kính thực tế ảo (VR Cardboard Stereo):**
  + Hỗ trợ chia đôi màn hình (Dual-viewport stereo view) với thanh phân cách tâm, tối ưu hóa cho kính thực tế ảo giá rẻ VR Box / Google Cardboard khi đối tác dẫn khách đi thực địa công trình.
- **Phục hồi sự cố WebGL (Fail-safe WebGL Recovery):**
  + Lắng nghe sự kiện `webglcontextlost` trên canvas để tự động chuyển sang chế độ ảnh phẳng tĩnh (Static Panoramic Fallback) thay vì gây crash ứng dụng.

### B. Ma trận va chạm luật chơi (Invariant Collision Matrix & Refactor):

| Tính năng A | Giao thoa với Tính năng B | Điểm va chạm tiềm ẩn phát hiện | Hành động khắc phục đã thực hiện |
| :--- | :--- | :--- | :--- |
| **Auto-Link Portals** | **Workspace Multi-Tenancy** | `autoLinkTourScenes()` trước đây chỉ so sánh cứng `tour.userId !== userId`. Khi một kiến trúc sư trong cùng công ty/studio muốn bấm nút tự động nối phòng cho tour chung thì bị báo lỗi `Tour không tồn tại hoặc không có quyền truy cập`. | **Đã refactor:** Bổ sung truy vấn bảng `workspace_members`. Cho phép thành viên hợp lệ trong cùng workspace của tour có quyền tự động tạo liên kết phòng. Đã bổ sung 2 unit test xác minh chặt chẽ. |
| **White-label Branding** | **Responsive Embed Iframe** | Khi nhúng vào website đối tác qua iframe (`?embed=1`), thanh điều hướng Studio Header có thể chiếm diện tích hiển thị trên mobile. | `TourViewPanel` nhận cờ `isEmbed` để ẩn các thanh điều hướng thừa, tối đa hóa không gian 360° cho khung nhúng. |
| **Private-by-Default** | **Public CAD QR Code** | Tour tạo mới mặc định `isPublic: false`. Nếu kiến trúc sư in QR ra giấy khi chưa bấm nút "Chia sẻ công khai", khách quét mã sẽ thấy gì? | Hệ thống hiển thị trang cảnh báo Obsidian Gold sang trọng: *"Bản xem thực tế ảo không khả dụng hoặc đang ở chế độ riêng tư"*, tuyệt đối không để lộ bất kỳ metadata hay cấu trúc phòng nào của dự án. |

---

## 3. 🛠️ NHỮNG VIỆC ĐÃ HOÀN TẤT TRONG PHASE 04 (WHAT WAS DONE)

1. **Refactor bảo mật cho [`src/lib/panorama/batch-panorama.ts`](file:///e:/monetwork/hmdesign/src/lib/panorama/batch-panorama.ts):**
   - Nâng cấp hàm `autoLinkTourScenes()` hỗ trợ xác thực 2 lớp: Chủ sở hữu tour (`isOwner`) HOẶC Thành viên workspace (`isMember`).
   - Ngăn chặn triệt để tình trạng phân quyền không đồng bộ giữa API biên tập tour và engine auto-link.
2. **Bổ sung kiểm thử tự động tại [`src/lib/panorama/batch-panorama.test.ts`](file:///e:/monetwork/hmdesign/src/lib/panorama/batch-panorama.test.ts):**
   - Test case 1: Từ chối người dùng lạ không phải owner và không thuộc workspace (`rejects unauthorized user who is neither owner nor workspace member`).
   - Test case 2: Cho phép đồng nghiệp trong cùng workspace thực thi auto-link thành công (`allows workspace member to auto-link scenes even if not direct owner`).
   - Tổng số unit tests tăng từ **706 -> 708 tests (100% PASS)**.
3. **Kiểm tra Secret Regression Gate & Typecheck:**
   - Chạy `bash scripts/secret-gate.sh` -> **PASS (0 violations)**.
   - Chạy `npm run typecheck` (`tsc --noEmit`) -> **0 errors**.
4. **Cập nhật Living Context:**
   - Cập nhật [`CONTEXT.md`](file:///e:/monetwork/hmdesign/CONTEXT.md) và ghi nhận mốc chuyển giao.

---

## 4. 📊 BẰNG CHỨNG KIỂM NGHIỆM THỰC TẾ (EMPIRICAL EVIDENCE)

```
================================================================================
✅ LINT GATE: npm run lint
   Status: 0 errors, 320 warnings (Exit Code 0)

✅ TYPECHECK GATE: npm run typecheck (tsc --noEmit)
   Status: 0 errors (Exit Code 0)

✅ SECRET REGRESSION GATE: bash scripts/secret-gate.sh
   Status: PASS — 0 exposed secrets detected (Exit Code 0)

✅ UNIT TEST SUITE: npm test (vitest)
   Test Files: 65 passed (65)
   Tests:      708 passed (708) — Tăng thêm 2 tests bảo mật workspace
   Duration:   96.2s (Exit Code 0)

✅ WORKERS RUNTIME SUITE: npm run wrangler:test
   Test Files: 17 passed (17)
   Tests:      269 passed (269) (Exit Code 0)

✅ FREE-FIRST BUNDLE GATE: npm run gate:free-first
   Worker Bundle: 2,277,612 bytes / 3,145,728 bytes (2.17 MB / 3.0 MB limit, dư 27.6%)
   Status: OK: free-first bundle gate passed (Exit Code 0)

✅ GITHUB ACTIONS CI STATUS:
   Nhánh main: GREEN CHECKMARK (All jobs passed)
   PR #6: MERGED thành công
================================================================================
```

---

## 5. 🚦 QUY TRÌNH `/vibe-engineering-workflow` & `/vibe-git-manager`: LÀM GÌ TIẾP THEO?

### A. Về mặt Git & Mã nguồn (`/vibe-git-manager`):
- **Trạng thái:** Mã nguồn vừa sửa (`batch-panorama.ts` và `batch-panorama.test.ts`) đã qua toàn bộ test và secret gate.
- **Hành động:** Commit trực tiếp lên `main` với thông điệp chuẩn mực:
  `fix(security): support workspace member authorization in autoLinkTourScenes and add unit tests`
- **Mốc neo an toàn (Rollback Anchors):**
  + Base Release Anchor: `d54d069` (Tag `v1.0.1`).
  + Hotfix CI Anchor: `dec7340` (PR #6 merge).
  + Phase 04 Head Anchor: Sẽ là commit sau khi commit thay đổi này.

### B. Về mặt Định hướng Kỹ thuật (`/vibe-engineering-workflow`):
- **Kết thúc Sprint 11:** Chính thức khép lại Sprint 11 (Bao gồm v1.0.1 Release, Hotfix CI Green và Security Hardening).
- **Mở ra Sprint 12 (v2 Product Development):**
  + **Sprint 12 — Phase 01: Client Portal & 360° Pin Comments MVP.**
    - Thiết kế giao diện Portal dành riêng cho khách hàng của Kiến trúc sư (`/portal/[token]`).
    - Tính năng cắm cờ ghi chú 360° (Pin Comments) gắn với tọa độ Yaw/Pitch và phòng cụ thể.
  + **Sprint 12 — Phase 02: B2B White-Label & Nadir Floor Patch.**
    - Tùy biến thương hiệu Studio toàn diện, chèn logo đáy sàn che chân máy quay.
  + **Sprint 12 — Phase 03: Subscription Recurring Billing (VietQR & Stripe).**
    - Đăng ký gói định kỳ theo tháng/năm, tự động gia hạn và thời gian ân hạn Grace Period 14 ngày.

---

## 6. 🤝 MASTER PROMPT DÀNH CHO ĐẠI KA SANG SESSION MỚI (HANDOFF PROMPT)

Khi Đại Ka mở một cửa sổ chat mới, Đại Ka chỉ cần copy và dán nguyên văn đoạn dưới đây để AI mới nắm bắt 100% ngữ cảnh mà không bị nhầm lẫn:

```markdown
Chào em, tiếp tục dự án HomeDesign AI Architecture Studio từ tài liệu bàn giao Sprint 11 Phase 04:
docs/2026-09-19-sprint-11-phase-04-behavioral-audit-and-master-handover.md

### VỊ TRÍ HIỆN TẠI CỦA DỰ ÁN:
- VỊ TRÍ: BẮT ĐẦU SPRINT 12 — PHASE 01: PHÁT TRIỂN BẢN V2 (CLIENT PORTAL & 360° PIN COMMENTS).
- Phiên bản thương mại hiện tại: v1.0.1 Commercial Release (Release Tag: v1.0.1 trên main).
- Live Production URL: https://design.7app.online (Cloudflare Version ID: 3a132754-d14f-4f46-841d-85e8890c3bc6).
- Tour Mẫu Trực Tuyến: https://design.7app.online/tour/demo-penthouse (3 phòng 360° Gyroscope/VR Cardboard).
- GitHub CI Status: 100% XANH (GREEN) — PR #6 đã merge, dứt điểm hoàn toàn spam mail CI.
- Trạng thái kiểm thử đã xác minh thực nghiệm (Exit Code 0):
  + 708/708 unit tests PASSED 100% (65 test files).
  + 269/269 workers-runtime tests PASSED (17 test files).
  + Typecheck (tsc --noEmit): 0 errors.
  + Secret Gate: PASS (0 violations).
  + Cloudflare Worker Bundle: 2.17 MB / 3.0 MB (dư 27.6% hạn mức Free-first).

### MỤC TIÊU SPRINT 12 PHASE 01:
Tuân thủ /vibe-engineering-workflow, /vibe-git-manager, /behavior-model-debugger:
1. Giữ an toàn tuyệt đối mốc Rollback Anchor của bản v1.0.1.
2. Thiết kế và phát triển tính năng Client Portal (/portal/[token]):
   - Cho phép khách hàng của Kiến trúc sư / Studio xem thiết kế không cần tạo tài khoản.
   - Tính năng cắm cờ ghi chú tương tác 360° (Interactive 360° Pin Comments) lưu tọa độ Yaw/Pitch và nội dung yêu cầu sửa đổi.
3. Tạo feature branch feature/sprint-12-client-portal và chạy qua Pre-Check Gate 4 bước trước khi mở PR.

Bắt đầu kiểm tra trạng thái git và triển khai công việc!
```

---
*Báo cáo được biên soạn và kiểm chứng thực nghiệm bởi Antigravity AI Assistant.*
