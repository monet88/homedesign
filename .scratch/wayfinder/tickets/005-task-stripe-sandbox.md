---
title: "Task — Chuẩn bị Stripe sandbox & pricing scrape"
label: wayfinder:task
type: task
status: open
assignee: null
---

## Question

Công việc **phải làm trước khi quyết Credits/Pricing**: không có gì để quyết, chỉ cần chuẩn bị để grilling Pricing có fact.

Việc (AFK nếu có key, HITL nếu cần Đại Ca tạo account):
- Tạo Stripe test account / lấy `STRIPE_SECRET_KEY` + webhook endpoint cho `stripe_enabled:true` (đã thấy `POST /api/config/get-configs` → `default_payment_provider:stripe`, `select_payment_enabled:false`).
- Scrape 4 tiers Landing/Pricing: Lite/Plus/Pro/Max — mỗi card hiện `Buy Credits` nhưng chưa lộ số credits/giá. Cần mở modal Buy Credits (chưa click) để lấy bảng giá thực.
- Kiểm tra `GET /api/ai/model-pricing` (đã thấy 200) — lưu response.
- Claim Free Credits flow: link `Claim Free Credits` trên sidebar — test với user đã login `redacted-test-user` xem còn claim được không.
- Ghi lại: Stripe keys location (`.env.local`), pricing table, free-credit response. Đây là input cho ticket 006.

Không quyết pricing — chỉ unblock decision.

Blocked by: 001-research-stack-api-contract
