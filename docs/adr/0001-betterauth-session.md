# ADR 0001 — Keep BetterAuth + cookie session (clone y hệt origin)

Giữ **BetterAuth** với cookie `__Secure-better-auth.session_token` + `GET /api/auth/get-session` polling như homedesigns.app, thay vì đổi sang NextAuth/Supabase, để giảm rủi ro drift và reuse luôn `POST /api/auth/sign-in/email` shape đã khóa ở `research/stack-api-contract.md:1` (version 2 model-pricing, credits 5).

**Considered Options:**
- NextAuth/Auth.js — quen hơn nhưng khác cookie/session shape, phải rewrite `get-session` + Google One Tap `997586...`
- Supabase Auth — lock-in hosting, khác email_verified flow (`email_verification_enabled:true`)

**Consequences:**
- Env: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID=997586070123-...`, `STRIPE_*` giữ nguyên. Session 7 ngày (`expiresAt +7d`), httpOnly Secure. Google One Tap day-1 (không defer). Email verify bắt buộc trước `Generate (1 Credits)`.
- Clone `docs/design/DESIGN.md` header đổi `Sign In` → avatar `T` + dropdown `Assets/Activity/Sign Out` giữ nguyên logic.
