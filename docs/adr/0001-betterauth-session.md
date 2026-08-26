# ADR 0001 — BetterAuth session and verified-email gate

Giữ BetterAuth, cookie `__Secure-better-auth.session_token` và endpoint namespace `/api/auth/*` để khớp origin, nhưng browser-readable session response không được chứa session token. Build #1 cho phép user đăng nhập khi chưa verify để thấy app; App Worker mới là authority chặn mọi task billable tới khi `user.emailVerified=true`.

**Status:** accepted

## Browser auth contract

- Email/password dùng `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`, `POST /api/auth/send-verification-email` và `GET /api/auth/get-session`. Google One Tap là day-1 và dùng client ID riêng theo environment.
- Session sống 7 ngày trong cookie httpOnly, Secure, SameSite Lax. `GET /api/auth/get-session` trả session metadata tối thiểu và user profile cần cho UI; field token/session secret bị loại khỏi JSON dù origin đã quan sát có trả field này.
- Anonymous Generate bị chặn client-side để phản hồi nhanh. Server luôn kiểm tra session, ownership và `emailVerified`; user chưa verify nhận `403 EMAIL_NOT_VERIFIED`, không tạo task hoặc Credit Hold.
- Callback URL chỉ nhận same-environment origin từ allowlist. Auth error, resend và expired/invalid link đều có UI state rõ; không đưa email, verification token hoặc session token vào log.

## Email verification delivery

- BetterAuth `sendVerificationEmail` đi qua `EmailDelivery` adapter, `sendOnSignUp=true`, verification link/token hết hạn sau 1 giờ và `requireEmailVerification=false` để unverified user vẫn đăng nhập nhưng bị App Worker chặn task. Resend dùng cùng callback URL, rate limit 1 lần/phút và 5 lần/giờ/user; duplicate request trong cửa sổ đó trả kết quả ổn định mà không phát nhiều link.
- Local/development/PR preview/staging dùng `test-outbox`: lưu message + verification URL trong resource riêng của environment, TTL bằng token 1 giờ, chỉ xem được qua local tooling hoặc Cloudflare Access. Không dùng stdout/application log làm mailbox.
- Production email sign-up và verification chỉ bật sau khi chọn transactional email provider, domain/sender và secrets riêng bằng decision launch mới. Google-authenticated account vẫn theo email verification claim của provider, nhưng production generation tiếp tục bị launch gate của ADR 0006 chặn.
- Free Credit Grant không phụ thuộc callback chạy đúng một lần: mọi authenticated verified path gọi idempotent `ensureFreeCreditGrant(userId)` trước khi trả credit badge hoặc chấp nhận task; unique grant key bảo vệ email callback, Google login và reconnect chạy đồng thời.

## Configuration and tests

- Required names: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `EMAIL_DELIVERY_MODE`; values tách theo environment và không commit.
- HTTP tests phải chứng minh sign-up → outbox → verify → session, resend throttling, invalid/expired/cross-environment callback, token redaction, unverified server rejection và one-time grant qua cả email lẫn Google path.

Official contract: [Better Auth email/password](https://www.better-auth.com/docs/authentication/email-password) and [email verification](https://www.better-auth.com/docs/concepts/email).
