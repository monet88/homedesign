---
label: wayfinder:map
title: "Map — Clone 1:1 homedesigns.app (Interior / Exterior / Floor Plan)"
status: open
---

## Destination

Bản spec + kiến trúc + prototype fidelity đầy đủ để bàn giao cho team build clone y hệt https://homedesigns.app/ — gồm landing `/`, `/ai-interior-design`, `/ai-exterior-design`, `/ai-floor-plan` (đã crawl & login `redacted-test-email@example.invalid` thành công). Map xong là **sẵn sàng code**, không phải code production trong map (Wayfinder: plan, don't do). Handoff = bộ quyết định + context pointers, không còn gì phải quyết trước khi build.

## Notes

- Domain: AI home design credit-based (CONTEXT.md). Đã quan sát: Next.js Turbopack `_next/static/chunks`, BetterAuth `__Secure-better-auth.session_token`, Stripe `stripe_enabled:true`, Google One Tap `997586070123-...`, CDN `cdn.homedesigns.app`, Model `Nano Banana`.
- Skills mỗi session consult: `grilling`, `domain-modeling`, `prototype` (khi cần nâng fidelity), `research` cho fact ngoài repo.
- Ponytail full: YAGNI, stdlib/native trước dependency, shortest diff. Mỗi ticket = 1 quyết định, 1 session.
- Tracker: local markdown `.scratch/wayfinder/tickets/*.md` (xem `docs/agents/issue-tracker.md`). Blocking = body convention `Blocked by:`.
- 2026-08-23 Đại Ca chốt all recommend: Destination = spec+kiến trúc+prototype là handoff (không code trong map); Stack giữ BetterAuth+Next.js Turbopack; Billing Stripe-only day-1; Floor Plan full 2D→3D→360° với 360° stub tĩnh. Design ground-truth = `docs/design/DESIGN.md` + 6 PNG.

## Decisions so far

<!-- index: một dòng/ticket đã close, đủ để判断 relevance, link tới ticket cho chi tiết -->

- [Grilling — Auth & session — RECOMEND CHỐT](.scratch/wayfinder/tickets/003-grilling-auth-session.md): Giữ BetterAuth + Next.js Turbopack y hệt origin, Stripe-only day-1 — chốt 2026-08-23 theo grilling all-recommend (Đại Ca).
- [DESIGN.md — Clone 1:1 spec](docs/design/DESIGN.md): Đã chụp 6 PNG full (01-landing 2.68MB, 02-interior 1.58MB, 03-exterior 2.19MB, 04-floorplan 0.87MB, 05-controls, 06-loggedin) + trích tokens paper #f6f0e4, ink #171411, inter 72px/600, pill radius — làm ground-truth cho prototype.
- [Research — Stack & API contract homedesigns.app](.scratch/wayfinder/tickets/001-research-stack-api-contract.md): Khóa Next.js+Cloudflare OpenNext + BetterAuth + Stripe + CDN + model-pricing v2 (roomDesign 1/2/3/4 credits) — chi tiết `research/stack-api-contract.md:1`, unblock 003/004/005.

## Not yet specified

<!-- fog trong scope nhưng chưa đủ sắc để ticket — sẽ graduate khi frontier tiến -->

- Mapping chính xác Credits/tiers Lite/Plus/Pro/Max (số credits, giá, limit) — đang thấy 4 nút Buy Credits nhưng chưa scrape pricing detail, chờ ticket Credits.
- Pipeline Floor Plan chi tiết (Recognition model nào, 2D→3D→360° dùng service nào) — cần research Generation xong mới sắc.
- Chiến lược deploy & CDN thay thế `cdn.homedesigns.app` (Vercel + R2/S3 vs Cloudflare) — phụ thuộc quyết định stack & upload.
- i18n & SEO: hiện chỉ English, Change language button tồn tại nhưng chưa rõ scope đa ngữ.
- Admin/CMS cho Styles/Ideas: có cần backoffice hay seed tĩnh từ crawl?

## Out of scope

<!-- đã consciously loại khỏi effort này — không graduate -->

- Mobile native apps (iOS/Android) — destination là web clone.
- Marketplace/cộng đồng user-generated styles ngoài gallery hiện có.
- AR/VR headset viewing cho 360° — chỉ 360° web viewer như origin.
