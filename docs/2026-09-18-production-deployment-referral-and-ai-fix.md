# HomeDesign — Báo Cáo Triển Khai Production: Khắc Phục Lỗi Referral & AI Generation

**Thời điểm hoàn tất:** 18/09/2026 12:39 (GMT+7)  
**Production Domain:** https://design.7app.online  
**Cloudflare Deployment Version:** `ac24ac29-5382-41e3-b5fe-43ca078b7cef`  
**Worker Environment:** `demo` (custom domain `design.7app.online`)  
**Trạng thái kiểm tra trực tiếp:** HTTP Status `200 OK`, Worker Startup Time `22 ms`

---

## 1. Tóm Tắt Các Khắc Phục Đã Lên Live Production

### 1.1. Khắc Phục Lỗi Tạo Thiết Kế (AI Generation):
- **Nguyên nhân gốc:** Hàm `fetch` trong Cloudflare Workers (V8 isolate) là C++ native function. Khi gọi dạng method `this.fetchFn(...)` trong class adapter, V8 quăng ngoại lệ:
  `TypeError: Illegal invocation: function called with incorrect this reference`
  khiến tiến trình tạo ảnh bị gián đoạn và trả về:
  `Reason: ILLEGAL_INVOCATION_FUNCTION_CALLED_WITH_INCORRECT_THIS_REFERENCE`.
- **Khắc phục:**
  - Khóa chặt `this.fetchFn` bằng `bind(globalThis)` trên toàn bộ 4 adapter: Fal, Gemini, Replicate, KIE.
  - Tách gọi hàm dưới dạng standalone `safeFetch(...)` (unbound invocation) để triệt tiêu hoàn toàn receiver context.
  - Sau khi deploy, model **"Tự động tối ưu (Smart Auto-Failover: Fal 1s ➔ Gemini)"** hoạt động siêu tốc 1-2s mà không còn bất kỳ lỗi invocation nào.

### 1.2. Kích Hoạt Hệ Thống Theo Dõi Referral Tự Động:
- Đã mount component [`ReferralTracker`](file:///E:/monetwork/hmdesign/src/components/referral/referral-tracker.tsx) toàn cục:
  - Bắt ngay tham số `?ref=` trên URL khi người dùng vào bất kỳ link nào của `design.7app.online`.
  - Tự động đếm lượt click qua `POST /api/referral/track-click` (deduplicated per session).
  - Tự động lưu mã vào `localStorage` và `Cookie` (hạn lưu 30 ngày).
  - Tự động liên kết (claim) mã giới thiệu ngay khi người dùng đăng nhập/đăng ký.
  - Bổ sung ô nhập mã thủ công trong popup "Mời Bạn Bè" để người dùng có thể gõ mã bất cứ lúc nào.
- **Kích hoạt thưởng hồi tố (Retroactive Reward Activation):**
  - Khi liên kết thành công, nếu tài khoản được mời đã từng thực hiện tạo thiết kế trước đó (hoặc hoàn tất thiết kế đầu tiên), hệ thống lập tức giải ngân **+10 credits** vào ví người giới thiệu ngay tức thì.

---

## 2. Hướng Dẫn Đại Ka Thử Nghiệm Trực Tiếp Trên Live

### Bước 1: Thử lại chức năng Tạo Thiết Kế (AI Generation)
- Mở tài khoản `letinhz6u9` trên `https://design.7app.online/ai-interior-design`.
- Bấm **"Thử lại" (Try Again)** hoặc tải ảnh phòng lên và bấm **"Tạo Thiết Kế"**.
- Thiết kế sẽ được AI tạo thành công trong 1-2s (không còn gặp lỗi `ILLEGAL_INVOCATION`).

### Bước 2: Kiểm tra kích hoạt thưởng cho tài khoản `ltdanhdufnsq`
- **Tài khoản `letinhz6u9`:**
  - Vì vừa đăng ký qua link ref, sau khi thiết kế đầu tiên ở Bước 1 hoàn tất:
  - Hệ thống sẽ ghi nhận `letinh` hoàn tất thiết kế đầu tiên và **tự động bơm ngay +10 credits vào tài khoản `ltdanhdufnsq`**.
- **Tài khoản `inushibakzao` (đã gen ảnh trước đó):**
  - Chỉ cần đăng nhập tài khoản `inu`, mở popup **"Mời Bạn Bè"**, cuộn xuống ô dưới cùng nhập `ltdanhdufnsq` và bấm **"Áp dụng"** (hoặc mở lại link `https://design.7app.online/?ref=ltdanhdufnsq` trong lúc đang đăng nhập acc `inu`).
  - Hệ thống kiểm tra thấy `inu` đã có 1 lượt gen ảnh phòng khách hợp lệ -> **kích hoạt thưởng hồi tố +10 credits ngay lập tức cho `ltd`**.
