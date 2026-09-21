# ADR 0007: Cliproxy Gemini Image Provider Integration, Admin System & E2E Testing Harness

## Status
Accepted

**Revision 2026-09-07:** Password-based admin seeding with an initial 99,999 Credit grant is retained only for internal/local E2E compatibility. Public Demo follows ADR 0008: the configured Google-authenticated account is promoted to `admin` idempotently without creating a password credential or automatic Credit grant; any Credits are added separately through the immutable Admin Credit Grant path.

## Context
The HomeDesign application previously operated with fake/stubbed provider adapters (`FakeProviderAdapter`) during UI prototyping. For production fidelity and realistic multi-modal generation, we need:
1. Direct integration with the real AI Image Generation endpoint (`https://pro.autommo.online/v1` with model `gemini-3.1-flash-image` and API Key authentication).
2. An Admin provisioning and role-based management system seeded with default administrator credentials (`minhthang421992@gmail.com`).
3. An automated end-to-end (E2E) testing harness using Playwright that validates full user and administrator journeys.

## Decision
1. **AI Provider Adapter (`GeminiFlashImageAdapter`)**:
   - Implement `GeminiFlashImageAdapter` implementing `ProviderAdapter`.
   - Forward multimodal requests with source image data URI and crafted design prompts (combining Style, Room/Area, Color Palette, and Custom Requirements) to `POST /v1/chat/completions`.
   - Parse returned base64 image data URL from `choices[0].message.images[0].image_url.url` and stream into R2/Storage as validated `ready` assets.

2. **Admin Provisioning & Panel**:
   - Internal/local E2E may keep Admin configuration through `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_INITIAL_CREDITS` for deterministic test provisioning.
   - Public Demo does not use the password/initial-credit seed. After the configured Google account has signed in, a role-only bootstrap promotes that exact identity to `admin`; Credits remain a separate immutable Admin Credit Grant operation.
   - Keep the existing `npm run db:seed:admin` compatibility path for internal/local E2E where required, without treating its initial balance as a domain property of the Admin role.
   - Build a dedicated `/admin` dashboard with sub-views: User Management, Credit Adjustments, AI Task Monitor, and Provider Health Check.
   - Restrict `/admin` route via server session role check (`user.role === 'admin'`).

3. **E2E Automation Harness**:
   - Build Playwright automated test suite in `tests/e2e/full-flow.spec.ts`.
   - Verify:
     - Authentication & Admin bypass.
     - Admin dashboard metrics & user table.
     - Real AI Interior Generation flow from sample image upload to final image render.
     - Real AI Exterior Generation flow.
     - AI Floor Plan stage progression.
     - Credit Ledger deduction verification.

## Consequences
- **Positive**:
  - Realistic, photorealistic AI generations powered by `gemini-3.1-flash-image`.
  - Zero disruption to existing lifecycle and credit hold state machine.
  - Complete observability and administrative control over users and generation tasks.
  - High confidence through automated Playwright E2E testing.
- **Negative**:
  - Network dependency on `https://pro.autommo.online/v1` during live E2E test runs (with graceful fallback in offline CI).
