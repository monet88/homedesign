---
title: "Research — Stack & API contract homedesigns.app"
label: wayfinder:research
type: research
status: closed
assignee: homedesign-agent
closedAt: 2026-08-23
branch: research/stack-api-contract
---

## Question

Khóa lại **stack thực tế** và **API contract** của homedesigns.app làm baseline cho clone, để mọi quyết định sau không đoán.

Crawl đã làm (session `homedesign-ac6e747758b3`):
- Landing `/` + `/ai-interior-design` + `/ai-exterior-design` + `/ai-floor-plan` — snapshot đầy đủ (model Nano Banana, room/area/style, palette, aspect ratios, 50MB upload, BeforeAfter).
- Login email `redacted-test-email@example.invalid` / `redacted-test-password` thành công → cookie `__Secure-better-auth.session_token`, menu `Redacted Test User / Assets / Activity / Sign Out`.
- Network: `POST /api/config/get-configs` → `{stripe_enabled:true, google_one_tap_enabled:true, google_client_id:9975..., email_auth_enabled:true}`, `GET /api/auth/get-session`, `POST /api/auth/sign-in/email`, `POST /api/user/get-user-info`, `GET /api/ai/model-pricing`, `_next/static/chunks` Turbopack, `cdn.homedesigns.app`.

Cần trả lời trong ticket này (AFK, 1 session, branch `research/stack-api-contract`):
1. Xác nhận framework: Next.js version (từ chunks/headers), BetterAuth vs NextAuth, DB implied?
2. Liệt kê toàn bộ `/_next/*` và `/api/*` endpoints đã quan sát + method/shape (har đã capture 60+ requests).
3. Auth flow chi tiết: email+password + Google One Tap, session cookie attrs, `/api/auth/get-session` response shape.
4. CDN & upload: `cdn.homedesigns.app` host, upload endpoint nào (chưa bắt được POST generation)?
5. Trả về context pointer: file `research/stack-api-contract.md` + har snippet, để các ticket auth/upload/generation không phải crawl lại.

Không quyết định chọn stack mới — chỉ khóa fact origin. Quyết định chọn clone stack để cho ticket khác.

Blocked by: (none) — frontier

## Resolution

**Closed 2026-08-23** — AFK research xong trên branch `research/stack-api-contract` (commit `8e14af3`, merged `f323267`).

**Context pointer:** `research/stack-api-contract.md:1` (94 lines) + `docs/design/DESIGN.md:1` + HAR `§92-§97` (config, model-pricing, auth session).

**Gist:** Origin là **Next.js App Router + Turbopack + Cloudflare OpenNext** (`X-Powered-By: Next.js`, `x-opennext:1`), **BetterAuth** (cookie `__Secure-better-auth.session_token`, `POST /api/auth/sign-in/email` → `GET /api/auth/get-session` → `POST /api/user/get-user-info` → `credits.remainingCredits:5`), **Stripe-only** (`stripe_enabled:true`), **Google One Tap** `997586...`, **CDN `cdn.homedesigns.app`**, **model-pricing version 2** (`gemini-2.5-flash-image default 1 credit`, `roomDesign brief/layout/render/panorama 1/2/3/4 credits`). Đã khóa toàn bộ `/_next/*` và `/api/*` contract; generation POST & upload endpoint để lại ticket 004.

**Unblocks:** 003,004,005 now frontier. Agent-browser daemon treo sau 6 screenshots — khuyến nghị session mới `research-*` cho ticket sau.
