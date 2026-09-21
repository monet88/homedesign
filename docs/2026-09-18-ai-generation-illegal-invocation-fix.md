# HomeDesign — Báo Cáo Sửa Lỗi AI Generation: Illegal Invocation Trong V8 Runtime

**Ngày thực hiện:** 18/09/2026  
**Chuyên môn:** Cloudflare Workers V8 Isolate Native API Bindings, Fail-Safe Generation Engine  
**Trạng thái:** Đã khắc phục triệt để, Typecheck 0 error, Vitest pass 100%.

---

## 1. Bản Chất Sự Cố

Khi tài khoản `letinhz6u9` tiến hành tạo thiết kế ảnh nội thất ("Tái Thiết Kế Toàn Diện"), màn hình báo lỗi:
> **AI Generation Encountered An Issue**  
> **Reason: ILLEGAL_INVOCATION_FUNCTION_CALLED_WITH_INCORRECT_THIS_REFERENCE.**  
> **No worries! Your 1 credit was safely refunded to your account automatically.**

### 1.1. Nguyên Nhân Gốc (Root Cause Analysis):
- Mặc định trên UI, model được chọn là **"Tự động tối ưu (Smart Auto-Failover: Fal 1s ➔ Gemini)"** (`engine = "smart"`).
- Khi chạy trên môi trường Cloudflare Workers (V8 isolates), hàm `fetch` là một C++ native binding thuộc về `WorkerGlobalScope` (`globalThis`).
- Trong các adapter `FalFluxAdapter`, `ReplicateAdapter`, `KieAdapter`, `GeminiFlashImageAdapter`, biến `fetchFn` được gán:
  ```typescript
  this.fetchFn = config.fetchFn ?? fetch;
  ```
  Khi adapter thực thi:
  ```typescript
  const res = await this.fetchFn(endpoint, { ... });
  ```
  Theo ngữ nghĩa của JavaScript, cú pháp method call `this.fetchFn(...)` sẽ tự động gán `this` context là instance của class adapter (`FalFluxAdapter`,...).
- V8 engine của Cloudflare Workers phát hiện hàm native `fetch` được gọi với `this` không phải là `WorkerGlobalScope` -> văng ngoại lệ:
  `TypeError: Illegal invocation: function called with incorrect this reference`!
- Hàm `providerErrorCode(err)` chuyển thông báo này thành mã lỗi:
  `ILLEGAL_INVOCATION_FUNCTION_CALLED_WITH_INCORRECT_THIS_REFERENCE`.

### 1.2. Tính Hoạt Động Đúng Đắn của Cơ Chế Bảo Vệ Người Dùng (Credit Hold & Refund):
- Mặc dù provider bị lỗi gọi hàm, cơ chế **Credit Hold Fail-Safe** (Ticket #7 & ADR 0002) đã hoạt động chính xác:
  - Task được đánh dấu `failed`.
  - Hàm `releaseHold` lập tức được kích hoạt để giải phóng 1 credit đang bị giữ (hold) và hoàn trả nguyên vẹn về số dư khả dụng của user (`5 credits`). Người dùng không bị trừ bất kỳ credit nào.

---

## 2. Giải Pháp Triệt Để Đã Triển Khai

1. **Khóa Chặt `this` Context Bằng `bind(globalThis)`:**
   - Trong `FalFluxAdapter`, `ReplicateAdapter`, `KieAdapter`, `GeminiFlashImageAdapter`:
     ```typescript
     this.fetchFn = (config.fetchFn ?? fetch).bind(globalThis);
     ```
   - Trong `getProvider` (`provider-adapter.ts`):
     ```typescript
     const safeFetchFn = (envObj.fetchFn ?? (typeof fetch !== "undefined" ? fetch : undefined))?.bind(globalThis);
     ```
2. **Gọi Hàm Dưới Dạng Standalone (Unbound Invocation):**
   - Thay vì gọi `this.fetchFn(...)`, tách ra biến cục bộ trước khi invoke:
     ```typescript
     const safeFetch = this.fetchFn;
     const res = await safeFetch(endpoint, { ... });
     ```
   - Cú pháp gọi hàm này triệt tiêu hoàn toàn việc JS engine truyền `this` của adapter vào hàm `fetch`.
3. **Bổ Sung Unit Test Chống Tái Diễn:**
   - Đã thêm test case trong `src/lib/ai/fal-adapter.test.ts` giả lập môi trường V8 nghiêm ngặt, kiểm tra nếu `this !== globalThis` sẽ throw `Illegal invocation`. Test xác nhận adapter gọi hàm hoàn toàn an toàn.

---

## 3. Giải Đáp Về Vấn Đề Referral Của Acc `letinhz6u9`

1. **Tại sao chưa thấy báo click hay thưởng khi `letinhz6u9` đăng ký:**
   - Vì bản build trên production `design.7app.online` hiện tại **vẫn là bản cũ** (commit trước đó). Các cập nhật của `ReferralTracker` mới chỉ vừa được commit trên nhánh `feature/sprint-10-3d-panorama-vr-tour` và chưa được deploy lên Cloudflare live.
   - Hơn nữa, theo quy chế referral, người giới thiệu (`ltd`) **chỉ nhận 10 credits khi bạn bè hoàn tất thiết kế đầu tiên**. Do lượt tạo thiết kế vừa rồi bị lỗi `ILLEGAL_INVOCATION` và được hoàn tiền, nên tài khoản `letinh` chưa được tính là đã hoàn tất thiết kế đầu tiên.
2. Sau khi merge và deploy bản cập nhật này lên production:
   - Lỗi `ILLEGAL_INVOCATION` được loại bỏ 100%, acc `letinh` sẽ tạo ảnh thành công.
   - Khi đó, hệ thống sẽ tự động kích hoạt thưởng **+10 credits** ngay lập tức cho acc `ltd`!
