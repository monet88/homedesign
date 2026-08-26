---
title: "Grilling — Projects / Assets / Activity & sharing"
label: wayfinder:grilling
type: grilling
status: closed
assignee: codex
closedAt: 2026-08-26
---

## Question

Quyết định **Projects / Assets / Activity** — thư viện cá nhân sau khi generate.

Đã quan sát:
- Sau login, account menu có `Assets`, `Activity` (chưa crawl `/projects`, `/assets`); personal name đã redact.
- Floor Plan có `Favorite / Private / Share` ngay trên trang.
- Nav `Projects` link tới library (sidebar link `Projects` trên interior/exterior).
- Chưa rõ data model: Project chứa nhiều Generations, Asset là file đơn lẻ (đã định nghĩa trong CONTEXT.md).

Grilling (HITL):
- Data model: Project 1-n Generations 1-n Assets? Private/Favorite là flag trên Project hay Asset?
- Sharing: Share ra link public như origin? Cần auth check?
- Activity log: lưu những gì (upload, generate, purchase)?
- Pagination/filter cho library khi user có hàng trăm ảnh?
- Realtime: sau Generate xong tự push vào Projects hay cần refresh?

Gọi `grilling` + `domain-modeling` (đã có Glossary Project/Asset). Kết quả ERD sơ + UI list/grid quyết định.

Blocked by: 003-grilling-auth-session, 007-grilling-upload-cdn

## Resolution

**Closed 2026-08-26 — HITL.** Đại Ca chọn toàn bộ recommended answers và chỉ định tiếp tục chọn recommendation đến hết stage.

- `Project(kind: interior | exterior | floor-plan)` là aggregate duy nhất mang visibility, favorite và sharing. `FloorPlanProject` là specialization có đúng một Source Floor Plan và nhiều Room Designs; mỗi Generation hoặc Floor Plan Stage Run luôn thuộc một Project.
- Source Asset thuộc user và có thể được tái sử dụng giữa nhiều Projects. Generated Asset thuộc đúng một Generation/stage run và một Project. Asset không có favorite/share độc lập trong phase đầu.
- Project Share là link unlisted, entropy cao, read-only, không cần đăng nhập và có thể revoke. Share chỉ lộ các ready Generated Assets được chọn từ lineage active/confirmed; không lộ Source Asset, stale/history output, metadata nội bộ hoặc raw R2 URL. Download tắt mặc định.
- Project về Private, bị xóa hoặc Share bị revoke thì access dừng ngay. Restore Project không tự phục hồi Share cũ. Link mặc định không expire; owner có thể đặt expiry.
- Activity là timeline append-only, owner-only cho Project lifecycle, upload ready/rejected, generation/stage started/succeeded/failed và Mock Payment succeeded/failed. Không ghi polling, view/download hay từng Credit Hold; giữ 90 ngày và không thay thế audit log/Credit Ledger.
- Clone chuẩn hóa ba surface: `/projects` cho Project grid, `/assets` cho file library, `/activity` cho timeline. Đây là deliberate deviation vì origin hiện trả 404 ở `/projects`, sidebar `Projects` trỏ `/assets`, còn `/activity` yêu cầu auth.
- Projects/Assets dùng cursor pagination, 24 cards/page; Activity dùng 50 entries/page. Filter/sort/search chạy server-side; không dùng offset pagination.
- Generation polling hiện có là nguồn completion signal. Khi terminal, client invalidate/refetch Project detail và first pages của Projects/Assets/Activity; focus/reconnect refetch lại. Không thêm WebSocket/SSE hoặc optimistic Generated Asset trong phase đầu.

Architecture decision, ERD và UI/query contract: `docs/adr/0005-project-library-and-unlisted-sharing.md`.

Observed origin routes: https://homedesigns.app/projects, https://homedesigns.app/assets, https://homedesigns.app/activity.
