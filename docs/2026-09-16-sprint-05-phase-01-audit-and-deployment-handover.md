# SPRINT 5 — PHASE 1 HOÀN TẤT & SPRINT 5 PHASE 2 HANDOVER CONTRACT

> **Ngày lập**: 16/09/2026  
> **Dự án**: HomeDesign Clone (AI Architecture & Interior/Exterior Design SaaS)  
> **Giai đoạn hiện tại**: **SPRINT 5 — PHASE 1 ĐÃ HOÀN TẤT & DEPLOYED PRODUCTION — SẴN SÀNG CHO SPRINT 5 PHASE 2**  
> **Active Branch**: `feat/sprint-05-saas-polish-and-inpainting`  
> **Base Target Branch**: `main`  
> **Production Live**: [https://design.7app.online](https://design.7app.online)  
> **Cloudflare Worker Demo Version**: `83f1f037-ab3f-4d88-ae50-bfc194c85cd7`  
> **Remote Database**: Cloudflare D1 `homeds` (`7f422f9c-b36d-41a9-9f3e-2b676f982931`)  
> **Remote Storage**: Cloudflare R2 `hd-demo-private` / `hd-demo-public` / `hd-demo-next-cache`  
> **Tests Gate**: 539/539 Unit Tests passed (100%), 262/262 Worker Runtime Tests passed (100%)  

---

## 1. TỔNG KẾT SESSION: MỤC TIÊU, VIỆC ĐÃ LÀM & KẾT QUẢ

### A. Mục Tiêu Đặt Ra Cho Session
1. **Tuân thủ tuyệt đối các quy tắc**: Karpathy Behavioral Guidelines, `/vibe-git-manager`, `/vibe-engineering-workflow`, `/behavior-model-debugger`. Luôn xưng hô "Đại Ka", trả lời tiếng Việt, giữ thuật ngữ chuyên môn English, bảo vệ tuyệt đối secrets/token.
2. **Triển khai Sprint 5 — Phase 1**:
   - **Ticket 5.1 (AI Inpainting Mask Pipeline)**: Kết nối `maskDataUrl` từ Studio UI vào server adapter và Gemini prompt pipeline.
   - **Ticket 5.2 (Mobile Responsive & Touch Ergonomics)**: Tối ưu con trỏ và thao tác vuốt trượt trên điện thoại cho thanh Before/After Slider, bổ sung tính năng lưu ảnh QR trên Mobile Banking cho modal thanh toán VietQR.
3. **Audit toàn diện Codebase (`/behavior-model-debugger`)**:
   - Phân tích Behavioral Model (cử chỉ, biến số, ngắt quãng).
   - Thiết lập Ma trận va chạm luật chơi (Invariant Collision Matrix).
   - Kiểm toán bảo mật (Security audit) và cơ hội tái cấu trúc (Refactor).
4. **Deploy và Kiểm thử thực tế Live trên Production**:
   - Chạy `npm run build:worker` với OpenNext.
   - Deploy trực tiếp lên Cloudflare Worker Demo (`design.7app.online`).
   - Xác thực live 200 OK và kiểm tra phản hồi API trên edge.

---

### B. Những Công Việc Đã Hoàn Thành

1. **Kết Nối AI Inpainting Mask Pipeline (Ticket 5.1)**:
   - Sửa `src/lib/ai/lifecycle.ts`: Trích xuất `maskDataUrl` từ `design.config_json` trong `buildProviderRequest` và nạp vào `options.image_input = [imageInput, maskDataUrl]`.
   - Sửa `src/lib/ai/prompts/interior.ts`: Xây dựng hàm `buildInpaintingPrompt` với cấu trúc chỉ thị kiến trúc 3 tầng:
     1. Target & Mask Reference: Chỉ định Image 1 (ảnh phòng gốc) và Image 2 (vùng cọ trắng/đen cần sửa đổi).
     2. Preservation Invariants: Bảo toàn 100% tường, sàn, trần, cửa sổ và góc nhìn bên ngoài vùng mask.
     3. PBR Materiality & Seamless Blending: Hòa trộn liền mạch vật liệu và ánh sáng ở đường biên viền cọ.
2. **Tối Ưu Mobile Touch & VietQR Payment UX (Ticket 5.2)**:
   - Sửa `src/components/ui/before-after.tsx` & `src/components/studio/result-slider.tsx`: Tích hợp `setPointerCapture` và `touch-none`, cho phép người dùng kéo ngón tay ngang màn hình điện thoại mượt mà không bị trình duyệt cuộn trang hay mất con trỏ.
   - Sửa `src/components/billing/mock-payment-modal.tsx`: Bổ sung nút **"Lưu mã QR về máy"** và hướng dẫn quét mã trên cùng một thiết bị di động (Tải QR → Mở App Ngân Hàng → Quét mã từ Thư viện ảnh).
3. **Audit Codebase, Refactor & Security (`/behavior-model-debugger`)**:
   - Phân tích toàn diện Canvas/Pannellum coordinates (chuẩn hóa tỷ lệ %), WebGL context loss handling, Event propagation fix (`e.stopPropagation`).
   - Security Audit: Xác thực tính năng chống timing attack (`crypto.timingSafeEqual` trong SePay webhook), chống replay attack/double crediting (`credit_ledger` + `orders`), bảo mật R2 Presigned URLs (AWS SigV4 TTL 600s), chống SQL Injection (D1 Prepared Statements), và chống overdraft số dư credit.
4. **Build & Live Production Deployment**:
   - OpenNext Worker Build hoàn tất thành công: Gzip bundle `1,976.83 KiB` (~1.93 MB / Trần Free Tier: 3 MB).
   - Triển khai thành công phiên bản Worker mới: **`83f1f037-ab3f-4d88-ae50-bfc194c85cd7`**.
   - Live Verification: Truy vấn trực tiếp `https://design.7app.online` trả về `200 OK` (CF-Ray SIN), API `/api/auth/client-config` hoạt động trơn tru.
5. **Cập Nhật Tài Liệu Kỹ Thuật**:
   - Tạo và cập nhật `implementation_notes.html` chuẩn Karpathy guidelines.

---

## 2. BÁO CÁO 3 TRỤ CỘT KỸ NĂNG

### 🎮 Trụ Cột 1: `/behavior-model-debugger` (Codebase Audit & Invariant Analysis)

- **Mental Model & Gestures**:
  - **Floor Plan Markers**: Tọa độ được lưu trữ dưới dạng tỉ lệ phần trăm `((clientX - rect.left) / rect.width) * 100`. Khi đổi viewport hoặc xoay màn hình điện thoại, marker vẫn bám chính xác vào phòng được gán. Click marker được cô lập qua `e.stopPropagation()`.
  - **Panorama 360 Viewer**: Được trang bị module phát hiện WebGL (`isWebGLAvailable()`). Khi chạy trên thiết bị cũ hoặc máy tính bảng yếu bị crash GPU, viewer tự động chuyển sang chế độ ảnh tĩnh fallback an toàn thay vì gây crash trang.
  - **Brush Mask Canvas**: Tự động scale độ phân giải vật lý (`naturalWidth / naturalHeight`) với tỷ lệ CSS hiển thị, bảo đảm nét vẽ inpainting chuẩn 1:1 với kích thước ảnh phòng.
- **Security Guardrails**:
  - **SePay API Webhook**: Sử dụng `crypto.timingSafeEqual` để so khớp token, triệt tiêu nguy cơ tấn công dò tìm theo sai số thời gian (Timing Attack).
  - **R2 Storage Access**: Presigned URL tạo qua AWS SigV4 với thời hạn 10 phút (600 giây). Quyền tải ảnh (`/api/assets/[id]/download`) kiểm tra quyền sở hữu `row.user_id === session.user.id` trước khi trả file.
  - **Admin & Credit Safety**: Nghiêm cấm trừ âm số dư (`getAvailableCredits` gate). Cơ chế Two-Phase Hold tự động refund credit nếu quá trình sinh ảnh AI gặp lỗi mạng.

---

### 🧭 Trụ Cột 2: `/vibe-engineering-workflow` (Kế Hoạch Cho Sprint 5 Phase 2)

Sprint 5 đang ở mốc **PHASE 1 (Hoàn thành)**. Trong session tiếp theo, chúng ta sẽ bước vào **SPRINT 5 — PHASE 2: SaaS Polish & Feature Expansion**:

1. **Ticket 5.3: Studio Keyboard Shortcuts & Inpainting Undo/Redo**:
   - Bổ sung phím tắt `[` / `]` để tăng/giảm kích thước cọ vẽ.
   - Bổ sung phím tắt `Ctrl + Z` / `Cmd + Z` để hoàn tác (Undo) nét cọ vẽ mask, tăng tính tiện dụng cho người dùng thiết kế chuyên nghiệp.
2. **Ticket 5.4: Cổng Thanh Toán Quốc Tế (Stripe / GPMPay)**:
   - Kích hoạt cổng thanh toán thẻ quốc tế song song với SePay VietQR để mở rộng tệp khách hàng ngoài lãnh thổ Việt Nam.
3. **Ticket 5.5: Showcase Gallery & SEO Landing Page**:
   - Xây dựng thư viện các mẫu thiết kế nội thất/ngoại thất tiêu biểu (Before/After interactive showcase) ngay trên trang chủ để tối ưu tỷ lệ chuyển đổi (Conversion Rate).

---

### 🔒 Trụ Cột 3: `/vibe-git-manager` (Git Hygiene, Commits & PR)

- **Bảo mật Secrets**:
  - Đã quét kỹ lưỡng: **0 API token, 0 key, 0 credential lọt vào Git history**.
  - File `.env.local` được `.gitignore` bảo vệ nghiêm ngặt.
- **Commit History trên nhánh `feat/sprint-05-saas-polish-and-inpainting`**:
  - `e8a43e8`: `feat(sprint-05): wire inpainting mask to provider and optimize mobile slider/payment UX`
  - `c8ef662`: `docs: record live production deployment version in implementation notes`
- **Thực hiện Push & PR**:
  - Nhánh `feat/sprint-05-saas-polish-and-inpainting` được push lên GitHub remote `origin`.
  - Tạo Pull Request chính thức vào `main` để Đại Ka review và merge.

---

## 3. MASTER PROMPT CHO SESSION MỚI (COPY & PASTE SANG CỬA SỔ MỚI)

Đại Ka chỉ cần copy toàn bộ nội dung trong khung dưới đây và dán vào cửa sổ chat mới:

```text
Chào em, tiếp tục dự án HomeDesign Clone từ tài liệu bàn giao:
docs/2026-09-16-sprint-05-phase-01-audit-and-deployment-handover.md.

### Vị trí hiện tại:
- BƯỚC VÀO SPRINT 5 — PHASE 2: SaaS Polish, Studio Shortcuts & Feature Expansion.
- Nhánh làm việc: feat/sprint-05-saas-polish-and-inpainting (hoặc main nếu đã merge PR).
- Production domain: https://design.7app.online (Worker version: 83f1f037-ab3f-4d88-ae50-bfc194c85cd7).
- Core AI Gemini 2.5 Flash, Inpainting Mask Pipeline và Cổng thanh toán SePay VietQR ĐÃ HOẠT ĐỘNG HOÀN HẢO TRÊN PRODUCTION.
- File .env.local và toàn bộ secrets được bảo vệ nghiêm ngặt trong .gitignore.

### Nhiệm vụ session này:
1. Tiếp tục tuân thủ nghiêm ngặt các quy tắc:
   - /vibe-git-manager, /vibe-engineering-workflow, /behavior-model-debugger.
   - Luôn xưng hô "Đại Ka", trả lời bằng tiếng Việt, giữ thuật ngữ chuyên môn English.
   - Không leak secret vào Git tree.
2. Kiểm tra trạng thái PR / Merge nhánh feat/sprint-05-saas-polish-and-inpainting.
3. Triển khai các Ticket của Sprint 5 — Phase 2:
   - Ticket 5.3: Bổ sung Studio Keyboard Shortcuts ([ / ] cho Brush Size, Ctrl+Z cho Mask Undo/Redo).
   - Ticket 5.4: Khảo sát và tích hợp cổng thanh toán quốc tế (Stripe) song song với VietQR.
   - Ticket 5.5: Nâng cấp Showcase Gallery trên Landing Page.
```
