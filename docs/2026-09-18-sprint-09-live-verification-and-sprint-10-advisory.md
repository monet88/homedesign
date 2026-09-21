# Báo Cáo Kiểm Tra Thực Tế (Live Site Verification) & Tư Vấn Kế Hoạch SPRINT 10

**Thời điểm thực hiện:** 2026-09-18 07:45 (GMT+7)  
**Kỹ sư thực hiện:** Antigravity AI Engineer (Pair programming cùng Đại Ka)  
**Phương pháp áp dụng:** `/vibe-git-manager`, `/vibe-engineering-workflow`, `/behavior-model-debugger`  
**Nguyên tắc cốt lõi:** *Zero Guessing — Kiểm tra tận gốc mã nguồn và mạng thực tế trước khi kết luận — Luôn ghi log vào docs/*

---

## 1. Kết Quả Kiểm Tra Thực Tế Live Site (`https://design.7app.online`)

### 1.1. Tình trạng hạ tầng & mạng
- **Domain:** `https://design.7app.online`
- **HTTP Status:** `HTTP/1.1 200 OK` (Phản hồi ổn định, Cloudflare Edge Data Center: `SIN`, `x-opennext: 1`, `server: cloudflare`).
- **Các route cốt lõi kiểm tra:**
  - `GET /` $\rightarrow$ `200 OK`
  - `GET /ai-interior-design` $\rightarrow$ `200 OK`
  - `GET /assets` $\rightarrow$ `200 OK`
  - `GET /activity` $\rightarrow$ `200 OK`

### 1.2. Phát hiện quan trọng (Crucial Finding — Ground Truth)
Qua kiểm tra nội dung chunk JavaScript thực tế đang chạy trên live site:
- Live site hiện vẫn đang chạy **Bundle ID: `Uxxh2oloYLhTJBznUopkM`** (phiên bản trước commit `4ba2e0f` & `afad5f4`).
- **Nguyên nhân gốc rễ (Root Cause):**
  1. Hai commit vừa qua (`4ba2e0f` và `afad5f4`) đã được push thành công lên GitHub `main`.
  2. Tuy nhiên, GitHub Actions CI Workflow (`Run ID: 35231147643`) bị **FAILED** ở bước `End-to-end deterministic test suite` (`e2e/full-journey.spec.ts`).
  3. Khi CI trên GitHub Actions failed, tiến trình deploy tự động không kích hoạt sang Cloudflare.
  4. Phân tích chi tiết lỗi CI:
     - **Phase 3 & Phase 4:** Locator `#generator-card .getByRole('slider', { name: /before after/i })` bị timeout do `result-slider.tsx` đổi nhãn `aria-label` thành tiếng Việt `"Kéo thanh trượt so sánh trước sau"` (thiếu từ khóa `/before after/i`).
     - **Phase 7:** `page.getByRole('heading', { name: 'Activity', exact: true })` và `page.getByRole('combobox', { name: 'Filter by event family' })` bị lỗi do trang `/activity` được thiết kế lại thành dạng thẻ và tab nút bấm, đổi tiêu đề sang tiếng Việt `"Nhật Ký & Kiểm Toán Hoạt Động"`.
- **Hành động đề xuất ngay:** 
  Cần thực hiện một patch tương thích kép (Dual-Label Compatibility) cho `ResultSlider` và `ActivityPage` để Playwright E2E vượt qua 100% CI, sau đó kích hoạt deploy lại bản build mới nhất lên `design.7app.online`.

---

## 2. Đánh Giá Trạng Thái Codebase (Codebase Audit)

| Hạng mục kiểm thử | Công cụ / Lệnh | Kết quả | Đánh giá |
| :--- | :--- | :--- | :--- |
| **TypeScript Typecheck** | `npm run typecheck` | 0 errors | **HOÀN HẢO** |
| **Vitest Unit Suite** | `npm test` | **46/46 test files PASS** (toàn bộ 100+ tests hợp lệ) | **HOÀN HẢO** |
| **Git Working Tree** | `git status -uno` | Clean, up-to-date with `origin/main` | **CHUẨN CHỈ** |
| **Hệ thống xử lý ảnh** | Client Canvas WebP nén <2048px | Đã có trong `src/components/design/uploader.tsx` | Sẵn sàng deploy |
| **Laser Scanner 3D** | `generating-scanner.tsx` | Tích hợp hoàn tất trong `design-flow.tsx` | Sẵn sàng deploy |
| **Stream R2 /assets** | `route.ts` native binding stream | Đã có trong `src/app/api/assets/[id]/download/route.ts` | Sẵn sàng deploy |

---

## 3. Tư Vấn Chiến Lược & Kế Hoạch SPRINT 10

Để đưa HomeDesign AI Architecture Studio lên đẳng cấp Enterprise SaaS phục vụ các công ty thiết kế và văn phòng kiến trúc, dưới đây là phân tích 3 phương án Đại Ka đã đưa ra:

### Option A: White-Label Custom Domain CNAME cho các Studio Kiến Trúc
- **Bản chất kỹ thuật:** 
  Cho phép đối tác (ví dụ: Công ty Nội Thất An Phú) gắn domain riêng của họ (ví dụ: `studio.anphu.vn`) trỏ CNAME về `cname.design.7app.online`. Cloudflare Workers sẽ phân giải Hostname `request.headers.get("host")` $\rightarrow$ Tra cứu D1 bảng `workspaces` $\rightarrow$ Nạp toàn bộ Logo, Tên Studio, Màu thương hiệu tương ứng.
- **Mức độ khả thi:** **RẤT CAO (Khuyến nghị ưu tiên số 1)**.
- **Lý do:**
  1. Trong **Sprint 9 (Ticket 9.3)**, ta đã xây dựng hoàn chỉnh **Branding Engine** (Lưu Logo, Thông tin Studio, Hotline, Watermark và Xuất PDF Pitch Deck).
  2. Việc bổ sung Custom Domain CNAME chỉ là mảnh ghép cuối cùng để biến sản phẩm thành nền tảng B2B White-Label hoàn chỉnh, mang lại giá trị thương mại và doanh thu đăng ký gói Studio/Enterprise ngay lập tức.
- **Các hạng mục công việc (Scope):**
  - Migration D1: Thêm cột `custom_domain`, `custom_domain_status`, `cname_verified_at` vào bảng `workspaces`.
  - API endpoint: `POST /api/workspaces/[id]/domain` & xác thực bản ghi DNS qua Cloudflare Custom Hostnames for SaaS API.
  - Middleware / Edge Resolver: Đọc domain từ request host, nạp context workspace branding mặc định cho khách vào thăm.

---

### Option B: Interactive 3D Panorama & VR 360 Tour Export
- **Bản chất kỹ thuật:**
  Mở rộng từ ảnh 2D phối cảnh sang trải nghiệm thực tế ảo 360 độ:
  - Tích hợp viewer toàn cảnh với hỗ trợ Gyroscope (nghiêng điện thoại để nhìn phòng 360°).
  - Cho phép xuất link hoặc mã nhúng WebXR / VR 360 Tour để gửi cho gia chủ đeo kính VR (Meta Quest, Apple Vision Pro, hoặc Google Cardboard).
- **Mức độ khả thi:** **CAO**.
- **Lý do:**
  1. Dự án đã có sẵn thư viện `pannellum: ^2.5.7` trong `package.json`.
  2. Đã có component `src/components/floor-plan/panorama-viewer.tsx` từ Sprint 5.
  3. Cần nâng cấp pipeline AI để nhận diện hoặc kết xuất ảnh Equirectangular Panorama (tỷ lệ 2:1) và gắn các điểm liên kết (Hot-spots) đi từ Phòng Khách $\rightarrow$ Phòng Bếp.

---

### Option C: Multi-User Collaboration & Real-Time Pin-Notes Trên Bản Vẽ
- **Bản chất kỹ thuật:**
  Cung cấp công cụ ghim phản hồi (Pin-Notes) tương tự Figma/Frame.io dành riêng cho bản vẽ kiến trúc:
  - Kiến trúc sư và Khách hàng (Gia chủ) có thể click bất kỳ điểm nào trên ảnh Before/After để thả một chiếc đinh ghim kèm bình luận (ví dụ: *"Đổi loại đèn chùm này sang pha lê"*, *"Bỏ kệ tivi này"*).
  - Đồng bộ trạng thái: `Đang xử lý` / `Đã sửa xong`.
  - Thông báo email hoặc realtime khi có phản hồi mới.
- **Mức độ khả thi:** **TRUNG BÌNH - CAO**.
- **Lý do:**
  Giải quyết bài toán tương tác then chốt giữa kiến trúc sư và chủ nhà, giảm 80% thời gian trao đổi qua Zalo/Email rời rạc.

---

## 4. Bảng So Sánh & Khuyến Nghị Lộ Trình (Recommendation)

| Tiêu chí | Option A (Custom Domain CNAME) | Option B (VR 360 Panorama Tour) | Option C (Pin-Notes Bản Vẽ) |
| :--- | :--- | :--- | :--- |
| **Giá trị B2B / Doanh thu** | ⭐️⭐️⭐️⭐️⭐️ (Bán gói Enterprise cực mạnh) | ⭐️⭐️⭐️⭐️ (Hiệu ứng trình diễn cao cấp) | ⭐️⭐️⭐️⭐️ (Tăng tỷ lệ giữ chân khách) |
| **Nền tảng sẵn có trong repo** | Đã có sẵn Sprint 9 Branding & Workspace D1 | Đã có sẵn Pannellum & Panorama Viewer | Đã có sẵn Projects & Permissions |
| **Độ phức tạp kỹ thuật** | Trung bình (DNS + Hostname lookup) | Trung bình - Khá (AI panorama + Hotspots) | Khá (Interactive canvas + threading) |
| **Thời gian triển khai tối ưu** | 1 - 2 Phase | 2 Phase | 2 Phase |

### Lộ trình đề xuất:
1. **Bước 1 (Ngay bây giờ):** Áp dụng patch Dual-Label cho `result-slider.tsx` và `activity/page.tsx` $\rightarrow$ Verify E2E pass $\rightarrow$ Deploy bản build mới nhất lên `design.7app.online` để 5 tính năng UX/Performance của Đại Ka chính thức phát huy tác dụng trên live.
2. **Bước 2 (Khởi động SPRINT 10):** Triển khai **Option A (White-Label Custom Domain CNAME)** làm hạt nhân chính của gói Studio B2B, kèm tùy chọn mở rộng sang **Option B (Interactive VR 360 Tour)** nếu Đại Ka muốn gây ấn tượng thị giác mạnh mẽ cho khách hàng.
