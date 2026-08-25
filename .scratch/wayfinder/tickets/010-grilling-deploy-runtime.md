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

**Revised 2026-08-26 — HITL.** Đại Ca bỏ full image decode/re-encode và Cloudflare Container khỏi phase đầu; Workers Paid chuyển từ default sang evidence-based upgrade sau production build/CPU checks.

- Chọn Cloudflare end-to-end thay vì Vercel app + Cloudflare data plane: Next.js/OpenNext, D1, R2, Queues và Workflows cùng một capability/deploy/observability plane. Bắt đầu free-first nếu production build/runtime nằm trong limits; không mặc định Workers Paid.
- Giữ OpenNext vì stack/origin parity đã khóa, dù Cloudflare hiện khuyến nghị vinext cho app mới. Pin Next/OpenNext/Wrangler + compatibility date; Linux production build và Workers preview là release gate. Không dùng Next Edge runtime.
- HTTP Worker chạy global; Smart Placement tắt mặc định. Mỗi D1 tạo với location hint `apac`, read replication tắt phase đầu; không tuyên bố R2 có regional residency guarantee.
- R2 `object-create` → Queue `asset-validate` → Validation Worker kiểm tra actual size, magic bytes và bounded PNG/JPEG headers bằng ranged reads, rồi stream/copy sang ready key. Queue at-least-once nên job idempotent, concurrency bounded, retry hữu hạn và bắt buộc DLQ.
- AI task chạy bằng Cloudflare Workflow keyed theo task ID: submit provider, sleep/poll/retry, đưa output vào R2 quarantine rồi mới qua validator. Browser polling không sở hữu completion lifecycle.
- Tách bốn Cloudflare accounts: development, preview, staging, production. Mỗi account có bindings/resources/secrets riêng; preview có thể mock AI Workflow nhưng chạy cùng bounded-header validator, còn production là nơi duy nhất có user data thật.
- PR preview dùng Worker và D1/R2/Queue ephemeral theo PR, synthetic seed, Cloudflare Access, TTL janitor 72 giờ; không dùng shared staging data. Version Preview URL không đủ vì share bindings, thiếu isolated data lifecycle và không có logs.
- Wrangler/IaC là source of truth. Secrets non-inheritable, khai báo `secrets.required`, giá trị tách theo account; production deploy token least-privilege nằm trong protected CI environment và cần approval.
- Workers structured logs không chứa PII/token/raw signed URL. Alert error rate, queue backlog/DLQ, workflow error, hold age, validator bounded-read/error/duration, D1 overload và R2 growth.
- Release dùng expand/contract migration, staging rehearsal, upload version → smoke → gradual promote. Worker rollback không rollback D1/R2; D1 Time Travel chỉ dùng theo restore runbook. Giữ previous Worker version.
- Cost guardrails: production dry-run kiểm tra compressed bundle 3MB và runtime CPU 10ms của Workers Free; chỉ environment vượt limits mới nâng Paid. Giữ upload/storage quotas, Queue/Workflow concurrency, provider hard spend cap, bounded validation, R2 lifecycle, prod log sampling và budget/usage alerts.
- Production generation giữ disabled cho tới khi production Free Credit/paid policy được quyết; Mock Payment, test grants và test ledger không được đi qua production.

Architecture decision + environment topology: `docs/adr/0006-cloudflare-runtime-and-isolated-environments.md`.

Current primary-source evidence: `research/deploy-runtime-topology.md`.
