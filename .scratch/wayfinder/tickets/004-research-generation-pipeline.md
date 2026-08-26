---
title: "Research — Generation pipeline (Nano Banana, Full/Local, palettes, ratios)"
label: wayfinder:research
type: research
status: closed
assignee: homedesign-agent
closedAt: 2026-08-23
branch: research/generation-pipeline
---

## Question

Làm rõ **pipeline generation** Interior/Exterior để clone không sai payload.

Đã quan sát (cần 001 xác nhận + bắt thêm network khi bấm Generate):
- Interior: `Model=Nano Banana`, `Room Type=Living Room` (combobox), `Design Style=Modern Warm`, `Palette=Neutral/Warm/Cool/Earth/Custom` (Custom enable textbox `e.g. navy blue...`), `Aspect 1:1/4:3/16:9/3:4/9:16`, `Custom Requirements 0/300`, `Full Redesign / Local Edit`, `Generate (1 Credits)`, upload 50MB PNG/JPG/JPEG.
- Exterior: tương tự nhưng `Area=House Facade`, `Exterior Style=Modern`, palette `Classic White/Warm Earth/Modern Dark/Coastal Light/Custom` (`e.g. sage green siding...`).
- Cả hai: galleries styles/areas + BeforeAfter.

Ticket này (AFK, 1 session, branch `research/generation-pipeline`):
1. Capture request thực tế khi Generate (POST nào, form-data vs json, fields, credit deduct, response shape) — cần trigger 1 lần với ảnh mẫu (có 4 example buttons sẵn).
2. Document mapping Model→Style→Room/Area→Palette→Ratio→Custom Requirements → prompt gửi tới provider.
3. Xác định provider đứng sau Nano Banana (proxy tới Replicate/Fal/own?) và cần key nào.
4. Output: `research/generation-pipeline.md` với payload sample + state machine Full vs Local.

Blocked by: 001-research-stack-api-contract

## Resolution

**Closed 2026-08-23** — AFK research xong, branch `research/generation-pipeline` (commit `df52ad1`, merged master). Method: pull 35 JS chunks (4.2MB) của trang và grep contract từ chính code client origin — chính xác hơn network sniffing.

**Context pointer:** `research/generation-pipeline.md:1`

**Gist:** `POST /api/ai/generate` JSON `{mediaType:image, scene:image-to-image, provider, model(code|resolution), prompt(template verbatim đã trích), options:{aspect_ratio, image_input:[dataURL], num_outputs:1, resolution?, quality?}}` → `{code:0,data:{id}}`. Poll `POST /api/ai/query {taskId}` mỗi 2.5s tối đa 120s; `taskInfo/taskResult` là JSON string. Download `POST /api/assets/download`. Upload chung `POST /api/storage/upload-image` FormData `files` (default 10MB) — nhưng interior/exterior đi thẳng data URL trong `options.image_input`, không qua endpoint này. Floor Plan là state machine riêng: scenes `room-design-brief/layout/render/panorama` (1/2/3/4 credits), project status `draft→analyzed→layout-ready→render-ready→panorama-ready`, payload zod `{marker{x,y 0-100}, roomId, style, stylePreference, feedback}`. Auth gate: chưa login → Generate không sinh request nào (chặn client-side).

**Clone boundary (superseding decision):** data URL, arbitrary `image_input`, provider URL và download-by-URL ở trên chỉ là fact origin. Clone dùng ADR 0003: browser gửi ready `sourceAssetId`, provider adapter resolve object access nội bộ, query trả ready Asset IDs và owner download nhận `{assetId}`.

**Unblocks:** 007 (upload), 008 (floor plan domain).
