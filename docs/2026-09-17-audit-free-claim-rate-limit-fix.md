# Báo Cáo Kỹ Thuật: Khắc Phục Lỗi Claim Free Credits & Anti-Abuse Optimization
**Phương pháp áp dụng:** Steve Ruiz Behavioral Model Debugger (`/behavior-model-debugger`)  
**Thời điểm:** 17/09/2026 15:35 (Giờ Việt Nam)  
**Tác giả:** Antigravity AI Assistant  
**Chủ trì & Nghiệm thu:** Đại Ka  
**Trạng thái:** ✅ ĐÃ KHẮC PHỤC & VERIFIED (Branch: `fix/free-claim-rate-limit-and-double-click`)

---

## 1. Hiện Tượng & Triệu Chứng Ban Đầu (Bug Evidence)
- **Giao diện người dùng:** Khi người dùng mới đăng ký/đăng nhập và bấm nút "Claim 5 Free Credits", hệ thống từ chối và hiện thông báo màu vàng có dấu check kỳ lạ:  
  `✓ Thiết bị này đã nhận credit dùng thử trong vòng 7 ngày qua. Vui lòng nâng cấp gói để tiếp tục.`
- **DevTools Console:** Trình duyệt bắn liên tiếp **2 requests đỏ 429**:  
  `Failed to load /api/credits/claim-free:1 resource: the server responded with a status of 429 ()`  
  `Failed to load /api/credits/claim-free:1 resource: the server responded with a status of 429 ()`
- **Tài khoản:** Số dư hiển thị `Personal 0 credits`, người dùng không thể nhận được 5 credits dùng thử để trải nghiệm tính năng sinh ảnh.

---

## 2. Phân Tích Nguyên Nhân Gốc (Root Causes)

### 🔴 Root Cause 1: Ngưỡng chặn Anti-Abuse quá thô bạo (False-Positive Block)
- **Code cũ:** `src/lib/credits/claims.ts`
  - Cửa sổ thời gian: `CLAIM_RATE_LIMIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000` (7 ngày).
  - Điều kiện: `SELECT id FROM user_free_claims WHERE fingerprint = ?1 ... LIMIT 1`.
- **Hậu quả:**
  1. Chỉ cần trên máy tính hoặc địa chỉ IP đó đã từng có 1 claim nào trước đó (ví dụ tài khoản admin, tài khoản test trước), bất kỳ tài khoản mới nào tạo trên máy đó trong suốt 7 ngày tiếp theo đều bị chặn tuyệt đối!
  2. Các kiến trúc sư ngồi chung văn phòng, studio, coworking hoặc cùng 1 mạng WiFi chỉ duy nhất 1 người nhận được credit dùng thử, những người còn lại bị block 100%.

### 🔴 Root Cause 2: Va chạm mã thiết bị (Canvas Fingerprint Collision)
- **Code cũ:** `src/lib/client-fingerprint.ts`
  - Chỉ render 1 đoạn canvas text tĩnh kích thước 160x40 kết hợp kích thước màn hình.
- **Hậu quả:** Mọi máy tính cùng độ phân giải màn hình (ví dụ 1920x1080) chạy Chrome trên Windows đều sinh ra **cùng một chuỗi hash fingerprint**, gây nhận diện nhầm thiết bị của người dùng khác là thiết bị đã claim.

### 🔴 Root Cause 3: Client Double-Submission (Race Condition trên nút bấm)
- **Code cũ:** `src/components/landing/onboarding-free-claim-banner.tsx`
  - Nút bấm chỉ dùng React state `const [claiming, setClaiming] = useState(false)`.
  - Quá trình hash fingerprint `await getClientFingerprint()` tốn 30-50ms bất đồng bộ.
- **Hậu quả:** Khi người dùng click đúp (double-click), 2 request được gửi đi song song cùng một lúc $\rightarrow$ gây ra 2 lỗi đỏ `429` đồng thời trong DevTools console.

### 🔴 Root Cause 4: Trải nghiệm UX phản cảm (Icon Check trên thông báo lỗi)
- Khi bị từ chối claim, banner lại hiển thị icon `<IconCheck />` (dấu tick màu xanh/vàng), khiến người dùng tưởng hệ thống nhận thành công nhưng thực tế bị lỗi.

---

## 3. Kiến Trúc Khắc Phục Toàn Diện

### 🛡️ 1. Bảo Toàn Bất Biến Tài Khoản (`/behavior-model-debugger`)
- **Nguyên tắc vàng:** `user_id` chỉ được nhận **DUY NHẤT 1 LẦN TRONG ĐỜI** (được bảo vệ bất khả xâm phạm bằng ràng buộc `UNIQUE` trên `user_id` tại bảng `user_free_claims` và `grant_key` trong `credit_ledger`).

### ⚡ 2. Tinh Chỉnh Ngưỡng Phòng Vệ Thông Minh (`src/lib/credits/claims.ts`)
- **Rút ngắn cửa sổ trượt:** Giảm từ 7 ngày xuống **24 giờ** (`24 * 60 * 60 * 1000`).
- **Ngưỡng theo dung lượng (Threshold Counting):**
  - **Tối đa 2 claims / thiết bị / 24h** (`MAX_CLAIMS_PER_DEVICE = 2`).
  - **Tối đa 5 claims / IP / 24h** (`MAX_CLAIMS_PER_IP = 5`).
- **Bypass linh hoạt:** Bỏ qua kiểm tra thiết bị/IP nếu người dùng có vai trò `admin` hoặc môi trường `development`.

### 🎯 3. Nâng Cấp WebGL GPU Fingerprinting (`src/lib/client-fingerprint.ts`)
- Bổ sung WebGL GPU Unmasked Renderer Info (`WEBGL_debug_renderer_info`) để đọc chính xác chip đồ họa (NVIDIA, AMD, Intel, Apple Silicon).
- Nâng cấp Canvas 2D với gradient subpixel anti-aliasing và arc drawing để phân biệt rõ ràng giữa các máy tính khác nhau.

### 🔒 4. Khóa Đồng Bộ Mutex Tức Thì (`onboarding-free-claim-banner.tsx`)
- Thêm `const isClaimingRef = useRef(false)` khóa ngay lập tức trong microtask đầu tiên khi click, triệt tiêu 100% việc gửi duplicate requests.
- Phân tách rõ ràng:
  - Thành công: `<IconCheck />` màu xanh ngọc.
  - Lỗi / Giới hạn: `<IconAlert />` màu cam, kèm link điều hướng nhanh: `<Link href="/pricing">Xem Bảng Giá →</Link>`.
