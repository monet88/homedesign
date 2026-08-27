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

## Login back on

Set `AUTH_BYPASS=0` in `.dev.vars`, restart `npm run dev`. Playwright e2e expects Sign In — turn bypass off before `npm run test:e2e`.
