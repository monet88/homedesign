---
label: wayfinder:map
title: "Map — Clone 1:1 homedesigns.app (Interior / Exterior / Floor Plan)"
status: closed
---

## Destination

Bản spec + kiến trúc + prototype fidelity đầy đủ để bàn giao cho team build clone UI/workflow https://homedesigns.app/ — gồm landing `/`, `/ai-interior-design`, `/ai-exterior-design`, `/ai-floor-plan` (đã crawl bằng authenticated research account; personal data đã redact). Bản đầu **free-first**, chưa tích hợp checkout/payment. Map xong là **sẵn sàng code**, không phải code production trong map (Wayfinder: plan, don't do). Handoff = bộ quyết định + context pointers, không còn gì phải quyết trước khi build.

## Notes

- Domain: AI home design credit-based (CONTEXT.md). Đã quan sát: Next.js Turbopack `_next/static/chunks`, BetterAuth `__Secure-better-auth.session_token`, Stripe `stripe_enabled:true`, Google One Tap `997586070123-...`, CDN `cdn.homedesigns.app`, Model `Nano Banana`.
- Skills mỗi session consult: `grilling`, `domain-modeling`, `prototype` (khi cần nâng fidelity), `research` cho fact ngoài repo.
- Ponytail full: YAGNI, stdlib/native trước dependency, shortest diff. Mỗi ticket = 1 quyết định, 1 session.
- Tracker: local markdown `.scratch/wayfinder/tickets/*.md` (xem `docs/agents/issue-tracker.md`). Blocking = body convention `Blocked by:`.
- 2026-08-23 Đại Ca chốt all recommend: Destination = spec+kiến trúc+prototype là handoff (không code trong map); Stack giữ BetterAuth+Next.js Turbopack; Floor Plan full 2D→3D→360° với 360° stub tĩnh. Design ground-truth = `docs/design/DESIGN.md` + 6 PNG.
- 2026-08-25 Đại Ca đổi rollout sang free-first: giữ Credits để đo quota/usage, chưa tích hợp Stripe/payment; phase payment làm sau.
- 2026-08-25 Video feature đầy đủ và ADR 0004 supersede quyết định Floor Plan stub tĩnh bằng panorama web tương tác.
- 2026-08-26 Đại Ca đơn giản hóa upload security: Intake Validation bounded byte/header trong Worker; full decode/re-encode, EXIF stripping và Container deferred. Workers Paid chỉ bật theo production build/CPU evidence.

## Decisions so far

<!-- index: một dòng/ticket đã close, đủ để判断 relevance, link tới ticket cho chi tiết -->

- [Grilling — Deploy runtime & environment topology](.scratch/wayfinder/tickets/010-grilling-deploy-runtime.md): Cloudflare OpenNext/Workers + D1/R2/Queues/Workflows, Worker-only Intake Validation, four-account isolation, ephemeral PR resources và evidence-based Paid upgrade — ADR `docs/adr/0006-cloudflare-runtime-and-isolated-environments.md:1`.
- [Grilling — Projects / Assets / Activity & sharing](.scratch/wayfinder/tickets/009-grilling-projects-library.md): Project là aggregate visibility/favorite/share; Asset private độc lập; unlisted read-only sharing; cursor-based Project/Asset grids và owner Activity timeline — ADR `docs/adr/0005-project-library-and-unlisted-sharing.md:1`.
- [Grilling — Floor Plan domain](.scratch/wayfinder/tickets/008-grilling-floorplan-domain.md): Room-centric pipeline Room Brief → ảnh 2D → photorealistic Render → panorama tùy chọn, immutable stage lineage và Pannellum viewer; không CAD/BIM/editor/3D scene — ADR `docs/adr/0004-room-centric-floor-plan-visualization.md:1`.
- [Grilling — Upload 50MB & CDN/Storage](.scratch/wayfinder/tickets/007-grilling-upload-cdn.md): R2 storage-first, 50MB direct presigned upload, private user Assets qua bounded byte/header quarantine validation; Canonicalization deferred — ADR `docs/adr/0003-r2-storage-first-private-assets.md:1`.
- [Grilling — Free credits & usage rules](.scratch/wayfinder/tickets/006-grilling-credits-pricing.md): Testing dùng one-time 10 Credits + immutable ledger/holds + Mock Payment ở local/development/PR preview/staging; payment thật deferred — ADR `docs/adr/0002-free-first-credits-and-mock-payment.md:1`.
- [Grilling — Auth & session](.scratch/wayfinder/tickets/003-grilling-auth-session.md): Giữ BetterAuth y hệt origin (cookie `__Secure-better-auth.session_token`, `GET /api/auth/get-session`, Google One Tap day-1, email verify block Generate) — ADR `docs/adr/0001-betterauth-session.md:1`, branch `grilling/auth-session`.
- [DESIGN.md — Clone 1:1 spec](docs/design/DESIGN.md): Đã chụp 6 PNG full (01-landing 2.68MB, 02-interior 1.58MB, 03-exterior 2.19MB, 04-floorplan 0.87MB, 05-controls, 06-loggedin) + trích tokens paper #f6f0e4, ink #171411, inter 72px/600, pill radius — làm ground-truth cho prototype.
- [Research — Stack & API contract homedesigns.app](.scratch/wayfinder/tickets/001-research-stack-api-contract.md): Khóa Next.js+Cloudflare OpenNext + BetterAuth + Stripe + CDN + model-pricing v2 (roomDesign 1/2/3/4 credits) — chi tiết `research/stack-api-contract.md:1`, unblock 003/004/005.
- [Prototype — Fidelity Before/After + Style/Idea galleries](.scratch/wayfinder/tickets/002-prototype-beforeafter-gallery.md): Native slider `clip-path+--pos+range` + grid `auto-fill 160px` chốt y hệt, không lib — asset `prototype/before-after/index.html:1`, branch `prototype/beforeafter-gallery`.
- [Research — Generation pipeline](.scratch/wayfinder/tickets/004-research-generation-pipeline.md): Khóa `/api/ai/generate` + `/api/ai/query` (poll 2.5s/120s) + prompt template verbatim + Floor Plan state machine 4 scenes (brief/layout/render/panorama) — chi tiết `research/generation-pipeline.md:1`, unblock 007/008.

## Not yet specified

<!-- fog trong scope nhưng chưa đủ sắc để ticket — sẽ graduate khi frontier tiến -->

- i18n & SEO: hiện chỉ English, Change language button tồn tại nhưng chưa rõ scope đa ngữ. **2026-08-26 Đại Ca chốt: bỏ khỏi spec build #1, graduate sau.**
- Admin/CMS cho Styles/Ideas: có cần backoffice hay seed tĩnh từ crawl? **2026-08-26 Đại Ca chốt: seed tĩnh từ crawl, không backoffice trong spec build #1.**

## Handoff

**Closed 2026-08-26** — 10/10 tickets closed. Decisions collapsed vào spec `.scratch/homedesign-clone/spec.md` (label `ready-for-agent`) theo đúng hướng wayfinder: handoff, không build. Tiếp theo: `/to-tickets` từ spec đó.

## Out of scope

<!-- đã consciously loại khỏi effort này — không graduate -->

- Mobile native apps (iOS/Android) — destination là web clone.
- Marketplace/cộng đồng user-generated styles ngoài gallery hiện có.
- AR/VR headset viewing cho 360° — chỉ 360° web viewer như origin.
- [Task — Chuẩn bị Stripe sandbox & pricing scrape](.scratch/wayfinder/tickets/005-task-stripe-sandbox.md): Stripe sandbox/webhook/checkout và paid tiers không thuộc bản free-first; origin pricing đã scrape và giữ lại cho phase payment sau.
