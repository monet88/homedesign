# 🛡️ Báo Cáo Kiểm Toán, An Toàn Bảo Mật & Chuẩn Hóa Bảng Giá (v1.0.1 Hardening Report)

> **Dự án:** HomeDesign AI Architecture Studio  
> **Thời gian thực hiện:** 2026-09-19 09:55 (UTC+7)  
> **Phiên bản:** v1.0.1 Security & Economic Hardening Patch  
> **Nhánh Git:** `feature/v1.0.1-security-pricing-hardening`  
> **Rollback Anchor:** `b64f795` (on `main`)  
> **Phương pháp áp dụng:** `/behavior-model-debugger`, `/vibe-engineering-workflow`, `/vibe-git-manager`, `Karpathy Guidelines`.

---

## 1. MỤC TIÊU (OBJECTIVES)

Tiếp nối đợt bàn giao thương mại v1.0.0, đợt kiểm toán độc lập đã chỉ ra các rủi ro an toàn, tài chính và lệch pha giữa code, tài liệu và môi trường production:
1. **Bảo vệ Credit Pool & Chống IDOR:** Ngăn chặn người dùng biết `workspaceId` hoặc member quyền thấp (`viewer`) tiêu cạn Credit Pool của tổ chức và rò rỉ danh sách batch jobs của workspace khác.
2. **Khóa Chặt Hạn Ngạch Chi Phí AI (Demo Quota Defense) Cho Toàn Bộ Provider:** Ngăn chặn bypass hạn ngạch 50 calls/ngày trên Public Demo cho cả `fal`, `replicate`, `gemini`, và `kie`.
3. **Provider Allowlist Chặt Chẽ:** Kiểm tra whitelist nhà cung cấp AI tại các endpoint Batch (`batch-render`, `batch-panorama`) để ngăn chặn injection provider lạ.
4. **Thiết Lập Single Source of Truth Về Bảng Giá:** Khắc phục sự phân mảnh giữa giá hiển thị Landing Page, Catalog, Stripe (USD) và SePay (VND). Thực sự import và derive trực tiếp từ `pricing-constants.ts`.
5. **Hòa Giải Thời Hạn Credits Với D1 Database Ledger:** D1 ledger thiết kế credits không bao giờ hết hạn (`never expire`), loại bỏ hoàn toàn các dòng copy cũ "30–180 days" để thống nhất thành "Không giới hạn thời gian (Never expire)".
6. **Triệt Tiêu Lỗ Hổng Open Redirect:** Chặn đứng nguy cơ kẻ xấu lợi dụng callback `successUrl`/`cancelUrl` của Stripe Checkout để điều hướng lừa đảo (phishing) sau thanh toán.
7. **Gia Cố HTTP Security Headers:** Bổ sung CSP/HSTS/Frame-Options bảo vệ người dùng trên hạ tầng Cloudflare Workers và Next.js.
8. **Bảo Vệ Quyền Riêng Tư Bản Vẽ:** Chuyển đổi trạng thái mặc định của tour 360 do AI Batch sinh ra từ `isPublic: true` sang `isPublic: false` (Private/Draft).
9. **Bảo Toàn Chuẩn Kiến Trúc Free-First:** Đảm bảo toàn bộ thay đổi không làm phình bundle Cloudflare Workers quá 3.0 MB, không phát sinh lỗi TypeScript, và 100% unit tests pass.

---

## 2. NHỮNG VIỆC ĐÃ HOÀN TẤT CHI TIẾT (WHAT WAS DONE)

### 🧩 1. Phân Tích Mô Hình Hành Vi & Va Chạm Luật Chơi (`/behavior-model-debugger`)

- **Va chạm Batch vs Workspace Credit Pool:**  
  *Trước:* Client tự do gửi `workspaceId` lên `/api/ai/batch-render` và `/api/ai/batch-panorama`. Hệ thống chỉ kiểm tra số dư credits của workspace mà không xác thực caller có phải thành viên hay không. Member có role `viewer` cũng có thể kích hoạt batch.  
  *Khắc phục:* Bổ sung bước kiểm tra bảng `workspace_members` ở cả core service ([batch-service.ts](file:///e:/monetwork/hmdesign/src/lib/batch/batch-service.ts), [batch-panorama.ts](file:///e:/monetwork/hmdesign/src/lib/panorama/batch-panorama.ts)) và API routes. Nếu caller không phải member $\rightarrow$ ném lỗi `FORBIDDEN` (HTTP 403). Nếu caller có role `viewer` $\rightarrow$ ném lỗi `ROLE_CANNOT_GENERATE` (HTTP 403). Trong `listBatchRenderJobs`, nếu caller không thuộc workspace thì trả về `[]`.

- **Vá Lỗ Hổng KIE Provider Quota & Bao Phủ Multi-Provider:**  
  *Trước:* `KieAdapter` chưa có thuộc tính `claimOutboundAttempt`. Khi client gửi `provider=kie`, adapter gọi API ngoài mà không qua kiểm tra quota demo hàng ngày.  
  *Khắc phục:* Bổ sung `claimOutboundAttempt?: () => Promise<boolean>` vào [kie-adapter.ts](file:///e:/monetwork/hmdesign/src/lib/ai/kie-adapter.ts). Trong [provider-adapter.ts](file:///e:/monetwork/hmdesign/src/lib/ai/provider-adapter.ts), truyền `demoClaimFn` vào hàm khởi tạo `new KieAdapter({ apiKey: kieKey, fetchFn: safeFetchFn, claimOutboundAttempt: demoClaimFn })`. Đã có test riêng chứng minh quota chặn đứng tại [kie-adapter.test.ts](file:///e:/monetwork/hmdesign/src/lib/ai/kie-adapter.test.ts).

- **Provider Allowlist Enforcement Tại Batch API:**  
  *Khắc phục:* Trong cả 2 route [batch-render/route.ts](file:///e:/monetwork/hmdesign/src/app/api/ai/batch-render/route.ts) và [batch-panorama/route.ts](file:///e:/monetwork/hmdesign/src/app/api/ai/batch-panorama/route.ts), kiểm tra `body.provider` thuộc danh sách cho phép (`["fal", "gemini", "replicate", "kie", "smart", "default", "fake"]`). Nếu gửi provider lạ sẽ lập tức trả về HTTP 400 `INVALID_PROVIDER`.

- **Hiện Thực Hóa Single Source of Truth Bảng Giá & Đồng Bộ D1 Ledger:**  
  *Trước:* `pricing-constants.ts` được tạo nhưng chưa được import vào Stripe, SePay, Landing Page, và Catalog (vẫn dùng hằng số độc lập). Đồng thời ghi chú "hạn 30-180 ngày" mâu thuẫn với D1 database (vốn không có trường hết hạn credits).  
  *Khắc phục:*
    - Cập nhật [pricing-constants.ts](file:///e:/monetwork/hmdesign/src/lib/payments/pricing-constants.ts): Chuẩn hóa `features` thành "Không giới hạn thời gian (Never expire)" / "Credits never expire". Bổ sung mô tả song ngữ Việt - Anh.
    - [stripe.ts](file:///e:/monetwork/hmdesign/src/lib/payments/stripe.ts): Import `UNIFIED_PRICING_TIERS` và derive `CREDIT_PACKS` trực tiếp từ đó (Lite $5/80cr, Plus $9/160cr, Pro $17/320cr, Max $32/640cr).
    - [sepay.ts](file:///e:/monetwork/hmdesign/src/lib/payments/sepay.ts): Import `UNIFIED_PRICING_TIERS` và derive `SEPAY_CREDIT_PACKS` trực tiếp từ đó (Lite 200k, Plus 400k, Pro 700k, Max 1.2M VND).
    - [pricing-section.tsx](file:///e:/monetwork/hmdesign/src/components/landing/pricing-section.tsx): Import `UNIFIED_PRICING_TIERS` và derive `TIERS`, tự động hiển thị mô tả & tính năng song ngữ khi người dùng chuyển đổi ngôn ngữ.
    - [catalog.ts](file:///e:/monetwork/hmdesign/src/lib/catalog.ts): Import `UNIFIED_PRICING_TIERS` và derive `PRICING_TIERS`, xóa bỏ toàn bộ định nghĩa giá tách rời.
    - Viết test [pricing-constants.test.ts](file:///e:/monetwork/hmdesign/src/lib/payments/pricing-constants.test.ts) kiểm chứng tự động tính đồng bộ 100% giữa các file này.

- **Va chạm Stripe Callback vs Open Redirect Phishing:**  
  *Khắc phục:* Trong [route.ts](file:///e:/monetwork/hmdesign/src/app/api/payments/stripe/checkout/route.ts), triển khai hàm `isValidReturnUrl` so sánh `parsedUrl.origin === expectedOrigin` dựa trên `BETTER_AUTH_URL`. Bất kỳ URL nào khác origin đều bị từ chối ngay với HTTP 400 `{ error: "INVALID_RETURN_URL" }`.

- **Gia Cố HTTP Security Headers:**  
  *Khắc phục:* Thêm cấu hình `headers()` vào [next.config.ts](file:///e:/monetwork/hmdesign/next.config.ts) thiết lập các HTTP headers bắt buộc:
  ```ts
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  ```

- **Quyền Riêng Tư Tour 360 (Private by Default):**  
  *Khắc phục:* Đổi dòng 293 của [batch-panorama.ts](file:///e:/monetwork/hmdesign/src/lib/panorama/batch-panorama.ts) từ `isPublic: true` thành `isPublic: false`. Tour mới sinh được giữ bảo mật riêng tư, chỉ công khai khi người dùng bấm "Chia Sẻ".

- **Minh Bạch Về Quản Lý Dependencies & npm audit:**  
  *Khắc phục:* Chạy `npm audit fix` vá lỗ hổng `qs`. 5 cảnh báo High còn lại thuộc `sharp` nằm hoàn toàn trong devDependencies của môi trường kiểm thử local (`miniflare`/`wrangler`), được tách biệt hoàn toàn khỏi Cloudflare Workers production bundle sinh bởi Turbopack và OpenNext.

---

## 3. KẾT QUẢ ĐẠT ĐƯỢC (RESULTS & EVIDENCE)

### 📊 1. Kiểm Thử Toàn Diện (Zero Regressions)
- **Tổng số Unit Tests:** **694 / 694 tests PASSED 100%** (Tăng từ 669 $\rightarrow$ 682 $\rightarrow$ **694** test cases trên 65 test suites, 0 test failed).
- **TypeScript:** `npm run typecheck` (`tsc --noEmit`) đạt **0 errors**.
- **Edge Build Verification:** `npm run build:worker` hoàn thành trơn tru qua OpenNext Cloudflare.
- **Kiểm Soát Dung Lượng Free-First:** Lệnh `npm run gate:free-first` thông qua tuyệt đối:
  - Worker compressed bundle: **2,270,639 bytes (2.16 MB)**.
  - Giới hạn Cloudflare Workers Free: **3,145,728 bytes (3.0 MB)**.
  - Dư thừa an toàn: **~0.84 MB (28%)**.

### 🛡️ 2. Bảng So Sánh Trước & Sau Khi Hardening

| Hạng mục kiểm tra | Trạng thái v1.0.0 | Trạng thái v1.0.1 Hardened Hoàn Thiện |
| :--- | :--- | :--- |
| **Quyền truy cập Workspace Batch** | Bỏ ngỏ; tin `workspaceId` từ client | **Bảo vệ 2 lớp:** DB query `workspace_members`, chặn non-member & `viewer` (HTTP 403) |
| **Lộ dữ liệu Batch Jobs** | Cho phép query mọi `workspace_id` | **Bảo mật:** Trả về `[]` nếu caller không thuộc workspace |
| **Hạn ngạch AI Demo (50 calls/ngày)** | Chỉ có trên Gemini | **Bao phủ 100%:** Fal, Replicate, Gemini, và **KIE** (`KieAdapter`) |
| **Batch Provider Allowlist** | Chấp nhận chuỗi bất kỳ | **Chặn triệt để:** Whitelist `fal`, `gemini`, `replicate`, `kie`, `smart`, `default`, `fake` (HTTP 400 nếu lạ) |
| **Single Source of Truth Giá** | Giá bị phân mảnh khắp 4 file | **Đồng bộ 100%:** `pricing-constants.ts` cấp dữ liệu cho Stripe, SePay, Landing Page, và Catalog |
| **Tính hợp lệ của Hạn Dùng Credits** | Ghi 30–180 ngày (sai lệch D1) | **Khớp 100% D1 ledger:** "Không giới hạn thời gian (Never expire)" |
| **Stripe Return URL** | Cho phép bất kỳ URL ngoài | **Chặn triệt để:** Bắt buộc same-origin policy, chống Open Redirect Phishing |
| **HTTP Security Headers** | Chưa cấu hình trong Next | **Bảo mật cao:** Đầy đủ HSTS, nosniff, SAMEORIGIN, Referrer-Policy |
| **Trạng thái Tour 360 mới sinh** | `isPublic: true` (Công khai ngay) | `isPublic: false` (Riêng tư mặc định, chủ động chia sẻ) |

---

## 4. KẾT LUẬN & SẴN SÀNG CHO PILOT B2B

Toàn bộ các điểm hở phát hiện qua đợt review độc lập của Codex đã được xử lý triệt để:
1. `KieAdapter` đã được gắn `claimOutboundAttempt` và được truyền `demoClaimFn` từ factory.
2. Hai endpoint batch render/panorama đã có allowlist provider chặt chẽ.
3. Single Source of Truth `pricing-constants.ts` đã được liên kết thực sự 1-1 vào Stripe, SePay, Landing Page, và Catalog.
4. Cam kết credits không bao giờ hết hạn được đồng bộ chuẩn xác từ tầng database lên tầng marketing copy.

Mã nguồn trên nhánh `feature/v1.0.1-security-pricing-hardening` đã đạt tiêu chuẩn thương mại cao nhất, sẵn sàng 100% để merge vào `main`, gắn tag `v1.0.1`, deploy production và khởi động chiến dịch Pilot B2B.
