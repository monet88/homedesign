# Coding Standards & Invariants — HomeDesign

This document defines the non-negotiable architectural invariants and code review standards for `monet88/homedesign`. All pull requests and code modifications must comply with these rules. Automated tools (ESLint, Prettier, TypeScript compiler) enforce basic mechanics; this file governs domain integrity, failure boundaries, and security.

---

## 1. Credit Ledger & Entitlements

- **Append-only Ledger:** `Credit Ledger` is the sole source of truth for user credit balances. Never mutate credit balance fields directly without appending a ledger transaction (`Free Credit Grant`, `Mock Payment`, `Credit Hold`, `Usage`, `Release`).
- **Hold Lifecycle Integrity:** 
  - Every AI Task initiation MUST create a `Credit Hold`.
  - A hold is converted to `Usage` ONLY after output asset validation status reaches `ready`.
  - Terminal states (`failed`, `canceled`, `rejected`, `timeout`) MUST release the hold back to `Available Credits`.

---

## 2. AI Tasks & Provider Adapters

- **Task Success vs Provider Return:** An AI Provider response returning HTTP 200 does NOT constitute task completion. An `AI Task` is marked successful ONLY when all expected `Generated Assets` pass Intake Validation (`pending-upload` → `quarantined` → `ready`).
- **Provider Abstraction:** All external AI operations must route through a `ProviderAdapter` implementation (`FakeProviderAdapter` or `GeminiFlashImageAdapter`). Never make direct ad-hoc HTTP calls to AI endpoints from UI components or unrelated services.

---

## 3. Asset & Storage Safety

- **Asset Lifecycle Isolation:** Asset states (`pending-upload`, `quarantined`, `ready`, `rejected`, `deleted`) must be enforced at query level.
- **Privacy Boundaries:** Assets are private by default. Never expose `quarantined`, `rejected`, or `deleted` asset URLs in public unlisted share endpoints or user project APIs.

---

## 4. API & Data Validation

- **Input Sanitization:** All Server Actions and API route handlers must validate incoming payloads using Zod schemas before processing.
- **Design Generation Command Family:** Keep shared generation metadata (`sourceAssetId`, `options`, `idempotencyKey`, provider/model metadata) in one reusable base field set, then validate `interior`, `exterior`, and `floor-plan` payloads as a Zod discriminated union keyed by `scene`. Do not duplicate shared metadata across branches.
- **Error Propagation:** Never swallow exceptions or return dummy 200 OK responses with empty payloads on background worker/task failures. Log errors with actionable context and fail explicitly.

---

## 5. Next.js & Cloudflare Runtime Rules

- **Cloudflare Compatibility:** Code targeting edge handlers/workers must not use unsupported Node.js native modules (e.g. `fs`, `child_process`).
- **RSC Session Resolution:** Shared server-side session resolution must accept the auth-bearing primitive available at the call site (`Request | Headers`). Next.js Server Components should pass `headers()` directly; do not manufacture dummy `Request` objects solely to resolve a session.
- **Strict Hydration & Boundary Rules:** Maintain strict Server Component / Client Component boundaries. Keep transient interactive state in local component state.

---

## 6. Testing & Verification

- **Empirical Proof:** Never mark a task or bug fix as complete without running the relevant type check (`npm run typecheck` / `tsc`), linter, or Playwright E2E test (`e2e/`).
