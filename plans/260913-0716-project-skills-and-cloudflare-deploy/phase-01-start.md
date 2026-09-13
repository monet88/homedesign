---
title: "Phase 1: Sao chép skills và deploy"
status: completed
---

# Phase 1: Sao chép skills và deploy

## Overview

Giữ nguyên cấu trúc skills backup trong project scope, xác thực Cloudflare bằng biến môi trường chỉ tồn tại trong tiến trình, build OpenNext và deploy environment `demo` mà `wrangler.jsonc` đã khai báo.

## Requirements

- [ ] Không tạo nested repository hoặc ghi token vào config/Git.
- [ ] Copy đủ nội dung `D:\BACKUP\ASkills\.agents\skills` sang `E:\monetwork\hmdesign\.agents\skills`.
- [x] Không provision/sửa D1, R2 hay Queue; deploy tạo Worker demo cần thiết và gắn custom domain đã cấu hình.

## Implementation Steps

1. Sao chép cây skills bằng `Copy-Item` và đối chiếu danh sách/hash với nguồn.
2. Nạp `CLOUDFLARE_EMAIL` và `CLOUDFLARE_GLOBAL_API` vào biến môi trường tiến trình, xác thực với Wrangler.
3. Chạy `npm run build:worker`, sau đó `npx wrangler deploy --env demo`.
4. Gọi URL trả về để xác thực HTTP, kiểm tra trạng thái Git và redact credential trong báo cáo.

## Todo

- [x] Copy và hash-verify skills.
- [x] Wrangler auth.
- [x] Worker build.
- [x] Deploy, remote-secret check và HTTP smoke.

## Success Criteria

Tất cả SHA-256 skills khớp nguồn, build Worker pass, deploy demo trả URL Cloudflare và HTTP smoke không lỗi. Nếu binding Cloudflare thiếu hoặc token bị từ chối, dừng trước khi thay đổi cấu hình và báo lỗi nguyên văn đã redact.

## Blocker

Resolved. Worker `homedesign-demo` đã được tạo, D1 `homeds` đã migrate, OAuth Web Client riêng đã được tạo, và ba secrets auth đã được nạp vào Cloudflare Worker Secrets. Deploy version hiện tại phục vụ `design.7app.online`; `GET /` và `GET /api/auth/client-config` đều trả HTTP 200. Không lưu credential trong plan.

## Risk Assessment

- Binding demo (D1/R2/Queue/service) có thể không tồn tại trong Cloudflare account; deploy sẽ bị chặn thay vì được tự tạo.
- `.agents` bị ignore nên skills không được commit; đây là đúng project-local scope theo yêu cầu.

## Security Considerations

- Không in, commit, hoặc lưu token trong repo/config.
- Các biến Cloudflare chỉ được set trong shell chạy Wrangler.
