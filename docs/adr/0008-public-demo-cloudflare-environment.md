# ADR 0008 — Public Demo as an isolated Cloudflare environment

HomeDesign exposes a dedicated **Public Demo** at `homedesign.monet.uno` rather than repurposing staging or production. The demo stays on the existing OpenNext/Cloudflare Worker architecture, attaches the Worker directly through a Custom Domain, and uses isolated `hd-demo-*` D1/R2/Queues/Worker resources in the Cloudflare account that owns `monet.uno`; a local/VPS `cloudflared` Tunnel is not part of the request path.

**Status:** accepted

Public Demo deliberately uses a different trust/economy policy from both staging and production: the site is public, authentication is Google-only, every new user starts with 0 Credits, Free Credit Grant and Mock Payment are disabled, and only explicit Admin Credit Grants create spendable Credits. The Admin identity is bootstrapped by promoting the configured Google-authenticated account to `admin` without a password or automatic 99,999-Credit grant.

Real AI generation is enabled but fail-closed behind a durable global cap of 50 actual outbound provider submissions per `Asia/Bangkok` calendar day, counting retries. Private Asset/Project semantics, Credit Holds, settlement/release, upload/storage quotas and ADR 0003 retention remain unchanged; the demo is a public presentation environment, not a relaxation of storage or authorization boundaries.

Wrangler deployment credentials and `cloudflared` credentials are separate authorities. Public Demo provisioning uses a scoped `CLOUDFLARE_API_TOKEN` and must preflight the actual token before provisioning. On 2026-09-07 the machine-level token was rotated and live verification passed `wrangler whoami`, `wrangler d1 list`, `wrangler r2 bucket list`, and `wrangler queues list`; the earlier D1 `Authentication error 10000` blocker is therefore resolved, while the preflight remains a required deployment gate.

## Considered Options

- **Repurpose staging:** rejected because staging intentionally retains Access protection, Free Credit Grant, Mock Payment and test-outbox behavior.
- **Use production:** rejected because production generation remains launch-gated behind a separate payment/abuse decision.
- **Serve through `cloudflared` Tunnel:** rejected because the Worker is the application origin and Custom Domain gives a direct Cloudflare-managed DNS/TLS path without coupling public availability to a local/VPS tunnel process.

## Consequences

- Public Demo becomes a fifth named deploy environment with isolated resource bindings and its own policy matrix.
- The demo may share Cloudflare account-level operator blast radius with the `monet.uno` zone, but it must not share D1/R2/Queue data resources with dev/preview/staging/production.
- Staging and production semantics remain unchanged; Public Demo-specific exceptions must be explicit rather than inferred from generic “non-production” checks.
