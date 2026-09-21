# Handoff Contract: Sprint 2 — Chuyển Tiếp Sang Phase 4 (Remediation & Fix P1/P2)

- **Ngày lập:** 14/09/2026
- **Từ Session:** Session Audit Toàn Diện (Behavioral, Security & SaaS Readiness)
- **Tới Session:** Session Thực Thi Vá Lỗi (Phase 4 Remediation)
- **Dự án:** HomeDesign Clone
- **Branch hiện tại:** `repository-main`
- **Rollback Anchor:** `b3eb5a8`
- **Tài liệu tham chiếu chi tiết:** [`docs/2026-09-14-comprehensive-audit-and-saas-banker-readiness-report.md`](file:///e:/monetwork/hmdesign/docs/2026-09-14-comprehensive-audit-and-saas-banker-readiness-report.md)

---

## 🎯 1. Mục Tiêu Của Session Vừa Qua
1. **Kiểm tra hành vi (Behavioral Audit):** Áp dụng skill `/behavior-model-debugger` theo phương pháp Steve Ruiz để rà soát toàn bộ trải nghiệm người dùng, các tương tác stateful (Canvas inpainting, Floor plan, Uploader, Session).
2. **Đánh giá rủi ro tài chính & bảo mật:** Xác minh xem hệ thống có bị lỗ tiền API khi người dùng gọi tạo ảnh không, có rò rỉ token/secret không, và có lỗ hổng bảo mật nào không.
3. **Thẩm định MVP chào hàng Bankers:** Đánh giá sản phẩm hiện tại theo tiêu chuẩn thẩm định giải ngân cho vay sửa nhà (Home Renovation Financing) của các ngân hàng.
4. **Mổ xẻ kinh tế dự án:** Phân tích cấu trúc chi phí (COGS), biên lợi nhuận gộp (Gross Margin), và cơ chế Credit Hold trong sổ cái bất biến (Immutable Credit Ledger).
5. **Chiến lược GTM:** Lên lộ trình 3 giai đoạn để kiếm tiền và tìm kiếm khách hàng B2C / B2B.

---

## 🛠️ 2. Những Việc Đã Làm Trong Session Này
- Đã đọc và nạp toàn bộ ngữ cảnh từ `CONTEXT.md`, `plans/`, `docs/`, `wrangler.jsonc`.
- Khảo sát mã nguồn 14 module trọng yếu của dự án (`src/app`, `src/components/design`, `src/components/floor-plan`, `src/lib/ai`, `src/lib/credits`, `src/lib/intake`, `src/lib/auth`).
- Chạy kiểm thử tự động xác minh đơn vị: Bộ test session (`session.test.ts`) đạt 10/10 tests passed.
- Lập ma trận va chạm quy tắc (Invariant Collision Matrix) và xác minh 5 điểm gãy trải nghiệm người dùng.
- Biên soạn tài liệu báo cáo phân tích toàn diện 7 phần tại `docs/2026-09-14-comprehensive-audit-and-saas-banker-readiness-report.md`.

---

## 📊 3. Kết Quả Cốt Lõi
1. **Rủi ro tài chính / Lỗ tiền API:** **HOÀN TOÀN AN TOÀN (Low Risk)**. Cơ chế Credit Hold khóa trước tín dụng, chỉ thanh toán (`settle`) khi ảnh hợp lệ, hoàn trả (`release`) khi lỗi; bản Public Demo chặn nạp giả lập và chốt trần 50 calls/ngày. Biên lợi nhuận gộp đạt 90% - 95%.
2. **Bảo mật:** Phát hiện 1 điểm SQLi trong script seed admin (`src/lib/auth/admin.ts:L45`) và 1 điểm OOM do buffer trực tiếp ở upload local (`src/app/api/assets/[id]/upload/route.ts:L25`).
3. **Trải nghiệm người dùng:** Phát hiện 5 lỗi P1/P2 cần vá:
   - **Bug 1 (P1):** Cọ Inpainting lệch tọa độ do letterbox và lag do thiếu `beginPath()`.
   - **Bug 2 (P1):** Nét vẽ mask inpainting không được truyền vào form và bị vứt bỏ khi submit.
   - **Bug 3 (P1):** Bấm ảnh mẫu `.webp` bị Server chặn `400 INVALID_INPUT`.
   - **Bug 4 (P2):** Kéo thả file làm trình duyệt nhảy trang do thiếu `onDrop` trên thẻ dropzone.
   - **Bug 5 (P2):** Chấm marker trên sơ đồ mặt bằng có `pointer-events-none` làm tranh chấp click với canvas.
4. **Chào hàng Bankers:** Đạt **5.5 / 10** $\rightarrow$ **Chưa nên chào hàng tuần này**. Cần fix sạch 5 lỗi UX và bổ sung tính năng xuất hồ sơ phương án cải tạo.

---

## 🧭 4. Định Vị Hiện Tại: Đang Làm Tới Đâu?
- **Sprint:** **Sprint 2 — Behavioral Audit & Production Readiness** (Kế hoạch gốc: `plans/260913-1810-behavioral-audit-and-production-readiness/plan.md`)
- **Các Phase của Sprint 2:**
  - `Phase 1: Auth and deployment smoke` $\rightarrow$ **ĐÃ HOÀN THÀNH** (đã ghi nhận ở `docs/2026-09-13-sprint-02-phase-01-auth-deploy-audit.md`).
  - `Phase 2: Generation, credit and asset lifecycle audit` $\rightarrow$ **ĐÃ HOÀN THÀNH** (đã kiểm tra và lập báo cáo chi tiết).
  - `Phase 3: Library, sharing, admin and floor-plan audit` $\rightarrow$ **ĐÃ HOÀN THÀNH** (đã kiểm tra và lập báo cáo chi tiết).
  - `Phase 4: Remediation and release decision` $\rightarrow$ **👉 ĐÂY LÀ PHẦN TIẾP THEO CẦN LÀM Ở SESSION MỚI**.

---

## 🚦 5. `/vibe-engineering-workflow` Làm Gì Tiếp Theo Ở Session Mới?
Theo ma trận định tuyến công việc, công việc tiếp theo thuộc **Nhóm 3 (Clear & Large)** được chia nhỏ thành 4 Vertical Tickets độc lập theo nguyên tắc phẫu thuật chính xác (Surgical Changes):

1. **Ticket 1 (Dropzone Fix):** Gắn `onDrop` và `onDragOver` vào `src/components/design/uploader.tsx`.
2. **Ticket 2 (WebP Sample Presets Fix):** Bổ sung `image/webp` vào `VALID_UPLOAD_MIMES` và `UploadIntentSchema`, hoặc chuyển file mẫu sang `.jpg`.
3. **Ticket 3 (Inpainting Canvas & Mask Pipeline Fix):** Sửa tỷ lệ hiển thị, chống lag nét vẽ trong `brush-mask-canvas.tsx`, truyền callback `onMaskChange` vào `design-form.tsx` và gửi kèm payload.
4. **Ticket 4 (Floor Plan Marker Click Fix):** Bỏ `pointer-events-none` trên marker pin, gắn sự kiện `onClick` chuyển phòng.
5. **Ticket 5 (Security Clean-up):** Tham số hóa câu lệnh SQL trong `admin.ts`.

---

## 🌿 6. `/vibe-git-manager`: Chiến Lược Phân Nhánh & Commit Cho Session Mới
- **Commit tài liệu hiện tại:** Đã stage và commit 2 file tài liệu báo cáo & handoff vào branch `repository-main`.
- **Chiến lược cho Session mới:**
  - Tạo nhánh mới: `git checkout -b fix/sprint-02-phase-04-ux-and-security`
  - Thực hiện từng ticket $\rightarrow$ Chạy test kiểm chứng $\rightarrow$ Commit riêng từng ticket theo chuẩn Conventional Commits:
    - `fix(uploader): attach drag and drop handlers to prevent navigation hijack`
    - `fix(intake): accept webp format for sample presets in upload schema`
    - `fix(canvas): align inpainting coordinates and retain mask in form submission`
    - `fix(floor-plan): allow direct marker click selection without repositioning`
    - `sec(admin): sanitize sql statements in admin database seeding`
  - Sau khi hoàn thành toàn bộ test $\rightarrow$ Hướng dẫn Đại Ka merge hoặc tạo PR về `repository-main`.

---

## 📋 7. Master Prompt Sẵn Sàng Copy-Paste Cho Session Mới

Đại Ka chỉ cần mở một session mới và dán toàn bộ đoạn văn bản dưới đây:

```text
Chào em, tiếp tục dự án HomeDesign Clone từ tài liệu Handoff: docs/2026-09-14-sprint-02-session-handoff.md.

Chúng ta đang ở Sprint 2 — Phase 4: Remediation and Release Decision.
Nhiệm vụ của session này: Kích hoạt /vibe-git-manager và /vibe-engineering-workflow để thực thi tuần tự 5 vertical tickets đã được định nghĩa trong tài liệu handoff:
1. Ticket 1: Sửa Dropzone kéo thả ảnh trong uploader.tsx (tránh bị nhảy trang).
2. Ticket 2: Sửa lỗi WebP cho bộ ảnh mẫu trong uploader.tsx và validation schema.
3. Ticket 3: Căn chuẩn tọa độ cọ vẽ Inpainting, chống lag nét vẽ và nối mask data vào form submit.
4. Ticket 4: Tách biệt sự kiện click Marker trên Floor Plan canvas.
5. Ticket 5: Khắc phục SQL injection trong admin.ts seeding script.

Yêu cầu thực thi:
- Tạo nhánh làm việc: fix/sprint-02-phase-04-ux-and-security từ anchor b3eb5a8.
- Làm từng ticket một (Surgical Changes), chạy test xác minh sau mỗi ticket.
- Tuân thủ nghiêm ngặt quy tắc xưng hô: luôn gọi tôi là "Đại Ka" và trả lời bằng tiếng Việt.
Báo cáo lại kế hoạch bắt đầu Ticket 1 ngay khi nhận lệnh!
```
