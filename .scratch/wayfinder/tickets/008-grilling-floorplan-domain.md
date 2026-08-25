---
title: "Grilling — Floor Plan domain (Recognition → 2D → 3D → 360°)"
label: wayfinder:grilling
type: grilling
status: closed
assignee: codex
closedAt: 2026-08-25
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

## Resolution

**Closed 2026-08-25 — HITL.** Đại Ca chọn toàn bộ recommended answers, cung cấp video feature đầy đủ và chỉ định tiếp tục chọn recommendation đến hết frontier.

- Floor Plan là room-centric generative visualization, không phải CAD/BIM: một Source Floor Plan, nhiều Room Designs theo marker.
- Giữ bốn stage độc lập: Room Brief 1 Credit → Room Layout 2 → Room Render 3 → Room Panorama tùy chọn 4. `success` và user `confirmed` là hai trạng thái khác nhau.
- Recognition nằm trong Room Brief, chỉ suy luận context của vùng đã chọn; không tạo canonical topology hoặc kích thước có thẩm quyền.
- 2D là annotated generated image, không có drag/drop editor. 3D là photorealistic image, không phải scene/mesh. 360° là một equirectangular panorama tương tác cho từng phòng, không phải tour/video/VR.
- Mỗi stage run bất biến. Regenerate/retry tạo run mới; xác nhận upstream replacement mới làm downstream lineage cũ stale, không xóa history hoặc hoàn Credits đã settle.
- Mỗi phòng tiến triển độc lập; Project Overview chỉ aggregate số marker, số phòng hoàn tất và phòng hiện tại. `Add Next Room` quay lại marker selection.
- Viewer chọn Pannellum 2.5.7 qua JavaScript API; không dùng Three.js cho feature này.
- AI provider/model là stage adapter, cố ý không trở thành domain contract. Việc chọn model runtime không được đổi vocabulary, state machine hoặc artifact contracts đã khóa.

Architecture decision + flow diagram: `docs/adr/0004-room-centric-floor-plan-visualization.md`.
