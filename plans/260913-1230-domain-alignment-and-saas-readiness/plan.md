---
title: "domain-alignment-and-saas-readiness"
description: "Chuẩn hóa public domain, khép các gate an toàn và đưa HomeDesign từ demo có AI thật đến SaaS sẵn sàng bán."
status: in-progress
priority: P1
effort: "4-6 focused sessions"
tags: [domain, security, saas, cloudflare, monetization]
created: 2026-09-13
---

# Domain alignment and SaaS readiness

## Overview

Public app origin là `https://design.7app.online`; `https://cliproxy.monet.uno/v1` vẫn là backend AI hợp lệ. Plan tách rõ remediation không làm thay đổi dữ liệu khỏi các gate cần Đại Ka duyệt trước (OAuth thật, AI generation, credit/admin/payment mutation).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Loại bỏ domain-contract drift và bảo vệ dotenv portable | P1 |
| 2 | Hoàn tất behavioral audit với evidence phân tầng | P1 |
| 3 | Chọn và xây payment + abuse controls cho self-serve SaaS | P1 |
| 4 | Bán thử có kiểm soát và quyết định production launch | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Baseline and contract inventory](./phase-01-baseline-and-contract-inventory.md) | Complete (read-only) |
| 2 | [Public-domain remediation](./phase-02-public-domain-remediation.md) | Pending approval |
| 3 | [SaaS commerce and abuse gate](./phase-03-saas-commerce-and-abuse-gate.md) | Pending product decision |
| 4 | [Controlled launch and evidence](./phase-04-controlled-launch-and-evidence.md) | Pending |

## Success Criteria

- [ ] Một public origin duy nhất trong runtime, tests, operational docs và provisioning scripts: `design.7app.online`.
- [ ] `cliproxy.monet.uno` chỉ xuất hiện như AI provider; không bị đổi theo public-origin migration.
- [ ] Negative deploy-policy tests deterministic khi `.env.local` tồn tại.
- [ ] Không còn dotenv protection chỉ dựa trên global Git ignore; sample configuration không chứa values thật.
- [ ] Payment thật, webhook reconciliation, abuse budget và support/refund policy được chấp nhận trước khi production generation mở.
- [ ] Mọi claim launch dựa trên test/runtime evidence, không chỉ source inspection.

## Dependencies and decisions

- Rollback anchor: `908b2b1739719b4b70fbc097dfa33b6cbcdeb153`.
- Branch hiện tại đã có `origin/chore/sprint-01-cloudflare-oauth-deploy`; GitHub CLI không có quyền đọc PR nên trạng thái PR cần xác minh bằng identity có quyền trước khi tạo PR mới.
- Self-serve B2C hay assisted B2B/studio là quyết định commercial còn mở. Phase 3 không được tự chọn payment provider hoặc price point.

<!-- slug: domain-alignment-and-saas-readiness -->
