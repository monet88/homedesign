---
title: "Phase 4: Controlled launch and evidence"
status: pending
---

# Phase 4: Controlled launch and evidence

## Sequence

1. Merge Phase 2 as a focused domain-contract PR after review and CI.
2. With explicit approval, run one real OAuth journey in the browser profile Đại Ka names; record only redacted behavioral evidence.
3. With an approved test account and spend cap, perform one controlled generation and verify credit hold, output validation, storage ownership and settlement/release.
4. Run approved admin/read-only operational checks; do not grant credits or seed data unless the test plan explicitly permits it.
5. Pilot with a small contractual cohort; review metrics from Phase 3 before widening access.

## Release checklist

- [ ] Current public domain and OAuth callback verified live.
- [ ] Provider health/model availability verified without exposing its credential.
- [ ] Payment webhook replay, failure, refund and reconciliation tests pass.
- [ ] Privacy/terms/support ownership and escalation path are published.
- [ ] Dependency advisories are triaged; package upgrades are tested in a separate PR.
- [ ] Cloudflare logs/alerts cover task failure, queue/DLQ, holds, provider budget and auth failures.

## PR strategy

- Do not create a new PR before resolving the existing delivery branch's PR visibility. It already tracks `origin/chore/sprint-01-cloudflare-oauth-deploy` and contains Sprint 1.
- Commit the audit/roadmap documentation as one conventional docs commit on that branch only if its intended PR is confirmed; Phase 2, dependency upgrades and monetization each receive their own PR thereafter.
