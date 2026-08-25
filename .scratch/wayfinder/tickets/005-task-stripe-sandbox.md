---
title: "Task — Chuẩn bị Stripe sandbox & pricing scrape"
label: wayfinder:task
type: task
status: closed
assignee: homedesign-agent
closedAt: 2026-08-25
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

## Resolution

**Closed 2026-08-25** — Đại Ca đổi scope sang **free-first**: bản đầu không tích hợp thanh toán; Stripe sandbox, webhook và checkout được hoãn sang phase payment sau. Không tạo `.env.local`, không lấy hoặc lưu Stripe key.

**Facts đã scrape để giữ làm input cho phase sau:**

| Pack | Giá niêm yết | Giá bán | Credits | Hạn dùng |
|---|---:|---:|---:|---:|
| Lite | $5 | $5 | 80 | 30 ngày |
| Plus | $10 | $9 (10% off) | 160 | 60 ngày |
| Pro | $20 | $17 (15% off) | 320 | 90 ngày |
| Max | $40 | $32 (20% off) | 640 | 180 ngày |

- `GET /api/ai/model-pricing` trả `200`, schema `version: 2`. `roomDesign`: brief 1, layout 2, render 3, panorama 4 credits. Image models quan sát trên UI/API: Nano Banana 1; Nano Banana 2 1K/2K/4K = 2/3/4; Nano Banana Pro 1K/2K/4K = 3/3/5; GPT Image 2 Low/Medium/High = 1/2/5.
- Public FAQ của origin ghi account mới nhận **5 free credits**, không cần thẻ. Không bấm `Claim Free Credits` vì đây là external mutation; policy free-credit của clone sẽ được quyết trong ticket kế tiếp.
- Stripe docs hiện hành: test keys dùng prefix `pk_test_`/`sk_test_`; webhook signing secret là secret riêng theo từng endpoint, không phải API key. Pointers: https://docs.stripe.com/keys và https://docs.stripe.com/webhooks.

**Unblocks:** [Grilling — Free credits & usage rules](006-grilling-credits-pricing.md).
