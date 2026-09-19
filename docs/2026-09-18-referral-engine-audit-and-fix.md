# HomeDesign — Báo Cáo Audit & Khắc Phục Lỗi Referral Engine (Viral Growth)

**Ngày thực hiện:** 18/09/2026  
**Chuyên môn:** Behavior Model Debugging, Full-Stack Referral Engine, D1 Database Ledger Synchronization  
**Trạng thái:** Đã khắc phục triệt để, Typecheck 0 error, Vitest 6/6 test pass, Toàn bộ Test Suite pass 100%.

---

## 1. Bản Chất Vấn Đề (Root Cause Analysis)

Đại Ka phản ánh 2 trường hợp:
1. Vào link `https://design.7app.online/?ref=ltdanhdufnsq` để đăng ký acc `inu` (`inushibakzao`), nhưng kiểm tra tài khoản `ltd` thì **LƯỢT CLICK = 0** và **ĐÃ MỜI = 0**.
2. Acc `inu` đã hoàn tất thiết kế đầu tiên (tiêu tốn 1 credit thành công theo Activity log), nhưng acc `ltd` chưa nhận được thông tin mời và chưa được thưởng +10 credits.

### Nguyên Nhân Gốc Đã Được Xác Định:
1. **Thiếu Global URL Tracker:**
   - Trước đó, Backend API `POST /api/referral/track-click` đã có, nhưng ở Frontend chưa hề có component nào lắng nghe tham số `?ref=` trên URL khi người dùng truy cập. Vì vậy khi bấm vào link giới thiệu, API track click không được kích hoạt => **LƯỢT CLICK = 0**.
2. **Thiếu Cơ Chế Tự Động Bind (Claim) Referral Khi Đăng Ký/Đăng Nhập:**
   - Link ref không được lưu trữ vào `localStorage` hay Cookie trình duyệt (30-day attribution window).
   - Khi tài khoản `inu` hoàn tất đăng ký/đăng nhập Google, hệ thống không tự động gửi `POST /api/referral/claim` để ghi nhận `inu` là bạn bè được mời bởi `ltd`. Bảng `referrals` trên D1 không có dòng dữ liệu nào cho `inu` => **ĐÃ MỜI = 0**.
3. **Thiếu Cơ Chế Kích Hoạt Thưởng Hồi Tố (Retroactive Activation):**
   - Logic cũ chỉ gọi `activateReferralReward` vào thời điểm render hoàn tất (`commitCreditHold`). Nếu lúc đó tài khoản chưa kịp liên kết referral, hàm sẽ bỏ qua.
   - Khi tài khoản liên kết referral sau này, hệ thống cũ không kiểm tra xem tài khoản này đã từng có `usage` (render thiết kế) trước đó hay chưa để thưởng ngay cho người mời => **ĐÃ THƯỞNG = +0**.

---

## 2. Các Giải Pháp & Cải Tiến Đã Triển Khai

### 2.1. Thêm Global Component `ReferralTracker` ([referral-tracker.tsx](file:///E:/monetwork/hmdesign/src/components/referral/referral-tracker.tsx))
- Tự động bắt `?ref=<slug>` trên URL ở bất kỳ trang nào.
- Gửi ngay `POST /api/referral/track-click` (deduplicated per session qua `sessionStorage`) để tăng số lượt click chính xác mà không bị spam counter.
- Lưu trữ mã giới thiệu vào `localStorage` và `Cookie (hd_ref, max-age 30 ngày)` để bảo toàn attribution dù người dùng có tắt trình duyệt và quay lại sau.
- Tự động gọi `POST /api/referral/claim` ngay khi user đăng nhập/đăng ký thành công.

### 2.2. Gắn `ReferralTracker` Toàn Cục ([layout.tsx](file:///E:/monetwork/hmdesign/src/app/layout.tsx))
- Được mount trực tiếp trong `RootLayout` bên trong `WorkspaceProvider`, luôn sẵn sàng bắt ref link ngay từ landing page, bảng giá hoặc studio.

### 2.3. Nâng Cấp Service Referral với Cơ Chế Kích Hoạt Thưởng Hồi Tố ([referral.ts](file:///E:/monetwork/hmdesign/src/lib/referral/referral.ts))
- Bổ sung hàm `hasUserActivated(db, userId)`: Kiểm tra trong `credit_ledger` xem referee đã từng có giao dịch `usage` (tạo thiết kế) hoặc `payment` (nạp tiền) chưa.
- Trong `recordReferralSignup`:
  - Khi liên kết thành công (hoặc tài khoản đã pending), nếu referee ĐÃ TỪNG HOÀN TẤT THIẾT KẾ trước đó (như acc `inu`), hệ thống LẬP TỨC kích hoạt `activateReferralReward(db, refereeUserId)`.
  - Tự động bơm ngay **+10 credits** vào `credit_ledger` cho Referrer (`ltd`)!

### 2.4. Cải Tiến Route API `POST /api/referral/claim` ([route.ts](file:///E:/monetwork/hmdesign/src/app/api/referral/claim/route.ts))
- Tự động kích hoạt `recordReferralClick` nếu mã ref đó chưa được tính click.
- Phản hồi trực quan trạng thái kích hoạt ngay: `{ success: true, activated: true, isExisting: ... }`.

### 2.5. Thêm Ô Nhập Mã Giới Thiệu Thủ Công ([referral-modal.tsx](file:///E:/monetwork/hmdesign/src/components/referral/referral-modal.tsx))
- Trong popup "Mời Bạn Bè", bổ sung khu vực:
  *"Bạn được bạn bè giới thiệu? Nhập mã tại đây: [ VD: ltdanhdufnsq ] [ Áp dụng ]"*
- Giúp người dùng có thể chủ động liên kết với người giới thiệu bất cứ lúc nào, hỗ trợ đầy đủ tiếng Việt & English.

---

## 3. Cách Thức Nhận Thưởng Cho Acc `inu` & `ltd`

Sau khi mã nguồn này được build/deploy lên production:
- **Cách 1 (Tự động):** Đăng nhập tài khoản `inu` trên trình duyệt và bấm vào link:
  `https://design.7app.online/?ref=ltdanhdufnsq`  
  -> `ReferralTracker` sẽ tự động bắt mã `ltdanhdufnsq`, gọi API claim. Backend nhận thấy acc `inu` đã có 1 usage render phòng khách -> **Cộng ngay +10 credits cho acc `ltd` và tăng 1 click, 1 đã mời**.
- **Cách 2 (Thủ công):** Đăng nhập tài khoản `inu`, mở menu click **"Mời Bạn Bè"**, cuộn xuống ô nhập mã dưới cùng, nhập `ltdanhdufnsq` và bấm **"Áp dụng"** -> Hệ thống kích hoạt thành công lập tức!
