# ADR 0001 — BetterAuth session and verified-email gate

Giữ BetterAuth, cookie `__Secure-better-auth.session_token` và endpoint namespace `/api/auth/*` để khớp origin, nhưng browser-readable session response không được chứa session token. Build #1 cho phép user đăng nhập khi chưa verify để thấy app; App Worker mới là authority chặn mọi task billable tới khi `user.emailVerified=true`.

**Status:** accepted

**Revision 2026-09-07:** Public Demo follows ADR 0008 and is Google-only. Email/password sign-up/sign-in, test-outbox and automatic Free Credit Grant remain testing-environment behavior; a successful Public Demo Google login creates identity/session state but starts with 0 Credits. Google OAuth uses a server-side `GOOGLE_CLIENT_SECRET` distinct from the browser-visible client ID.

## Browser auth contract

- Local/development/PR preview/staging có thể dùng email/password qua `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`, `POST /api/auth/send-verification-email` và `GET /api/auth/get-session`. Public Demo không expose email/password auth; nó dùng Google One Tap cùng normal Google OAuth fallback trên cùng environment origin.
- Session sống 7 ngày trong cookie httpOnly, Secure, SameSite Lax. `GET /api/auth/get-session` trả session metadata tối thiểu và user profile cần cho UI; field token/session secret bị loại khỏi JSON dù origin đã quan sát có trả field này.
- Anonymous Generate bị chặn client-side để phản hồi nhanh. Server luôn kiểm tra session, ownership và `emailVerified`; user chưa verify nhận `403 EMAIL_NOT_VERIFIED`, không tạo task hoặc Credit Hold.
- Callback URL chỉ nhận same-environment origin từ allowlist. Auth error, resend và expired/invalid link đều có UI state rõ; không đưa email, verification token hoặc session token vào log.

## Email verification delivery

- BetterAuth `sendVerificationEmail` đi qua `EmailDelivery` adapter, `sendOnSignUp=true`, verification link/token hết hạn sau 1 giờ và `requireEmailVerification=false` để unverified user vẫn đăng nhập nhưng bị App Worker chặn task. Resend dùng cùng callback URL, rate limit 1 lần/phút và 5 lần/giờ/user; duplicate request trong cửa sổ đó trả kết quả ổn định mà không phát nhiều link.
- Local/development/PR preview/staging dùng `test-outbox`: lưu message + verification URL trong resource riêng của environment, TTL bằng token 1 giờ, chỉ xem được qua local tooling hoặc Cloudflare Access. Không dùng stdout/application log làm mailbox.
- Production email sign-up và verification chỉ bật sau khi chọn transactional email provider, domain/sender và secrets riêng bằng decision launch mới. Google-authenticated account vẫn theo email verification claim của provider, nhưng production generation tiếp tục bị launch gate của ADR 0006 chặn.
- Trong local/development/PR preview/staging, Free Credit Grant không phụ thuộc callback chạy đúng một lần: verified testing paths gọi idempotent `ensureFreeCreditGrant(userId)`; unique grant key bảo vệ email callback, Google login và reconnect chạy đồng thời. Public Demo tuyệt đối không gọi Free Credit Grant như một entitlement; Credits chỉ đến từ Admin Credit Grant theo ADR 0008.

## Configuration and tests

- Required names vary by environment: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`; Google OAuth environments also require server-only `GOOGLE_CLIENT_SECRET`; testing email flows additionally require `EMAIL_DELIVERY_MODE`. Values tách theo environment và không commit.
- HTTP tests phải chứng minh testing sign-up → outbox → verify → session, resend throttling, invalid/expired/cross-environment callback, token redaction và one-time testing grant; Public Demo policy tests phải chứng minh email/password bị chặn, Google identity không tự grant Credits và OAuth secret không xuất hiện ở client config/log.

Official contract: [Better Auth email/password](https://www.better-auth.com/docs/authentication/email-password) and [email verification](https://www.better-auth.com/docs/concepts/email).
