---
title: "Grilling — Deploy runtime & environment topology"
label: wayfinder:grilling
type: grilling
status: closed
assignee: codex
closedAt: 2026-08-26
---

## Question

Quyết định runtime deploy sau khi stack Next.js/OpenNext và R2 storage-first đã khóa: Cloudflare Workers/OpenNext end-to-end hay Vercel cho app với R2/Queue/validator ở Cloudflare.

Grilling (HITL):
- Chọn production runtime và vùng triển khai.
- Tách development/staging/production accounts, buckets, queues, databases và domains thế nào.
- Queue/validator/AI worker chạy cùng Cloudflare hay qua provider khác.
- Preview deployments có dùng shared staging data hay isolated ephemeral resources.
- Observability, secrets ownership, rollback và cost guardrails tối thiểu trước handoff build.

Kết quả: ADR + environment topology diagram.

Blocked by: 001-research-stack-api-contract, 007-grilling-upload-cdn

## Resolution

**Closed 2026-08-26 — HITL.** Đại Ca chọn toàn bộ recommended answers đến hết stage.

- Chọn Cloudflare end-to-end thay vì Vercel app + Cloudflare data plane: Next.js/OpenNext chạy trên Workers Paid; D1, R2, Queues, Workflows và Containers cùng một capability/deploy/observability plane.
- Giữ OpenNext vì stack/origin parity đã khóa, dù Cloudflare hiện khuyến nghị vinext cho app mới. Pin Next/OpenNext/Wrangler + compatibility date; Linux production build và Workers preview là release gate. Không dùng Next Edge runtime.
- HTTP Worker chạy global; Smart Placement tắt mặc định. Mỗi D1 tạo với location hint `apac`, read replication tắt phase đầu. Validator Container bị constrain `APAC`; không tuyên bố R2 có regional residency guarantee.
- R2 `object-create` → Queue `asset-validate` → thin consumer → `standard-1` Container để decode/re-encode ảnh 50MB/50MP. Queue at-least-once nên job idempotent, batch 1, concurrency bounded, retry hữu hạn và bắt buộc DLQ.
- AI task chạy bằng Cloudflare Workflow keyed theo task ID: submit provider, sleep/poll/retry, đưa output vào R2 quarantine rồi mới qua validator. Browser polling không sở hữu completion lifecycle.
- Tách bốn Cloudflare accounts: development, preview, staging, production. Mỗi account có bindings/resources/secrets riêng; preview mặc định thay real Workflow/Container bằng mocks, còn production là nơi duy nhất có user data thật.
- PR preview dùng Worker và D1/R2/Queue ephemeral theo PR, synthetic seed, Cloudflare Access, TTL janitor 72 giờ; không dùng shared staging data và mặc định mock validator thay vì Container. Version Preview URL không đủ vì share bindings, không có logs và không hỗ trợ Container/DO.
- Wrangler/IaC là source of truth. Secrets non-inheritable, khai báo `secrets.required`, giá trị tách theo account; production deploy token least-privilege nằm trong protected CI environment và cần approval.
- Workers/Container structured logs không chứa PII/token/raw signed URL. Alert error rate, queue backlog/DLQ, workflow error, hold age, validator rejection/RSS/duration, D1 overload và R2 growth.
- Release dùng expand/contract migration, staging rehearsal, upload version → smoke → gradual promote. Worker rollback không rollback D1/R2/DO; D1 Time Travel chỉ dùng theo restore runbook. Giữ previous Worker version và Container digest.
- Cost guardrails: upload/storage quotas đã khóa, `max_instances`, Queue/Workflow concurrency, provider hard spend cap, R2 lifecycle, prod log sampling và Cloudflare budget/usage alerts. Budget alerts chỉ cảnh báo; kill switches dừng upload/generation mới nhưng không chặn reads/auth/recovery.
- Production generation giữ disabled cho tới khi production Free Credit/paid policy được quyết; Mock Payment, test grants và test ledger không được đi qua production.

Architecture decision + environment topology: `docs/adr/0006-cloudflare-runtime-and-isolated-environments.md`.

Current primary-source evidence: `research/deploy-runtime-topology.md`.
