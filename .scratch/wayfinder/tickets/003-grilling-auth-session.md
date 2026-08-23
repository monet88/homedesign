---
title: "Grilling — Auth & session (BetterAuth vs NextAuth vs Supabase)"
label: wayfinder:grilling
type: grilling
status: open
assignee: null
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
