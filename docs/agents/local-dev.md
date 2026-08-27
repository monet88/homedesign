# Local app for a human to click

Use when the user wants to **see the UI**, **click through the app**, **start/stop the Next server**, or **skip login** on their machine. Not for `npm test` / `wrangler:test` (those stay authenticated).

## Start

From `F:\CodeBase\homedesign` (or the repo root):

1. If port **3000** is taken, kill the old process (`Get-NetTCPConnection -LocalPort 3000` → `Stop-Process -Id <pid> -Force`).
2. Ensure `.dev.vars` exists (gitignored). Copy `.dev.vars.example` if missing.
3. For UI-without-login, `.dev.vars` must contain `AUTH_BYPASS=1` (ignored when `ENVIRONMENT=production`; ignored under Vitest).
4. `npx wrangler d1 migrations apply homedesign --local`
5. `npm run dev` — wait for `Local: http://localhost:3000` and `Ready`.

Guest user when bypass is on: **Local tester** / `local@homedesign.dev`, verified, free credits. Generation uses the fake provider (tiny PNG), not a real model.

## Links

- Landing: http://localhost:3000
- Interior: http://localhost:3000/ai-interior-design
- Exterior: http://localhost:3000/ai-exterior-design
- Floor Plan: http://localhost:3000/ai-floor-plan
- Projects: http://localhost:3000/projects

Same LAN/Tailscale bind may also print a `Network:` URL in the Next banner.

## Stop

Kill the `npm run dev` / Next process (the shell PID that started it, or whatever owns port 3000). Do not leave a stale `next dev` running; it locks 3000 for the next agent.

## Deterministic End-to-End (E2E) Testing

HomeDesign includes a self-provisioning, deterministic Playwright test suite covering complete user and administrator journeys.

### Single Command

```bash
npm run test:e2e
```

To update visual regression baselines:

```bash
npm run test:e2e:update
```

### What It Provisions Automatically

Running `npm run test:e2e` executes `scripts/run-e2e.mjs`, which handles all lifecycle requirements from a clean environment without manual setup:

1. **Test Fixtures**: Generates standard 1x1 image fixtures (`room.png`, `house.jpg`, `floor-plan.png`, `facade.png`) via `scripts/create-e2e-fixtures.mjs`.
2. **Local D1 Database**: Applies local D1 migrations via `wrangler d1 migrations apply homedesign --local`.
3. **Admin Actor**: Generates dynamic per-run administrator credentials and provisions the admin user in the local D1 database via `scripts/seed-admin.mjs`.
4. **Standard User & Verification**: Tests register standard user actors and verify emails via the Ticket #32 authorized test-outbox endpoint (`/api/auth/test-outbox`), triggering the initial 5 Free Credit Grant.
5. **Offline Fake AI Provider**: Runs without live AI provider credentials (`AI_API_KEY=""`), executing the Ticket #33 offline FakeProvider pipeline with zero external network dependencies.
6. **Web Server Lifecycle**: Automatically launches the local development server and tears down resources upon test completion.

### Prerequisites

- Node.js 22+
- Playwright Chromium browser installed:
  ```bash
  npx playwright install chromium
  ```
- If `.dev.vars` exists locally with `AUTH_BYPASS=1`, ensure `AUTH_BYPASS=0` when running manual server debugging for E2E tests.
