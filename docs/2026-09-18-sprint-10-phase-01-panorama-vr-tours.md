# Báo Cáo Triển Khai SPRINT 10 — Phase 01: Interactive 3D Panorama & VR 360 Tour Engine

- **Thời điểm:** 2026-09-18 10:42 (GMT+7)
- **Branch:** `feature/sprint-10-3d-panorama-vr-tour`
- **Rollback Anchor:** Commit `ee6f0dc` (nhánh `main`)
- **Backup Branch:** `backup/sprint-09-verified-20260918`
- **Kỹ sư phụ trách:** Antigravity AI Engineer (Pair programming cùng Đại Ka)
- **Phương pháp luận:** `/vibe-git-manager`, `/vibe-engineering-workflow`, `/behavior-model-debugger`

---

## 1. Mục Tiêu Sprint 10 (Option B: Interactive 3D Panorama & VR 360 Tour)

Đưa trải nghiệm thiết kế kiến trúc vượt ra khỏi giới hạn của những bức ảnh 2D tĩnh:
1. Cho phép kiến trúc sư và studio tạo các **Virtual Tour 360 độ** từ các ảnh Equirectangular Panorama.
2. Cho phép liên kết các căn phòng (Scenes: Phòng Khách, Phòng Bếp, Ban Công...) thông qua các điểm tương tác 3D (**Hot-spots**).
3. Hỗ trợ góc nhìn cầu đa chiều: `pitch` (độ cao góc nhìn -90° đến +90°), `yaw` (góc quay 360° từ -180° đến +180°), `hfov` (trường nhìn zoom từ 30° đến 140°).
4. Cung cấp API công khai bảo mật qua **Share Token** độc nhất cho phép gia chủ xem toàn cảnh trên smartphone (với con quay hồi chuyển Gyroscope) hoặc kính VR.

---

## 2. Các Thành Phần Đã Triển Khai Trong Phase 01

### 2.1. Cấu trúc dữ liệu D1 Database
- **File:** `migrations/0017_panorama_vr_tours.sql`
  - `panorama_tours`: Chứa thông tin tour, tiêu đề, mô tả, workspace, project, quyền riêng tư, share token.
  - `panorama_scenes`: Chứa danh sách các phòng/không gian, liên kết tới `assets(id)` trên R2, các góc quay mặc định `initial_yaw`, `initial_pitch`, `initial_hfov` và thứ tự hiển thị `order_index`.
  - `panorama_hotspots`: Chứa các điểm ghim chuyển phòng (`type: 'scene'`) hoặc điểm thuyết minh kiến trúc (`type: 'info'`), tọa độ hình cầu `pitch`, `yaw`, tiêu đề và mô tả.

### 2.2. Domain Models & Service Layer
- **File:** `src/lib/panorama/types.ts`:
  - Interface TypeScript: `PanoramaTour`, `PanoramaScene`, `PanoramaHotspot`.
  - Zod Schemas xác thực chặt chẽ dữ liệu đầu vào: `CreateTourSchema`, `UpdateTourSchema`, `CreateSceneSchema`, `CreateHotspotSchema`.
- **File:** `src/lib/panorama/tour-service.ts`:
  - `createTour`: Khởi tạo tour mới với share token ngẫu nhiên 16 ký tự.
  - `getTourById`: Truy vấn tour kèm nạp lồng (nested) toàn bộ scenes và hotspots của từng scene.
  - `getTourByShareToken`: Phục vụ người xem công khai mà không cần đăng nhập.
  - `listUserTours`: Danh sách tour của người dùng/workspace.
  - `updateTour` & `deleteTour`: Chỉnh sửa và xóa tour có kiểm tra quyền sở hữu.
  - `addSceneToTour` & `deleteScene`: Quản lý phòng trong tour, tự động cập nhật `first_scene_id`.
  - `addHotspot` & `deleteHotspot`: Quản lý điểm ghim điều hướng không gian 3D.

### 2.3. Hệ Thống Backend API Endpoints
- **`src/app/api/tours/route.ts`:**
  - `GET`: Danh sách các tour của người dùng/workspace.
  - `POST`: Tạo tour mới (yêu cầu xác thực tài khoản).
- **`src/app/api/tours/[id]/route.ts`:**
  - `GET`: Chi tiết tour, toàn bộ scenes và hotspots.
  - `PATCH`: Cập nhật tour (chỉ chủ sở hữu).
  - `DELETE`: Xóa tour (chỉ chủ sở hữu).
- **`src/app/api/tours/[id]/scenes/route.ts`:**
  - `POST`: Thêm căn phòng mới vào tour.
  - `DELETE ?sceneId=...`: Xóa phòng khỏi tour.
- **`src/app/api/tours/[id]/hotspots/route.ts`:**
  - `POST`: Thêm hotspot chuyển phòng hoặc ghi chú nội thất.
  - `DELETE ?hotspotId=...`: Xóa hotspot.
- **`src/app/api/tours/share/[token]/route.ts`:**
  - `GET`: Endpoint mở cho khách hàng / gia chủ trải nghiệm VR Tour qua token chia sẻ.

---

## 3. Bằng Chứng Kiểm Thử & Xác Minh (Verification Evidence)

| Hạng mục kiểm thử | Lệnh thực thi | Kết quả | Trạng thái |
| :--- | :--- | :--- | :--- |
| **Tour Service Unit Tests** | `npx vitest run src/lib/panorama/tour-service.test.ts` | 11/11 tests passed | **PASS (100%)** |
| **Tour API Unit Tests** | `npx vitest run src/app/api/tours/tours-api.test.ts` | 7/7 tests passed | **PASS (100%)** |
| **TypeScript Typecheck** | `npm run typecheck` | 0 errors | **PASS (100%)** |
| **ESLint Linter** | `npm run lint` | 0 errors | **PASS (100%)** |

---

## 4. Kế Hoạch Phase 02 Tiếp Theo
- Xây dựng component giao diện **Studio VR Tour Editor**:
  - Giao diện kéo thả ảnh 360 vào Tour.
  - Khung nhìn 3D trực quan: Click chuột trực tiếp lên vị trí cửa để lấy `pitch`/`yaw` và gắn link chuyển phòng.
- Xây dựng trang xem công khai **`/tour/[token]`**:
  - Tích hợp **Pannellum** toàn màn hình Obsidian Luxury.
  - Tích hợp nút kích hoạt **Gyroscope (Con quay hồi chuyển)** cho smartphone và chế độ Kính VR.
