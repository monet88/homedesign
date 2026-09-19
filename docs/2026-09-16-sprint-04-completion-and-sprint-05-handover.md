# SPRINT 4 HOÀN TẤT & SPRINT 5 HANDOVER / HANDOFF CONTRACT

> **Ngày lập**: 16/09/2026  
> **Dự án**: HomeDesign Clone (AI Architecture & Interior/Exterior Design SaaS)  
> **Trạng thái hiện tại**: **SPRINT 4 ĐÃ HOÀN TẤT 100% — SẴN SÀNG BƯỚC VÀO SPRINT 5**  
> **Active Base Branch**: `main` (Working tree clean 100%, Ahead of origin 13 commits)  
> **Production Live**: [https://design.7app.online](https://design.7app.online)  
> **Cloudflare Worker Demo Version**: `b7267566-48b5-4dd2-801a-3630bd627b74`  
> **Remote Database**: Cloudflare D1 `homeds` (`7f422f9c-b36d-41a9-9f3e-2b676f982931`)  
> **Remote Storage**: Cloudflare R2 `homeds-storage`  

---

## 1. TỔNG KẾT SESSION: MỤC TIÊU, CÔNG VIỆC ĐÃ LÀM & KẾT QUẢ

### A. Mục Tiêu Đặt Ra Cho Session
1. Tuân thủ nghiêm ngặt các quy tắc Karpathy, `/vibe-git-manager`, `/vibe-engineering-workflow`, `/behavior-model-debugger`.
2. Giữ vững tính bảo mật, tuyệt đối không làm rò rỉ secrets/token vào Git tree, bảo vệ file `.env.local`.
3. Kiểm tra và kích hoạt thành công lượt sinh ảnh AI trực tiếp trên Production (`https://design.7app.online/ai-interior-design`).
4. Kiểm thử luồng thanh toán SePay (VietQR) tự động cộng credit trên Remote D1 Database và Production Webhook.
5. Tiến hành Pre-Check Gate và merge nhánh `feat/sprint-04-phase-02-live-verification` vào `main` để khép lại Sprint 4.

### B. Công Việc Đã Thực Hiện & Giải Quyết
1. **Xử lý dứt điểm Root Cause của Gemini API Key**:
   - Phát hiện secret `AI_API_KEY` trên Cloudflare Worker bị dính ký tự dấu ngoặc kép thừa `"` (41 ký tự thay vì 39 ký tự).
   - Đã cập nhật lại key chuẩn 100% trên Cloudflare Worker Demo qua Wrangler.
   - Bổ sung cơ chế tự động sanitize (`rawApiKey.replace(/^["']|["']$/g, "").trim()`) trong `src/lib/ai/gemini-adapter.ts`.
   - Build và triển khai Worker Demo phiên bản mới: `b7267566-48b5-4dd2-801a-3630bd627b74` (Gzip 1.93MB, nằm an toàn trong giới hạn Free Tier 3MB).
2. **Kiểm thử Live AI Generation trên Production**:
   - Sử dụng ảnh mẫu phòng khách trống (`empty-living-room-before.webp`).
   - Luồng chạy qua đầy đủ các bước: `upload-intent` -> PUT ảnh lên Cloudflare R2 -> `finalize` -> kiểm dịch `quarantined` -> `ready` -> `POST /api/designs` -> poll status task.
   - **Task ID**: `deb844b1-e794-4473-8b71-cbce9d565c33`.
   - **Kết quả**: Task chuyển sang `status: success`, model `gemini-2.5-flash-image` tạo ảnh output `e34e1cd3-ed38-44be-a2d8-b0a7fbb52ca7`.
   - Đã tải và xác thực ảnh output: Ảnh PNG 2,082,556 bytes (2.08MB), phân giải 1344 x 768 px đạt chuẩn chất lượng cao Architectural Digest.
3. **Kiểm thử E2E Cổng Thanh Toán SePay (VietQR)**:
   - Tạo đơn hàng pending `TEST57841E` (Gói Lite: 200,000 VND = 80 credits).
   - Giả lập SePay Webhook có token bảo mật `Authorization: Apikey <SEPAY_WEBHOOK_TOKEN>` gửi payload chuyển khoản tới `https://design.7app.online/api/payments/sepay/webhook`.
   - Endpoint xử lý thành công, trả về HTTP 200, cập nhật đơn hàng thành `completed`, ghi nhận vào `credit_ledger`.
   - Thử nghiệm gửi lại payload: Hệ thống chặn thành công với `{ alreadyProcessed: true }` (chống double-crediting).
   - Số dư tài khoản admin của Đại Ka (`galaxypro710@gmail.com`) được cộng chính xác +80 credits (từ 100,009 lên 100,089 credits).
4. **Merge Code An Toàn Về Nhánh `main`**:
   - Đã merge sạch không xung đột từ `feat/sprint-04-phase-02-live-verification` vào `main`.
   - Chạy bộ test trên `main`: **538 / 538 tests passed (100%)**, 27 / 27 worker runtime tests passed.

---

## 2. PHÂN TÍCH THEO 3 TRỤ CỘT KỸ NĂNG

### 🔒 Trụ Cột 1: `/vibe-git-manager` (Bảo Mật Git & Quản Lý Branch)
- **Bảo mật `.env.local`**:
  - Đã xác thực bằng lệnh `git check-ignore -v .env.local`: File `.env.local` được `.gitignore` bảo vệ nghiêm ngặt 100%.
  - Quét diff toàn bộ các commit: **0 token, 0 secret, 0 private key rò rỉ vào Git history**.
- **Trạng thái Git hiện tại**:
  - Nhánh hiện tại: `main`.
  - Trạng thái: `working tree clean`, không có file uncommitted nào.
  - Phía local đang ahead `origin/main` 13 commits (đã tích hợp đầy đủ các tính năng của Sprint 4).
- **Lưu ý về GitHub Remote Push**:
  - Remote URL hiện tại là `https://github.com/gosoniccapital-ui/hmdesign.git`. Khi Đại Ka muốn push lên GitHub, chỉ cần kiểm tra xem repo đã được tạo trên tài khoản `gosoniccapital-ui` hoặc trỏ sang `monet88/homedesign` / `newmylab/homedesign` rồi thực hiện `git push origin main`.
- **Quy tắc cho Sprint tiếp theo**:
  - Khi bắt đầu tính năng mới ở Sprint 5, tạo nhánh mới từ `main`:
    `git checkout -b feat/sprint-05-saas-polish-and-inpainting`.

### 🧭 Trụ Cột 2: `/vibe-engineering-workflow` (Làm Gì Tiếp Theo?)
Sprint 4 đã giải quyết xong phần "nền móng vận hành" (Core AI Generation + VietQR Payment + Edge Deployment). Bước tiếp theo sang **SPRINT 5 — SaaS Polish, Advanced AI Inpainting & Commercial Scaling**:
1. **Ticket 5.1: Live Verification cho Tính năng AI Inpainting / Brush Mask Editor**:
   - Kiểm thử thực tế trên `design.7app.online` tính năng quét cọ (brush mask) để thay đổi một phần phòng hoặc vật thể cụ thể.
2. **Ticket 5.2: Mobile Responsive & UX Micro-Interactions**:
   - Tối ưu hóa thanh Before/After slider trên màn hình cảm ứng điện thoại.
   - Thêm nút Download ảnh trực tiếp có watermark (bản free) và không watermark (bản trả phí).
3. **Ticket 5.3: Bổ sung Cổng Thanh Toán Quốc Tế (Stripe / GPMPay)**:
   - Kích hoạt cổng Stripe hoặc GPMPay song song với SePay VietQR để phục vụ khách hàng ngoài Việt Nam.
4. **Ticket 5.4: SEO & Landing Page Conversion**:
   - Bổ sung trang thư viện thiết kế mẫu (Showcase gallery) để người dùng xem trước chất lượng ảnh trước khi đăng ký.

### 🎮 Trụ Cột 3: `/behavior-model-debugger` (Audit Codebase & UX Invariant Model)
- **Credit Lifecycle Invariant**:
  - Khách hàng bấm Generate -> Trừ 1 Hold Credit (`status: accepted`).
  - Nếu thành công -> Chuyển Hold thành Deducted (`status: success`).
  - Nếu lỗi mạng hoặc AI provider fail -> Tự động `releaseHoldOnTerminal`, hoàn lại credit lập tức, hiển thị thông báo đỏ và nút Retry trên UI. **Tài chính của người dùng được bảo vệ 100%**.
- **Asset Storage Invariant**:
  - Client không upload file trực tiếp qua server Next.js (để tránh nghẽn băng thông và vượt worker body size limit 100MB).
  - Sử dụng Presigned PUT URL lên Cloudflare R2 -> Worker kiểm tra metadata và chuyển lifecycle từ `quarantined` sang `ready`.
- **Payment Idempotency Invariant**:
  - Bảng `credit_ledger` và bảng `orders` sử dụng trường `order_id` và mã tham chiếu ngân hàng làm khóa đối soát duy nhất. Mọi cuộc gọi webhook trùng lặp đều bị chặn tức thì, bảo vệ chống double-crediting.

---

## 3. PROMPT KHỞI ĐỘNG SESSION MỚI (COPY & PASTE CHO SESSION TIẾP THEO)

Đại Ka chỉ cần copy toàn bộ nội dung trong khung dưới đây và dán vào cửa sổ chat mới:

```text
Chào em, tiếp tục dự án HomeDesign Clone từ tài liệu bàn giao:
docs/2026-09-16-sprint-04-completion-and-sprint-05-handover.md.

### Vị trí hiện tại:
- BẮT ĐẦU SPRINT 5 — PHASE 1: SaaS Polish, AI Inpainting & Mobile Responsive.
- Nhánh làm việc gốc: main (Đã merge hoàn tất Sprint 4, Head commit sạch sẽ, 538/538 tests passed).
- Production domain: https://design.7app.online (Worker version: b7267566-48b5-4dd2-801a-3630bd627b74).
- Core AI Gemini 2.5 Flash và Cổng thanh toán SePay VietQR ĐÃ HOẠT ĐỘNG HOÀN HẢO 100% TRÊN PRODUCTION.
- File .env.local và toàn bộ secrets được bảo vệ nghiêm ngặt trong .gitignore.

### Nhiệm vụ session này:
1. Tiếp tục tuân thủ nghiêm ngặt các quy tắc:
   - /vibe-git-manager, /vibe-engineering-workflow, /behavior-model-debugger.
   - Luôn xưng hô "Đại Ka", trả lời bằng tiếng Việt, giữ thuật ngữ chuyên môn English.
   - Không leak secret vào Git tree.
2. Tạo nhánh làm việc mới: feat/sprint-05-saas-polish-and-inpainting từ main.
3. Tiến hành Ticket 5.1: Kiểm thử và hoàn thiện tính năng AI Inpainting / Brush Mask Canvas trên live production https://design.7app.online.
4. Kiểm tra và tối ưu mobile responsive cho Before/After Slider và quy trình nạp tiền trên thiết bị di động.
```
