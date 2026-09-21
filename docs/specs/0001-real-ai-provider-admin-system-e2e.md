# Spec: Real AI Provider Integration, Admin System & E2E Testing Harness

## Problem Statement

The HomeDesign application currently has a 1:1 pixel-perfect frontend clone of `homedesigns.app`, but the backend generation engine still relies on a stubbed/fake adapter that emits 1x1 test pixels. Users and administrators cannot generate real, photorealistic architectural and interior design images from room/house photos or floor plans. Furthermore, there is no administrative system to provision and manage users, audit system-wide AI tasks, grant credits, or monitor provider latency, and no automated End-to-End (E2E) testing harness to verify full user journeys against live or staging environments.

## Solution

1. Integrate a live AI provider adapter connecting to `https://pro.autommo.online/v1` using model `gemini-3.1-flash-image` and Bearer token authentication to generate photorealistic interior, exterior, and floor plan images from multimodal user inputs in ~15 seconds.
2. Implement an Admin system with an automated CLI seeder (`npm run db:seed:admin`) that provisions administrator `minhthang421992@gmail.com` with role `admin` and 99,999 Credits, backed by a dedicated, role-protected Admin Dashboard at `/admin`.
3. Provide a complete automated Playwright E2E test harness (`npm run test:e2e`) verifying the entire journey from authentication, admin dashboard inspection, image upload, AI generation, Before/After verification, and Credit Ledger settlement.

## User Stories

1. As an interior design user, I want to upload a room photo and select a design style (e.g. Modern Warm), so that the real AI model generates a photorealistic, stylized room image that preserves my room layout.
2. As an exterior renovation user, I want to upload a house photo and select an architectural style (e.g. Modern Farmhouse), so that the AI generates a realistic facade redesign with updated siding, windows, and landscaping.
3. As a floor plan designer, I want to upload a 2D floor plan and place room markers, so that the AI pipeline renders 2D furniture layouts, photorealistic 3D room renders, and 360° equirectangular panoramas.
4. As a user, I want to preview my generated design against my original photo using a side-by-side Before/After slider, so that I can inspect the visual changes in high fidelity.
5. As a user, I want my Available Credits to be held when a generation starts and only captured when the image is fully validated and ready, so that failed generations do not deduct my credits.
6. As an administrator, I want to run a single seed command `npm run db:seed:admin`, so that my admin account (`minhthang421992@gmail.com`) is provisioned with 99,999 credits and administrator privileges immediately.
7. As an administrator, I want to access `/admin` with role verification, so that unauthorized non-admin users are rejected with a 403 Forbidden status.
8. As an administrator, I want to view all registered users, their creation date, and their current credit balances in a table on the Admin Dashboard, so that I have complete visibility over user activity.
9. As an administrator, I want to grant or deduct credits for any specific user directly from the Admin Dashboard, so that I can provide promotional credits or assist users with testing.
10. As an administrator, I want to monitor all live and completed AI Tasks across the system with status, prompt, latency, and error codes, so that I can quickly diagnose issues or provider failures.
11. As an administrator, I want an AI Provider Health Check tool in `/admin` that pings the endpoint `https://pro.autommo.online/v1` and verifies model availability, so that I can confirm AI backend uptime without generating a full project.
12. As a quality engineer, I want to execute `npm run test:e2e` via Playwright, so that the entire system (Auth → Admin → Interior → Exterior → Floor Plan → Credits) is automatically verified without manual clicking.
13. As a developer, I want provider configurations (API URL, API Key, default model) to be read securely from environment variables (`AI_API_BASE_URL`, `AI_API_KEY`, `AI_DEFAULT_MODEL`), so that secrets are never hardcoded.

## Implementation Decisions

### 1. AI Provider Adapter Layer
- Implement `GeminiFlashImageAdapter` complying with the existing `ProviderAdapter` contract (`submit` and `fetchOutput`).
- Transport: convert source image bytes from Storage/R2 into a base64 data URI and dispatch a multimodal payload to `POST /v1/chat/completions`.
- Request schema shape:
  ```json
  {
    "model": "gemini-3.1-flash-image",
    "messages": [
      {
        "role": "user",
        "content": [
          { "type": "text", "text": "<Engineered Design Prompt>" },
          { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
        ]
      }
    ]
  }
  ```
- Output extraction: extract raw base64 data URL from `choices[0].message.images[0].image_url.url`, decode into binary `Uint8Array`, and pipe into intake validation before marking the asset `ready`.
- Register the adapter in the Provider Registry with fallback to `FakeProviderAdapter` in offline test mode when `AI_API_KEY` is not present.

### 2. Administrator Provisioning & RBAC
- Add `role` column (`TEXT NOT NULL DEFAULT 'user'`) to user records and session stubs.
- Seeding mechanism: `scripts/seed-admin.mjs` executes D1 SQL statements to insert or update the admin record for `minhthang421992@gmail.com`, setting `role = 'admin'` and appending a 99,999 credit grant to `credit_ledger`.
- Route protection: implement server-side middleware / helper `requireAdminSession(request)` returning 401 if unauthenticated and 403 if `user.role !== 'admin'`. For the `/admin` page, enforce Server Component authorization boundary via `resolveSession(env, headers)` rendering `<AdminUnauthorized status={401|403} />` without dashboard markup leakage.
- Build the `/admin` page using the design system (`#f6f0e4` paper, `#faf7f2` card, `#0f382c` forest green, `#c26e38` copper) with tabs for Users, Credits, Task Logs, and Health Check.

### 3. API Endpoints for Administration & Mutation Validation
- `GET /api/admin/users`: returns paginated user list (`page`, `limit`, `total`, `totalPages`) with email, role, created timestamp, and credit balance.
- `POST /api/admin/credits`: accepts `{ userId, amount, reason }` validated with Zod and overdraft checks, recording an immutable grant/adjustment in `credit_ledger`.
- `GET /api/admin/tasks`: returns paginated AI Task records (`page`, `limit`, `total`, `totalPages`, default 50) with prompt, execution time, cost, status, and error details.
- `POST /api/admin/health`: dispatches a ping request to `https://pro.autommo.online/v1/models` via `ProviderAdapter.healthCheck()` and returns latency and model status.
- Unified Mutation Validation: all Server Actions and route handlers (`/api/designs`, `/api/ai/generate`, `/api/assets/*`, `/api/payments/mock`, `/api/floor-plan/room-designs/*`) strictly validate payloads with shared Zod schemas (`src/lib/validation/schemas.ts`).

### 4. Playwright E2E Test Suite
- Configure `playwright.config.ts` with local web server autostart (`npm run dev`) and standard 1440x900 viewport.
- Author `e2e/full-journey.spec.ts` and `e2e/admin-journey.spec.ts` covering:
  - Phase 1: Admin provisioning verification & `/admin` dashboard test.
  - Phase 2: AI Interior Design generation flow with sample living room image.
  - Phase 3: AI Exterior Design generation flow with sample house facade.
  - Phase 4: AI Floor Plan interactive canvas & render flow.
  - Phase 5: Credit Ledger deduction & Activity feed verification.

## Testing Decisions

- **Black-box behavioral testing**: Tests evaluate user-visible behaviors, HTTP status codes, and DOM elements rather than internal component states.
- **Seams tested**:
  - `ProviderAdapter` boundary: unit tested with mocked HTTP payloads and integration tested with live `cliproxy` endpoint.
  - Server Auth & RBAC boundary: tested with guest, regular user, and admin sessions.
  - Full Application E2E: tested via Playwright browser automation simulating real clicks, uploads, and assertions.
- **Prior Art**: Extends existing Vitest suite (`src/lib/ai/provider-adapter.test.ts`, `src/lib/auth/session.test.ts`, `tests/deploy.test.ts`).

## Out of Scope

- Real credit card processing / live Stripe payment gateway (handled by Mock Payment modal in current scope).
- User-to-user public social community feeds.
- Complex 3D mesh exporting (OBJ/GLTF); 3D views remain photorealistic 2D renders and equirectangular 360° panoramas.

## Further Notes

- API Endpoint configured: `https://pro.autommo.online/v1` with model `gemini-3.1-flash-image` (configured via `AI_API_KEY` environment variable). Live model compatibility requires an approved authenticated health check.
- Response latency during testing was ~15.6s for high-resolution 1024x1024 photorealistic renders.
