# Báo Cáo Kỹ Thuật: Sprint 2 — Phase 4: Remediation and Release Decision

- **Dự án:** HomeDesign Clone (`homedesign`)
- **Giai đoạn:** **Sprint 2 — Phase 4: Remediation and Release Decision**
- **Nhánh làm việc:** `fix/sprint-02-phase-04-ux-and-security`
- **Base Commit Anchor:** `b3eb5a8` (`docs(migration): record provider transition`)
- **Head Commit Hash:** `7ca96a1` (`sec(admin): sanitize sql statements and use parameterized queries in admin seeding`)
- **Ngày hoàn thành:** 14/09/2026
- **Trạng thái:** ✅ **HOÀN THÀNH 5/5 TICKETS — WORKING TREE SẠCH SẼ — READY FOR RELEASE GATE**

---

## 1. Mục Tiêu (Objective)

Thực thi tuần tự 5 vertical tickets đã được xác định trong tài liệu Handoff của Sprint 2 Phase 4 nhằm khắc phục triệt để các vấn đề UX, validation format ảnh, độ mượt tương tác canvas, xung đột sự kiện mặt bằng và lỗ hổng bảo mật SQL Injection trước khi đóng Sprint 2 và chuyển giao bản phát hành.

---

## 2. Việc Đã Làm & Chi Tiết Kỹ Thuật (What Was Done)

### Ticket 1: Sửa Dropzone kéo thả ảnh trong `uploader.tsx` (Chống nhảy trang)
- **Vấn đề:** Khi người dùng kéo thả file từ bên ngoài vào vùng dropzone, trình duyệt kích hoạt hành vi điều hướng mặc định (mở trực tiếp file ảnh trên toàn màn hình, gây mất state trang).
- **Giải pháp (Surgical):**
  - Gắn sự kiện `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` trực tiếp vào wrapper element của dropzone.
  - Sử dụng đồng thời `e.preventDefault()` và `e.stopPropagation()` trên toàn bộ các handlers để triệt tiêu navigation hijack.
  - Thêm state `isDragging` để đổi giao diện trực quan (`border-brand-primary bg-brand-primary/5`) khi file rê qua vùng dropzone.
- **Commit:** `92b3b6d` `fix(uploader): attach drag and drop handlers to prevent navigation hijack`
- **File sửa:** [`src/components/design/uploader.tsx`](../src/components/design/uploader.tsx)
- **Test bảo vệ:** [`src/components/design/uploader.test.tsx`](../src/components/design/uploader.test.tsx) (4/4 tests passed).

---

### Ticket 2: Sửa lỗi WebP cho bộ ảnh mẫu trong uploader và validation schema
- **Vấn đề:** Các ảnh mẫu preset định dạng WebP bị từ chối bởi `UploadIntentSchema` và `validateUploadIntentBytes` do schema ban đầu chỉ cho phép `image/jpeg` và `image/png`.
- **Giải pháp (Surgical):**
  - Mở rộng `UploadIntentSchema` và hằng số `VALID_UPLOAD_MIMES` chấp nhận `"image/webp"`.
  - Bổ sung hàm giải mã WebP header (`RIFF....WEBPVP8 ` / `VP8L` / `VP8X`) vào `src/lib/intake/header-parser.ts` để đọc chính xác kích thước `width` và `height`.
  - Cập nhật helper `validWebpBytes()` và văn bản hướng dẫn trên UI trong `uploader.tsx` hiển thị rõ "JPEG, PNG, WebP".
- **Commit:** `41b41c9` `fix(intake): accept webp format for sample presets in upload schema`
- **File sửa:** 
  - [`src/lib/validation/schemas.ts`](../src/lib/validation/schemas.ts)
  - [`src/lib/fixtures/images.ts`](../src/lib/fixtures/images.ts)
  - [`src/lib/intake/header-parser.ts`](../src/lib/intake/header-parser.ts)
  - [`src/lib/intake/validator.ts`](../src/lib/intake/validator.ts)
  - [`src/components/design/uploader.tsx`](../src/components/design/uploader.tsx)
- **Test bảo vệ:** Cập nhật assertions trong `tests/unit.test.ts`, `assets-api.test.ts`, `header-parser.test.ts` (Passed 100%).

---

### Ticket 3: Căn chuẩn tọa độ Inpainting canvas, chống lag O(1), nối mask submit
- **Vấn đề:**
  1. *Lệch tọa độ:* Canvas inpainting bị biến dạng/letterbox so với ảnh gốc do tỉ lệ container không khớp aspect ratio tự nhiên của ảnh (`img.naturalWidth / img.naturalHeight`).
  2. *Lag và dồn alpha:* Khi vẽ nét, component lưu mảng điểm và chạy vòng lặp vẽ lại từ đầu ở mỗi mouse move (độ phức tạp O(N²)), dẫn đến hiện tượng giật lag khung hình và màu nét vẽ bị dồn alpha đậm đặc không mong muốn.
  3. *Mất mask data:* Form submit không gửi `maskDataUrl` lên server khi người dùng đang ở chế độ chỉnh sửa ảnh (edit/inpainting mode).
- **Giải pháp (Surgical):**
  - Trong `BrushMaskCanvas`: tính toán `aspectRatio = img.naturalWidth / img.naturalHeight` gán cho container để canvas khớp pixel-perfect với ảnh nền; dùng `lastPosRef` kết hợp `ctx.beginPath()` theo từng segment nét vẽ (độ phức tạp O(1)), giữ nguyên độ trong suốt của nét cọ.
  - Trong `src/lib/design/state.ts`: thêm trường `maskDataUrl: string | null` vào `DesignFormState`, cập nhật `buildDesignConfig` xuất `maskDataUrl` khi `mode === "edit"`.
  - Trong `src/components/design/design-form.tsx`: nối `onMaskChange={(mask) => update("maskDataUrl", mask)}` vào `BrushMaskCanvas`.
  - Trong `src/lib/ai/config.ts` & `types.ts`: cho phép thuộc tính `maskDataUrl` trong schema cấu hình sinh ảnh AI.
- **Commit:** `a3b3645` `fix(canvas): align inpainting coordinates and retain mask in form submission`
- **File sửa:** 
  - [`src/components/design/brush-mask-canvas.tsx`](../src/components/design/brush-mask-canvas.tsx)
  - [`src/lib/design/state.ts`](../src/lib/design/state.ts)
  - [`src/components/design/design-form.tsx`](../src/components/design/design-form.tsx)
  - [`src/lib/ai/types.ts`](../src/lib/ai/types.ts)
  - [`src/lib/ai/config.ts`](../src/lib/ai/config.ts)
- **Test bảo vệ:** Tạo [`src/components/design/brush-mask-canvas.test.tsx`](../src/components/design/brush-mask-canvas.test.tsx) và cập nhật [`src/lib/design/state.test.ts`](../src/lib/design/state.test.ts) (Passed 100%).

---

### Ticket 4: Tách biệt sự kiện click Marker trên Floor Plan canvas
- **Vấn đề:** Marker phòng trên mặt bằng là thẻ `<span>` có class `pointer-events-none`. Khi người dùng click vào marker để chọn phòng, sự kiện click lọt xuống canvas bên dưới kích hoạt hàm `placeMarker`, vô tình di chuyển marker sang vị trí mới.
- **Giải pháp (Surgical):**
  - Chuyển đổi Marker thành `<button type="button" className="... cursor-pointer z-10">`.
  - Gắn `onClick={(e) => { e.stopPropagation(); selectRoom(r.id); }}` ngăn chặn hoàn toàn sự kiện nổi bọt xuống canvas cha.
- **Commit:** `8d99de7` `fix(floor-plan): allow direct marker click selection without repositioning`
- **File sửa:** [`src/components/floor-plan/floor-plan-flow.tsx`](../src/components/floor-plan/floor-plan-flow.tsx)
- **Test bảo vệ:** [`src/components/floor-plan/floor-plan-marker.test.tsx`](../src/components/floor-plan/floor-plan-marker.test.tsx) (Passed 100%).

---

### Ticket 5: Khắc phục SQL injection trong admin database seeding script
- **Vấn đề:** Các hàm `generateSqlStatements` và `seedDirect` trong `src/lib/auth/admin.ts` ghép chuỗi template string raw SQL trực tiếp mà không escape ký tự `'` cho `email` và `hashedPassword`, chạy raw SQL trên Cloudflare D1.
- **Giải pháp (Surgical):**
  - Trong `seedDirect`: chuyển hoàn toàn sang sử dụng **parameterized / prepared statements** (`db.prepare("...").bind(...)`) trên D1 miniflare, triệt tiêu mọi nguy cơ SQL Injection.
  - Trong `generateSqlStatements` và `scripts/seed-admin.mjs`: sanitize và escape triệt để dấu nháy đơn (`'`) thành (`''`) trên mọi chuỗi động (`email`, `name`, `password`, `userId`, `ledgerId`).
- **Commit:** `7ca96a1` `sec(admin): sanitize sql statements and use parameterized queries in admin seeding`
- **File sửa:** 
  - [`src/lib/auth/admin.ts`](../src/lib/auth/admin.ts)
  - [`scripts/seed-admin.mjs`](../scripts/seed-admin.mjs)
- **Test bảo vệ:** 
  - [`src/lib/auth/admin.test.ts`](../src/lib/auth/admin.test.ts) (9/9 tests passed, có test SQL injection).
  - [`src/lib/auth/admin-seed.wtest.ts`](../src/lib/auth/admin-seed.wtest.ts) (7/7 tests passed, có test AC5 injection trên real D1 miniflare).
  - [`tests/admin-seed.test.ts`](../tests/admin-seed.test.ts) (5/5 tests passed).

---

## 3. Kết Quả Kiểm Thử (Verification Results)

1. **TypeScript Typecheck:**
   ```bash
   npx tsc --noEmit
   # Exit code: 0 — 0 errors
   ```
2. **Unit & Integration Test Suite:**
   - 28 test suites passed, 472 tests passed.
   - `tests/admin-seed.test.ts` passed 5/5.
   - `tests/deploy.test.ts` passed 30/30.
   - `src/lib/auth/admin-seed.wtest.ts` passed 7/7 trên Workers runtime miniflare.
3. **Working Tree:**
   ```text
   On branch fix/sprint-02-phase-04-ux-and-security
   nothing to commit, working tree clean
   ```

---

## 4. Đánh Giá Codebase Theo `behavior-model-debugger`

Áp dụng phương pháp phân tích Behavioral Invariant Matrix:

| Tương tác (Interaction) | Hành vi kỳ vọng (Expected Invariant) | Trạng thái sau Phase 4 | Đánh giá |
|---|---|---|---|
| **Drag & Drop File ngoài OS vào UI** | File không mở đè tab hiện tại; dropzone đổi màu báo hiệu; thả chuột thì file được nạp vào preview. | Đã gắn `preventDefault()` & `stopPropagation()` trên toàn bộ chu trình kéo thả. | ✅ Tuyệt đối an toàn (Robust) |
| **Chọn ảnh mẫu WebP từ thư viện** | Hệ thống chấp nhận WebP, kiểm tra header magic bytes và cấp quyền presign URL hợp lệ. | Schema và Parser đã đồng bộ `image/webp`. | ✅ Nhất quán (Consistent) |
| **Vẽ Inpainting Mask** | Tọa độ đầu cọ nằm chính xác dưới con trỏ chuột; nét vẽ mượt mà O(1); chuyển qua submit vẫn giữ nguyên mask data. | Canvas tỷ lệ tự nhiên `aspectRatio`, O(1) stroke segment, state liên kết form submit. | ✅ Pixel-Perfect & Fast |
| **Click Marker phòng trên Mặt Bằng** | Chỉ kích hoạt chọn phòng xem chi tiết, không làm xê dịch marker hoặc kích hoạt click canvas cha. | Đã chuyển sang button có `e.stopPropagation()`. | ✅ Phân lập sự kiện chuẩn |
| **Seeding Admin Database** | Chèn admin, phân quyền và cấp credit an toàn kể cả khi email hoặc name chứa ký tự nháy đơn / SQL injection payload. | Parameterized query (`?1, ?2`) + chuỗi escape double quotes. | ✅ Đạt chuẩn bảo mật OWASP |

---

## 5. Quy Trình Tiếp Theo Theo `vibe-engineering-workflow` & `vibe-git-manager`

### Giao thức Pre-Check Gate 4 bước:
- [x] **1. Logic Correctness:** 100% test units, workers và integration tests đã pass xanh trên môi trường thực tế.
- [x] **2. Code Cleanliness:** Không có debug logging dư thừa, không có orphaned imports/variables.
- [x] **3. Edge Cases:** Đã bao phủ các trường hợp biên (tập tin WebP lạ, payload SQL nháy đơn, click trùng canvas, kéo thả ra ngoài).
- [x] **4. Latent Risks & Security:** Không lộ secret, không vi phạm `.gitignore`, D1 queries được bảo vệ an toàn.

### Bước tiếp theo của `vibe-git-manager`:
Nhánh `fix/sprint-02-phase-04-ux-and-security` đã hoàn tất 5 commits sạch sẽ. Các lựa chọn triển khai:
1. **Lựa chọn A (Tạo PR):** Push nhánh lên GitHub remote (`origin/fix/sprint-02-phase-04-ux-and-security`) và tạo Pull Request vào `main`.
2. **Lựa chọn B (Merge trực tiếp vào `main`):** Nếu Đại Ka muốn chốt trực tiếp, merge fast-forward nhánh này vào `main` và đánh tag kết thúc Sprint 2.

### Bước tiếp theo của `vibe-engineering-workflow`:
- Chuyển sang **Release Gate Verification**: Chạy kiểm thử release smoke (`npm run smoke` và `npm run gate:free-first`).
- Sau khi chốt Phase 4, hoàn thành Sprint 2 và chuyển giao sang **Sprint 3** (hoặc chuẩn bị triển khai lên staging/Cloudflare production).

---

## 6. Prompt Chuyển Giao Cho Session Mới (Handoff Prompt)

Khi mở session mới, Đại Ka chỉ cần sao chép toàn bộ khối lệnh dưới đây và gửi cho AI:

```markdown
Chào em, tiếp tục dự án HomeDesign Clone từ tài liệu báo cáo: docs/2026-09-14-sprint-02-phase-04-remediation-report.md.

### Vị trí hiện tại:
- Sprint 2 — Phase 4: Remediation and Release Decision đã HOÀN THÀNH 5/5 tickets trên nhánh `fix/sprint-02-phase-04-ux-and-security`.
- Head commit: `7ca96a1` (`sec(admin): sanitize sql statements and use parameterized queries in admin seeding`).
- Toàn bộ test suite đã xanh (472 tests passed, 0 error tsc).

### Nhiệm vụ session này:
1. Kích hoạt /vibe-git-manager để hợp nhất (merge) nhánh `fix/sprint-02-phase-04-ux-and-security` vào `main` (hoặc tạo PR theo policy của repository).
2. Chạy Release Gate verification: `npm run smoke`, `npm run gate:free-first`, và kiểm tra worker build `npm run build:worker`.
3. Đóng Sprint 2 và lập kế hoạch cho Sprint 3 (xác định mục tiêu và vertical tickets cho Sprint 3).

Luôn xưng hô với tôi là "Đại Ka", trả lời bằng tiếng Việt, chuyên môn dùng English; tuân thủ nghiêm ngặt Karpathy Guidelines và quy tắc dự án.
```
