# DESIGN — Clone 1:1 homedesigns.app

> Nguồn: crawl trực tiếp 2026-08-23 qua `agent-browser` session `homedesign-ac6e747758b3` (login `redacted-test-email@example.invalid` ok). Toàn bộ ảnh màn hình lưu tại `docs/design/screenshots/`. Stack quan sát: **Next.js App Router + Turbopack** (`_next/static/chunks`), **Tailwind CSS** (3 chunks), **BetterAuth** (`__Secure-better-auth.session_token`), **Stripe + Google One Tap**, **CDN `cdn.homedesigns.app`**.

---

## 0. Screenshots (y hệt origin, dùng làm ground-truth)

| # | File | Mô tả | Kích thước |
|---|------|-------|------------|
| 1 | `screenshots/01-landing.png` | Landing `/` full — hero + 3 tools + Before/After + Pricing + FAQ | 2.68 MB, full scroll |
| 2 | `screenshots/02-ai-interior-design.png` | `/ai-interior-design` full — upload + controls + galleries + before/after | 1.58 MB |
| 3 | `screenshots/03-ai-exterior-design.png` | `/ai-exterior-design` full — tương tự interior nhưng palette/area khác | 2.19 MB |
| 4 | `screenshots/04-ai-floor-plan.png` | `/ai-floor-plan` full — upload floor plan + 6 feature blocks | 0.87 MB |
| 5 | `screenshots/05-interior-controls.png` | Viewport crop vùng controls interior (palette/ratio/generate) | 0.28 MB |
| 6 | `screenshots/06-landing-loggedin.png` | Landing sau login — nav hiện `T` avatar + badge `5` credits | 0.89 MB |

> Quy ước clone: mở từng PNG 1:1, đo spacing bằng DevTools, không đoán.

---

## 1. Information Architecture

```
/ (landing)
  #tools
  #before-after
  #pricing
  #faq
/ai-interior-design   — upload room → chọn Model/Room/Style/Palette/Ratio/Requirements → Generate → galleries → before/after
/ai-exterior-design   — upload house → Area/Exterior Style/Palette/Ratio → Generate → tương tự
/ai-floor-plan        — upload floor plan / Use Sample → Recognition → chọn Room+Style → 2D → 3D → 360°
/projects, /assets, /activity  — sau login (menu Redacted Test User)
/pricing  (anchor trong landing)
/privacy-policy, /terms-of-service, /home-design-software
/settings/*, /admin/*  — chỉ quan sát qua __NEXT_DATA__ (chưa crawl UI)
```

Nav chính (`Header` trong `__NEXT_DATA__`):
`HomeDesign logo → Design Tools | Before & After | Pricing | FAQ | [Claim Free Credits] | English | Pricing | Account` → sau login thay `Sign In` bằng avatar `T` + dropdown `Redacted Test User / Assets / Activity / Sign Out` + badge credits `5`.

Footer: brand + 3 cột `Design Tools | Resources | About` + social `Email` + `Privacy/Terms`.

---

## 2. Layout & Shell

- **App shell:** `SidebarProvider` + `SidebarInset` + `Header` + `LocaleDetector` (next-intl, `locale=en`). Theme `light` cố định (`show_theme:false`).
- **Viewport đo:** `1264×591, dpr 1`. Origin responsive mobile-first (width=device-width, initial-scale=1).
- **Background:** `rgb(246,240,228) #f6f0e4` trên `body` (warm paper). NProgress bar `#171411` 3px top.
- **Container:** max-width centered, padding ~24px mobile → 48px desktop (ước từ screenshot, đo lại bằng grid overlay).
- **Spacing:** Tailwind scale (nhìn CSS vars `--tw-*`). Gaps 16/24/32/48. Section padding 64-96px.
- **Radius:** pill buttons `3.35544e+07px` (full rounded), cards ~12-16px, upload dropzone ~16px.
- **Shadow:** nhẹ, card gallery `shadow-sm`, hero có depth.
- **Fonts:** `inter` (400-700) + fallback Arial `ascent-override 89.79%`, `jetbrains_mono` cho code/prompt. `h1 72px / 600` trên landing, `h2 ~36px`, `h3 ~20px`. Line-height ~1.1 cho display.

CSS entry: `/_next/static/chunks/f509e38a...css`, `867919...css`, `09e247...css` (Tailwind layers `properties`, `theme`, `base`).

---

## 3. Design Tokens (trích từ live)

```ts
colors: {
  paper: "#f6f0e4",          // body bg
  ink: "#171411",            // nprogress + primary text
  muted: "oklab(0.956 0.0016 0.017 / .7)", // btn bg secondary
  red:   "#fef2f2 → #fb2c36 → #e40...", // Tailwind red scale trong :root
}
typography: {
  sans: "inter, 'inter Fallback', Arial",
  mono: "jetbrains_mono",
  h1: "72px / 600 / tight",
  body: "16px / 400 / 1.5",
}
radius: {
  pill: "9999px", // render là 3.3e7px
  card: "12px",
  input: "8px",
}
spacing: [4,8,12,16,24,32,48,64,96]
breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280 }
```

> Clone: giữ Tailwind config, import `inter_latin` woff2 `3a6ba036` và `jetbrains_mono` woff2 `ec718a33` qua `next/font`.

---

## 4. Components (inventory 1:1)

### Header / Nav
- Logo `HomeDesign` (`/logo.png` 100×100, footer 1024×1024).
- Nav links 4 mục (Design Tools → `/#tools` etc). Mobile: `Toggle Sidebar` button.
- Right: `Claim Free Credits` (ghost), `English` locale selector, `Pricing`, `Account/Sign In` hoặc avatar `T` + credit badge `5`.
- Sticky, height ~64px, backdrop-blur nhẹ.

### Hero
- Landing: `See your future home in minutes` + CTA `Choose a design tool` (primary). Background `cdn.homedesigns.app/landing/hero-room-light.webp`.
- Interior/Exterior: `AI Interior/Exterior Design` H1 + sub, CTA `Upload Your Room Photo` / `Design My Exterior Now`, hero image `hero-floating-room-model.webp`.

### Upload Dropzone
- Label: `Upload a room photo` (Interior) / `Upload a home photo` (Exterior) / `Upload Floor Plan` — `PNG, JPG, JPEG up to 50MB` + hint `A clear, bright photo...` / `A clear daylight photo of the whole facade...` / `Drop an image here, or use sample`.
- Borders dashed, hover state, 4 example buttons (`Warm modern living room example` etc) kích hoạt fill.
- Floor Plan thêm `Use Sample Floor Plan` + states `Favorite/Private/Share`.

### Controls Row (Interior vs Exterior)
| Control | Interior | Exterior |
|---------|----------|----------|
| Mode | `Full Redesign` / `Local Edit` (segmented) | same |
| Model | `Nano Banana` (combobox) | same |
| Room/Area | `Room Type: Living Room` | `Area: House Facade` |
| Style | `Design Style: Modern Warm` | `Exterior Style: Modern` |
| Palette | `Neutral/Warm/Cool/Earth/Custom` → Custom enable textbox `e.g. navy blue and brass...` | `Classic White/Warm Earth/Modern Dark/Coastal Light/Custom` → `e.g. sage green siding...` |
| Aspect | `1:1 4:3 16:9 3:4 9:16` | `4:3 16:9 1:1 3:4 9:16` (thứ tự khác) |
| Requirements | `Custom Requirements 0/300` textarea | same |
| CTA | `Generate (1 Credits)` disabled khi chưa upload | same |

### Galleries
- `Popular Styles` (12 cards) + `Ideas for Every Room/Area` (10 cards). Mỗi card: ảnh `cdn.homedesigns.app/...`, overlay `Preview style` / `Use style` (Interior) hoặc `Preview area idea` / `Try this look` (Exterior). Nút `View all styles/ideas` → full catalog. Carousel với arrow buttons `[<] [>]`.

### Before/After
- Component `BeforeAfter` clickable, slider kéo, + 5 nút `Show comparison 1..5`. Tabs `Interior | Exterior | Floor Plan` trên landing để switch dataset. Ảnh `empty-living-room-before/after.webp`.

### How It Works (3 steps)
- `1 Upload a photo` → `2 Choose a style` → `3 Generate and compare` — mỗi step là button expandable với heading level 3.

### Pricing
- 4 tiers `Lite / Plus / Pro / Max` mỗi tier `Buy Credits` button. Section `How credits are used` + FAQ accordion. Pricing detail modal chưa capture (cần click Buy Credits ở ticket 005).

### FAQ
- Accordion `Frequently Asked Questions About AI Interior/Exterior Design`.

### Footer
- Brand description: `HomeDesign helps you explore interior, exterior, and floor-plan ideas...` + logo footer + 3 nav columns + `Email` + `Privacy Policy | Terms of Service` + locale switcher `English` bottom.

### Auth Modal
- `Sign In` heading, `Input your email here` + `Input your password here` (required), `Sign In` button, `Sign in with Google` (heading level 3), `Sign Up` link, `Close`. Sau login avatar `T` dropdown 3 items.

---

## 5. Page Specs (pixel notes từ PNG)

### Landing `/`
- Hero full-bleed, 2 cột (text left ~45%, image right).
- `All Your Home Design in One Place` 3 cards horizontal: Interior / Exterior / Floor Plan (mỗi card image poster `landing/ai-*-poster.webp` + title + `Try ...` link).
- Before/After centered, tabs pill.
- Pricing 4-cols grid, FAQ single col.

### Interior `/ai-interior-design`
- Layout: sidebar `Home/Projects/AI Interior/Exterior/Floor Plan` (WorkspaceSidebar), main 2 cột (controls left stack, galleries right) → mobile stack.
- Controls order: Upload → Full/Local → Model/Room/Style (3 combobox) → Palette row → Custom textbox disabled → Aspect row → Requirements → Generate.
- Galleries: 2 sections `Popular Styles` `Ideas for Every Room` mỗi section horizontal scroll.

### Exterior `/ai-exterior-design`
- Y hệt interior nhưng: Area combobox thay Room, Exterior Style list khác (Modern, Modern Farmhouse, Contemporary...), palette khác, `Powerful AI Exterior Design Capabilities` 6 sub-headings (`Redesign & Edit Modes`, `Structure-Aware Generation`...).

### Floor Plan `/ai-floor-plan`
- Layout khác hẳn: centered upload card (`Favorite/Private/Share` top), `Use Sample Floor Plan` CTA, `How AI Floor Plan Works` 3 steps horizontal, `AI Floor Plan Features` 6 feature cards (Recognition, Style Options, 2D Layouts, Room Adjustments, 3D Renders, 360° Views), video guide, `Explore Room Ideas` 8 cards (Modern Living Room...), Pricing.

---

## 6. Interaction & State

- **Upload validation:** client check `PNG/JPG/JPEG`, `<=50MB`, show error toast (chưa capture). Nhấn example button = preload ảnh mẫu.
- **Palette Custom:** chọn `Custom` → enable textbox, các preset disable.
- **Generate:** disabled khi chưa có ảnh, khi bấm → deduct 1 Credits, show progress (?) → ảnh result + BeforeAfter update.
- **Preview/Use:** `Preview style` mở modal ảnh lớn, `Use style` fill combobox + scroll tới controls.
- **Auth:** email+password → `POST /api/auth/sign-in/email` → set `__Secure-better-auth.session_token` → `GET /api/auth/get-session` → header đổi. Google One Tap auto-popup (đã thấy `accounts.google.com/gsi`).
- **Credits:** badge header realtime sau `POST /api/user/get-user-info`.

---

## 7. Assets & CDN

- `cdn.homedesigns.app/landing/*`, `ai-interior-design/before-after/*`, `ai-interior-design/hero-floating-room-model.webp`, `ai-exterior-design` tương tự. Clone thay bằng R2/S3 + `/_next/image?url=...&w=128&q=75` optimizer.
- Logo `/logo.png`, `/logo-footer.png` 1:1.

---

## 8. Responsive & A11y

- Đo snapshot: `@e*` refs có `clickable`, `expanded`, `required`, `placeholder` — giữ aria. Locale `en`, theme `light`.
- Mobile: sidebar drawer (`Toggle Sidebar`), galleries swipe, BeforeAfter touch drag.

---

## 9. Implementation Checklist cho Clone

- [ ] Next.js 15 + Turbopack + `next/font` inter/jetbrains_mono + Tailwind (copy 3 chunk vars).
- [ ] Body bg `#f6f0e4`, pill radius, nprogress `#171411`.
- [ ] Header/Footer 1:1 theo `__NEXT_DATA__` header/footer config.
- [ ] 4 pages với đúng controls order/palette/ratios như bảng trên.
- [ ] Upload 50MB + 4 example buttons + dropzone dashed.
- [ ] Galleries: 12 styles + 10 ideas, card `Preview/Use` overlay.
- [ ] BeforeAfter slider + 5 comparisons + tabs.
- [ ] Pricing 4 tiers + FAQ accordion.
- [ ] Auth modal + BetterAuth + Google One Tap (client_id `997586070123-...`).
- [ ] CDN abstraction để đổi `cdn.homedesigns.app` thành env var.

---

*Generated 2026-08-23 — so sánh PNG trong `screenshots/` trước khi code, mọi pixel lệch phải fix.*
