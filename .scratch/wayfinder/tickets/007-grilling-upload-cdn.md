---
title: "Grilling — Upload 50MB & CDN/Storage"
label: wayfinder:grilling
type: grilling
status: closed
assignee: codex
closedAt: 2026-08-25
---

## Question

Quyết định **upload & storage** cho clone.

Fact origin: upload button `PNG, JPG, JPEG up to 50MB`, label `A clear, bright photo...` (Interior) / `A clear daylight photo...` (Exterior), CDN `cdn.homedesigns.app` (hero, before/after, posters), lưu asset sau generate.

Grilling (HITL):
- Giới hạn 50MB giữ nguyên hay hạ xuống 10-20MB để tiết kiệm?
- Storage: giữ `cdn.homedesigns.app` (R2/S3 + CloudFront) hay dùng Vercel Blob / Supabase Storage / S3 VN?
- Upload flow: direct-to-CDN presigned URL hay qua `/api` proxy (quan sát chưa thấy endpoint upload — chờ 001/004)?
- Validation: client-side mime/size + server-side, virus scan?
- Retention: asset gốc + generated giữ bao lâu, liên quan Projects/Assets?

Gọi `grilling` + `domain-modeling` (Asset vs Project). Kết quả ADR + sequence diagram upload→generate→store.

Blocked by: 001-research-stack-api-contract, 004-research-generation-pipeline

## Resolution

**Closed 2026-08-25 — HITL.** Đại Ca chọn toàn bộ recommended answers, rồi chỉ định tiếp tục chọn recommendation đến hết frontier.

**Revised 2026-08-26 — HITL.** Đại Ca bỏ full decode/re-encode khỏi phase đầu. Intake Validation nhẹ trong Worker là gate bắt buộc; Canonicalization/Container chỉ được thêm bằng decision mới khi threat model hoặc format scope yêu cầu.

- Chọn Cloudflare R2: bucket private cho toàn bộ user Assets và bucket public cho Static Media qua `cdn.<domain>`; không dùng `r2.dev` ở production.
- Chuẩn hóa storage-first cho Interior, Exterior và Floor Plan. AI nhận ready Asset reference thay vì base64/data URL từ client.
- Giữ intake PNG/JPG/JPEG tối đa 50MB, single PUT. User đã xác thực nhận presigned PUT 10 phút cho server-generated key và upload trực tiếp vào quarantine.
- Validation hai lớp: client phản hồi sớm; server/worker kiểm tra auth, actual byte size 50MB, magic bytes và bounded PNG/JPEG headers, tối đa 50MP/12,000px mỗi cạnh mà không full decode hoặc buffer toàn file. Chỉ Asset `ready` được Generate.
- Presigned upload dùng R2 S3 API domain với CORS allowlist; testing giới hạn 3 pending uploads/user, 20 intents/giờ và 1GiB ready private Assets/user.
- Object-create event và finalize cùng kích hoạt một validation job idempotent. Quarantine/rejected/orphan hết hạn sau 24 giờ; retry không nhân đôi Asset/job.
- Generated output cũng phải qua quarantine và cùng bounded-header validator trước khi thành Generated Asset `ready`.
- User Assets private mặc định và chỉ phát qua authorized short-lived delivery. Project Share không public raw bucket/object.
- Assets attach vào Project giữ tới khi user xóa. Delete ẩn và thu hồi access ngay, recovery 30 ngày rồi purge; failed generation giữ Source Asset nhưng output orphan chỉ giữ 24 giờ.
- Phase đầu không dùng antivirus, full decode/re-encode hoặc EXIF stripping vì chỉ allowlist raster PNG/JPEG, objects luôn private và raw Source Asset không thuộc Project Share. Raw-source sharing/public delivery hoặc thêm SVG/PDF/archive phải mở decision mới cho Canonicalization và malware/CDR gate.

Architecture decision + sequence diagram: `docs/adr/0003-r2-storage-first-private-assets.md`.

Official facts consulted: Cloudflare R2 presigned URLs, UGC architecture, public buckets/custom domains, event notifications, object lifecycles; OWASP File Upload Cheat Sheet. URLs nằm trong ADR.
