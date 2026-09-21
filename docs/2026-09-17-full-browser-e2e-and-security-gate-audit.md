# Báo Cáo Kiểm Định Trực Tiếp & Khắc Phục Secret Gate CI

- **Ngày thực hiện:** 17/09/2026
- **Kỹ sư chịu trách nhiệm:** Antigravity Agent (Pair Programming with Đại Ka)
- **Phương pháp luận:** `/vibe-engineering-workflow`, `/vibe-git-manager`, `/behavior-model-debugger`, `chrome-devtools-mcp`, `scripts/secret-gate.sh`
- **Mục tiêu:** Không suy đoán, kiểm chứng trực tiếp trên live browser và CI script, lưu vết và xác nhận thực tế.

---

## 1. Phát Hiện Lỗi Chặn Deployment CI (Root Cause Analysis)

Khi sử dụng `chrome-devtools-mcp` để truy cập `https://design.7app.online/ai-interior-design`, hệ thống phát hiện giao diện Model Selector vẫn hiển thị phiên bản trước đó thay vì bản cập nhật mới nhất (chứa Fal.ai Flux, Gemini Flash, Replicate, Kie).

Tiến hành kiểm tra nhật ký chạy GitHub Actions thông qua `gh run list` và `gh run view 35218544427 --log-failed`:
- **Nguyên nhân gốc:** Bước `Secret regression gate` chạy lệnh `bash scripts/secret-gate.sh` bị fail với exit code 1 do Rule 2:
  ```
  [RULE-02-HARDCODED-SECRET] src/app/api/workspaces/workspaces-api.test.ts:56: potential hardcoded credential assignment detected
  [RULE-02-HARDCODED-SECRET] src/app/api/workspaces/workspaces-api.test.ts:222: potential hardcoded credential assignment detected
  [RULE-02-HARDCODED-SECRET] src/lib/ai/fal-adapter.test.ts:31: potential hardcoded credential assignment detected
  [RULE-02-HARDCODED-SECRET] src/lib/ai/multi-provider.test.ts:30: potential hardcoded credential assignment detected
  [RULE-02-HARDCODED-SECRET] src/lib/ai/multi-provider.test.ts:50: potential hardcoded credential assignment detected
  [RULE-02-HARDCODED-SECRET] src/lib/ai/multi-provider.test.ts:78: potential hardcoded credential assignment detected
  FAIL: Detected 6 secret violation(s) in repository.
  ```
- **Lý do kỹ thuật:** `scripts/secret-gate.sh` áp dụng regex nghiêm ngặt: bất kỳ biến `token` hoặc `apiKey` nào trong test file mà không bắt đầu bằng các tiền tố an toàn như `test-`, `mock-`, `dev-only-` đều bị chặn để ngăn rò rỉ credential lên production.
- **Biện pháp khắc phục triệt để:**
  - `src/app/api/workspaces/workspaces-api.test.ts`: đổi `"valid-token-123"` thành `"test-token-123"`.
  - `src/lib/ai/fal-adapter.test.ts`: đổi `"fake-key"` thành `"test-fake-key"`.
  - `src/lib/ai/multi-provider.test.ts`: đổi `"fal-test-key"`, `"r8_test_key"`, `"kie-test-key"` thành `"test-fal-key"`, `"test-replicate-key"`, `"test-kie-key"`.

---

## 2. Kết Quả Xác Minh Nội Bộ (Local Verification)

1. **Secret Gate Execution:**
   - Lệnh chạy: `& "C:\Program Files\Git\bin\bash.exe" scripts/secret-gate.sh`
   - Kết quả:
     ```
     ==> Scanning tracked files at HEAD for secret patterns...
     ==> Scanning recent commit messages (last 10 commits)...
     PASS: No exposed secrets detected in tracked files or recent commit messages.
     ```
   - Exit code: **0**.

2. **Unit & Integration Test Suite:**
   - Toàn bộ 51 test suites đều xanh.
   - Các file test vừa cập nhật fixture đều pass 100%:
     - `src/app/api/workspaces/workspaces-api.test.ts` (10 tests) ✓
     - `src/lib/ai/fal-adapter.test.ts` (3 tests) ✓
     - `src/lib/ai/multi-provider.test.ts` (7 tests) ✓

---

## 3. Kiểm Thử Trực Tiếp Qua Chrome DevTools MCP (`chrome-devtools-mcp`)

- **Domain:** `https://design.7app.online`
- **Điều hướng & Ngôn ngữ:**
  - Bấm chọn menu ngôn ngữ `🇻🇳 Tiếng Việt`.
  - Toàn bộ Landing Page và thanh Header/Footer chuyển sang tiếng Việt 100%:
    - *"KIẾN TRÚC & NỘI THẤT AI CAO CẤP"*
    - *"Kiến Tạo Không Gian Mơ Ước Trong 60 Giây"*
    - *"Khám Phá Công Cụ"*, *"Xem Không Gian Mẫu"*, *"Đăng Nhập & Nhận 5 Credits Trải Nghiệm"*
    - *"Bộ Công Cụ Thiết Kế Chuyên Nghiệp"*: *"Vào Studio Nội Thất"*, *"Vào Studio Ngoại Thất"*, *"Vào Studio Mặt Bằng"*.
- **Runtime Console Logs:**
  - Kiểm tra qua `list_console_messages`: Không có unhandled JavaScript exception nào trên trang.
  - Các log xuất hiện đều là các cảnh báo chuẩn từ Google One Tap / GSI Auth.

---

## 4. Khắc Phục Workers Runtime Gate (`demo-usage.wtest.ts`)

- **Vấn đề phát hiện:** Trong CI của GitHub Actions, bước `Workers-runtime integration suite` báo lỗi tại `src/lib/ai/demo-usage.wtest.ts`:
  - `AssertionError: expected 'smart' to be 'gemini'`
  - Nguyên nhân: Trước đó dòng 172 của `src/lib/ai/lifecycle.ts` ép mặc định demo về `smart` thay vì `gemini` theo quy chuẩn ADR 0008.
- **Biện pháp xử lý:**
  - Khôi phục `effectiveProvider = "gemini"` khi `rawProvider === undefined || effectiveProvider === "fake"` để bảo toàn hợp đồng ADR 0008 trong môi trường Demo.
  - Khi người dùng chủ động chọn Model trên Studio UI (`smart`, `fal`, `replicate`, `kie`), `rawProvider` được truyền lên và giữ nguyên model được chọn.
- **Kết quả xác minh:**
  - `npm run wrangler:test -- src/lib/ai/demo-usage.wtest.ts`: Toàn bộ 12 tests passed 100%.

---

## 5. Khắc Phục Playwright E2E Suite & Tối Ưu Mobile Viewport

- **Vấn đề phát hiện:** Khi CI vượt qua Secret Gate, Lint, Typecheck, Unit tests và Workers-Runtime suite, bước `End-to-end deterministic test suite` phát hiện các lỗi assertion do cập nhật giao diện cao cấp từ Sprint 6 chưa được đồng bộ sang test fixtures:
  1. **Landing & Smoke Headings/Theme Tokens:**
     - Headings được nâng cấp sang bản sao quyền tác giả cao cấp (`Architectural Vision in Sixty Seconds`, `Precision Design Suites`, `Curated Showcase Gallery`, `Flexible Credit Packages`). Các file test (`e2e/smoke.spec.ts`, `e2e/landing.spec.ts`, `e2e/demo-auth-smoke.spec.ts`) được cập nhật regex để hỗ trợ cả 2 phiên bản.
     - Background color body nâng cấp sang màu luxury off-white `#FAF9F6` (`rgb(250, 249, 246)`). Đã cập nhật assertion `toContain(bodyBg)`.
  2. **Mobile Viewport Overflow trên Admin Dashboard (`e2e/admin-journey.spec.ts`, `e2e/full-journey.spec.ts`):**
     - Ở Sprint 7 & 8, hai tab mới (`Orders & Revenue`, `Viral Referrals`) được bổ sung nâng tổng số lên 5 tabs (~790px). Trên mobile viewport (390x844), tab `Provider Health Check` bị đẩy ra ngoài viewport và không cuộn được do thiếu `overflow-x-auto`.
     - Đã thêm `overflow-x-auto scrollbar-none` vào thanh navigation tabs và `shrink-0 whitespace-nowrap` cho từng nút tab trong `src/app/admin/_components/admin-dashboard.tsx`. Đồng thời thêm `scrollIntoViewIfNeeded()` trước khi kích hoạt tab trên mobile trong test specs.
  3. **Touch Interaction trên Before/After Slider:**
     - Đã cập nhật `landing.spec.ts` hỗ trợ nhận diện và tap touchscreen trên viewport mobile (< 600px).

