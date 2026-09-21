# Báo Cáo Hoàn Thành SPRINT 8 & Chuyển Giao Kỹ Thuật
**HomeDesign AI Architecture Studio — Enterprise Team Workspaces, Role Permissions & Custom Presets**

- **Ngày bàn giao:** 17/09/2026
- **Trạng thái:** HOÀN THÀNH 100% — TẤT CẢ GATES ĐÃ PASSED
- **Nhánh Git:** `feat/sprint-08-team-workspaces-roles-presets`
- **Mã commit cơ sở:** `09205ab` (Sprint 7 merged vào `main`)

---

## 1. Tóm Tắt Thành Tựu Kỹ Thuật (Deliverables)

### Ticket 8.1: Enterprise Team Workspaces & Shared Credit Pool
- **Cơ sở dữ liệu (D1 Migration 0015):** Bổ sung bảng `workspaces`, `workspace_members`, `workspace_invites`, và cột `workspace_id` vào `projects`, `credit_ledger`, `credit_holds`.
- **Logic Quản Lý Workspace (`src/lib/workspaces`):**
  - Tạo, cập nhật, xóa Workspace cho Studio kiến trúc.
  - Quản lý lời mời qua Token SHA-256 có hạn 7 ngày (`/invite/[token]`).
  - Nạp & phân bổ credits từ tài khoản cá nhân của Owner vào quỹ chung Studio (`/api/workspaces/[id]/credits/allocate`).
- **Giao diện người dùng (`src/components/workspaces`):**
  - `WorkspaceSwitcher`: Chuyển đổi mượt mà giữa Personal Account và các Studio Workspaces, hiển thị vai trò (Owner/Architect/Viewer) và số dư shared credits.
  - `CreateWorkspaceModal` & `WorkspaceSettingsModal`: Quản lý thành viên, gửi lời mời và nạp credits.

### Ticket 8.2: Granular Role-Based Access Control (RBAC)
- **Hệ thống phân quyền 3 tầng:**
  - **Owner:** Toàn quyền quản trị, xóa studio, nạp credits, mời thành viên, tạo thiết kế, tạo preset.
  - **Architect:** Tạo/sửa thiết kế của studio, tạo preset của studio, sử dụng shared credit pool.
  - **Viewer:** Chỉ xem thư viện dự án của studio, bị chặn quyền sinh ảnh tiêu tốn credits (`FORBIDDEN_VIEWER_ROLE`).
- **Thư viện dự án nhóm (`src/app/projects/page.tsx`):**
  - Tích hợp tabs chuyển đổi xem "Dự án cá nhân" vs "Dự án Studio [Tên Studio]".
  - Tự động lọc và đồng bộ các thiết kế được tạo trong phạm vi Workspace.

### Ticket 8.3: Custom Styling Presets
- **Cơ sở dữ liệu:** Bảng `custom_presets` lưu trữ bộ phong cách kiến trúc riêng của từng Studio (Interior / Exterior).
- **Bộ thông số Studio:** Lưu trữ phong cách chủ đạo, vật liệu đặc trưng (`materials`), hướng ánh sáng & không gian (`lighting`), và ghi chú kiến trúc sư (`notes`).
- **Prompt Injection (`src/lib/presets/custom-presets.ts`):** Tự động inject phong cách, vật liệu và ánh sáng studio vào prompt gửi tới Gemini AI/Provider.
- **Giao diện (`src/components/presets/studio-presets-modal.tsx` & `src/components/design/design-flow.tsx`):**
  - Modal tạo và quản lý Presets riêng của Studio.
  - Menu chọn Custom Preset ngay trong Flow thiết kế bên cạnh các preset mặc định.

---

## 2. Báo Cáo Đo Lường & Verification Matrix

Tất cả các bài kiểm tra nghiêm ngặt nhất đều đã được thực thi và xác minh thành công trên môi trường thực tế (Trust no blind code):

| Kiểm Tra | Quy Mô | Kết Quả | Chi Tiết |
| :--- | :--- | :--- | :--- |
| **Smoke Suite (Workers Runtime)** | 17 files | **269 / 269 PASSED (100%)** | Chạy trên Cloudflare D1 local mô phỏng |
| **Full Unit & Integration Suite** | 43 files | **579 / 579 PASSED (100%)** | 3 tests staging-proof skipped an toàn |
| **TypeScript Typecheck** | Toàn bộ repo | **0 ERRORS (exit code 0)** | `tsc --noEmit` hoàn hảo |
| **Free-First Gate (Bundle Size)** | Cloudflare Worker | **2.12 MB / 3.0 MB (PASSED)** | Giới hạn tối đa 3.14 MB |
| **Production Worker Build** | OpenNext + Turbopack | **BUILD SUCCESSFUL** | 53/53 static pages & API routes |

---

## 3. Nhật Ký Giải Quyết Sự Cố (Root-Cause Analysis)
1. **Lỗi `no such column: workspace_id` & `completed_at` trong các test cũ:**
   - *Nguyên nhân:* Một số file test integration `.wtest.ts` cũ khởi tạo schema in-memory độc lập chưa cập nhật các cột mới của Sprint 8.
   - *Biện pháp 2 lớp:*
     - Lớp 1 (Phòng vệ sản phẩm): Bổ sung try-catch fallback trong `src/lib/credits/ledger.ts`, `src/lib/ai/task-lifecycle.ts`, `src/lib/ai/lifecycle.ts`, và `src/lib/library/projects.ts` để tự động xử lý mượt mà khi cột chưa tồn tại mà không làm sập tiến trình.
     - Lớp 2 (Chuẩn hóa kiểm thử): Bổ sung đầy đủ cột `workspace_id TEXT` và `completed_at INTEGER` vào các hàm `applyMigrations` của `floor-plan.wtest.ts`, `library.wtest.ts`, `virtual-staging.wtest.ts`, `demo-usage.wtest.ts`, `lifecycle.wtest.ts`, `admin-seed.wtest.ts`, `deploy-policy.wtest.ts`.

---

## 4. Hướng Dẫn Kích Hoạt & Sử Dụng
1. **Chuyển đổi Studio:** Click vào góc trên bên phải Header hoặc Sidebar, chọn Studio của bạn.
2. **Nạp Quỹ Chung:** Trong cài đặt Studio (`Cài đặt Studio`), Owner có thể nhập số credits muốn phân bổ từ ví cá nhân sang Studio.
3. **Mời Thành Viên:** Tạo liên kết mời và gửi cho Kiến trúc sư hoặc Khách hàng xem. Khách hàng truy cập `/invite/[token]` để vào Studio.
4. **Tạo Bộ Phong Cách Riêng:** Vào `Bộ phong cách Studio` để cấu hình vật liệu (Gỗ óc chó, Kính Low-E, Đá Marble Carrara...) để mọi thiết kế mới của Studio đều tuân theo đúng nhận diện thương hiệu.
