---
title: "Grilling — Floor Plan domain (Recognition → 2D → 3D → 360°)"
label: wayfinder:grilling
type: grilling
status: open
assignee: null
---

## Question

Quyết định **kiến trúc domain Floor Plan** — domain duy nhất tách pipeline khỏi Interior/Exterior.

Đã quan sát `/ai-floor-plan` (đã crawl):
- Hero `Visualize Your Floor Plan with AI`, `Upload Floor Plan` vs `Use Sample Floor Plan`.
- Sections: `Upload your floor plan` → `Choose a room and style` → `Compare and refine`.
- Features: `Floor Plan Recognition`, `Style Options`, `2D Furniture Layouts`, `Room-Level Adjustments`, `Photorealistic 3D Renders`, `360° Views`, video guide.
- Khác Interior/Exterior: không có Model/Room/Style combobox ngay, mà có `Favorite/Private/Share` trên flow.

Grilling (HITL):
- Có tách thành 4 bước pipeline như origin hay gộp 2D+3D?
- Recognition dùng service nào (diff với Nano Banana)?
- 2D layouts có cần editor kéo thả không, hay ảnh tĩnh?
- 360°: viewer nào (pannellum, three.js), có cần video?
- Credits cho Floor Plan: cũng 1 credit hay đắt hơn (2-3 credits cho 3D/360)?

Gọi `grilling` + `domain-modeling` (sharpen Floor Plan vs Generation vs Render). Kết quả ADR + flow diagram. Không làm trước khi 004 xong để reuse insight generation.

Blocked by: 004-research-generation-pipeline
