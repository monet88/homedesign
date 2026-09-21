# Sprint 4 Phase 2: Google One Tap / OAuth Sign-In Loop Bug Fix & Live Verification

## 1. Bối cảnh & Yêu cầu (Context & User Goal)
- **Báo cáo từ Đại Ka**: Sau khi bấm chọn tài khoản Google trên Google One Tap prompt (`https://design.7app.online`), ứng dụng không cập nhật session mà tiếp tục hiện One Tap prompt lặp lại (loop).
- **Kỹ năng áp dụng**: `/behavior-model-debugger`, `/vibe-engineering-workflow`, `/vibe-git-manager`.
- **Mục tiêu**: Điều tra mô hình hành vi (Behavioral Model), tìm ra root cause ở cả server database, backend auth và client React hydration, vá triệt để và deploy live lên Cloudflare Worker (`homedesign-demo`).

---

## 2. Phân tích Mô hình Hành vi & Root Cause (`behavior-model-debugger`)

### Bước 1: Kiểm tra Remote Cloudflare D1 Database (`homeds`)
- Truy vấn D1 remote cho bảng `user`, `account`, `session`:
  - User `ACLEn24aMae2PFrnfE13TnzuVEpo3U9t` (`galaxypro710@gmail.com`, Xyle Gal) đã được lưu thành công trên D1.
  - Google Account ID `113426742512683050012` đã được liên kết chính xác.
  - Active Session đã được tạo trong database.
  => **Kết luận**: Backend D1 và Google One Tap Token Verification hoàn toàn hoạt động tốt. Lỗi không nằm ở D1 Database.

### Bước 2: Kiểm tra Backend Endpoints & Signed Cookies
- Endpoint `/api/auth/one-tap/callback`: Nhận ID token từ Google, verify với Google OAuth Client ID, sinh session và trả về Set-Cookie `__Secure-better-auth.session_token=<token>.<sig>; HttpOnly; Secure; SameSite=Lax`.
- Endpoint `/api/auth/get-session`: Khi nhận signed cookie, trả về HTTP 200 kèm user metadata và session object đầy đủ.
- Endpoint `/api/credits`: Trả về HTTP 200 kèm `{"available": 0, "plan": "free"}`.

### Bước 3: Phát hiện 2 Race Conditions / Bugs ở Frontend Client
1. **Initial Mount Race Condition (`useSession` vs `GoogleOneTapPrompt`)**:
   - Trong `src/lib/auth/session-stub.ts`, hook `useSession()` khởi tạo đồng bộ với `user: null`, không có trạng thái `loading`.
   - Trong `src/components/auth/google-one-tap.tsx`, `useEffect` chạy ngay lập tức khi component mount vì `user === null`. Nó kích hoạt `client.oneTap()` ngay cả khi trình duyệt đã có cookie hợp lệ và đang chờ `/api/auth/get-session` phản hồi.
2. **Navigation No-Op trong Better Auth One Tap Plugin**:
   - Client plugin của Better Auth xử lý sau khi One Tap callback thành công: `if (isSafeUrlScheme(target)) window.location.href = target;` với `target = "/"`.
   - Khi người dùng đang ở sẵn `https://design.7app.online/`, việc gán `window.location.href = "/"` trong Chromium là một hành động **no-op** (không reload trang, không kích hoạt re-render).
   - Do đó, React state không được re-hydrate, `useSession()` vẫn giữ `{ user: null }`, dẫn đến việc One Tap prompt tiếp tục hiển thị hoặc loop lại.

---

## 3. Giải pháp & Triển khai (Implementation)

### 3.1. Cập nhật `src/lib/auth/session-stub.ts`
- Thêm trường `loading?: boolean` vào interface `Session`.
- `useSession()` khởi tạo ban đầu với `loading: true`. Sau khi `fetchSession()` và `toShellSession()` hoàn tất, `loading` được đặt về `false`.
- Bổ sung `SESSION_CHANGED_EVENT = "homedesign:session-changed"` và helper `triggerSessionRefresh()`.
- Lắng nghe event `SESSION_CHANGED_EVENT` và `focus` để tự động làm mới session bất kỳ khi nào trạng thái đăng nhập thay đổi.

### 3.2. Cập nhật `src/components/auth/google-one-tap.tsx`
- Đọc `{ user, loading } = useSession()`.
- Thêm guard: `if (loading) return;` — Đảm bảo Google One Tap không bao giờ prompt khi quá trình kiểm tra session ban đầu đang diễn ra.
- Trong `client.oneTap({ fetchOptions })`:
  - Thêm `onSuccess: () => { triggerSessionRefresh(); window.location.reload(); }`.
  - Đảm bảo khi đăng nhập One Tap thành công, trang web được reload và hydrate lại toàn bộ session người dùng, hiển thị avatar và credit badge ngay lập tức.

### 3.3. Cập nhật `src/lib/auth/client.ts`
- Trong `signInWithGoogle`: Thêm fallback gán `window.location.href = result.data.url` phòng trường hợp better-auth không tự động redirect.
- Trong `signOut`: Gọi `triggerSessionRefresh()`.

---

## 4. Kiểm thử & Verification Gates (`vibe-engineering-workflow`)

1. **TypeScript Typecheck**:
   - `npm run typecheck` => PASS 100% (0 errors).
2. **Unit Tests Suite**:
   - `npm test` => PASS 536/536 tests (Bổ sung unit test cho `loading` và `triggerSessionRefresh()`).
3. **Workers Integration Suite**:
   - `npm run wrangler:test` => PASS 261/261 tests.
4. **Smoke & Free-First Verification**:
   - `npm run smoke` => PASS.
   - `npm run gate:free-first` => PASS (Worker bundle: 2.02MB <= 3MB limit).
5. **Production Upload & Deploy**:
   - Worker build mới được upload lên Cloudflare demo: Version `cbd15423-4d9c-49f2-be62-4baf3955f35b`.
   - Deploy 100% traffic thành công vào lúc 14:57:11 (2026-09-16).
   - Kiểm tra `https://design.7app.online/api/auth/client-config` => HTTP 200 OK.

---

## 5. Trạng thái Git & Secret Hygiene (`vibe-git-manager`)
- Toàn bộ secret files (`.env.local`, `client_secret_*.json`, `ziga-p2p-game-*.json`) được bảo vệ nghiêm ngặt trong `.gitignore`.
- Diff chỉ bao gồm mã nguồn UI auth và test file tương ứng, 0 leak credentials.
