# ADR 0006 — Cloudflare runtime with isolated environments

Deploy HomeDesign end-to-end trên Cloudflare thay vì đặt Next.js ở Vercel rồi giữ data/workers tại Cloudflare. OpenNext Worker, D1, R2, Queues, Workflows và Containers dùng chung capability, deployment và observability plane; bốn Cloudflare accounts tách development, preview, staging và production để giảm blast radius và ngăn binding nhầm vào user data thật.

**Status:** accepted

## Runtime modules and interfaces

- **App module:** Next.js/OpenNext Worker sở hữu HTTP/SSR, BetterAuth, authorization, upload intents, D1 transactions và public task/query interface. Chạy Workers Paid với `nodejs_compat`, Node runtime của Next.js và pinned compatibility date; không dùng `export const runtime = "edge"`.
- **Metadata module:** D1 là nguồn chuẩn cho Identity metadata, Projects/Assets, immutable stage/task lineage, Activity và Credit Ledger/Holds. Mỗi environment có database riêng, tạo với location hint `apac`.
- **Asset module:** private R2 bucket giữ `quarantine/`, canonical user Assets và recovery prefixes; public R2 bucket giữ Static Media; bucket thứ ba giữ OpenNext incremental cache. Không dùng production bucket cho development/preview/staging.
- **Validation module:** R2 `object-create` gửi ID/key/ETag vào `asset-validate` Queue. Thin consumer gọi một APAC-constrained `standard-1` Container để magic-byte/decode/dimension/pixel checks, EXIF strip và re-encode; chỉ metadata/reference quay lại D1/R2.
- **Generation module:** một Cloudflare Workflow có ID bằng task ID gọi AI provider adapter, sleep/poll/retry theo failure policy và ghi provider output vào R2 quarantine. Workflow không truyền binary qua state và không để browser polling quyết định task lifecycle.
- **Delivery module:** App Worker authorize private view/share rồi phát short-lived delivery; public static media đi qua `cdn.<domain>`. Raw R2 user object không trở thành public route.

OpenNext được giữ vì origin parity và stack đã khóa. Tài liệu Cloudflare hiện ưu tiên vinext cho app mới, trong khi OpenNext upstream vẫn hỗ trợ Next.js 16 và các feature cần dùng. Vì vậy resolved Next/OpenNext/Wrangler versions, compatibility date, Linux production build và Workers-runtime integration suite là một release unit; đổi sang vinext cần compatibility spike và ADR riêng.

## Production placement

- HTTP Worker chạy global, static assets ở edge gần request. Smart Placement tắt mặc định; chỉ bật sau khi production trace chứng minh nó giảm materially D1/provider round trips.
- D1 primary dùng `--location=apac`; đây là hint, không phải residency guarantee. Read replication tắt phase đầu để giữ interface đơn giản cho BetterAuth, Credit Holds và task acceptance; chỉ bật cùng Sessions API sau benchmark và consistency tests.
- Validator Container constrain `regions: ["APAC"]`. Container disk là ephemeral; R2/D1 mới là durable state. `sleepAfter` scale-to-zero và `max_instances` giới hạn cost/concurrency.
- Không ghi claim R2 regional residency. Nếu sau này có data-residency requirement, phải mở decision mới cho D1 jurisdiction, Regional Services, R2 policy và AI provider data handling trước khi nhận dữ liệu thuộc jurisdiction đó.

## Environment topology

```mermaid
flowchart TB
    subgraph DEV[Cloudflare account: development]
        DW[Dev Worker] --> DD[(Dev D1)]
        DW --> DR[(Dev R2)]
        DR --> DQ[Dev Queue/DLQ]
        DQ --> DC[Dev Validator Container]
    end

    subgraph PREVIEW[Cloudflare account: preview]
        PW[PR-specific Worker] --> PD[(PR-specific D1)]
        PW --> PR[(PR-specific R2)]
        PR --> PQ[PR-specific Queue/DLQ]
        PQ --> PM[Mock validator]
    end

    subgraph STAGING[Cloudflare account: staging]
        SW[Staging OpenNext Worker] --> SD[(Staging D1)]
        SW --> SR[(Staging R2)]
        SW --> SF[Staging AI Workflow]
        SR --> SQ[Staging Queue/DLQ]
        SQ --> SC[APAC Validator Container]
    end

    subgraph PROD[Cloudflare account: production]
        U[Browser] --> W[Global OpenNext Worker]
        W --> D[(Production D1, APAC hint)]
        W --> R[(Production private/public/cache R2)]
        W --> F[Generation Workflow]
        F --> AI[External AI provider]
        AI --> R
        R --> Q[asset-validate Queue]
        Q --> C[APAC Validator Container]
        Q --> DLQ[Validation DLQ]
        C --> R
        C --> D
    end
```

| Environment | Exposure | Data/resources | Payment/generation rule |
| --- | --- | --- | --- |
| Local development | localhost | Wrangler-local simulations + Docker validator | Synthetic data; Mock Payment allowed |
| Development | Cloudflare Access-protected `workers.dev` | Dedicated dev account/resources | Synthetic data; Mock Payment allowed |
| PR preview | Access-protected PR-specific `workers.dev` | Ephemeral D1/R2/Queue/Worker, migrations + seed, destroy on close and 72-hour janitor | Synthetic data; Mock Payment + mock validator; no Container by default |
| Staging | Access-protected `workers.dev` | Dedicated production-shaped resources and real Container/Workflow | Disposable test data; Mock Payment allowed; full failure tests |
| Production | apex/www, `cdn.<domain>`, share routes | Dedicated prod account; real user data only | Mock Payment forbidden; generation off until production Credits/payment policy is accepted |

Static fixtures may be copied from a versioned manifest, but no environment reads another environment's private bucket, D1, Queue, secret or user export. Cloudflare version Preview URLs are not used as PR environments because they retain Worker bindings, lack logs and do not cover Workers with Containers/Durable Objects.

## Queue, Workflow and failure policy

- Queue payloads contain IDs, object key, ETag and attempt metadata, never image bytes. Queue delivery là at-least-once, nên `AssetValidationJob.id` và state transition phải idempotent.
- Asset validation starts with batch size 1, finite retries, exponential delay, explicit `max_concurrency` and mandatory DLQ. Duplicate R2 event/finalize requests converge on the same job.
- Container returns a result only after canonical R2 write is durable. Crash/OOM/timeout keeps Asset non-ready and retries safely; poison input reaches DLQ and raises an alert, never bypasses validation.
- Workflow instance ID equals accepted task ID. Provider submit and settlement steps use task/idempotency IDs; sleeping does not release Credit Hold. Server expiry/failure releases only through the state machine in ADR 0002.
- A scheduled reconciler finds accepted tasks without a running/completed Workflow and restarts the same instance ID; client disconnect or 120-second polling timeout has no terminal effect.

## Configuration, secrets and preview lifecycle

- Wrangler configuration and checked-in provisioning scripts are source of truth. Bindings, vars and secrets are explicit per environment because Wrangler environments do not inherit them.
- Commit only `secrets.required` names. Local values live in ignored `.dev.vars*`; deployed values use environment-specific secrets. BetterAuth, Google OAuth, AI provider and Cloudflare automation credentials differ by account.
- CI tokens are least-privilege and account-scoped. Production tokens live only in a protected CI environment with approval; no development/preview job receives them.
- Each PR preview provisions resources from migrations/fixtures, runs smoke tests and records resource IDs. Close cleanup plus a scheduled janitor deletes resources older than 72 hours. It never clones production data.

## Observability and operational gates

- Enable structured Workers/Workflow/Container logs with `request_id`, `task_id`, `asset_id`, `job_id`, attempt and deployed version. Never log email, token, opaque share secret, object credential or signed URL.
- Alert on HTTP error/CPU, D1 failures, Credit Hold age, Workflow error/stall, Queue backlog/oldest age, DLQ depth, Container cold-start/OOM/exit/RSS/duration, validation rejection spikes and R2 storage growth.
- Development/staging keep full logs. Production uses intentional head sampling plus 100% explicit error/security events; export only if native retention is insufficient.
- Build acceptance gate: benchmark adversarial 50MB/50MP PNG/JPEG on `standard-1`, record peak RSS/CPU/wall/cold-start p95, and test duplicate delivery, retry, DLQ and idempotent canonical write. Raise instance size only from evidence.

## Release, rollback and cost guardrails

- Release order: validate migrations → apply backward-compatible expand migration → upload Worker/Container version → staging smoke/failure suite → production smoke → gradual promotion. Contract cleanup occurs only after the rollback window.
- Worker rollback restores code/config version but not D1/R2/Durable Object state. Keep schemas backward-compatible, retain previous Container image digest and rehearse rollback in staging. D1 Time Travel is a destructive point-in-time recovery procedure, not normal code rollback.
- Existing per-user upload/storage quotas remain hard gates. Add `max_instances`, Queue/Workflow concurrency, provider request/spend caps, R2 lifecycle rules and log sampling. Cloudflare budget/usage alerts notify only; they do not cap spend.
- Kill switches may reject new upload intents or AI tasks while reads, auth, Project recovery, share revocation and Credit reconciliation stay available. Production generation remains disabled until production credit/payment policy replaces the testing-only Mock Payment decision.

## Rejected alternatives

- **Vercel app + Cloudflare data/queue:** feasible, but adds cross-provider credentials, HTTP hops, preview/resource skew and split incident ownership while R2/Queues remain mandatory.
- **Decode/re-encode in a normal Worker:** a 50MP RGBA frame alone is about 191MiB, already above the 128MiB isolate limit before decoder/output buffers.
- **Shared staging data for previews:** lets unreviewed code mutate integration data and makes tests order-dependent; version Preview URLs do not isolate bindings.
- **One account with Wrangler environments only:** bindings/secrets are separately configured but still share account-level credential and operator blast radius.
- **Always-on Smart Placement/read replication:** adds behavior before measured latency need and complicates write/read consistency without evidence.

## Sources

- Runtime: [Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [OpenNext Cloudflare](https://opennext.js.org/cloudflare), [OpenNext get started](https://opennext.js.org/cloudflare/get-started), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
- Data and async: [D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/), [D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/), [R2 event notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/), [Queues delivery](https://developers.cloudflare.com/queues/reference/delivery-guarantees/), [Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/).
- Compute and operations: [Containers placement](https://developers.cloudflare.com/containers/platform-details/placement/), [Containers limits](https://developers.cloudflare.com/containers/platform-details/limits/), [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/), [Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/), [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [Workers rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/), [budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/).
