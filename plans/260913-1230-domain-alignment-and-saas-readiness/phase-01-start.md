---
title: "Phase 1: Baseline and contract inventory"
status: completed
---

# Phase 1: Baseline and contract inventory

## Overview

Ghi nhận trạng thái deploy, public domain, provider, auth/economy policy và test evidence mà không tạo external state.

## Requirements

- [x] Xác minh branch `chore/sprint-01-cloudflare-oauth-deploy`, HEAD `908b2b1`, remote tracking branch và working tree trước các file audit mới.
- [x] Xác minh baseline trước migration: `wrangler.jsonc` demo dùng `design.7app.online`, `BETTER_AUTH_URL` cùng origin, model `gemini-3.1-flash-image`; provider được thay thế theo log migration.
- [x] Map source auth, generation, ledger, storage, share, admin và floor-plan boundaries.
- [x] Chạy safe HTTP GET smoke; không OAuth, AI, credit, payment hay admin mutation.

## Implementation Steps

1. Giữ evidence auth/deploy trong `docs/2026-09-13-sprint-02-phase-01-auth-deploy-audit.md`.
2. Phân loại finding: source/HTTP/test execution; không suy diễn live behavior từ source.
3. Chuyển mỗi remediation sang phase riêng, không gộp refactor vào audit.

## Todo

- [x] F1: `e2e/demo-auth-smoke.spec.ts` hard-code origin cũ.
- [x] F2: negative auth config test bị `.env.local` contaminating fixture.
- [x] F3: README, CONTEXT, ADR 0006/0008 và provisioning scripts còn mô tả public origin/zone cũ.
- [x] F4: `.env.local` được bảo vệ bởi global ignore, không phải repo `.gitignore`.
- [x] F5: `npm audit --omit=dev` ghi nhận 3 High, 1 Moderate dependency advisories; upgrade cần test riêng.

## Success Criteria

- Public origin/provider distinction documented and verified against `wrangler.jsonc` and adapter source.
- Typecheck pass; provider/policy unit suite: 77 pass.
- Worker-test signals recorded, including deterministic failure requiring remediation; no failing test was suppressed.

## Test scenario matrix

| Priority | Scenario | Current evidence | Next gate |
| --- | --- | --- | --- |
| Critical | Google callback produces a session on public origin | Not run by guardrail | Explicit OAuth approval + selected browser profile |
| Critical | 0-credit user cannot generate | Source/test policy only | Approved authenticated test user |
| Critical | 50/day cap settles/release holds correctly | Worker test currently fails at boundary | Diagnose and repair test/behavior separately |
| High | Client config never exposes server secret | HTTP GET and source | Retain regression test |
| High | Retired origin cannot leak into live smoke | Source finding | Phase 2 regression test |

## Risks

- Exact Cloudflare zone/account ownership for `design.7app.online` has not been re-provisioned in this audit; scripts must not be run until token scope and target zone are explicitly verified.
- The provider is a commercial dependency; its upstream model availability and pricing are not evidenced by this repository.
