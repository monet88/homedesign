# 🔍 Behavioral Audit & UX Reconstruction: HomeDesign AI Architecture Studio

> **Dự án:** HomeDesign AI Architecture Studio  
> **Thời gian thực hiện:** 2026-09-18 19:25 (UTC+7)  
> **Vị trí hiện tại:** SPRINT 10 — HOÀN TẤT 100% (Phases 01, 02, 03)  
> **Git Branch:** `feature/sprint-10-3d-panorama-vr-tour` (Head: `3099bbf`)  
> **Pull Request:** [#4 (OPEN)](https://github.com/newmylab/hmdesign/pull/4)  
> **Production Live URL:** `https://design.7app.online` (Version ID: `f16c21fc-1f06-43f3-a397-d8dd49f66f0b`)  
> **Phương pháp áp dụng:** `/behavior-model-debugger`, `/vibe-engineering-workflow`, `/vibe-git-manager`, `Karpathy Guidelines`.

---

## 1. TỔNG QUAN: MỤC TIÊU, VIỆC ĐÃ LÀM VÀ KẾT QUẢ

### 🎯 Mục Tiêu Đặt Ra (Sprint 10)
Xây dựng phân hệ **Interactive 3D Panorama & Multi-Room VR Tour Studio** thương mại hoàn chỉnh, cho phép Kiến trúc sư (KTS) và Studio thiết kế kết nối các góc ảnh 360°, cắm mốc chuyển phòng (Portal Hotspot), gắn ghi chú vật liệu photorealistic (Info Hotspot), xuất mã QR Code in hồ sơ bản vẽ kỹ thuật, và cung cấp Tour mẫu để người dùng mới trải nghiệm tức thì.

### 🛠️ Những Việc Đã Làm (Done & Verified)
1. **Phase 01 (Backend, Database & Schema):**
   - Thiết kế & migrate Cloudflare D1 với 3 bảng: `panorama_tours`, `panorama_scenes`, `panorama_hotspots` kèm đầy đủ foreign keys, cascade deletes, và composite indexes.
   - Xây dựng cụm API CRUD: `/api/tours`, `/api/tours/[id]`, `/api/tours/[id]/scenes`, `/api/tours/[id]/hotspots`.
   - Streaming ảnh 360 qua Public Share Token `/api/tours/share/[token]/assets/[assetId]` từ R2 private bucket mà không bao giờ lộ bucket keys.
2. **Phase 02 (Interactive 360° Viewer & Studio Editor):**
   - Tích hợp động cơ Pannellum 360° đa không gian với con quay hồi chuyển Gyroscope và chế độ kính VR Cardboard Stereo.
   - Xây dựng Studio Tour Editor Modal: click trực tiếp lên ảnh 360 để lấy tọa độ Pitch/Yaw, cắm mốc và chỉnh sửa trực quan.
   - Nâng cấp Visual Asset Picker Modal: phân loại 4 tab (⭐ 360 VR, ✨ AI Done, 📁 Ảnh Gốc, Tất cả) kèm thumbnail preview, lọc `lifecycle=ready` loại bỏ hoàn toàn lỗi ảnh xám 409.
3. **Phase 03 (QR Code Generator, Seed Demo Tour & Ship to Main):**
   - Xây dựng component `TourQrModal`: xuất mã QR Code PNG High-Res 1024x1280px (kèm khung hồ sơ bản vẽ) và file Vector SVG chuẩn CAD cho AutoCAD/Revit/Illustrator.
   - Thiết lập Tour VR mẫu mặc định: "Penthouse Horizon Sky Villa (Demo 3 Phòng)" với token `demo-penthouse`, zero DB dependency, hoạt động mượt mà 100%.
   - Cải tiến Dashboard `/tour`: nạp scenes để hiển thị thumbnail thực tế và số lượng phòng/hotspot, kèm Showcase Banner nổi bật.
   - Đóng gói và deploy Cloudflare Workers Production Demo thành công (Live Version: `f16c21fc-1f06-43f3-a397-d8dd49f66f0b`).
   - Mở Pull Request #4 trên GitHub.

### 🏆 Kết Quả Đạt Được
- **Unit Tests:** 650/650 tests passed (59 test files).
- **TypeScript:** `tsc --noEmit` đạt 0 lỗi.
- **Worker Bundle:** 2.14 MB (vượt qua chuẩn Free-first, dưới hạn mức 3.0 MB).
- **Trải nghiệm thực tế:** Xem mượt mà trên cả desktop và smartphone tại `https://design.7app.online/tour/demo-penthouse`.

---

## 2. BÁO CÁO AUDIT THEO SKILL `/behavior-model-debugger`

### 🎮 Phase 1 & 2: Tái Tạo Mô Hình Hành Vi Người Dùng (Behavioral Model)

#### 1. Input & Controls Matrix
- **Kéo chuột / Vuốt màn hình cảm ứng:**
  - *Viewer 360:* Kéo tự do để xoay góc nhìn Pitch (trục dọc -85° đến +85°) và Yaw (trục ngang 360° vô tận).
  - *Chế độ Auto-Rotate:* Tự động xoay chậm (-1.5°/s). Khi người dùng chạm hoặc kéo chuột, auto-rotate lập tức tạm dừng; sau khi thả chuột không thao tác, hệ thống khôi phục auto-rotate mượt mà.
  - *Studio Editor (Pick Coordinates Mode):* Khi KTS bật chế độ "📍 Nhấp trên ảnh 360 để lấy tọa độ":
    - Phân biệt rõ giữa hành vi **Kéo xoay góc nhìn (Drag)** và **Click chọn điểm (Click)**: Sử dụng khoảng cách dịch chuyển chuột `Math.hypot(dx, dy) < 5px`. Nếu di chuột > 5px thì là xoay camera; nếu < 5px thì lấy tọa độ Pitch/Yaw chính xác và đặt ghim tạm thời màu vàng phát sáng.
- **Phím & Tương tác Modifiers:**
  - `Escape`: Lập tức đóng modal đang mở (Editor, QR Code, Asset Picker) và đưa focus trở lại màn hình chính.
  - `Space / Arrow Keys`: Điều khiển xoay góc nhìn và dừng/tiếp tục chuyển động.

#### 2. Lifecycle & Resilience (Ngắt Quãng & Khôi Phục)
- **WebGL Context Loss:** Khi GPU bị quá tải hoặc trình duyệt mất WebGL context, `PanoramaTourViewer` tự động kích hoạt chế độ `Static 2D Equirectangular Fallback` kèm thông báo tiếng Việt thanh lịch, không bao giờ để màn hình bị trắng (White Screen of Death).
- **Fullscreen Transitions:** Tự động lắng nghe sự kiện `fullscreenchange`, đồng bộ icon thu nhỏ/phóng to và gọi `viewer.resize()` để khung hình không bị méo tỉ lệ.

---

### 💥 Phase 3: Ma Trận Va Chạm Luật Chơi (Invariant Collision Matrix)

| Cặp Tính Năng Va Chạm | Tình Huống Xung Đột Tiềm Ẩn | Cơ Chế Giải Quyết Đã Verified |
| :--- | :--- | :--- |
| **Pick Tọa Độ Hotspot vs Xoay Ảnh 360** | Vừa muốn xoay tìm góc khuất vừa muốn click cắm mốc | Đo delta tọa độ chuột `dragStartPos`. Chỉ nhận click khi độ dịch chuyển < 5px. |
| **Share Token Public vs Bảo Mật R2 Bucket** | Khách vãng lai xem tour nhưng không được lộ presigned URL hoặc storage key | Stream qua endpoint proxy `/api/tours/share/[token]/assets/[assetId]` với `owner_user_id` & `is_public = 1` validation. |
| **Filter Asset Lifecycle vs Upload Chưa Hoàn Tất** | Asset vừa upload đang ở trạng thái `pending`/`failed` bị chọn làm phòng | Query URL tham số cứng `/api/assets?limit=100&lifecycle=ready`, loại bỏ ảnh xám 409. |
| **Demo Tour vs D1 Database Cold Start** | Khách mới vào chưa có DB records hoặc DB đang sleep | Token `demo-penthouse` bypass D1 query, trả về immutable mock tour ngay tức thì. |

---

### 🛡️ Phase 4 & 5: Kiểm Toán Bảo Mật & Rủi Ro Kinh Tế (Security & Economic Audit)

1. **Bảo Vệ Tài Chính & Tránh Thất Thoát Tiền (Zero Leakage):**
   - Cổng thanh toán VietQR SePay: Webhook xác thực API Token bí mật, kiểm tra Idempotency Key chống Double Spend, kiểm tra khớp số tiền nạp chính xác tới từng đồng VND.
   - Ledger kế toán 2 chiều (Double-entry Ledger) ghi nhận bất biến trong D1: credits chỉ tăng khi giao dịch thanh toán thành công được xác nhận.
2. **Bảo Vệ Hạn Ngạch AI Engine (API Cost Defense):**
   - Hạn mức demo công cộng `DEMO_DAILY_PROVIDER_LIMIT = 50 submissions/ngày` ngăn chặn bot spam làm cạn kiệt chi phí API Google/Fal.
   - Tự động nén ảnh client-side xuống định dạng WebP < 2048px trước khi upload, tiết kiệm 80% băng thông và dung lượng lưu trữ Cloudflare R2.
3. **Secret Hygiene:**
   - Hoàn toàn không có `.env`, API Keys, hay Private Keys nằm trong commit hoặc git diff.

---

## 3. LÀM GÌ TIẾP THEO THEO `/vibe-engineering-workflow`?

### Hiện Tại: SPRINT 10 ĐÃ HOÀN TẤT 100%
Dự án đã có đầy đủ:
- Trình tạo ảnh AI Interior / Exterior / Floor Plan.
- Phòng trưng bày Before/After.
- Hệ thống thanh toán VietQR SePay + Stripe.
- Hệ thống Referral kiếm credit.
- Không gian làm việc Workspace & Phân quyền thành viên.
- Multi-Room VR Tour 360° Studio có QR Code in ấn và Tour mẫu Penthouse.

### Đề Xuất Lộ Trình Sprint Tiếp Theo:
👉 **SPRINT 11: SAAS MONETIZATION SUITE, AI BATCH RENDERING & KTS CLIENT PORTAL**
1. **AI Batch Panorama Renderer:** KTS upload bản vẽ mặt bằng 2D hoặc ảnh hiện trạng, AI tự động render 3-5 góc nhìn 360° đồng bộ phong cách nội thất chỉ bằng 1 cú click.
2. **KTS Client Portal & Approval Workflow:** Gia chủ có thể vào link Tour VR, để lại comment/note trực tiếp lên các điểm vật liệu để KTS chỉnh sửa thiết kế.
3. **Mở Bán Gói Thuê Bao KTS (Pro / Agency Subscription):** Kết nối bảng giá định kỳ hàng tháng cho Studio với hạn ngạch Tour không giới hạn.

---

## 4. QUẢN LÝ GIT & PULL REQUEST THEO `/vibe-git-manager`

- **Branch hiện tại:** `feature/sprint-10-3d-panorama-vr-tour`
- **Commit mới nhất:** `3099bbf`
- **Pull Request đã mở:** [PR #4: feat(vr-tour): Sprint 10 Complete](https://github.com/newmylab/hmdesign/pull/4)
- **Thao tác khuyến nghị cho Đại Ka:**
  - Đại Ka có thể click vào link PR #4 trên GitHub để bấm nút **Merge Pull Request (Squash & Merge)** hợp nhất vào nhánh `main`.
  - Hoặc nếu Đại Ka muốn, em có thể thực hiện lệnh merge trực tiếp qua Git CLI ngay lập tức!

---

## 5. MASTER PROMPT KHỞI TẠO CHO SESSION MỚI (COPY & PASTE)

Khi chuyển sang session mới, Đại Ka chỉ cần copy nguyên văn đoạn dưới đây:

```text
Chào em, tiếp tục dự án HomeDesign AI Architecture Studio từ tài liệu bàn giao hoàn chỉnh:
docs/2026-09-18-behavior-model-debugger-audit-and-handover-sprint-10.md

### VỊ TRÍ HIỆN TẠI CỦA DỰ ÁN:
- VỊ TRÍ: SPRINT 10 — 3D PANORAMA & VR TOUR STUDIO ĐÃ HOÀN THÀNH 100%.
- Branch: feature/sprint-10-3d-panorama-vr-tour (Commit: 3099bbf).
- Pull Request: https://github.com/newmylab/hmdesign/pull/4 (Target: main).
- Production Live: https://design.7app.online (Live Version ID: f16c21fc-1f06-43f3-a397-d8dd49f66f0b).
- Tính năng hoàn tất:
  1. Interactive VR Tour Viewer 360° (Gyroscope, VR Stereo Cardboard, Multi-Room Hotspot Navigation).
  2. Studio Tour Editor (cắm mốc Pitch/Yaw, liên kết phòng, ghi chú vật liệu).
  3. Visual Asset Picker phân loại 4 tabs, thumbnail preview, chống lỗi 409.
  4. QR Code Generator xuất file PNG 1024px và Vector SVG cho KTS in hồ sơ CAD.
  5. Seed Demo Tour mẫu Penthouse Horizon 3 phòng (URL: /tour/demo-penthouse) hoạt động độc lập zero-DB.
  6. Toàn bộ 650/650 unit tests passed, 0 type errors, OpenNext Cloudflare Worker build passed.

### NHIỆM VỤ THỰC HIỆN TIẾP THEO:
Đồng ý tiến hành /vibe-git-manager /vibe-engineering-workflow /behavior-model-debugger để:
1. Hợp nhất (Merge) PR #4 từ branch feature/sprint-10-3d-panorama-vr-tour vào nhánh main.
2. Khởi động SPRINT 11: SAAS MONETIZATION SUITE, AI BATCH RENDERING & KTS CLIENT PORTAL.
```
