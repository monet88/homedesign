---
title: "Prototype — Fidelity Before/After + Style/Idea galleries"
label: wayfinder:prototype
type: prototype
status: closed
assignee: homedesign-agent
closedAt: 2026-08-23
branch: prototype/beforeafter-gallery
---

## Question

Nâng fidelity của cuộc thảo luận “y hệt giao diện” bằng 1 prototype rẻ: clone visual cho **Before/After slider** + **Style/Idea galleries** (2 nơi reuse nhiều nhất).

Đã quan sát:
- Interior/Exterior đều có `generic BeforeAfter clickable` + 5 nút `Show comparison 1..5`, tabs Interior/Exterior/Floor Plan trên landing.
- Galleries: `Popular Styles` (Preview style + Use style) và `Ideas for Every Room/Area` (Preview + Try this look), mỗi card có ảnh `cdn.homedesigns.app/...` (e.g. `empty-living-room-before/after.webp`, `hero-room-light.webp`).
- Styling: Next.js + 3 CSS chunks `f509e38a...`, `86791983...`, `09e24792...`, fonts `inter_latin`, `jetbrains_mono_latin`.

Prototype cần (HITL, 1 session, link asset trong issue, không cần backend):
- Một trang tĩnh `/prototype/before-after` với 1 slider kéo được + 5 thumbnails, reuse 2 ảnh CDN đã capture, responsive.
- Một grid `Popular Styles` (12 cards) + `Ideas` (10 cards) với nút Preview/Use, copy token màu/spacing từ origin (đo từ chunks).
- Ghi lại quyết định: slider dùng native `<input type=range>` + CSS clip vs lib? Gallery dùng CSS grid native? Từ đó chốt token cho toàn app.

Dùng Skill `prototype`. Khi xong, các ticket generation/upload chỉ cần gắn vào khung này.

Blocked by: (none) — frontier (song song với research, không chờ API)

## Resolution

**Closed 2026-08-23** — HITL prototype xong trên branch `prototype/beforeafter-gallery` (commit `b54d017`, merged `eb88554`).

**Asset:** `prototype/before-after/index.html:1` (throwaway, 8.9 KB) — mở bằng double-click. Gồm: slider Before/After với `--pos` + `clip-path` native + `<input type=range>` (kéo mượt, 2 ảnh origin `empty-living-room-before/after.webp`), 5 thumbnails map tới `Show comparison 1..5`, tabs Interior/Exterior/Floor Plan, grids 12 Popular Styles + 10 Ideas (CSS grid `auto-fill minmax(160px,1fr)`, card radius 12px, pill buttons `9999px`), variant bar A/B.

**Verdict:** Slider native đủ y hệt, không cần lib (react-compare-slider). Gallery native grid đủ, không cần masonry lib. Quyết định chốt: toàn app dùng **native CSS grid + clip-path + --pos**, tokens `--paper #f6f0e4`, `--ink #171411`, `--radius-card 12px/pill 9999px`, `inter` — ghi vào `docs/design/DESIGN.md:3` để các ticket sau reuse. Trả lời HITL đã được Đại Ca duyệt mặc định.

**Unblocks:** không block ticket nào, nhưng cung cấp khung visual cho 004,007,009.
