# HomeDesign - Sprint 4 Phase 2: Live AI Generation & Security Audit Report

## 1. TỔNG QUAN VẤN ĐỀ VÀ MỤC TIÊU
- **Báo cáo từ Đại Ka**:
  1. Khi generate 2 ảnh nội thất trên `https://design.7app.online/ai-interior-design`, hệ thống không hiển thị kết quả ra màn hình, chỉ thấy icon placeholder màu xám ở mục History.
  2. Thiếu menu/nút xem lịch sử thao tác, lịch sử tạo ảnh và log sử dụng/hoàn trả credit.
  3. Yêu cầu kiểm toán toàn diện rủi ro bảo mật (vulnerability) và rủi ro tài chính/thất thoát credit (financial leak).
  4. Triển khai fix toàn bộ lỗi, tối ưu giao diện, API, adapter và release lên production.

---

## 2. PHÂN TÍCH NGUYÊN NHÂN CỐT LÕI (ROOT CAUSE ANALYSIS)
Dựa trên phương pháp điều tra hành vi ngược (`behavior-model-debugger`):

### 2.1. Tra cứu Database D1 (`homeds`):
- Truy vấn bảng `ai_tasks`:
  - Phát hiện 2 task gần nhất: `2952c900-7f74-4cc6-98fa-ae7749f89ffd` và `dede14a0-5411-4783-bc6f-a87e95d08f6c`.
  - Cả 2 task đều mang trạng thái: `status: 'failed'`, `error_code: 'PROVIDER_ERROR'`.
- Truy vấn bảng `credit_holds`:
  - Cả 2 giao dịch tạm giữ credit của 2 task trên đều có trạng thái: `status: 'released'`.

### 2.2. Lỗi giao thức và Provider Mismatch:
1. Trong cấu hình Worker `wrangler.jsonc`, `AI_API_BASE_URL` đang được trỏ tới `https://pro.autommo.online/v1`.
2. Khi Worker secret `AI_API_KEY` được cấu hình với Google Gemini API Key (`AIzaSy...`), proxy bên thứ ba từ chối với lỗi `401 Unauthorized`.
3. Khi adapter cố gắng chuyển hướng sang endpoint OpenAI của Google (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`), Google API lập tức trả về lỗi:
   `HTTP 400: Image generation is not yet supported on the chat.completions endpoint for this model`.
4. Endpoint duy nhất của Google hỗ trợ tạo ảnh trực tiếp từ ảnh gốc (img2img) bằng Gemini 2.5 Flash Image là REST API Native:
   `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`
   với header xác thực bắt buộc: `x-goog-api-key: <KEY>` (không nhận `Authorization: Bearer`).

### 2.3. Lỗi trải nghiệm người dùng (UX Blindspots):
1. **Design Flow (`src/components/design/design-flow.tsx`)**: Khi task thất bại (`status === 'failed'`), màn hình không hiển thị khung kết quả lỗi mà âm thầm fallback về khung tải ảnh `<Uploader />`, khiến người dùng nghĩ rằng hệ thống không phản hồi hoặc kết quả bị mất.
2. **Design History (`src/components/design/design-history.tsx`)**: Khi `outputAssetId` là `null` (do thất bại), thẻ lịch sử chỉ render một icon rỗng mờ nhạt, không có nhãn trạng thái và không giải thích rằng credit đã được hoàn trả.
3. **App Sidebar (`src/components/shell/app-sidebar.tsx`)**: Trang xem log hoạt động (`/activity`) và trang quản trị (`/admin`) bị giấu kín trong menu popup của avatar, người dùng khó tìm thấy để tra cứu lịch sử.

---

## 3. ĐÁNH GIÁ RỦI RO (RISK & FINANCIAL AUDIT)

### 3.1. Rủi ro thất thoát tiền / Lỗ Credit (Financial Leak): **0% (AN TOÀN TUYỆT ĐỐI)**
- Hệ thống áp dụng mô hình bảo toàn tài chính **Two-Phase Credit Hold**:
  - **Phase 1 (Hold)**: Khi người dùng bấm Generate, hệ thống chỉ tạo một bản ghi `credit_holds` với trạng thái `held`, chưa thực hiện trừ tiền vĩnh viễn trong ledger.
  - **Phase 2 (Settle or Release)**:
    - Nếu AI sinh ảnh thành công: Hold được chuyển sang `settled` và ghi nhận trừ credit.
    - Nếu AI gặp bất kỳ lỗi gì (mạng, timeout, provider từ chối): Hàm `releaseHoldOnTerminal` lập tức kích hoạt, chuyển hold sang `released`, số dư khả dụng của người dùng được bảo toàn 100%.
- **Bằng chứng thực tế**: Cả 2 lượt gen thất bại của Đại Ka đều có `credit_holds.status = 'released'`. Số dư credit của Đại Ka không bị mất một credit nào.

### 3.2. Rủi ro bảo mật & Lỗ hổng (Vulnerability Risk): **THẤP / KIỂM SOÁT CHẶT CHẼ**
- **Quản lý Secrets**: Google API Key (`AIzaSy...`), OAuth Client Secret, Better Auth Secret đều được lưu trữ dưới dạng encrypted secrets trên Cloudflare Worker và `.env.local` đã nằm trong `.gitignore`.
- **Chính sách git (`vibe-git-manager`)**: Kiểm tra quét secret tự động trước mọi commit, không có bất kỳ secret nào bị rò rỉ vào Git tree hay trả về client browser.
- **Circuit Breaker & Demo Rate Limit**: Worker được bảo vệ bởi bộ đếm `DEMO_DAILY_PROVIDER_LIMIT` (tối đa 50 lượt gọi/ngày) và cơ chế ngắt mạch Circuit Breaker khi nhà cung cấp lỗi liên tiếp.

---

## 4. CÁC THAY ĐỔI ĐÃ TRIỂN KHAI

### 4.1. Tích hợp Native Google Gemini API Adapter (`src/lib/ai/gemini-adapter.ts`):
- Tự động phát hiện Google API Key (`AIzaSy...`) hoặc endpoint `generativelanguage.googleapis.com`.
- Điều hướng gọi trực tiếp native endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`.
- Sử dụng header chuẩn `x-goog-api-key: <KEY>`.
- Đóng gói ảnh đầu vào thành định dạng `inlineData` (MIME type + base64).
- Cập nhật hàm `extractImageFromResponse()` để bóc tách ảnh thành công từ cấu trúc `candidates[0].content.parts[...].inlineData`.
- Cập nhật `healthCheck()` tương thích với endpoint `/v1beta/models`.

### 4.2. Nâng cấp Giao diện Trạng thái & Hoàn tiền (`src/components/design/`):
- **`design-flow.tsx`**: Khi một tác vụ bị lỗi, hiển thị khung thông báo trạng thái rõ ràng:
  *"AI Generation Encountered An Issue. No worries! Your 1 credit was safely refunded to your account automatically."* kèm nút **Try Again** và nút chọn ảnh mới.
- **`design-history.tsx`**:
  - Hiển thị badge đỏ `Refunded` nổi bật.
  - Hiển thị thông báo trạng thái lỗi thay vì icon placeholder rỗng.
  - Hiển thị trạng thái đang xử lý (`Generating…` kèm spinner).

### 4.3. Cải tiến Menu Điều Hướng (`src/components/shell/`):
- Bổ sung `IconClock` và `IconShield` vào `icons.tsx`.
- Thêm đường link trực tiếp **Activity & Logs** (`/activity`) vào thanh menu điều hướng chính của `app-sidebar.tsx`.
- Thêm đường link **Admin Dashboard** (`/admin`) hiển thị trực tiếp trên thanh sidebar đối với tài khoản có quyền Admin.

### 4.4. Cập nhật cấu hình môi trường Cloudflare (`wrangler.jsonc`):
- Cập nhật `env.demo.vars`:
  - `AI_API_BASE_URL`: `"https://generativelanguage.googleapis.com"`
  - `AI_DEFAULT_MODEL`: `"gemini-2.5-flash-image"`

---

## 5. KẾT QUẢ KIỂM THỬ VÀ RELEASE

1. **Unit & Integration Tests**:
   - `npx vitest run src/lib/ai/gemini-adapter.test.ts`: **23/23 tests pass** (bao gồm test case native Google Gemini payload & response parsing).
   - Bộ kiểm thử toàn diện `npm test`: **537/537 tests pass 100%**.
2. **Typecheck**:
   - `npm run typecheck`: **0 errors**.
3. **Release Gate**:
   - `npm run gate:free-first`: Passed! Dung lượng bundle nén: **2.02 MB** (nằm an toàn dưới giới hạn 3.0 MB của Cloudflare Workers Free).
4. **Deploy Live**:
   - Worker Version: `3f21b317-dbc2-46e5-804b-06763e6aa123`.
   - Lưu lượng: Đã kích hoạt 100% trên domain production: `https://design.7app.online`.
