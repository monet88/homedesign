# BÁO CÁO TOÀN DIỆN SPRINT 5 — PHASE 2: AUDIT, REFACTOR, SECURITY & DEPLOYMENT

> **Ngày lập**: 16/09/2026  
> **Dự án**: HomeDesign Clone (Next.js 15, Cloudflare Workers OpenNext, Gemini 2.5 Flash, SePay, Stripe)  
> **Giai đoạn**: **SPRINT 5 — PHASE 2 HOÀN TẤT & SẴN SÀNG RELEASE**  
> **Nhánh làm việc**: `feat/sprint-05-saas-polish-and-inpainting` (PR #1)  
> **Tác giả & Đánh giá**: CEO / Lead PM AI Studio  

---

## 1. TỔNG KẾT SESSION: MỤC TIÊU, VIỆC ĐÃ LÀM & KẾT QUẢ

### A. Mục Tiêu Đặt Ra Cho Session
1. **Tuân thủ kỷ luật kỹ thuật & quản trị**:
   - `/vibe-git-manager`: Kiểm tra Git hygiene, bảo vệ secrets, phân tích diff trước commit.
   - `/vibe-engineering-workflow`: Xác lập lộ trình Release chuẩn (Commit/Push -> Audit -> Build -> Deploy).
   - `/behavior-model-debugger`: Bóc tách Behavioral Model, Ma trận va chạm luật chơi (Invariant Collision Matrix), Security & Refactor Audit.
2. **Triển khai 3 Ticket trọng tâm của Sprint 5 — Phase 2**:
   - **Ticket 5.3 (Studio Shortcuts & Mask Undo/Redo)**: Bổ sung phím tắt `[` / `]` để tăng/giảm Brush Size, `Ctrl+Z` / `Cmd+Z` để Undo nét vẽ mask, `Ctrl+Shift+Z` / `Ctrl+Y` để Redo, kèm nút UI trực quan trên thanh toolbar.
   - **Ticket 5.4 (Tích hợp Stripe song song VietQR)**: Nâng cấp `MockPaymentModal` với tab chuyển đổi VietQR (Nội địa 24/7) và Stripe Checkout (Quốc tế / Thẻ).
   - **Ticket 5.5 (Showcase Gallery & Conversion CTA)**: Bổ sung Thumbnail Grid bên dưới slider Before/After và nút CTA "Thiết kế kiểu này" chuyển đổi nhanh sang Studio.
3. **Giải đáp rõ ràng thắc mắc về `GITHUB_TOKEN`** trong `.env.local`.

---

### B. Những Việc Đã Làm (What Was Done)
1. **Phân tích danh tính token GitHub**:
   - Xác định chính xác token trong `.env.local` thuộc về account `gosoniccapital-ui` (David Cool Dev), không có quyền trên `newmylab/hmdesign` (trả về 404). Việc `git push origin` thành công là nhờ Git Credential Manager của Windows.
2. **Cập nhật `src/components/design/brush-mask-canvas.tsx` & Test**:
   - Tích hợp state `historyRef` lưu trữ các snapshot `ImageData` (giới hạn 25 states chống leak RAM).
   - Bổ sung phím tắt toàn cục `[` và `]` để tăng/giảm kích thước cọ vẽ.
   - Bổ sung phím tắt `Ctrl+Z` / `Cmd+Z` (Undo) và `Ctrl+Y` / `Ctrl+Shift+Z` (Redo).
   - Đảm bảo phím tắt tự động bỏ qua khi người dùng đang nhập văn bản trong `<input>`, `<textarea>`, `<select>` hoặc `contenteditable`.
   - Bổ sung các nút bấm Undo/Redo trực quan trên toolbar.
   - Cập nhật test suite `brush-mask-canvas.test.tsx` đạt 4/4 tests pass (100%).
3. **Cập nhật `src/components/payments/mock-payment-modal.tsx`**:
   - Thêm tab chọn phương thức thanh toán linh hoạt: **VietQR** (VND) và **Thẻ Quốc Tế / Stripe** (USD).
   - Kết nối trực tiếp với backend `POST /api/payments/stripe/checkout`.
   - Thêm cơ chế graceful fallback: Nếu `STRIPE_SECRET_KEY` chưa nạp trong môi trường, hiển thị thông báo nhẹ nhàng hướng dẫn người dùng chuyển sang VietQR thay vì gây crash app.
4. **Cập nhật `src/components/landing/before-after.tsx`**:
   - Thêm bộ sưu tập **Thumbnail Showcase Grid** trực quan bên dưới thanh slider so sánh.
   - Người dùng click vào mẫu nào, slider Before/After tự động chuyển sang mẫu đó ngay lập tức.
   - Thêm nút CTA **"Thiết kế kiểu này →"** dẫn thẳng vào Studio tương ứng (`/ai-interior-design`, `/ai-exterior-design`, `/ai-floor-plan`).
5. **Cập nhật Living Spec**:
   - Cập nhật [`implementation_notes.html`](file:///e:/monetwork/hmdesign/implementation_notes.html) chuẩn Karpathy guidelines.

---

### C. Kết Quả Xác Thực (Verification Results)
- **Unit Test Suite**: Chạy toàn bộ test suite dự án đạt **541/541 tests passed (100%)** trên 34 files kiểm thử:
  - `src/components/design/brush-mask-canvas.test.tsx`: 4/4 passed.
  - `src/app/api/payments/stripe/stripe-api.test.ts`: 7/7 passed.
  - `src/app/api/payments/sepay/sepay-api.test.ts`: 9/9 passed.
  - `src/app/api/designs/design-api.test.ts`: 48/48 passed.
- **Git Hygiene**: 0 secrets trong diff, `.env.local` được bảo vệ nghiêm ngặt.

---

## 2. BÁO CÁO PHÂN TÍCH CHUYÊN GIA (CEO & LEAD PM PERSPECTIVE)

### Quyết định: Commit & Push lên PR #1 TRƯỚC hay Build & Deploy Cloudflare Worker luôn?

> **Lựa chọn chuyên môn của CEO / Lead PM**: **BẮT BUỘC Commit & Push lên PR #1 TRƯỚC khi Deploy lên Production**.

#### Lý do cốt lõi:
1. **Nguyên tắc "Git is Single Source of Truth" (SSOT)**:
   - Trong môi trường phân tán (Edge Workers), bản build trên production PHẢI có một commit hash đại diện trong Git tree. Nếu deploy mã nguồn chưa commit từ local, bản chạy trên `https://design.7app.online` sẽ trở thành "bản phát hành vô thừa nhận" (phantom build) — không ai biết chính xác commit nào đang chạy, và việc rollback sẽ không thể thực hiện được bằng `git revert`.
2. **Audit Trail & Team Governance**:
   - Khi commit và push lên nhánh `feat/sprint-05-saas-polish-and-inpainting` (PR #1), GitHub PR sẽ cập nhật toàn bộ diff và giữ lịch sử minh bạch cho Đại Ka duyệt merge vào `main`.
3. **An Toàn Build Worker**:
   - OpenNext Worker build (`npm run build:worker`) đóng gói bundle dựa trên source tree sạch. Việc commit giúp đảm bảo working directory không bị dirty state ảnh hưởng tới sourcemap hoặc cache.

---

## 3. AUDIT TOÀN DIỆN CODEBASE QUA SKILL `/behavior-model-debugger`

### 🎮 A. Tái Tạo Mô Hình Hành Vi (Behavioral Model Reconstruction)

#### 1. Inpainting Mask Canvas (`BrushMaskCanvas`)
- **Tương tác vẽ (Drawing Gestures)**:
  - Người dùng chạm hoặc rê chuột trên canvas sẽ vẽ các nét cọ màu thương hiệu copper mờ (`rgba(194, 110, 56, 0.65)`).
  - Tọa độ vẽ được scale chuẩn xác theo tỉ lệ thực tế giữa `naturalWidth/naturalHeight` của ảnh và kích thước hiển thị CSS (`scaleX = canvas.width / rect.width`).
- **Phím tắt & Undo/Redo**:
  - Khi ấn `[`, cọ giảm theo nấc (50 → 30 → 15). Khi ấn `]`, cọ tăng theo nấc (15 → 30 → 50).
  - Khi ấn `Ctrl+Z` / `Cmd+Z`, hàm `handleUndo()` lấy lại snapshot liền kề từ `historyRef` và khôi phục tức thì qua `ctx.putImageData`.
  - Nếu lùi về bước 0 (ảnh ban đầu chưa vẽ), component tự động reset `onMaskChange(null)` để form studio hiểu rằng không còn mask inpainting nào.

#### 2. Before/After Interactive Comparison (`BeforeAfter`)
- **Gestures & Sliders**:
  - `setPointerCapture(e.pointerId)` khóa chặt con trỏ vào thanh trượt, cho phép người dùng kéo ra ngoài mép khung hình mà slider vẫn bám mượt mà theo ngón tay/chuột.
  - Lớp `touch-none` ngăn chặn trình duyệt điện thoại tự động cuộn trang (scroll hijack) khi đang trượt so sánh ảnh.
- **Thumbnail Grid Sync**:
  - Khi người dùng click chọn một thumbnail mẫu trong danh sách 5 mẫu tiêu biểu, vị trí slider tự động reset về 50% (trung tâm) để người dùng có trải nghiệm so sánh trọn vẹn nhất cho mẫu mới.

#### 3. Cổng Thanh Toán Kép (`MockPaymentModal`)
- **Dual-Gateway Switching**:
  - Khách Việt Nam quét mã VietQR: Tự động poll API `/api/payments/sepay/order` mỗi 2.5 giây. Khi tiền vào tài khoản ngân hàng, webhook SePay cập nhật D1 và màn hình client lập tức chuyển sang trạng thái "Thanh toán thành công" kèm hiệu ứng chúc mừng.
  - Khách Quốc Tế dùng Stripe: Bấm "Thanh toán Stripe" chuyển hướng an toàn tới trang thanh toán của Stripe Checkout.

---

### 💥 B. Ma Trận Va Chạm Luật Chơi (Invariant Collision Matrix)

| Cặp Va Chạm | Tình Huống Kịch Bản | Kết Quả Phân Tích & Cách Đã Xử Lý |
| :--- | :--- | :--- |
| **Gõ văn bản vs Phím tắt cọ vẽ** | Người dùng đang gõ ghi chú (Prompt note) trong ô textarea mà ấn phím `[` hoặc `Ctrl+Z`. | **Đã xử lý triệt để**: Listener `handleKeyDown` kiểm tra `target.tagName === 'INPUT' \|\| target.tagName === 'TEXTAREA'` và lập tức `return`, không làm đổi cọ vẽ hay mất nét mask khi đang soạn thảo. |
| **Chuyển Tab Payment khi đang Polling** | Người dùng mở mã VietQR (đang bật polling interval 2.5s) rồi bấm chuyển sang tab Stripe. | **Đã xử lý an toàn**: State `order` và interval được gắn chặt vào lifecycle; khi đổi gói hoặc đóng modal, `clearInterval` tự động dọn sạch luồng nền, chống rò rỉ network request. |
| **Xóa Mask (Clear) vs Undo** | Người dùng vẽ 3 nét, bấm "Clear Mask", sau đó bấm `Ctrl+Z`. | **Đã xử lý chuẩn**: Hành động `handleClear` đẩy trạng thái trống mới vào stack lịch sử. Bấm Undo sẽ phục hồi lại đúng trạng thái 3 nét vẽ trước khi xóa. |
| **Treo GPU WebGL Panorama 360** | Khách truy cập bằng máy tính cũ hoặc trình duyệt tắt tăng tốc phần cứng. | **Đã xử lý chuẩn**: `isWebGLAvailable()` phát hiện mất context GPU và tự động rơi về ảnh phẳng panoramic fallback an toàn mà không làm crash tab trình duyệt. |

---

### 🛡️ C. Kiểm Toán Bảo Mật (Security & Refactor Audit)

1. **Chống Replay Attack & Over-crediting**:
   - Trong cả Stripe webhook (`src/lib/payments/stripe.ts`) và SePay webhook (`src/lib/payments/sepay.ts`), hệ thống kiểm tra `order.status === 'completed'`. Nếu webhook gửi lại lần 2 (do retry từ gateway), hệ thống trả về HTTP 200 idempotent mà không cộng tiền lần 2 vào `credit_ledger`.
2. **Chống Timing Attack**:
   - `verifyStripeWebhookSignature` và SePay API Token comparison sử dụng thuật toán so sánh chuỗi hằng số thời gian (`timingSafeEqual`), triệt tiêu nguy cơ hacker đo thời gian phản hồi để đoán token.
3. **Bảo Mật Lưu Trữ Cloudflare R2**:
   - Các URL tải ảnh gốc được ký bằng AWS SigV4 Presigned URL với thời hạn sống ngắn (TTL 600 giây). API route tải ảnh kiểm tra phiên đăng nhập `session.user.id === row.user_id`.
4. **Giới Hạn Bộ Nhớ Canvas (Memory Leak Prevention)**:
   - Stack `historyRef` trong `BrushMaskCanvas` được giới hạn tối đa 25 phần tử (`nextHistory.shift()`). Điều này ngăn việc người dùng vẽ hàng trăm nét làm tràn RAM trình duyệt trên iPhone/Android.

---

## 4. KẾ HOẠCH BÀN GIAO & TRẠNG THÁI RELEASE THỰC TẾ

1. **Thực hiện Git Commit & Push**:
   - Commit Conventional: `4ca2187` — `feat(sprint-05): add studio shortcuts, stripe checkout tabs, and interactive showcase gallery`.
   - Push lên nhánh `feat/sprint-05-saas-polish-and-inpainting` (PR #1).
2. **Cloudflare Worker Build & Deploy Hoàn Tất 100%**:
   - OpenNext Worker Build hoàn tất thành công: Gzip bundle `1,979.47 KiB` (~1.93 MB / Trần Free Tier: 3 MB).
   - Triển khai phiên bản Worker mới lên Cloudflare Demo (`design.7app.online`):
     - **Current Version ID**: `d5cc1a61-5884-4870-8c0c-6ad36a5b7b65`.
     - **Custom Domain**: `https://design.7app.online`.
     - **Triggers**: Schedule `*/15 * * * *`, Queues `hd-demo-asset-validate` và `hd-demo-provider-notify`.
   - **Xác thực Live**:
     - GET `https://design.7app.online/api/auth/client-config` ➜ `HTTP 200 OK` (CF-Ray MAD verified).
     - GET `https://design.7app.online` ➜ `HTTP 200 OK` (HTML 73,914 bytes, Before and After section verified).
