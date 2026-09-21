---
title: "behavioral-audit-and-production-readiness"
description: "Sprint 2: xác minh luồng người dùng sau deploy và audit hành vi các vùng có state."
status: planned
priority: P1
effort: "1-2 sessions"
tags: [audit, auth, production-readiness]
created: 2026-09-13
---

# Sprint 2 — Behavioral Audit and Production Readiness

## Outcome

Xác minh và mô tả hành vi thực tế của các journey có state sau Sprint 1: Google auth, credits/generation, project library/admin và floor-plan. Mỗi finding phải có evidence level; không biến source inspection thành claim production.

## Guardrails

- Không dùng hoặc ghi credential vào Git, docs, report hay prompt.
- Không tạo user OAuth, task AI, credit charge, payment hoặc admin mutation khi chưa có xác nhận riêng.
- Dùng account/profile do Đại Ka chỉ định cho bất kỳ browser test nào.
- Mỗi fix tách ticket, test và PR riêng; không gộp refactor vào audit.

## Phases

| # | Phase | Status | Acceptance |
|---|---|---|---|
| 1 | [Auth and deployment smoke](./phase-01-auth-and-deploy-smoke.md) | Planned | OAuth redirect/callback behavior được kiểm chứng không tạo session ngoài ý muốn. |
| 2 | Generation, credit and asset lifecycle audit | Planned | State model + collision matrix + evidence cho generate/cancel/retry/credit hold. |
| 3 | Library, sharing, admin and floor-plan audit | Planned | Ownership, visibility, RBAC và async stage transitions được map và kiểm chứng. |
| 4 | Remediation and release decision | Planned | Mỗi finding có owner, test/verification và rollback path. |

## Entry evidence

Sprint 1 đã deploy `design.7app.online` và public smoke đạt; chi tiết ở `docs/2026-09-13-sprint-01-deployment-report.md`. Đây không phải bằng chứng OAuth interactive login, AI generation, billing hoặc admin behavior hoạt động production.

<!-- slug: behavioral-audit-and-production-readiness -->
