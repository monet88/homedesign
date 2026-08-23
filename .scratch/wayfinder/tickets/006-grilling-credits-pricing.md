---
title: "Grilling — Credits, tiers & billing rules"
label: wayfinder:grilling
type: grilling
status: open
assignee: null
---

## Question

Quyết định **mô hình Credits & billing** cho clone.

Input chờ: 001 (stack), 005 (pricing scrape + Stripe sandbox). Đã biết sơ: `1 Generation = 1 Credits` (nút Generate), 4 tiers Lite/Plus/Pro/Max, `Claim Free Credits` cho user mới, `POST /api/user/get-user-info` trả credits còn lại, `How credits are used` section.

Grilling (HITL):
- Số credits từng tier & giá tiền — giữ y hệt origin hay làm tròn cho thị trường VN?
- Credit deduction: trừ ngay khi bấm Generate hay sau khi ảnh về? Hoàn credit khi fail?
- Free credits: bao nhiêu, expire, anti-abuse?
- Billing provider: giữ Stripe 100% như origin (`select_payment_enabled:false`) hay thêm VNPay/MoMo?
- Hiển thị: badge `5` đã thấy sau login (góc nav) — là credits còn lại, cần realtime update?

Gọi `grilling` + `domain-modeling` (sharpen term Credits vs Render trong CONTEXT.md). Kết quả: ADR + state diagram.

Blocked by: 001-research-stack-api-contract, 005-task-stripe-sandbox, 003-grilling-auth-session
