---
title: "Research — Generation pipeline (Nano Banana, Full/Local, palettes, ratios)"
label: wayfinder:research
type: research
status: open
assignee: null
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
