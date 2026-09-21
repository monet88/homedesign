# 🚀 Handoff Document: Chuyển Giao Session Sang Sprint 10 — Phase 02

> **Dự án:** HomeDesign AI Architecture Studio  
> **Ngày:** 18/09/2026  
> **Branch:** `feature/sprint-10-3d-panorama-vr-tour` (Commit: `94f3f2e`)  
> **Base Anchor:** `ee6f0dc` (nhánh `main`)  
> **Live Production:** `https://design.7app.online` (Version ID: `7899a783-7311-415f-a6a5-510c68c7f1b5`)

---

## 1. 📌 Vị Trí & Tiến Độ Dự Án Hiện Tại

### ✅ ĐÃ HOÀN THÀNH 100%:
1. **Sprint 10 — Phase 01 (Backend, Database & Schema):**
   - Bảng `tours`, `tour_scenes`, `tour_hotspots` đã migrate trên Cloudflare D1.
   - Các API endpoints `/api/tours`, `/api/tours/[id]/scenes`, `/api/tours/[id]/hotspots`, `/api/tours/share/[token]` đã sẵn sàng và kiểm thử.
2. **Hotfix & Referral / AI Engine Stability (Phase 01.5):**
   - Sửa lỗi upload R2: Thay thế URL giả bằng direct worker upload `/api/assets/[id]/upload`, fix lỗi `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`.
   - Chuẩn hóa AI Model Adapter: Sửa Gemini 2.5 Flash Image (`responseModalities: ["IMAGE", "TEXT"]`), khắc phục lỗi prompt text/json của Google API.
   - Đã tạo thiết kế phối cảnh thành công 100% trên Production (Slide Before/After hoạt động mượt mà).
   - Khắc phục lỗi Referral Attribution: Ngăn chặn tự xóa cookie khi gặp `SELF_REFERRAL`.
   - Đã liên kết tài khoản `letinhz6u9` với `ltdanhdufnsq`, cộng 10 credits cho `ltd` (số dư hiện tại là 15 credits, clicks: 2, referrals: 1).
   - Hoàn thành báo cáo kiểm toán kinh tế Unit Economics & Anti-Fraud Sybil Prevention tại `docs/2026-09-18-audit-referral-economics-and-behavioral-debugger.md`.
   - Đã push commit `94f3f2e` lên remote branch.

---

## 2. 🎯 Nhiệm Vụ Tiếp Theo: SPRINT 10 — PHASE 02

### **Mục tiêu Phase 02: FRONTEND INTERACTIVE VR TOUR VIEWER & STUDIO EDITOR**
1. **Xây dựng Interactive Panorama Viewer (`PanoramaTourViewer`):**
   - Sử dụng Three.js / Panolens hoặc Canvas 360° Sphere Projection mượt mà.
   - Hỗ trợ chuyển cảnh giữa các phòng (Multi-room scenes: Phòng khách ➔ Bếp ➔ Phòng ngủ).
   - Tương tác Hotspot 3D: Click vào điểm neo trên không gian để nhảy sang phòng khác hoặc xem thông tin vật liệu/nội thất.
   - Hỗ trợ Gyroscope (cảm biến con quay hồi chuyển) trên thiết bị di động để xoay theo hướng nhìn người dùng.
2. **Xây dựng Studio Tour Editor:**
   - Cho phép Kiến trúc sư click trực tiếp lên ảnh panorama để cắm cờ Hotspot (chọn tọa độ pitch/yaw).
   - Chọn phòng đích cần liên kết hoặc nhập thông số ghi chú.
   - Lưu trạng thái vào API backend `/api/tours/[id]/hotspots`.
3. **Trang Public Share Tour (`/tour/[token]`):**
   - Màn hình xem toàn cảnh 360° không cần đăng nhập cho khách hàng của KTS.
   - Tối ưu SEO, WebGL context loss handling và nút chuyển chế độ VR Fullscreen.

---

## 3. 📋 Master Prompt Cho Session Mới (Dành Cho Đại Ka)

Đại Ka chỉ cần copy toàn bộ đoạn dưới đây và gửi vào session mới:

```text
Chào em, tiếp tục dự án HomeDesign AI Architecture Studio từ tài liệu bàn giao:
docs/2026-09-18-handoff-sprint-10-phase-02-vr-tour-viewer.md

### VỊ TRÍ HIỆN TẠI CỦA DỰ ÁN:
- VỊ TRÍ: SPRINT 10 — PHASE 01 & HOTFIX ENGINE/REFERRAL ĐÃ HOÀN THÀNH 100% (Commit: 94f3f2e).
- Branch: feature/sprint-10-3d-panorama-vr-tour
- Production: https://design.7app.online (Live Version: 7899a783-7311-415f-a6a5-510c68c7f1b5)
- Tài khoản ltdanhdufnsq và letinhz6u9 đã được verify, credit và AI generation đã hoạt động mượt mà.

### NHIỆM VỤ THỰC HIỆN TIẾP THEO:
Đồng ý tiến hành /vibe-git-manager /vibe-engineering-workflow /behavior-model-debugger để triển khai:
SPRINT 10 — PHASE 02: FRONTEND INTERACTIVE VR TOUR VIEWER & STUDIO EDITOR:
1. Xây dựng component PanoramaTourViewer 360° hỗ trợ multi-room scenes, hot-spots 3D chuyển phòng, và hỗ trợ Gyroscope trên mobile.
2. Xây dựng Studio Tour Editor: KTS click trực tiếp lên ảnh để gắn điểm neo Hotspot liên kết giữa các phòng.
3. Hoàn thiện trang Public Share Tour (/tour/[token]) tối ưu full màn hình, chống crash WebGL và responsive.
4. Chạy typecheck, build worker và deploy Cloudflare Production.
```
