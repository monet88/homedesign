# Sprint 4 Phase 2: Admin Account & Credit Management Activation

## 1. Bối cảnh & Yêu cầu của Đại Ka
1. **Đăng nhập Google thành công**: Tài khoản Google `galaxypro710@gmail.com` (Xyle Gal) đã đăng nhập vào hệ thống mượt mà, không còn loop One Tap prompt.
2. **Thắc mắc về tài khoản Admin**:
   - Tài khoản admin là gì? Làm thế nào để vào admin test các tính năng?
3. **Thắc mắc về việc set Credit**:
   - Set credit cho user như thế nào?
4. **Lỗi Claim Credit trên UI**:
   - Tại sao khi login tài khoản `galaxypro710@gmail.com` bấm "Claim Free Credits" lại không được?

---

## 2. Phân tích Kỹ thuật & Mô hình Hành vi (`behavior-model-debugger`)

### 2.1. Phân tích Tài khoản Admin (`/admin`)
- Cơ chế phân quyền trong hệ thống dựa trên cột `role` của bảng `user` trong Cloudflare D1 Database (`homeds`).
- Giá trị hợp lệ của `role`: `'user' | 'admin'`.
- Trang `/admin` là một Server Component được bảo vệ nghiêm ngặt:
  - Nếu anonymous: trả về màn hình `401 Unauthorized`.
  - Nếu `role !== 'admin'`: trả về màn hình `403 Forbidden`.
  - Nếu `role === 'admin'`: render giao diện **Admin Dashboard** đầy đủ với 3 phân hệ:
    1. **Users Management**: Xem danh sách người dùng, tìm kiếm theo email/name, điều chỉnh credit trực tiếp (Modal Adjust Credits).
    2. **Tasks Monitor**: Xem toàn bộ AI generation tasks, lọc theo status (`pending`, `running`, `succeeded`, `failed`), lọc theo scene (`interior`, `exterior`, `floor_plan`).
    3. **Health Check**: Tự động ping và kiểm tra sức khỏe D1 Database, R2 Storage, Cloudflare Queues, Live AI Provider.

### 2.2. Phân tích Nguyên nhân Nút "Claim Free Credits" không hoạt động
1. **Frontend UI Bug**:
   - Trong `src/components/shell/app-sidebar.tsx`, banner quảng cáo "Log in to get free credits! / Unlock more features!" chỉ là một thẻ tĩnh `<Link href="/sign-in">Claim Free Credits</Link>`.
   - Banner này luôn hiển thị ngay cả khi người dùng đã đăng nhập thành công. Khi click vào, trình duyệt chỉ điều hướng sang trang `/sign-in`.
2. **Backend Environment Policy (ADR 0008)**:
   - Trong `src/lib/env/policy.ts`, hàm `isFreeGrantAllowed(env)` được cấu hình cấm tự động cấp 10 free credit đối với môi trường `demo` và `production` để tránh lạm dụng AI outbound calls:
     ```typescript
     export function isFreeGrantAllowed(env: Pick<Env, "ENVIRONMENT">): boolean {
       return !isProduction(env) && !isDemo(env);
     }
     ```
   - Do đó, khi tài khoản mới đăng nhập trên môi trường demo, số dư ban đầu là 0 credits.

---

## 3. Các Giải pháp & Hành động Đã Triển Khai

### 3.1. Kích hoạt Quyền Admin & Cấp 99,999 Credits cho Đại Ka
- Đã thực thi trực tiếp trên Cloudflare Remote D1 (`homeds`):
  1. Cập nhật `role = 'admin'` cho user `galaxypro710@gmail.com`:
     ```sql
     UPDATE user SET role = 'admin', updatedAt = strftime('%s', 'now') * 1000 WHERE email = 'galaxypro710@gmail.com';
     ```
  2. Cấp initial grant **99,999 credits** vào `credit_ledger`:
     ```sql
     INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
     VALUES ('ledger-admin-galaxypro710-initial-grant', 'ACLEn24aMae2PFrnfE13TnzuVEpo3U9t', 'grant', 99999, 'Initial Admin Credit Grant', 'admin_adjustment', NULL, 'admin-initial-grant', strftime('%s', 'now') * 1000);
     ```
  - Kết quả: Tài khoản `galaxypro710@gmail.com` hiện có quyền **Admin tối cao** và **99,999 credits**.

### 3.2. Cải tiến Giao diện Sidebar (`src/components/shell/app-sidebar.tsx`)
- Khi chưa đăng nhập: Hiển thị banner mời đăng nhập Google.
- Khi đã đăng nhập:
  - Nếu là **Admin**:
    - Hiển thị badge: `Admin Balance` kèm số credit thực tế (`99,999`).
    - Nút bấm trực tiếp: **Admin Dashboard** (dẫn tới `/admin`).
    - Trong menu tài khoản góc dưới: bổ sung mục **Admin Dashboard**.
  - Nếu là **User**:
    - Hiển thị số dư credit hiện có.
    - Nút bấm: **Get More Credits** (dẫn tới `/pricing`).

### 3.3. Hướng dẫn Quản trị & Set Credit cho User khác
- **Cách 1 - Qua giao diện Admin Web (Khuyến nghị)**:
  1. Đại Ka truy cập `https://design.7app.online/admin`.
  2. Ở tab **Users**, tìm kiếm user cần cấp credit qua email hoặc tên.
  3. Bấm **Adjust Credits**:
     - Nhập số lượng credit (ví dụ: `100`, `500`, `1000`).
     - Nhập lý do (ví dụ: "Tặng credit trải nghiệm", "Hỗ trợ khách hàng").
     - Bấm **Confirm**: Hệ thống sẽ gọi API `/api/admin/credits` và ghi vào `credit_ledger` ngay lập tức.
- **Cách 2 - Qua CLI Database D1**:
  - Ghi bản ghi vào `credit_ledger` bằng lệnh SQL:
    ```bash
    npx wrangler d1 execute homeds --remote --command="INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, created_at) VALUES ('ledger-' || hex(randomblob(8)), '<USER_ID>', 'grant', 500, 'Manual grant', 'admin_adjustment', unixepoch() * 1000);"
    ```
