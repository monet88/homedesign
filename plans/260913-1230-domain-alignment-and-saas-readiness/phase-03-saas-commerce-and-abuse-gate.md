---
title: "Phase 3: SaaS commerce and abuse gate"
status: pending
---

# Phase 3: SaaS commerce and abuse gate

## Product diagnosis

HomeDesign solves a real early-stage visualization problem: turn a room/exterior photo or floor-plan intent into an understandable design direction before a homeowner commits to a designer, contractor or renovation. Its strongest differentiator is not “an image generator”; it is the workflow around provenance, private assets, project sharing, credits and multi-stage room visualization.

The current demo is suitable for a controlled sales demonstration, not an autonomous paid SaaS: demo users have zero credits, Mock Payment is forbidden, and production generation is intentionally disabled until payment, email delivery and abuse policy are accepted.

## Decision required

Choose one initial commercial motion before implementation:

1. **Assisted B2B/studio pilot (recommended):** sell a paid workflow to interior studios, renovation contractors or real-estate visualizers. Staff can provision credits under a contract while usage, provider cost and conversion are measured.
2. **Self-serve B2C credits:** requires payment provider, tax/invoice policy, fraud/chargeback handling, receipts, refunds, support SLA and explicit provider-cost margin model.

## Required implementation contracts

- Payment provider abstraction and signed webhook verification; server-side immutable credit issuance only after reconciliation.
- Idempotency from checkout through webhook and ledger settlement; retries never double credit.
- Tenant/user rate limits, spend caps, provider timeout/retry budgets, daily/monthly cost alerts and kill switch.
- Terms/privacy/data-retention disclosure matching storage, provider processing and share-link behavior.
- Transactional email provider for production identities and recoverable support/refund processes.

## Go/no-go metrics

| Metric | Pilot gate | Why |
| --- | --- | --- |
| Activation | User reaches first useful generated concept in one guided session | validates problem, not vanity sign-up |
| Value | A pilot reuses/exports/shares an output in a real client workflow | validates willingness to pay |
| Unit economics | Measured provider + infra cost per successful usable output below contracted revenue | protects margin |
| Reliability | Task success, p95 time-to-ready, hold-release correctness and support incidents meet target set before launch | protects trust |
| Abuse | Budget/rate limit alerts and manual emergency stop rehearsed | protects open public endpoint |

## Risks

- A broad consumer launch first turns a high-cost image provider into an abuse and support channel before product-market fit.
- Selling “architectural accuracy” would overpromise: Floor Plan is explicitly visualization, not CAD/BIM authority.
- Model/vendor dependency must be visible in price and availability policy; avoid claiming model capability not independently verified.
