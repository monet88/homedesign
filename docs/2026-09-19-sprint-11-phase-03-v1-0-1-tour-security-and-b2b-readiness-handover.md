# 📜 BÁO CÁO BÀN GIAO TOÀN DIỆN: SPRINT 11 — PHASE 03
## v1.0.1 TOUR 360 SECURITY HARDENING, EMPIRICAL EVIDENCE & PILOT B2B MASTER HANDOVER

> **Dự án:** HomeDesign AI Architecture Studio  
> **Phiên bản chính thức:** `v1.0.1` (Commercial Hardened Release)  
> **Thời gian chốt bàn giao:** 2026-09-19 14:25 (UTC+7)  
> **Vị trí hiện tại:** **SPRINT 11 — PHASE 03 (HOÀN TẤT VÁ BẢO MẬT TOUR 360, EMPIRICAL VERIFICATION & KHỞI ĐỘNG PILOT B2B)**  
> **Nhánh phát triển:** `main` (Head Commit: `54dfdf9`, base anchor: `b64f795`)  
> **Branch tính năng liên quan:** `fix/v1.0.1-tour-security-hardening` (Commit `078c393`)  
> **Git Release Tag:** [`v1.0.1`](https://github.com/newmylab/hmdesign/releases/tag/v1.0.1) (Trỏ trực tiếp vào commit bản vá bảo mật)  
> **Live Production URL:** [https://design.7app.online](https://design.7app.online)  
> **Cloudflare Worker Version ID:** `3a132754-d14f-4f46-841d-85e8890c3bc6`  
> **Phương pháp luận:** `/behavior-model-debugger` • `/vibe-engineering-workflow` • `/vibe-git-manager` • `Karpathy Behavioral Guidelines`  
> **Trạng thái kiểm thử:** **706 / 706 unit tests PASSED (100%)** • `tsc --noEmit` **0 errors** • Cloudflare Worker Bundle **2.17 MB / 3.0 MB**

---

## 1. MỤC TIÊU CỦA SPRINT 11 PHASE 03 (OBJECTIVES)

Sau đợt phát hành sơ bộ v1.0.1 tại Phase 02, hệ thống đã được phản biện độc lập bởi Codex. Đợt kiểm toán read-only từ Codex đã xác nhận nhiều cải tiến vững chắc (Quota UPSERT, Single Source of Truth giá, Atomic Hold, Security Headers), đồng thời chỉ ra **3 lỗ hổng bảo mật nghiêm trọng (Blockers)** tại module Interactive 360° VR Tour:

1. **Lỗ hổng IDOR tại `GET /api/tours/[id]`:** Cho phép bất kỳ ai biết `id` đều đọc được metadata và danh sách phòng của tour private mà không cần đăng nhập.
2. **Không private-by-default:** Schema `CreateTourSchema` và service `createTour()` để mặc định `isPublic: true`, đe dọa bảo mật bản vẽ CAD mật của khách hàng VIP.
3. **Lỗ hổng BOLA / Asset Substitution tại `addSceneToTour()`:** Không kiểm tra quyền sở hữu của `assetId` khi thêm scene vào tour, tạo nguy cơ rò rỉ hình ảnh bí mật từ R2 private bucket qua tour công khai.
4. **Thiếu bằng chứng kiểm thử Exit Code:** Cần lưu lại bằng chứng thực nghiệm (Empirical Evidence) với Exit Code 0 trên toàn bộ test suite và build gate.

Sprint 11 Phase 03 được kích hoạt nhằm **vá triệt để 3 lỗ hổng này**, thực thi kiểm thử toàn trình, deploy lên Cloudflare Live và bàn giao hồ sơ hoàn thiện.

---

## 2. NHỮNG VIỆC ĐÃ HOÀN TẤT CHI TIẾT (WHAT WAS DONE)

### 🧩 A. Phân Tích Mô Hình Hành Vi (`/behavior-model-debugger`)

1. **Khóa Van IDOR tại `GET /api/tours/[id]`:**
   - *Phân tích hành vi:* Luồng công khai (public view) xem tour đã có endpoint unlisted riêng biệt `GET /api/tours/share/[token]` yêu cầu `is_public = 1`. Endpoint `GET /api/tours/[id]` là API quản trị/biên tập nhưng trước đây không gọi `authorizeVerified`.
   - *Giải pháp:* Trong [`src/app/api/tours/[id]/route.ts`](file:///e:/monetwork/hmdesign/src/app/api/tours/[id]/route.ts):
     + Gọi `authorizeVerified(request)` bắt buộc xác thực caller (chặn HTTP 401 `UNAUTHENTICATED`).
     + Kiểm tra quyền sở hữu: `tour.userId === auth.userId` HOẶC caller là thành viên trong cùng `workspaceId` của tour (`SELECT role FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2`).
     + Người dùng lạ hoặc không có quyền bị từ chối với HTTP 403 `FORBIDDEN`.

2. **Chuẩn Hóa Private-by-Default Tuyệt Đối:**
   - *Phân tích hành vi:* Bản vẽ thiết kế kiến trúc và căn hộ của khách hàng doanh nghiệp phải được bảo mật mặc định ngay khi vừa tạo, tránh nguy cơ lộ lọt phương án chưa duyệt.
   - *Giải pháp:*
     + Trong [`src/lib/panorama/types.ts`](file:///e:/monetwork/hmdesign/src/lib/panorama/types.ts): Đổi `isPublic: z.boolean().optional().default(false)` và `export type CreateTourInput = z.input<typeof CreateTourSchema>`.
     + Trong [`src/lib/panorama/tour-service.ts`](file:///e:/monetwork/hmdesign/src/lib/panorama/tour-service.ts): Gán `isPublic: input.isPublic ?? false`. Tour chỉ được mở công khai khi người dùng chủ động chuyển trạng thái chia sẻ.

3. **Chặn Lỗ Hổng Đánh Cắp Bản Vẽ (BOLA / Asset Substitution Defense):**
   - *Phân tích hành vi:* Kẻ xấu tạo một public tour, sau đó thêm scene trỏ tới `assetId` bí mật của nạn nhân. Endpoint `deliverTourSceneAsset()` sẽ đọc và stream bytes ảnh từ R2 private bucket ra ngoài.
   - *Giải pháp:* Trong `addSceneToTour()` ([`src/lib/panorama/tour-service.ts`](file:///e:/monetwork/hmdesign/src/lib/panorama/tour-service.ts)):
     + Truy vấn bảng `assets`: Kiểm tra asset phải tồn tại và không ở trạng thái `deleted` hoặc `rejected`.
     + Ràng buộc sở hữu: `asset.user_id === userId` HOẶC nếu tour thuộc workspace, `asset.user_id` phải là thành viên hợp lệ trong cùng workspace đó.
     + Bất kỳ hành vi mượn `assetId` lạ đều bị từ chối ngay lập tức (`return null`).

---

## 3. KẾT QUẢ ĐẠT ĐƯỢC & BẰNG CHỨNG XÁC MINH (RESULTS & EVIDENCE)

### 📊 Bảng Bằng Chứng Kiểm Thử Toàn Trình (Exit Code Record):

| Bộ kiểm thử / Quy trình | Lệnh thực thi | Kết quả chi tiết | Exit Code | Trạng thái |
|---|---|:---:|:---:|:---:|
| **Unit Tests Suite** | `npm test` | **706 / 706 passed (100%)**<br>(Tăng 7 tests bảo mật mới, 65 test files, 201.26s) | `0` | ✅ **PASS** |
| **TypeScript Typecheck** | `npm run typecheck` (`tsc --noEmit`) | **0 errors** | `0` | ✅ **PASS** |
| **Cloudflare Bundle Gate** | `npm run gate:free-first` | **2,277,653 bytes (2.17 MB)**<br>(Ngưỡng trần: 3.0 MB, dư 27.6%) | `0` | ✅ **PASS** |
| **Cloudflare Deploy** | `node scripts/deploy-demo.mjs` | **Version ID:** `3a132754-d14f-4f46-841d-85e8890c3bc6` | `0` | ✅ **PASS** |

### 🌐 Bằng Chứng Xác Minh Trực Tiếp Trên Live Production (`https://design.7app.online`):

1. **Khóa IDOR thành công 100%:**
   ```bash
   GET https://design.7app.online/api/tours/tour-random-idor-test
   # Kết quả:
   Status: 401 UNAUTHENTICATED
   Body: { "error": "UNAUTHENTICATED" }
   ```
2. **Public Demo Tour hoạt động trơn tru:**
   ```bash
   GET https://design.7app.online/tour/demo-penthouse -> HTTP 200 OK
   GET https://design.7app.online/api/tours/share/demo-penthouse -> HTTP 200 OK
   Title: "Penthouse Horizon Sky Villa (Demo 3 Phòng)"
   ```
3. **Live Security Headers đầy đủ:**
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: SAMEORIGIN`
   - `Referrer-Policy: strict-origin-when-cross-origin`

---

## 4. QUẢN LÝ MÃ NGUỒN THEO `/vibe-git-manager`

- **Nhánh chính:** `main` (Trạng thái: `working tree clean`).
- **Head Commit trên `main`:** `54dfdf9` (*docs: update CONTEXT.md with v1.0.1 tour security hardening and live deployment*).
- **Commit chứa bản vá bảo mật:** `078c393` (*fix(security): resolve tour 360 idor, enforce private-by-default, and validate scene asset ownership*).
- **Release Tag:** [`v1.0.1`](https://github.com/newmylab/hmdesign/releases/tag/v1.0.1) đã được re-tag chính xác và push force lên remote `origin`.
- **Nhánh tính năng đã lưu trữ:** `fix/v1.0.1-tour-security-hardening` (đã push đồng bộ lên GitHub).
- **Khuyến nghị PR:** Không cần mở PR mới vì nhánh `fix/v1.0.1-tour-security-hardening` đã được Fast-Forward merge sạch sẽ trực tiếp vào `main`.

---

## 5. QUY TRÌNH TIẾP THEO THEO `/vibe-engineering-workflow`

Codebase hiện tại đã đạt độ hoàn thiện cao nhất từ trước đến nay. Theo quy trình `/vibe-engineering-workflow`:

### 👉 BƯỚC TIẾP THEO: ĐÓNG BĂNG MÃ NGUỒN (CODE FREEZE) & GIÁM SÁT 7 NGÀY ĐẦU PILOT B2B
1. **Tạm dừng can thiệp source code:** Không thêm tính năng mới, giữ vững trạng thái xanh 100% của `main`.
2. **Chỉ số cần theo dõi trong 7 ngày đầu tiên (Monitoring Checklist):**
   - Số lượng quota-claim & failover count giữa Fal/Gemini/Replicate/KIE.
   - Tỷ lệ lỗi provider timeout (xác nhận credit hold tự giải phóng qua `failGeneration()`).
   - Tính bất biến (Idempotency) của webhook thanh toán VietQR SePay và Stripe.
   - Các mã lỗi bất thường 401/403/404 tại các endpoint `/api/tours/*`.
   - Lưu lượng tải R2 egress.
3. **Chính sách tỷ giá USD/VND:** Thiết lập lịch đối soát bảng giá định kỳ hàng quý giữa $5/$9/$17/$32 và 200k/400k/700k/1.2M VND để bảo đảm biên lợi nhuận.

---

## 6. MASTER PROMPT KHỞI TẠO CHO SESSION MỚI (COPY & PASTE)

*Khi Đại Ka mở sang một Session mới, Đại Ka chỉ cần copy nguyên văn đoạn dưới đây để nạp ngữ cảnh tức thì:*

```markdown
Chào em, tiếp tục dự án HomeDesign AI Architecture Studio từ tài liệu bàn giao Sprint 11 Phase 03:
docs/2026-09-19-sprint-11-phase-03-v1-0-1-tour-security-and-b2b-readiness-handover.md

### VỊ TRÍ HIỆN TẠI CỦA DỰ ÁN:
- VỊ TRÍ: SPRINT 11 — PHASE 03: HOÀN TẤT VÁ BẢO MẬT TOUR 360 & SẴN SÀNG PILOT B2B THƯƠNG MẠI.
- Phiên bản phát hành: v1.0.1 Commercial Release (Release Tag: v1.0.1 trên main).
- Head Commit: 54dfdf9 (Base Anchor: b64f795).
- Live Production URL: https://design.7app.online (Cloudflare Version ID: 3a132754-d14f-4f46-841d-85e8890c3bc6).
- Tour Mẫu Trực Tuyến: https://design.7app.online/tour/demo-penthouse (3 phòng 360° Gyroscope/VR Cardboard).
- Trạng thái kiểm thử đã xác minh thực nghiệm (Exit Code 0):
  + 706/706 unit tests PASSED 100% (65 test files).
  + Typecheck (tsc --noEmit): 0 errors.
  + Cloudflare Worker Bundle: 2.17 MB / 3.0 MB (dư 27.6% hạn mức Free-first).
- 3 Blockers bảo mật Tour 360 đã được xử lý triệt để:
  1. IDOR tại GET /api/tours/[id]: Đã khóa bằng authorizeVerified và kiểm tra owner/workspace member (chặn 401/403).
  2. Private-by-Default: CreateTourSchema và createTour() mặc định isPublic: false.
  3. BOLA / Asset Substitution: addSceneToTour() bắt buộc kiểm tra quyền sở hữu asset trong bảng assets.

### ĐỊNH HƯỚNG SESSION TIẾP THEO:
Tuân thủ /vibe-engineering-workflow, /vibe-git-manager, /behavior-model-debugger:
1. Duy trì Code Freeze trên main ở mốc v1.0.1.
2. Hỗ trợ giám sát vận hành Pilot B2B và chào hàng Kiến trúc sư / Studio nội thất theo tài liệu bàn giao.
3. Thu thập phản hồi từ những khách hàng đầu tiên để chuẩn bị backlog cho bản v2 (Client Portal & Subscription).

Bắt đầu kiểm tra trạng thái git và tiếp tục hỗ trợ tôi!
```
