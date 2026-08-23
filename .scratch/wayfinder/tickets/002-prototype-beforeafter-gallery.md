---
title: "Prototype — Fidelity Before/After + Style/Idea galleries"
label: wayfinder:prototype
type: prototype
status: open
assignee: null
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
