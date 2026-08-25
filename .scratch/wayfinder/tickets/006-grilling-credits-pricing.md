---
title: "Grilling — Free credits & usage rules"
label: wayfinder:grilling
type: grilling
status: closed
assignee: codex
closedAt: 2026-08-25
---

## Question

Quyết định **mô hình free Credits & usage rules** cho bản free-first. Payment/Stripe không thuộc phase hiện tại.

Input: 001 (stack), 005 (origin pricing/model-pricing scrape + quyết định defer payment). Đã biết: origin cho account mới 5 free credits; `POST /api/user/get-user-info` trả credits còn lại; chi phí theo action/model được `GET /api/ai/model-pricing` công bố.

Grilling (HITL):
- Số free credits ban đầu; cấp một lần hay refill theo ngày/tháng?
- Credit deduction: trừ ngay khi bấm Generate hay sau khi ảnh về? Hoàn credit khi fail?
- Free credits có expire không; giới hạn account/device/IP nào cần có để chống abuse?
- Hết credits thì khóa Generate, cho reset trong dev, hay hiển thị waitlist cho phase payment?
- Hiển thị: badge `5` đã thấy sau login (góc nav) — là credits còn lại, cần realtime update?

Gọi `grilling` + `domain-modeling` (sharpen Credits vs Payment và Credits vs Render trong CONTEXT.md). Kết quả: ADR + state diagram.

Blocked by: 001-research-stack-api-contract, 005-task-stripe-sandbox, 003-grilling-auth-session

## Resolution

**Closed 2026-08-25 — HITL, Đại Ca chọn toàn bộ recommended answers.** Bản development/staging giữ Credits và enforcement thật để test đủ luồng, nhưng dùng Mock Payment; Stripe và payment thật vẫn deferred.

- Mỗi user đã xác thực nhận một lần **10 Free Credits**, không refill và không expire trong testing. Không áp dụng giới hạn IP/device.
- Giữ cost theo origin: image model/action 1–5 Credits; Floor Plan tính riêng brief 1, layout 2, render 3, panorama 4.
- Credit Ledger bất biến là nguồn chuẩn. Available Credits trừ các Credit Hold đang active và là số badge hiển thị.
- Task acceptance tạo hold atomically và idempotently. Success settle thành usage; failed/canceled/server expiry release. Client polling timeout không release; late success chỉ settle một lần.
- Floor Plan giữ usage của stage đã thành công, chỉ release stage lỗi; retry stage tạo hold mới.
- Mock Payment mô phỏng Lite 80 / Plus 160 / Pro 320 / Max 640, mặc định success và có test outcomes canceled/failed. Chỉ success cộng Credits; retry cùng purchase id không cộng hai lần.
- Không đủ Credits thì không tạo task, báo chính xác số thiếu và mở modal Mock Payment. Mock chỉ chạy cho user đã xác thực ở development/staging và không giới hạn số lần.
- Mock Credits/transactions không sang production. Chính sách free grant, paid tiers, expiry và Stripe thật được quyết ở phase payment.

Architecture decision và state diagram: `docs/adr/0002-free-first-credits-and-mock-payment.md`.
