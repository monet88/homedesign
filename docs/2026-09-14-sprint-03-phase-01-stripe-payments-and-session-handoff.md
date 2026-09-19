# Báo Cáo Kỹ Thuật & Handoff Contract: Sprint 3 — Phase 1: Stripe Payments & Session Handoff

- **Dự án:** HomeDesign Clone (`homedesign`)
- **Giai đoạn vừa hoàn thành:**
  - **Đóng Sprint 2:** Release Gate Verification (Smoke, Free-First, Worker Build) & Merge vào `main` (`99bc1a0`).
  - **Khởi động Sprint 3 — Phase 1:** Triển khai hoàn tất Ticket 3.1: Stripe Checkout & Webhook Idempotent Settlement.
- **Nhánh làm việc:** `feat/sprint-03-payments-and-monetization`
- **Pull Request:** [PR #1](https://github.com/gosoniccapital-ui/hmdesign/pull/1) (`feat(sprint-03): payments monetization (Stripe Checkout & Webhook - Ticket 3.1)`)
- **Base Commit Anchor:** `c9f0d30` (`docs(implementation): record sprint 2 release gate results and sprint 3 roadmap`)
- **Head Commit Hash:** `a7104bc` (`docs(implementation): record ticket 3.1 completion`)
- **Ngày hoàn thành:** 14/09/2026
- **Trạng thái:** ✅ **HOÀN THÀNH 100% RELEASE GATE SPRINT 2 & TICKET 3.1 SPRINT 3 — ALL TESTS PASSING (492 UNIT + 249 SMOKE)**

---

## 1. Mục Tiêu (Objective)

1. **Khép lại trọn vẹn Sprint 2:**
   - Chạy xác minh toàn diện bộ Release Gate: kiểm thử tích hợp workers-runtime (`npm run smoke`), kiểm tra hạn ngạch bundle Cloudflare Free (`npm run gate:free-first`), và kiểm tra worker build OpenNext (`npm run build:worker`).
   - Hợp nhất nhánh sửa lỗi `fix/sprint-02-phase-04-ux-and-security` vào nhánh chính `main` và đồng bộ an toàn lên GitHub remote `origin/main` (`gosoniccapital-ui/hmdesign`).
2. **Khai mở Sprint 3 (SaaS Monetization & Growth):**
   - Thiết lập tài liệu chiến lược cho Sprint 3 với 4 Epics trọng tâm: Thanh toán thương mại, B2B Virtual Staging cho môi giới, Vòng lặp chia sẻ lan truyền (Viral loop), và Độ ổn định AI Engine.
   - Bắt tay triển khai ngay **Ticket 3.1 (Phase 1)**: Xây dựng hệ thống cổng thanh toán quốc tế Stripe Checkout và Webhook tự động giải ngân credit với tính năng Idempotent chống duplicate billing.

---

## 2. Việc Đã Làm & Chi Tiết Kỹ Thuật (What Was Done)

### A. Đóng Sprint 2 & Release Gate Verification
- **Khắc phục các điểm nghẽn môi trường Windows trước khi Release:**
  - Cập nhật assertion `VALID_UPLOAD_MIMES` trong [`tests/harness.wtest.ts`](../tests/harness.wtest.ts) đồng bộ với định dạng `image/webp` được chấp nhận trong Phase 4.
  - Phân lập đối tượng `baseDemo` trong [`src/lib/env/deploy-policy.wtest.ts`](../src/lib/env/deploy-policy.wtest.ts) để không bị ảnh hưởng bởi biến môi trường Google OAuth cục bộ trong `.env.local`.
  - Căn chỉnh timeout cho Miniflare và các tiến trình con CLI D1 trên Windows ([`tests/admin-seed.test.ts`](../tests/admin-seed.test.ts), [`vitest.config.ts`](../vitest.config.ts), [`vitest.workers.config.ts`](../vitest.workers.config.ts)).
- **Hợp nhất và đồng bộ Git:**
  - Thực hiện merge nhánh `fix/sprint-02-phase-04-ux-and-security` vào `main` với commit `99bc1a0`.
  - Push thành công lên `origin/main` qua xác thực an toàn `GITHUB_TOKEN`.

### B. Sprint 3 — Ticket 3.1: Stripe Checkout & Webhook Fulfillment
- **Migration D1 mới ([`migrations/0012_payment_orders.sql`](../migrations/0012_payment_orders.sql)):**
  - Khởi tạo bảng `payment_orders` lưu trữ:
    - `id`: UUID định danh đơn hàng nội bộ.
    - `user_id`: Khóa ngoại tham chiếu bảng `user`.
    - `provider`: Hỗ trợ `stripe` và `sepay`.
    - `pack`: Các gói credit chuẩn (`lite`: 80 credits / $9, `plus`: 160 credits / $17, `pro`: 320 credits / $29, `max`: 640 credits / $49).
    - `amount_cents`, `currency`, `credits_granted`.
    - `status`: Quản lý trạng thái vòng đời đơn hàng (`pending`, `completed`, `failed`, `refunded`).
    - `provider_session_id`, `provider_payment_id`, `ledger_entry_id`.
- **Module Cốt Lõi Pure Web API ([`src/lib/payments/stripe.ts`](../src/lib/payments/stripe.ts)):**
  - **100% Zero Dependency:** Sử dụng `fetch` gốc và Web Crypto API (`crypto.subtle`), hoàn toàn tương thích Cloudflare Workers Edge runtime, không làm tăng kích thước bundle.
  - **Xác thực Webhook chuẩn HMAC-SHA256:**
    - Phân tích header `stripe-signature` (`t=timestamp,v1=signature`).
    - Kiểm tra thời gian hết hạn của chữ ký (tolerance 300 giây) chống tấn công Replay Attack.
    - Kỹ thuật so sánh chuỗi `timingSafeEqual` chống tấn công Timing Attack.
  - **Fulfillment Idempotent & Atomic Batch:**
    - Khi nhận sự kiện `checkout.session.completed`, hệ thống đối chiếu đơn hàng qua `provider_session_id`.
    - Nếu đơn hàng đã ở trạng thái `completed`, trả về kết quả thành công ngay mà **tuyệt đối không cộng thêm credit lần 2**.
    - Nếu đơn hàng đang `pending`, chạy atomic batch trên Cloudflare D1: chèn bản ghi giao dịch `entry_type = 'payment'` vào `credit_ledger` và cập nhật đơn hàng thành `completed` cùng mã `provider_payment_id`.
- **API Endpoints:**
  - [`POST /api/payments/stripe/checkout`](../src/app/api/payments/stripe/checkout/route.ts): Xác thực người dùng, kiểm tra gói credit với Zod `StripeCheckoutSchema`, gọi Stripe API tạo phiên checkout và lưu pending order.
  - [`POST /api/payments/stripe/webhook`](../src/app/api/payments/stripe/webhook/route.ts): Endpoint công khai lắng nghe sự kiện từ Stripe, xác thực chữ ký bằng `STRIPE_WEBHOOK_SECRET` và kích hoạt cộng credit tự động.

---

## 3. Kết Quả Kiểm Thử (Verification Evidence)

1. **TypeScript Typecheck:**
   ```bash
   npm run typecheck # tsc --noEmit
   # Exit code: 0 — 0 errors
   ```
2. **Unit Test Suite (`npm test`):**
   - **31 test files passed, 492 tests passed 100%**.
   - `src/lib/payments/stripe.test.ts` passed 11/11.
   - `src/app/api/payments/stripe/stripe-api.test.ts` passed 7/7.
3. **Workers Runtime Suite (`npm run smoke`):**
   - **14 test files passed, 249 tests passed 100%**.
   - `src/lib/payments/stripe.wtest.ts` passed 4/4 trên real D1 miniflare.
   - D1 migrations `0001` đến `0012` applied thành công.
4. **Cloudflare Bundle Gate (`npm run gate:free-first`):**
   - Next.js 16 Turbopack build: 32 routes thành công.
   - Worker bundle nén: **1.99 MB** (dưới ngưỡng tối đa 3.0 MB của Cloudflare Workers Free).

---

## 4. Đánh Giá Codebase Theo `/behavior-model-debugger`

Áp dụng phương pháp phân tích Behavioral Invariant Matrix cho hệ thống Thanh toán và Tín chỉ (Monetization & Credit Ledger):

| Tương tác (Interaction) | Hành vi kỳ vọng (Expected Invariant) | Cơ chế bảo vệ trong Code | Đánh giá |
|---|---|---|---|
| **Người dùng bấm mua gói Credit** | Hệ thống tạo phiên checkout Stripe an toàn, ghi nhận pending order, không cấp credit trước. | `createStripeCheckoutSession` chỉ lưu `status: 'pending'`, credit ledger chưa bị chạm vào. | ✅ An toàn tuyệt đối |
| **Stripe gửi Webhook `checkout.session.completed`** | Xác thực chữ ký cryptographic, cộng đúng số credit tương ứng gói đã mua, chuyển trạng thái đơn hàng sang `completed`. | HMAC-SHA256 qua `crypto.subtle` + D1 atomic batch (`INSERT INTO credit_ledger` + `UPDATE payment_orders`). | ✅ Đạt chuẩn tài chính |
| **Stripe retry gửi Webhook lần 2, 3 (Duplicate Webhook)** | Hệ thống phát hiện đơn hàng đã hoàn tất, trả về 200 OK ngay lập tức, không được cộng trùng credit. | Kiểm tra `order.status === 'completed'` trước khi batch; trả về `alreadyProcessed: true`. Đã verify bằng unit test. | ✅ Chống Duplicate Billing |
| **Kẻ gian gửi Webhook giả mạo hoặc sửa payload** | Chữ ký HMAC không khớp hoặc timestamp quá cũ (>300s) sẽ bị từ chối ngay ở cửa ngõ. | `verifyStripeWebhookSignature` ném lỗi `INVALID_STRIPE_SIGNATURE` hoặc `STRIPE_SIGNATURE_EXPIRED`, trả về HTTP 400. | ✅ Chống Replay / Tamper |
| **Môi trường chưa cấu hình Webhook Secret** | Hệ thống fail-closed, không bao giờ bỏ qua bước xác thực chữ ký. | Kiểm tra `!webhookSecret` trả về HTTP 503 `STRIPE_WEBHOOK_SECRET_NOT_CONFIGURED`. | ✅ Fail-Closed an toàn |

---

## 5. Trạng Thái Git Theo `/vibe-git-manager`

- **Nhánh hiện tại:** `feat/sprint-03-payments-and-monetization`
- **Trạng thái đồng bộ:** Đã push lên GitHub remote `https://github.com/gosoniccapital-ui/hmdesign.git`.
- **Pull Request đã tạo:** **[PR #1](https://github.com/gosoniccapital-ui/hmdesign/pull/1)**
- **Working Tree:** Sạch sẽ (`nothing to commit, working tree clean`).
- **Commits trên nhánh:**
  - `7eee038` `feat(payments): integrate stripe checkout and webhook fulfillment with idempotent credit grant (Ticket 3.1)`
  - `a7104bc` `docs(implementation): record ticket 3.1 completion`

---

## 6. Lộ Trình Tiếp Theo Theo `/vibe-engineering-workflow`

Vị trí hiện tại: **Sprint 3 — Phase 1 (Ticket 3.1: Stripe Monetization) ĐÃ XONG**.

### Các vertical tickets tiếp theo của Sprint 3:
1. **Ticket 3.2 (Phase 2): Cổng thanh toán nội địa SePay / VietQR Webhook**
   - Hỗ trợ quét mã VietQR tự động cấp credit cho người dùng tại Việt Nam.
   - Endpoint tạo mã QR động `HD<order_id>` và webhook đối chiếu giao dịch ngân hàng.
2. **Ticket 3.3 (Phase 3): B2B Virtual Staging Engine cho Môi Giới BĐS**
   - Chế độ thiết kế chuyên biệt biến ảnh phòng trống (empty room) thành căn hộ full nội thất cao cấp phục vụ đăng tin bán nhà.
3. **Ticket 3.4 (Phase 4): Tối ưu trang `/share/[token]` thành Phễu chuyển đổi (Viral Loop)**
   - Thanh trượt so sánh Before/After mượt mà trên mobile/desktop.
   - Thẻ metadata OpenGraph động và nút CTA dẫn thẳng người xem mới về công cụ uploader.
4. **Ticket 3.5 (Phase 5): AI Provider Resilience & E2E Verification**
   - Cơ chế Exponential Backoff & Circuit Breaker cho AI adapter.
   - Chạy bộ kiểm thử tự động Playwright E2E (`npm run test:e2e`).

---

## 7. Prompt Chuyển Giao Cho Session Mới (Handoff Prompt)

Khi mở session mới, Đại Ka chỉ cần sao chép toàn bộ khối lệnh dưới đây và gửi cho AI:

```markdown
Chào em, tiếp tục dự án HomeDesign Clone từ tài liệu báo cáo: docs/2026-09-14-sprint-03-phase-01-stripe-payments-and-session-handoff.md.

### Vị trí hiện tại:
- Sprint 2 đã đóng hoàn tất và đã merge vào `main` (Release Gate 100% passed).
- Sprint 3 — Phase 1: Stripe Monetization (Ticket 3.1) đã HOÀN THÀNH trên nhánh `feat/sprint-03-payments-and-monetization`.
- Pull Request: PR #1 (https://github.com/gosoniccapital-ui/hmdesign/pull/1).
- Head commit: `a7104bc` (`docs(implementation): record ticket 3.1 completion`).
- Toàn bộ test suite xanh 100% (492 unit tests passed, 249 smoke tests passed, 0 error tsc, worker bundle 1.99 MB).

### Nhiệm vụ session này (Sprint 3 — Phase 2):
1. Triển khai Ticket 3.2: Tích hợp cổng thanh toán nội địa SePay / VietQR Webhook (quét mã QR chuyển khoản ngân hàng tự động cấp credit trong < 3s).
2. Xây dựng endpoint sinh mã QR VietQR kèm cú pháp chuyển khoản duy nhất `HD<order_id>`.
3. Xây dựng webhook listener `POST /api/payments/sepay-webhook` xác thực API token SePay, kiểm tra idempotent và cấp credit vào `credit_ledger`.
4. Viết đầy đủ unit tests và workers-runtime integration tests cho Ticket 3.2.
5. Chạy toàn bộ test suites (`npm test` và `npm run smoke`) xác minh không có hồi quy (zero regression).

Luôn xưng hô với tôi là "Đại Ka", trả lời bằng tiếng Việt, chuyên môn dùng English; tuân thủ nghiêm ngặt Karpathy Guidelines và quy tắc dự án.
```
