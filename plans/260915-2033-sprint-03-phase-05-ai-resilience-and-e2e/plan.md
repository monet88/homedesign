# Kế Hoạch Kỹ Thuật: Sprint 3 — Phase 5: AI Provider Resilience & E2E Verification (Ticket 3.5)

- **Dự án:** HomeDesign Clone (`homedesign`)
- **Giai đoạn:** Sprint 3 — Phase 5 (Ticket 3.5)
- **Nhánh thực hiện:** `feat/sprint-03-payments-and-monetization`
- **Mục tiêu:** Xây dựng cơ chế phòng thủ mạng lưới (Resilience Engine) cho các AI Provider bên ngoài, tự động retry với Exponential Backoff & Circuit Breaker, đảm bảo an toàn số dư Credit khi provider gặp sự cố và xác thực toàn diện hệ sinh thái qua Playwright E2E Tests.

---

## 1. Bối Cảnh & Vấn Đề (Context & Problem Statement)

1. **Rủi Ro Mạng Lưới Từ AI Providers Bên Ngoài:**
   - Các mô hình AI thế hệ mới (Gemini Flash, Fal Flux, Kie Seedance, Replicate) đôi khi gặp hiện tượng nghẽn mạng (HTTP 429 Too Many Requests, HTTP 503 Service Unavailable, HTTP 504 Gateway Timeout).
   - Nếu không có cơ chế Resilience, client sẽ bị treo hoặc thất bại đột ngột, gây ức chế cho người dùng và có nguy cơ thất thoát Credit (Hold không được giải phóng kịp thời).
2. **Cơ Chế Bảo Vệ Tín Dụng (Credit Safety Invariant):**
   - Khi tạo thiết kế, hệ thống tạm giữ (`hold`) 1 Credit. Nếu tác vụ AI thất bại hoàn toàn sau các lượt thử lại, hệ thống PHẢI tự động gọi `releaseHold` để hoàn trả Credit ngay tức thì cho người dùng.
3. **Kiểm Thử Toàn Diện (End-to-End E2E Verification):**
   - Cần có bộ kiểm thử E2E Playwright để chạy giả lập hành vi thực tế của người dùng từ uploader phòng trống, chọn preset B2B Virtual Staging, thanh toán VietQR / Stripe đến chia sẻ link Before/After slider.

---

## 2. Kiến Trúc Giải Pháp Kỹ Thuật (Architecture & Technical Design)

### Module 1: AI Provider Resilience Adapter (`src/lib/ai/resilience.ts`)
- **Exponential Backoff with Full Jitter:**
  - Base delay: `500ms`, Max delay: `4000ms`, Retry attempts: `3`.
  - Công thức: `delay = Math.min(maxDelay, baseDelay * 2 ** attempt) * (0.5 + Math.random() * 0.5)`.
  - Chỉ tự động retry các mã lỗi tạm thời (Transient Errors: 408, 429, 500, 502, 503, 504, Connection Reset). Tuyệt đối không retry các lỗi do dữ liệu đầu vào (400 Bad Request, 401 Unauthorized, 403 Forbidden).
- **Circuit Breaker Pattern:**
  - State Machine: `CLOSED` (bình thường) -> `OPEN` (ngắt mạch khi lỗi liên tục >= 5 lần trong 60s) -> `HALF_OPEN` (thử nghiệm 1 request sau cooldown 30s).
  - Khi mạch `OPEN`, hệ thống từ chối ngay mà không gửi request ra ngoài, bảo vệ Worker Edge khỏi bị nghẽn connection pool và chuyển sang Fallback Model (hoặc phản hồi lỗi ngay lập tức).
- **Atomic Credit Rollback Guarantee:**
  - Kết nối chặt chẽ với `src/lib/ai/lifecycle.ts` và `src/lib/credits/ledger.ts`: đảm bảo bất kỳ lỗi nào xảy ra ở tầng provider đều kích hoạt `releaseHold(env, holdId)`.

### Module 2: Playwright E2E Test Suite (`e2e/sprint-03-flows.spec.ts`)
- **Flow 1: Before/After Share Funnel Verification:**
  - Mở `/share/[token]` của một dự án mẫu.
  - Kiểm tra thanh trượt Before/After hoạt động, nút 100% Gốc / 50-50 / 100% Mới thay đổi vị trí slider.
  - Kiểm tra nút sao chép link và nút Tải ảnh HD.
- **Flow 2: B2B Virtual Staging Landing & Presets:**
  - Truy cập `/ai-virtual-staging`.
  - Kiểm tra form hiển thị 3 presets B2B (Living Room Luxury, Modern Bedroom, Executive Office).
- **Flow 3: VietQR / Stripe Checkout Page:**
  - Kiểm tra bảng giá 4 gói credit, chọn gói và render QR VietQR.

---

## 3. Các Giai Đoạn Triển Khai (Phases of Execution)

| Giai đoạn | Nhiệm vụ chi tiết | File liên quan | Tiêu chí nghiệm thu (Pass Criteria) |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Xây dựng `resilience.ts` (Backoff & Circuit Breaker) & Unit Tests | `src/lib/ai/resilience.ts`, `src/lib/ai/resilience.test.ts` | 100% Unit tests passed |
| **Phase 2** | Tích hợp Resilience vào AI Caller Lifecycle & Credit Refund Safe-Gate | `src/lib/ai/lifecycle.ts`, `src/lib/ai/worker.ts` | Workers tests passed, zero credit leak |
| **Phase 3** | Viết kịch bản Playwright E2E Tests cho Sprint 3 | `e2e/sprint-03-flows.spec.ts` | Playwright chạy pass trên local/ci |
| **Phase 4** | Verification Gate: Typecheck, Smoke 261+, Secret Gate, Báo cáo | `npm run smoke`, `scripts/secret-gate.sh` | 100% All gates pass, PR ready |

---

## 4. Bằng Chứng & Chỉ Số Thành Công (Success Metrics)
- `npm run typecheck`: 0 errors.
- `npm test`: 100% tests passed.
- `npm run smoke`: 261/261 tests passed.
- Không có rò rỉ secret hoặc memory leak trên Cloudflare Workers runtime.
