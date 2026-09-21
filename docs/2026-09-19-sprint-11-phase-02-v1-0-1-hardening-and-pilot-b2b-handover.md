# 📜 BÁO CÁO BÀN GIAO TOÀN DIỆN: SPRINT 11 — PHASE 02
## v1.0.1 SECURITY, QUOTA & PRICING HARDENING & PILOT B2B HANDOVER CONTRACT

> **Dự án:** HomeDesign AI Architecture Studio  
> **Phiên bản:** v1.0.1-rc (Commercial Hardening Patch)  
> **Thời gian chốt:** 2026-09-19 11:15 (UTC+7)  
> **Vị trí hiện tại:** **SPRINT 11 — PHASE 02 (HOÀN TẤT HARDENING & SẴN SÀNG MERGE VÀO MAIN ĐỂ RELEASE PILOT B2B)**  
> **Nhánh phát triển:** `feature/v1.0.1-security-pricing-hardening`  
> **Head Commit:** `629927e` (*fix(security): resolve smart failover quota bypass and configure production generation toggle*)  
> **Rollback Anchor:** `b64f795` (Tag `v1.0.0` trên `main`)  
> **Phương pháp luận:** `/behavior-model-debugger` • `/vibe-engineering-workflow` • `/vibe-git-manager` • `Karpathy Behavioral Guidelines`  
> **Trạng thái kiểm thử:** **699 / 699 unit tests PASSED (100%)** • `tsc --noEmit` **0 errors** • Cloudflare Worker Bundle **2.16 MB / 3.0 MB**

---

## 1. MỤC TIÊU CỦA SPRINT 11 PHASE 02 (OBJECTIVES)

Sau khi phiên bản v1.0.0 được đóng gói tại Sprint 11 Phase 01, đợt kiểm toán độc lập đã chỉ ra các rủi ro bảo mật, chi phí AI và sự phân mảnh bảng giá. Sprint 11 Phase 02 được kích hoạt để giải quyết triệt để 5 mục tiêu then chốt:

1. **Khóa chặt hạn ngạch chi phí AI (Demo Daily Quota Defense):**
   - Loại bỏ hoàn toàn nguy cơ vượt hạn ngạch 50 calls/ngày trên Public Demo ở mọi provider: Fal.ai, Replicate, Gemini và KIE.ai.
   - Triệt tiêu lỗ hổng bypass quota qua `SmartFailoverProviderAdapter` khi failover sang provider phụ.

2. **Thiết lập Single Source of Truth duy nhất cho bảng giá:**
   - Chấm dứt tình trạng phân mảnh giá giữa Landing Page, Catalog, Stripe (USD) và SePay (VND).
   - Tích hợp thực sự 1-1 hằng số bảng giá xuyên suốt toàn bộ codebase.

3. **Hòa giải mâu thuẫn thời hạn Credits với D1 Database Ledger:**
   - Đồng bộ thông điệp marketing với bản chất cơ sở dữ liệu: loại bỏ copy cũ "hạn 30–180 ngày", chuẩn hóa thành "Không giới hạn thời gian (Never expire)".

4. **Bảo vệ toàn vẹn dữ liệu & Phân quyền Workspace:**
   - Ngăn chặn IDOR và việc thành viên `viewer` tiêu cạn Credit Pool của tổ chức tại các endpoint Batch (`batch-render`, `batch-panorama`).
   - Chặn provider lạ qua cơ chế Whitelist. Chuyển đổi trạng thái mặc định của tour 360 do AI Batch tạo ra sang `isPublic: false` (Private/Draft).
   - Chặn đứng lỗ hổng Open Redirect tại Stripe Checkout callback.

5. **Chốt chính sách môi trường rõ ràng cho Production & Demo:**
   - Mở khóa tính năng sinh ảnh AI trên Production có kiểm soát qua biến `AI_GENERATION_ENABLED="true"` trong `wrangler.jsonc`.
   - Phân định ranh giới thanh toán: Demo cho phép thanh toán thử nghiệm có van an toàn 50 calls/ngày; Production vận hành thương mại thật theo số dư Credit Ledger.

---

## 2. NHỮNG VIỆC ĐÃ HOÀN TẤT CHI TIẾT (WHAT WAS DONE)

### 🧩 A. Phân Tích Mô Hình Hành Vi (`/behavior-model-debugger`)

1. **Vá lỗ hổng Quota Bypass qua Smart Failover (Double-Lock Guard):**
   - *Phân tích hành vi:* Khi request `provider=smart`, nếu provider chính gặp lỗi mạng trong `fetchOutput()`, `SmartFailoverProviderAdapter` lặp sang provider tiếp theo. Trước đây, provider fallback này bị gọi thẳng `fetchOutput()` mà không qua `submit()`, khiến cuộc gọi tính phí ra Fal/Replicate/KIE không bị trừ vào hạn ngạch 50 calls/ngày.
   - *Giải pháp 2 lớp:*
     - **Lớp 1 (Failover Router):** Trong [`smart-failover-adapter.ts`](file:///e:/monetwork/hmdesign/src/lib/ai/smart-failover-adapter.ts#L90-L105), trước khi gọi `fetchOutput` của bất kỳ fallback candidate nào (`provider !== active`), hệ thống bắt buộc gọi `await provider.submit(req)`. Nếu quota đã hết (`DEMO_DAILY_LIMIT_REACHED`), failover từ chối ngay lập tức, không gửi request ra ngoài.
     - **Lớp 2 (Defense-in-Depth tại từng Adapter):** Trong [`fal-adapter.ts`](file:///e:/monetwork/hmdesign/src/lib/ai/fal-adapter.ts#L75-L85), [`replicate-adapter.ts`](file:///e:/monetwork/hmdesign/src/lib/ai/replicate-adapter.ts#L75-L85) và [`kie-adapter.ts`](file:///e:/monetwork/hmdesign/src/lib/ai/kie-adapter.ts#L78-L88), bổ sung cơ chế theo dõi `claimedTaskIds`. Nếu `fetchOutput` bị gọi mà chưa claim ở `submit`, adapter sẽ tự động kiểm tra `claimOutboundAttempt()` trước khi gửi HTTP POST.

2. **Khóa chặt KIE Provider Quota:**
   - Trang bị `claimOutboundAttempt?: () => Promise<boolean>` vào [`kie-adapter.ts`](file:///e:/monetwork/hmdesign/src/lib/ai/kie-adapter.ts).
   - Truyền `demoClaimFn` từ factory [`provider-adapter.ts`](file:///e:/monetwork/hmdesign/src/lib/ai/provider-adapter.ts#L220-L223).
   - Bổ sung 5 tests độc lập trong [`kie-adapter.test.ts`](file:///e:/monetwork/hmdesign/src/lib/ai/kie-adapter.test.ts).

3. **Provider Allowlist tại Batch API:**
   - Trong [`batch-render/route.ts`](file:///e:/monetwork/hmdesign/src/app/api/ai/batch-render/route.ts#L32-L38) và [`batch-panorama/route.ts`](file:///e:/monetwork/hmdesign/src/app/api/ai/batch-panorama/route.ts#L54-L60), kiểm tra `body.provider` thuộc allowlist `["fal", "gemini", "replicate", "kie", "smart", "default", "fake"]`. Provider không hợp lệ bị từ chối với HTTP 400 `INVALID_PROVIDER`.

4. **Single Source of Truth Bảng Giá Hoàn Chỉnh:**
   - Khởi tạo [`pricing-constants.ts`](file:///e:/monetwork/hmdesign/src/lib/payments/pricing-constants.ts) định nghĩa 4 gói: Lite ($5/200k/80cr), Plus ($9/400k/160cr), Pro ($17/700k/320cr), Max ($32/1.2M/640cr).
   - [`stripe.ts`](file:///e:/monetwork/hmdesign/src/lib/payments/stripe.ts#L6-L37): `CREDIT_PACKS` được derive 100% từ `UNIFIED_PRICING_TIERS`.
   - [`sepay.ts`](file:///e:/monetwork/hmdesign/src/lib/payments/sepay.ts#L7-L38): `SEPAY_CREDIT_PACKS` được derive 100% từ `UNIFIED_PRICING_TIERS`.
   - [`pricing-section.tsx`](file:///e:/monetwork/hmdesign/src/components/landing/pricing-section.tsx#L8-L76): `TIERS` derive trực tiếp, hỗ trợ song ngữ Anh - Việt.
   - [`catalog.ts`](file:///e:/monetwork/hmdesign/src/lib/catalog.ts#L544-L585): `PRICING_TIERS` derive trực tiếp.
   - Tạo test [`pricing-constants.test.ts`](file:///e:/monetwork/hmdesign/src/lib/payments/pricing-constants.test.ts) kiểm chứng tính đồng bộ liên module.

5. **Đồng bộ Hạn Dùng Credits với D1 Database:**
   - Bỏ toàn bộ copy "30–180 days", chuẩn hóa thành "Không giới hạn thời gian (Never expire)" / "Credits never expire", phản ánh đúng thực tế thiết kế bảng `credit_ledger` trong D1.

6. **Chốt Chính Sách Môi Trường (Production vs Demo Policy):**
   - Trong [`policy.ts`](file:///e:/monetwork/hmdesign/src/lib/env/policy.ts#L48-L62), `isGenerationAllowed` hỗ trợ cờ `AI_GENERATION_ENABLED="true"`.
   - Cấu hình `"AI_GENERATION_ENABLED": "true"` trong [`wrangler.jsonc`](file:///e:/monetwork/hmdesign/wrangler.jsonc#L248-L255) cho `production`.
   - Mặc định không có cờ này vẫn trả về `false` để bảo toàn 100% test spec ADR 0006 cũ.

7. **Bảo Mật Open Redirect & Security Headers & Private Tour:**
   - [`stripe/checkout/route.ts`](file:///e:/monetwork/hmdesign/src/app/api/payments/stripe/checkout/route.ts): Ép buộc return URLs phải cùng origin với `BETTER_AUTH_URL` hoặc relative path.
   - [`next.config.ts`](file:///e:/monetwork/hmdesign/next.config.ts): Đã thêm cấu hình HSTS, nosniff, SAMEORIGIN, Referrer-Policy.
   - [`batch-panorama.ts`](file:///e:/monetwork/hmdesign/src/lib/panorama/batch-panorama.ts#L293): Đổi mặc định tour batch thành `isPublic: false`.

---

## 3. KẾT QUẢ ĐẠT ĐƯỢC & BẰNG CHỨNG XÁC MINH (RESULTS & EVIDENCE)

### 📊 Bảng Tổng Hợp Kiểm Thử Tự Động:

| Bộ kiểm thử | Lệnh thực thi | Kết quả | Trạng thái |
|---|---|:---:|:---:|
| **Unit Tests Suite** | `npm test` | **699 / 699 passed (100%)**<br>(65 test files, 127.20s) | ✅ PASS (Exit Code 0) |
| **TypeScript Typecheck** | `npm run typecheck` (`tsc --noEmit`) | **0 errors** | ✅ PASS (Exit Code 0) |
| **Cloudflare Bundle Gate** | `npm run gate:free-first` | **2,271,069 bytes (2.16 MB)**<br>(Giới hạn: 3.0 MB, dư 28%) | ✅ PASS (Exit Code 0) |
| **Next.js Compile** | `npm run build:worker` | **57 / 57 routes compile thành công** | ✅ PASS (Exit Code 0) |

### 🔍 Bằng chứng giải trình `sharp` trong `npm audit`:
- Lệnh `npm ls sharp` chứng minh: `sharp` chỉ là dependency nội bộ của `miniflare` (công cụ giả lập test local của `@cloudflare/vitest-plugin` và `wrangler`).
- Script kiểm tra cấu trúc `.open-next` xác nhận: Cloudflare Workers build chạy thuần Edge V8 isolates, **hoàn toàn không đóng gói C++ native binary `sharp`** vào `worker.js`.

---

## 4. QUẢN LÝ GIT & LỊCH SỬ COMMITS (`/vibe-git-manager`)

- **Nhánh hiện tại:** `feature/v1.0.1-security-pricing-hardening`
- **Base Anchor:** `b64f795` (trên `main` - Tag `v1.0.0`)
- **Lịch sử các Commits trên nhánh:**
  1. `3a729c3`: *fix(security): resolve batch workspace authorization, demo multi-provider quota, pricing consistency, and security hardening*
  2. `2b5f419`: *docs: update CONTEXT.md with v1.0.1 security and pricing hardening state*
  3. `abb29b8`: *docs: add v1.0.1 security, pricing and quota hardening report*
  4. `3b2051b`: *fix(security): resolve kie provider quota leak, enforce batch allowlist, and unify pricing single source of truth*
  5. `24c9d9e`: *docs: add codex review dossier on mvp commercial readiness*
  6. `629927e`: *fix(security): resolve smart failover quota bypass and configure production generation toggle*
- **Trạng thái Working Tree:** Clean 100%, không còn file untracked hay thay đổi dở dang.

---

## 5. KẾ HOẠCH BÀN GIAO & CÔNG VIỆC TIẾP THEO (NEXT STEPS)

Khi Đại Ka mở Session mới, các bước thực hiện tiếp theo được khuyến nghị như sau:

### Bước 1: Push Nhánh & Tạo PR (`/vibe-git-manager`)
```bash
git push -u origin feature/v1.0.1-security-pricing-hardening
```
Tạo PR từ `feature/v1.0.1-security-pricing-hardening` vào `main`.

### Bước 2: Hợp Nhất & Gắn Tag Release v1.0.1
```bash
git checkout main
git merge feature/v1.0.1-security-pricing-hardening --ff-only
git tag -a v1.0.1 -m "HomeDesign v1.0.1 Commercial Release: Security, Quota & Pricing Hardened"
git push origin main --tags
```

### Bước 3: Triển Khai Cloudflare Workers Production
```bash
npm run deploy
```
Sau khi deploy, các security headers mới trong `next.config.ts` sẽ chính thức có hiệu lực trên `design.7app.online`.

### Bước 4: Kiểm Tra Trực Tiếp (Live Smoke Test)
- Kiểm tra curl headers: `curl -I https://design.7app.online` (xác nhận HSTS, nosniff, SAMEORIGIN).
- Kiểm tra nạp credits qua VietQR SePay và Stripe.
- Kích hoạt chiến dịch Pilot B2B gửi tour demo penthouse tới các Studio nội thất và Kiến trúc sư.

---

## 6. PROMPT DÀNH CHO ĐẠI KA KHI MỞ SESSION MỚI

*Đại Ka hãy copy toàn bộ đoạn prompt bên dưới để dán vào khung chat của Session mới:*

```markdown
Chào em, tiếp tục dự án HomeDesign AI Architecture Studio từ tài liệu bàn giao hoàn chỉnh:
docs/2026-09-19-sprint-11-phase-02-v1-0-1-hardening-and-pilot-b2b-handover.md

### VỊ TRÍ HIỆN TẠI CỦA DỰ ÁN:
- VỊ TRÍ: SPRINT 11 — PHASE 02: HOÀN TẤT BẢN VÁ v1.0.1 SECURITY, QUOTA & PRICING HARDENING (SẴN SÀNG MERGE VÀO MAIN ĐỂ RELEASE PILOT B2B).
- Branch hiện tại: feature/v1.0.1-security-pricing-hardening (Head Commit: 629927e).
- Base Rollback Anchor: main (Commit: b64f795 - Release Tag: v1.0.0).
- Trạng thái kiểm thử đã xác minh:
  + 699/699 unit tests PASSED 100% (exit code 0).
  + Typecheck (tsc --noEmit): 0 errors (exit code 0).
  + Gate Free-First: PASSED, compressed bundle 2.16 MB / 3.0 MB (exit code 0).
- Các hạng mục đã giải quyết dứt điểm:
  1. Quota bypass qua Smart Failover: Đã khóa van 2 lớp (smart-failover submit candidate trước + double-lock guard trong fetchOutput của Fal, Replicate, KIE).
  2. Single Source of Truth giá: pricing-constants.ts đã import thực tế 100% vào Stripe ($5/$9/$17/$32), SePay (200k/400k/700k/1.2M VND), Landing Page và Catalog.
  3. Thời hạn credits: Chuẩn hóa "Không giới hạn thời gian (Never expire)" đồng bộ 100% với D1 ledger.
  4. Batch allowlist: Chặn provider lạ (HTTP 400 INVALID_PROVIDER).
  5. Policy môi trường: Bật AI_GENERATION_ENABLED="true" trong wrangler.jsonc cho Production thương mại.
  6. Minh bạch npm audit: sharp thuộc devDependencies (miniflare test), không nằm trong worker bundle.

### NHIỆM VỤ TIẾP THEO CỦA SESSION NÀY:
Áp dụng /vibe-git-manager và /vibe-engineering-workflow:
1. Đẩy nhánh feature/v1.0.1-security-pricing-hardening lên GitHub remote origin.
2. Hợp nhất nhánh vào main (Fast-Forward merge) và gắn Git Tag v1.0.1.
3. Hướng dẫn/thực hiện deploy lên Cloudflare Workers (npm run deploy) để kích hoạt toàn bộ Security Headers và bản vá v1.0.1 lên live domain design.7app.online.
4. Chạy smoke test xác minh live headers và sẵn sàng chiến dịch Pilot B2B.

Bắt đầu kiểm tra trạng thái git và thực hiện bước tiếp theo giúp tôi!
```
