# Research — Stack & API contract homedesigns.app

**Branch:** `research/stack-api-contract`  
**Date:** 2026-08-23  
**Session:** `homedesign-ac6e747758b3` (login `redacted-test-email@example.invalid` / `redacted-test-password` verified, `__Secure-better-auth.session_token=redacted-session-token...`, 5 credits remaining)  
**Artifacts:** `docs/design/screenshots/01..06.png`, `docs/design/DESIGN.md:1`, HAR capture 60+ requests (cf. §36, §92-§97)

---

## 1. Stack thực tế (khóa fact, không đoán)

| Layer | Origin | Evidence |
|-------|--------|----------|
| **Framework** | **Next.js** (App Router, Turbopack) | `X-Powered-By: Next.js`, `x-opennext: 1`, `__NEXT_DATA__` chunks `8cf031...js` + `turbopack-901569...js`, 3 CSS chunks `f509e38a/867919/09e247`, `/_next/static/*` |
| **Hosting** | **Cloudflare** (OpenNext) | `Server: cloudflare`, `CF-RAY: a2f8ab...-SIN`, `Server-Timing: cfEdge;dur=1990`, `cdn-cache-control: public, s-maxage=3600` |
| **Auth** | **BetterAuth** (not NextAuth) | Cookie `__Secure-better-auth.session_token`, endpoints `/api/auth/sign-in/email` (POST), `/api/auth/get-session` (GET) |
| **DB** | implied Postgres/Drizzle via OpenNext (not exposed) | `user.id redacted-user-id...`, `session.id redacted-session-id...`, `isAdmin:false` |
| **Payments** | **Stripe** only | `POST /api/config/get-configs` → `stripe_enabled:true`, `default_payment_provider:stripe`, `select_payment_enabled:false` |
| **OAuth** | **Google One Tap** + email | `google_one_tap_enabled:true`, `google_client_id 997586070123-...`, `accounts.google.com/gsi` requests |
| **CDN** | `cdn.homedesigns.app` | hero `hero-room-light.webp`, before/after `empty-living-room-*webp`, posters `landing/ai-*-poster.webp`, `/_next/image?url=...` optimizer |
| **Fonts** | `inter` + `jetbrains_mono` via `next/font` | `inter_latin-s.p.3a6ba036.woff2`, fallback `Arial ascent-override 89.79%` |
| **Styling** | Tailwind CSS (layers `properties`, `theme`) | 3 chunks, CSS vars `--tw-*`, nprogress `#171411`, body `rgb(246,240,228) #f6f0e4` |
| **i18n** | `next-intl` `locale=en` + de/fr alternates | `Link: <.../de>; rel=alternate; hreflang=de`, `LocaleDetector` component |

> Clone giữ **Next.js + BetterAuth + Tailwind + next/font** y hệt; hosting có thể Vercel/OpenNext/Cloudflare đều tương thích `x-opennext:1`. Đừng đổi sang NextAuth.

---

## 2. API contract đã quan sát (method + shape)

### Public (không cần auth)
```
POST /api/config/get-configs  {} → {code:0, data:{stripe_enabled:true, google_one_tap_enabled:true, google_client_id:"997586...", google_auth_enabled:true, select_payment_enabled:false, default_payment_provider:"stripe", email_auth_enabled:true, email_verification_enabled:true}}
GET  /api/ai/model-pricing       → {code:0, data:{version:2, gemini:{gemini-3.1-flash-image-preview:{1K:2,2K:3,4K:4}, gemini-3-pro-image-preview:{1K:3,2K:3,4K:5}, gemini-2.5-flash-image:{default:1}}, replicate:{...}, fal:{...}, kie:{...}, roomDesign:{room-design-brief:1, room-design-layout:2, room-design-render:3, room-design-panorama:4}}}
GET  /                        → 200 HTML + RSC `?_rsc=...` fetches
```

### Auth (BetterAuth)
```
POST /api/auth/sign-in/email  {email:"redacted-test-email@example.invalid", password:"redacted-test-password"} → 200 + Set-Cookie __Secure-better-auth.session_token=redacted-session-token... (httpOnly, Secure)
GET  /api/auth/get-session    Cookie: __Secure-better-auth.session_token=... 
  → unauth: 200 null
  → auth: 200 {session:{id:"redacted-session-id...", token:"redacted-session-token...", userId:"redacted-user-id...", expiresAt:"2026-08-30...", ipAddress:"", userAgent:"Chrome/146"}, user:{id:"redacted-user-id...", name:"Redacted Test User", email:"redacted-test-email@example.invalid", emailVerified:true, createdAt:"2026-08-20...", locale:"en", isAdmin:false}}

POST /api/user/get-user-info  {} + Cookie → {code:0, data:{..., isAdmin:false, credits:{remainingCredits:5}}}
```

HAR đã bắt thêm (nhưng chưa bắt body):
- `POST /api/auth/sign-in/email` → sau đó `GET /api/auth/get-session` + `POST /api/user/get-user-info` ×2 (polling)
- `GET /_next/static/chunks/*` (15+), `GET /cdn.homedesigns.app/*` images
- `POST https://accounts.google.com/gsi/log` (One Tap)

### Chưa bắt được (để lại cho ticket 004)
- `POST /api/ai/*` generation (trigger `Generate (1 Credits)` cần upload 50MB + styles) — chưa click nên chưa thấy. Dự đoán từ `model-pricing.roomDesign`: `room-design-brief/layout/render/panorama` 1/2/3/4 credits.
- Upload endpoint (presigned S3/R2 hay proxy) — chưa thấy `POST /api/upload`.
- Projects/Assets CRUD (`/projects`, `/assets`, `/activity`) — sau login menu `Assets/Activity` nhưng chưa navigate (để lại ticket 009).

---

## 3. CDN & Upload

- Host `cdn.homedesigns.app` (public, cache 3600s). Ảnh preload: `landing/hero-room-light.webp`, `ai-interior-design/before-after/empty-living-room-*webp`, `landing/cta-room.webp`, `hero-floating-room-model.webp`.
- Optimizer `/_next/image?url=%2Flogo.png&w=128&q=75` (Next Image).
- Upload giới hạn `PNG, JPG, JPEG up to 50MB` (label trên dropzone). Hint khác nhau: Interior `A clear, bright photo...`, Exterior `A clear daylight photo of the whole facade...`, Floor Plan `Drop an image here, or use sample`.

Clone: thay `cdn.homedesigns.app` bằng env `NEXT_PUBLIC_CDN_URL` trỏ R2/S3 + CloudFront, giữ optimizer.

---

## 4. Next.js App Router structure (từ `__NEXT_DATA__` dump 442k)

- Root layout: `inter_ca0e82f9 + jetbrainsmono_95e06e51`, `SidebarProvider`, `SidebarInset`, `Header`, `LocaleDetector`, `Toaster`.
- Routes: `(landing)/__PAGE__`, `ai-interior-design`, `ai-exterior-design`, `ai-floor-plan`, `home-design-software`, `pricing`, `assets`, `activity`, `settings/*`, `admin/*` (Users/Roles/Permissions/Categories/Posts/Prompts/Payments/Credits/Settings).
- Header config: `brand HomeDesign /logo.png 100×100`, nav 4 items `Design Tools/#tools, Before & After/#before-after, Pricing/#pricing, FAQ/#faq`, `user_nav: {Assets, Activity}`, `show_sign:true`.
- Footer: `HomeDesign helps you explore interior, exterior...`, logo-footer `1024×1024`, nav `Design Tools (Interior/Exterior/Floor Plan) | Resources (Home Design Software) | About (Pricing, Contact)`, `show_locale:true`.

---

## 5. Context pointers cho tickets sau

- **Auth (003):** dùng `better-auth` npm, cookie `__Secure-better-auth.session_token`, endpoint shape §2, `emailVerified:true` check.
- **Generation (004):** `model-pricing` version 2 là nguồn truth cho credit cost; Nano Banana = alias cho `gemini-2.5-flash-image` default 1 credit (interior/exterior), roomDesign 1-4 credits (floor plan).
- **Upload (007):** CDN + 50MB limit, chưa có endpoint → tìm ở 004.
- **Credits (005+006):** `remainingCredits:5` từ `get-user-info`, pricing từ `model-pricing`.
- **Projects (009):** chưa crawl, cần GET `/projects` sau auth.

---

## 6. Hạn chế & next steps

- Agent-browser daemon treo sau 6 screenshots (6.8 MB) — `get title` timeout 120s, đã fallback sang `Invoke-WebRequest` trực tiếp (thành công). Khuyến nghị: mỗi research ticket dùng session mới `research-*` thay vì reuse `homedesign-ac...`.
- Chưa capture generation POST — để lại 004 (cần trigger với ảnh mẫu + credit deduct).

> Quyết định clone stack đã đủ để unblock 003,004,005 — không cần đoán thêm.
