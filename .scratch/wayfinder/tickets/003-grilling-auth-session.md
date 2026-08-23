---
title: "Grilling — Auth & session (BetterAuth vs NextAuth vs Supabase)"
label: wayfinder:grilling
type: grilling
status: closed
assignee: homedesign-agent
closedAt: 2026-08-23
branch: grilling/auth-session
---

## Question

Quyết định **auth provider & session strategy** cho clone.

Fact từ origin (chờ 001 khóa lại, nhưng đã thấy): `__Secure-better-auth.session_token`, `POST /api/auth/sign-in/email`, `GET /api/auth/get-session`, `google_client_id 997586...`, Google One Tap + email+password, không thấy NextAuth.

Grilling (HITL, cần Đại Ca):
- Giữ **BetterAuth** y hệt origin để giảm rủi ro, hay đổi **NextAuth/Auth.js** / **Supabase Auth** vì ecosystem quen hơn?
- Session: cookie `__Secure-...` httpOnly + `get-session` polling như origin, hay JWT stateless?
- Google One Tap: bắt buộc day-1 hay defer sau email login?
- Edge: email_verification_enabled:true — flow verify ra sao, có block generation khi chưa verify không?

Gọi Skill `grilling` + `domain-modeling` (update CONTEXT.md Identity & Billing nếu đổi thuật ngữ). Kết quả là ADR ngắn + checklist env vars.

Blocked by: 001-research-stack-api-contract

## Resolution

**Closed 2026-08-23** — HITL grilling xong (Đại Ca all-recommend), consult `grilling` + `domain-modeling`, nhánh `grilling/auth-session` (commit `c1da3ca`, merged `88070fb`).

**Context pointer:** `docs/adr/0001-betterauth-session.md:1` + `research/stack-api-contract.md:1` + `CONTEXT.md:1` (Identity & Billing).

**Gist:** Giữ **BetterAuth** y hệt origin (`__Secure-better-auth.session_token`, `POST /api/auth/sign-in/email`, `GET /api/auth/get-session` shape `session{expiresAt+7d,token,userId}, user{emailVerified}`), **không đổi NextAuth/Supabase**. Session cookie httpOnly Secure + polling, **Google One Tap day-1** (`997586...`), `email_verification_enabled:true` → block Generate khi chưa verify. Env checklist: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `STRIPE_*`.

**Unblocks:** 006 (cần 003+005), 009 (cần 003+007). Không đổi thuật ngữ CONTEXT.md.
