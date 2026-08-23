---
title: "Grilling — Upload 50MB & CDN/Storage"
label: wayfinder:grilling
type: grilling
status: open
assignee: null
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
