---
title: "Phase 1: Auth and deployment smoke"
status: planned
---

# Phase 1 — Auth and deployment smoke

## Goal

Kiểm chứng journey sign-in Google trên demo mà không tự ý tạo hay giữ session của người dùng.

## Evidence to collect

1. Source map: sign-in button → BetterAuth social redirect → callback → session route.
2. Browser-only redirect smoke với account/profile được Đại Ka chỉ định và xác nhận riêng ngay trước login.
3. Callback allowlist/origin match, error state và cookie/session boundary.
4. Post-login state: zero-credit policy của Public Demo, không trigger AI task hay Credit Hold.

## Risks and rollback

- OAuth configuration propagation can take time; record observed response/time rather than retrying blindly.
- A real login creates session state; explicitly ask before that action and sign out when verification completes.
- If configuration is wrong, change only the dedicated HomeDesign OAuth client; do not modify Firebase auto-created client.
