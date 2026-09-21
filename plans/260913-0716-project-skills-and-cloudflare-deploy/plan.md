---
title: "project-skills-and-cloudflare-deploy"
description: "Sao chép skills backup vào phạm vi dự án và triển khai Worker Cloudflare bằng credential cục bộ."
status: completed
priority: P1
effort: "30m"
tags: [infra, docs]
created: 2026-09-13
---

# Project Skills and Cloudflare Deploy

## Overview

Sao chép nguyên trạng năm skill từ `D:\BACKUP\ASkills\.agents\skills` vào `.agents\skills` của dự án, sau đó build và deploy cấu hình Cloudflare `demo` tới `design.7app.online`. Credential chỉ đọc từ `.env.local`, không được ghi vào Git hay tài liệu.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Sao chép skills, build Worker và deploy demo | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Sao chép và triển khai](./phase-01-start.md) | Completed |
| 2 | [Behavioral audit & production readiness](../260913-1810-behavioral-audit-and-production-readiness/plan.md) | Planned |

## Success Criteria

- [x] Năm file skill đích có SHA-256 khớp nguồn.
- [x] `npm run build:worker` thành công.
- [x] `homeds` D1 được migrate đầy đủ và binding demo trỏ tới `design.7app.online`.
- [x] Worker demo được triển khai, remote secrets được nạp và URL phản hồi HTTP 200.

<!-- slug: project-skills-and-cloudflare-deploy -->
