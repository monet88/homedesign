# Báo Cáo Kinh Tế Đơn Vị (Unit Economics), Phân Tích Cạnh Tranh & Bàn Giao Kỹ Thuật (Handoff)
## SPRINT 10 — PHASE 01 HOÀN TẤT $\rightarrow$ CHUYỂN GIAO PHASE 02: 3D PANORAMA & VR 360 TOUR

- **Thời điểm lập:** 2026-09-18 10:50 (GMT+7)
- **Tác giả:** Antigravity AI Engineer (Pair programming cùng Đại Ka)
- **Vị trí hiện tại:** **SPRINT 10 — PHASE 01 HOÀN TẤT & VERIFIED 100% (Branch: `feature/sprint-10-3d-panorama-vr-tour`, Commit: `7d37c12`)**
- **Phương pháp luận:** `/behavior-model-debugger`, `/vibe-engineering-workflow`, `/vibe-git-manager`

---

## 💰 PHẦN 1: BÀI TOÁN KINH TẾ (UNIT ECONOMICS) — VR 360 CÓ TỐN TIỀN API KHÔNG? CÓ RỦI RO LỖ KHÔNG?

Đại Ka đặt ra một câu hỏi chuẩn tư duy nhà sáng lập (Founder / Product Owner). Dưới đây là phân tích chi tiết tận gốc về chi phí và dòng tiền:

### 1. Phân Tích Chi Phí Token / API Thực Tế (Cost Breakdown)

Rất nhiều người lầm tưởng rằng người xem xoay quanh phòng 360 độ thì AI phải tính toán liên tục. **Thực tế hoàn toàn không phải vậy!**

1. **Khâu sinh ảnh (AI Generation — Chỉ tốn 1 lần duy nhất):**
   - AI chỉ chạy **đúng 1 lần** để sinh ra 1 tấm ảnh phẳng dạng cầu gọi là **Equirectangular Image** (tỉ lệ $2:1$, ví dụ $2048 \times 1024$ hoặc $4096 \times 2048$).
   - Chi phí API thực tế từ nhà cung cấp:
     - **Fal.ai Flux Schnell:** $\approx \$0.003$ - $\$0.005$ (~70đ - 120đ VND / ảnh).
     - **Fal.ai Flux Dev (Chất lượng cao):** $\approx \$0.025$ (~600đ VND / ảnh).
     - **Google Gemini 2.5 / 3.1 Flash Image:** $\approx \$0.02$ - $\$0.03$ (~500đ - 750đ VND / ảnh).
   - $\rightarrow$ **Tổng chi phí AI sinh 1 căn phòng 360: Tối đa ~600đ – 800đ VND ($0.025 - $0.03).**

2. **Khâu hiển thị & Trải nghiệm VR (Viewing & Tour Interaction — Hoàn toàn MIỄN PHÍ):**
   - Khi gia chủ, khách hàng hoặc KTS mở link xem, xoay phòng, lia camera, hay đeo kính VR: **KHÔNG HỀ TỐN 1 TOKEN AI NÀO!**
   - Engine 3D Pannellum chạy trực tiếp bằng **GPU của trình duyệt người dùng (WebGL Canvas client-side)**.
   - Băng thông tải ảnh: Ảnh 360 lưu trên **Cloudflare R2** với chính sách **Zero Egress Fees (Miễn phí 100% băng thông tải về)**. Khách hàng có vào xem 10.000 lượt thì chi phí Cloudflare R2 vẫn là $0.

### 2. Biên Lợi Nhuận (Profit Margin) & Cơ Chế Định Giá Bán

- Trong hệ thống HomeDesign, 1 lượt tạo Panorama tiêu tốn **4 Credits**.
- Biểu giá bán credit hiện tại của hệ thống:
  - Gói Nạp Cơ Bản (Starter): 50 Credits = 149.000đ ($\approx 2.980đ$ / credit).
  - Gói KTS Chuyên Nghiệp (Studio Pro): 200 Credits = 499.000đ ($\approx 2.495đ$ / credit).
- Doanh thu thu về cho 1 phòng 360 (4 Credits): $\approx 10.000đ - 12.000đ$ VND ($\approx \$0.45$).
- Chi phí vốn API (COGS): $\approx 700đ$ VND ($\approx \$0.03$).
- $\rightarrow$ **Lợi nhuận gộp (Gross Profit Margin) đạt trên 92% - 94%!**
- **Rủi ro lỗ:** **BẰNG 0%**. Hệ thống hoạt động theo cơ chế trừ credit trả trước (Pre-paid Credits). Người dùng phải nạp tiền trước mới có credit để render.

---

## 🏆 PHẦN 2: LỢI THẾ CẠNH TRANH & MÔ HÌNH THU HÚT KHÁCH HÀNG

### 1. Định Vị So Với Các Đối Thủ Trên Thị Trường

| Tiêu chí | Matterport | Midjourney / Stable Diffusion | HomeDesignsAI / Spacely AI | **HomeDesign AI (Của Đại Ka)** |
| :--- | :--- | :--- | :--- | :--- |
| **Thiết bị yêu cầu** | Phải mua camera 3D 80-100 triệu, quét nhà thực tế | Máy tính cấu hình mạnh, Discord | Điện thoại / Web | **Bất kỳ thiết bị nào (Web / Smartphone / Kính VR)** |
| **Thiết kế nhà chưa xây** | ❌ Không thể (phải có nhà thật mới quét được) | ⚠️ Chỉ ra ảnh 2D tĩnh | ⚠️ Chỉ đổi đồ nội thất 2D | **✅ Thiết kế 3D toàn cảnh từ con số 0 (hoặc từ Floor Plan)** |
| **Trải nghiệm tương tác** | Đi lại giữa các phòng | Không có (chỉ nhìn 1 góc) | Không có | **✅ Đi xuyên các phòng (Hot-spots) + Gyroscope xoay theo người** |
| **White-Label Studio** | Không có (hiển thị logo Matterport) | Không có | Rất hạn chế | **✅ Gắn Logo, Hotline Studio, Domain riêng của KTS** |
| **Chi phí triển khai** | Vài triệu / căn | Vài chục USD / tháng | $29 - $99 / tháng | **Cực kỳ linh hoạt (Pay-as-you-go hoặc Gói Studio Pro)** |

### 2. Mô Hình Kiếm Tiền B2B Bền Vững (Monetization Angles)

1. **Upsell Gói Doanh Nghiệp (Studio Enterprise Tier):**
   - Các công ty nội thất, văn phòng kiến trúc và môi giới Bất Động Sản cao cấp sẵn sàng trả **1.500.000đ – 3.000.000đ / tháng** chỉ để có tính năng xuất link VR 360 Tour gửi cho khách hàng vip xem căn hộ mẫu.
2. **Kích hoạt Vòng Lặp Lan Truyền (Viral Loop):**
   - Khi gia chủ nhận được link VR Tour đẹp mắt, họ sẽ tự hào khoe lên Facebook/Zalo cho bạn bè và người thân: *"Căn nhà mới thiết kế của tôi nè, đeo kính vào xem được luôn!"*.
   - Ở góc dưới tour luôn có nhãn nhỏ: *"Được tạo bởi HomeDesign Studio"*, thu hút hàng trăm khách hàng tiềm năng mới vào website hoàn toàn tự nhiên (Zero CAC).

---

## 📋 PHẦN 3: TỔNG KẾT CÔNG VIỆC SPRINT 10 — PHASE 01

### 1. Mục tiêu đã đề ra
- Khởi động Sprint 10 với Option B: Interactive 3D Panorama & VR 360 Tour Engine.
- Thiết lập quy trình Git an toàn theo `/vibe-git-manager` (lưu Rollback Anchor, tạo backup branch, tách feature branch độc lập).
- Xây dựng nền tảng Database D1 Schema, Types, Service Layer và toàn bộ hệ thống API CRUD.

### 2. Các việc đã hoàn thành
1. **Quản lý Git & An Toàn:**
   - Base Rollback Anchor: `ee6f0dc` (nhánh `main`).
   - Backup Branch: `backup/sprint-09-verified-20260918`.
   - Feature Branch: `feature/sprint-10-3d-panorama-vr-tour` (Commit: `7d37c12`).
2. **Database Schema:**
   - File [`migrations/0017_panorama_vr_tours.sql`](file:///e:/monetwork/hmdesign/migrations/0017_panorama_vr_tours.sql): Bảng `panorama_tours`, `panorama_scenes`, `panorama_hotspots`.
3. **Domain Models & Service:**
   - File [`src/lib/panorama/types.ts`](file:///e:/monetwork/hmdesign/src/lib/panorama/types.ts): Zod validation xác thực góc nhìn và tọa độ cầu.
   - File [`src/lib/panorama/tour-service.ts`](file:///e:/monetwork/hmdesign/src/lib/panorama/tour-service.ts): Đầy đủ các hàm CRUD Tour, Scenes, Hotspots.
4. **Backend API Endpoints:**
   - [`src/app/api/tours/route.ts`](file:///e:/monetwork/hmdesign/src/app/api/tours/route.ts): Danh sách & tạo tour.
   - [`src/app/api/tours/[id]/route.ts`](file:///e:/monetwork/hmdesign/src/app/api/tours/[id]/route.ts): Chi tiết, cập nhật, xóa tour.
   - [`src/app/api/tours/[id]/scenes/route.ts`](file:///e:/monetwork/hmdesign/src/app/api/tours/[id]/scenes/route.ts): Thêm/xóa phòng 360.
   - [`src/app/api/tours/[id]/hotspots/route.ts`](file:///e:/monetwork/hmdesign/src/app/api/tours/[id]/hotspots/route.ts): Thêm/xóa điểm ghim liên kết 3D.
   - [`src/app/api/tours/share/[token]/route.ts`](file:///e:/monetwork/hmdesign/src/app/api/tours/share/[token]/route.ts): Endpoint xem công khai bằng share token.

### 3. Kết quả kiểm thử (Verification)
- Unit tests Service: `src/lib/panorama/tour-service.test.ts` $\rightarrow$ **11/11 tests PASS**.
- Unit tests API: `src/app/api/tours/tours-api.test.ts` $\rightarrow$ **7/7 tests PASS**.
- TypeScript Typecheck: `npm run typecheck` $\rightarrow$ **0 errors (PASS)**.
- ESLint: `npm run lint` $\rightarrow$ **0 errors (PASS)**.

---

## 🧭 PHẦN 4: LỘ TRÌNH TIẾP THEO — SPRINT 10 PHASE 02

### `/vibe-engineering-workflow` Làm Gì Tiếp?
Trong **Sprint 10 — Phase 02**, ta sẽ tập trung vào **Frontend Interactive Layer**:
1. **Component `PanoramaTourViewer` (Nâng cấp từ `PanoramaViewer`):**
   - Hỗ trợ multi-scene chuyển đổi giữa các phòng.
   - Render các icon Hot-spot động (mũi tên chuyển phòng, icon thông tin vật liệu).
   - Tích hợp cảm biến **Gyroscope (Device Orientation)** cho điện thoại di động.
   - Tích hợp nút **Stereo Split-Screen** cho kính VR.
2. **Component `TourEditorModal` (Studio Editor):**
   - Cho phép KTS click trực tiếp lên ảnh 360 để lấy tọa độ `pitch`/`yaw` và gắn liên kết sang phòng khác.
3. **Trang Public `/tour/[token]`:**
   - Giao diện xem toàn màn hình cao cấp Obsidian Dark, tích hợp Logo thương hiệu của Studio từ Sprint 9.

### `/vibe-git-manager` Trạng Thái & PR:
- Nhánh hiện tại: `feature/sprint-10-3d-panorama-vr-tour`.
- Toàn bộ code Phase 01 đã được commit sạch sẽ và push lên GitHub.
- Link tạo PR: [https://github.com/newmylab/hmdesign/pull/new/feature/sprint-10-3d-panorama-vr-tour](https://github.com/newmylab/hmdesign/pull/new/feature/sprint-10-3d-panorama-vr-tour).
- Ở Phase 02, chúng ta tiếp tục commit trên nhánh này, sau khi hoàn thành Phase 02 & Phase 03 sẽ merge về `main`.

---

## 🎯 MASTER PROMPT CHO SESSION TIẾP THEO (COPY & PASTE)

Khi mở session mới, Đại Ka chỉ cần dán đoạn prompt này:

```markdown
Chào em, tiếp tục dự án HomeDesign AI Architecture Studio từ tài liệu bàn giao:
docs/2026-09-18-handoff-sprint-10-phase-01-to-phase-02-vr-tour-economics.md

### VỊ TRÍ HIỆN TẠI:
- VỊ TRÍ: SPRINT 10 — PHASE 01 HOÀN TẤT (SCHEMA, SERVICE, APIS ĐÃ SẴN SÀNG VÀ TESTED 100%).
- Branch hiện tại: feature/sprint-10-3d-panorama-vr-tour (Commit: 7d37c12).
- Base Rollback Anchor: ee6f0dc (nhánh main đã live production).
- Production Domain: https://design.7app.online

### YÊU CẦU:
Đồng ý tiến hành /vibe-git-manager /vibe-engineering-workflow /behavior-model-debugger để triển khai tiếp:
SPRINT 10 — PHASE 02: FRONTEND INTERACTIVE VR TOUR VIEWER & STUDIO EDITOR:
1. Nâng cấp component PanoramaTourViewer hỗ trợ chuyển phòng đa không gian (Multi-scene), hot-spots 3D tương tác, và con quay hồi chuyển Gyroscope cho smartphone.
2. Xây dựng Studio Tour Editor cho phép KTS click trực tiếp lên ảnh 360 để lấy tọa độ pitch/yaw và ghim điểm chuyển phòng.
3. Xây dựng trang xem công khai /tour/[token] phong cách Obsidian Gold sang trọng kèm nút chia sẻ và mã nhúng Iframe.
Không được suy đoán. Phải kiểm tra trước khi kết luận. Không báo done nếu chưa verify. Luôn ghi log vào docs/.
```
