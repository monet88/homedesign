---
title: "Grilling — Projects / Assets / Activity & sharing"
label: wayfinder:grilling
type: grilling
status: open
assignee: null
---

## Question

Quyết định **Projects / Assets / Activity** — thư viện cá nhân sau khi generate.

Đã quan sát:
- Sau login, menu `Redacted Test User` có `Assets`, `Activity` (chưa crawl `/projects`, `/assets`).
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
