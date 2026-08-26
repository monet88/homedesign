---
label: ready-for-agent
title: "Spec — HomeDesign Clone (Interior / Exterior / Floor Plan), free-first"
status: open
completion_target: production-shaped-staging
---

# Spec — HomeDesign Clone (free-first)

Synthesized từ wayfinder map `.scratch/wayfinder/map-homedesign-clone.md` (closed 2026-08-26): 10 decision tickets, ADR 0001–0006, research `stack-api-contract` + `generation-pipeline`, prototype `before-after`, ground-truth `docs/design/DESIGN.md` + 6 screenshots.

## Problem Statement

Người dùng muốn một web app clone 1:1 homedesigns.app: upload ảnh phòng/mặt tiền/sơ đồ mặt bằng, nhận thiết kế lại bằng AI, quản lý kết quả trong thư viện Projects/Assets, chia sẻ qua link — với hệ thống Credits đo quota. Bản đầu free-first: không payment thật, dùng Free Credit Grant + Mock Payment để kiểm thử đầy đủ quota và failure paths. Completion target của build #1 là local/development/PR preview/staging production-shaped; production public launch vẫn bị gate bởi email delivery, Credits/payment và abuse policy riêng.

## Solution

Một Next.js (App Router, Turbopack) + OpenNext deploy trên Cloudflare (Worker + D1 + R2 + Queues + Workflows), BetterAuth (email + Google One Tap), UI clone theo DESIGN.md (tokens paper `#f6f0e4` / ink `#171411` / inter / pill radius, native slider + grid từ prototype). Ba design flow: Interior, Exterior (image-to-image, 1 Credit) và Floor Plan (pipeline 4 stage theo phòng: Brief 1 → Layout 2 → Render 3 → Panorama 4 Credits). Credits dùng immutable ledger + holds; Mock Payment thay Stripe trong local/development/PR preview/staging. Provider completion chưa phải success: output phải qua quarantine, trở thành Asset `ready`, attach vào Project rồi mới settle Credits.

## User Stories

### Landing & Catalog
1. As a visitor, I want to see the landing page với hero, Before & After slider, Popular Styles, Ideas, Pricing, FAQ, so that tôi hiểu sản phẩm trước khi đăng ký.
2. As a visitor, I want to kéo slider Before/After (5 comparisons), so that tôi thấy chất lượng AI redesign.
3. As a visitor, I want to browse Popular Styles (12 cards) và Ideas (10 cards) với Preview/Use style, so that tôi chọn nhanh phong cách.
4. As a visitor, I want to bấm Use style và được đưa tới design flow tương ứng với preset apply, so that tôi bắt đầu thiết kế ngay.

### Auth
5. As a visitor, I want to đăng ký/đăng nhập bằng email + password, nhận verification link qua environment-local test outbox và có resend/error/expired-link states, so that toàn bộ auth flow kiểm thử được không cần payment/mail provider thật.
6. As a visitor, I want to đăng nhập Google One Tap ngay day-1, so that tôi vào app một chạm.
7. As a new user, I want to xác thực email trước khi Generate; client giải thích cách verify và server trả `403 EMAIL_NOT_VERIFIED` mà không tạo task/hold, so that hệ thống chặn abuse.
8. As a logged-in user, I want to session 7 ngày qua cookie `__Secure-better-auth.session_token` với `GET /api/auth/get-session` polling; JSON response không chứa session token, so that tôi không phải login lại liên tục mà httpOnly vẫn có ý nghĩa.
9. As a logged-in user, I want to header đổi `Sign In` thành avatar + dropdown (Assets/Activity/Sign Out), so that tôi điều hướng tài khoản.
10. As an anonymous user, I want to bấm Generate bị chặn client-side (toast, không request), so that tôi biết phải đăng nhập.

### Credits & Mock Payment
11. As a verified user trong local/development/preview/staging, I want to nhận một lần Free Credit Grant 10 Credits không hết hạn qua idempotent grant key, so that email verify, Google login hoặc reconnect đồng thời không cấp trùng.
12. As a user, I want to thấy Available Credits trên badge (đã trừ holds đang hoạt động), so that tôi biết quota thực.
13. As a user, I want to khi hết Credits thì bị từ chối task trước khi tạo, UI nêu số thiếu và mở modal Mock Payment, so that tôi nạp thêm ngay.
14. As a user (local/dev/preview/staging), I want to mua mock 4 pack Lite 80 / Plus 160 / Pro 320 / Max 640 với nhãn rõ `Mock purchase — no charge`, so that tôi test quota mà không trả tiền.
15. As a user, I want to retry/double-click/reconnect với cùng key + cùng request nhận record cũ, còn reuse key cho payload khác bị `409`, so that task, hold hoặc Mock Payment không bị tạo trùng.
16. As a user, I want to hold chỉ settle khi output đã `ready` + attach; release khi failed/canceled/validation exhausted/DLQ/server expiry 30 phút, so that Credits luôn đúng và tôi không bị charge khi không có artifact dùng được.
17. As a user, I want to client polling timeout 120s không giải phóng hold và task hoàn tất muộn vẫn settle đúng một lần, so that đóng tab không mất Credits.
18. As an operator, I want to Mock Payment bị cấm ở production, so that không lẫn credits test với payment thật.

### Upload & Assets
19. As a user, I want to upload ảnh PNG/JPG/JPEG tới 50MB bằng direct presigned PUT (hết hạn 10 phút), so that upload nhanh và không qua API body.
20. As a user, I want to Asset đi `pending-upload → quarantined → ready | rejected` qua bounded byte/header validation (magic bytes, ≤50MP, ≤12000px/cạnh), so that trạng thái chờ validation và lỗi đều quan sát được.
21. As a user, I want to Generate chỉ nhận Asset `ready`, so that lỗi validation không biến thành task lỗi khó hiểu.
22. As a user, I want to Assets private mặc định và đọc qua signed delivery sống ngắn, so that ảnh của tôi không public.
23. As a user, I want to quota 3 intake đang hoạt động (`pending-upload` + `quarantined`) đồng thời, 20 intents/giờ, 1GiB ready private assets, so that biết giới hạn trong testing.
24. As a user, I want to upload dở dang/quarantine tự hết hạn sau 24 giờ và delete có recovery 30 ngày, so that storage sạch và xóa nhầm cứu được.

### Interior / Exterior Generation
25. As a user, I want to upload ảnh phòng (Interior) hoặc mặt tiền (Exterior), chọn Style + Room Type/Area + Palette + Aspect Ratio (1:1, 4:3, 16:9, 3:4, 9:16) + Custom Requirements (0/300), so that tôi mô tả intent.
26. As a user, I want to Full Redesign dùng server-owned snapshot-tested prompt contract (Interior verbatim origin; Exterior clone-defined vì origin template chưa recover) và Local Edit chỉ gửi instruction, so that behavior ổn định mà spec không claim evidence chưa có.
27. As a user, I want to chọn Custom palette thì textbox `e.g. navy blue and brass...` enable, so that tôi nhập màu tự do.
28. As a user, I want to bấm `Generate (1 Credits)` và poll kết quả (2.5s/120s) với trạng thái rõ, so that tôi theo dõi tiến trình.
29. As a user, I want to xem kết quả dạng Before/After với slider và 5 nút Show comparison, so that tôi so sánh gốc vs generated.
30. As a user, I want to regenerate tạo Generation mới (billable) và giữ history, so that tôi không mất phương án cũ.
31. As a user, I want to download Generated Asset qua authorized `{assetId}` endpoint, so that tôi dùng ảnh bên ngoài mà server không fetch arbitrary URL.

### Floor Plan
32. As a user, I want to upload sơ đồ mặt bằng tạo Floor Plan Project gắn đúng một Source Floor Plan, so that mỗi căn nhà là một workspace.
33. As a user, I want to đặt Room Marker (tọa độ % 0–100) trên sơ đồ, so that tôi chọn phòng cần thiết kế.
34. As a user, I want to hệ thống nhận diện room type từ vùng marker và đề xuất Room Brief (style + questionnaire theo loại phòng + yêu cầu tự do + Design Proposal), so that tôi xác nhận intent phòng đó.
35. As a user, I want to sau khi confirm Brief thì generate Room Layout (ảnh 2D có furniture, chú thích, dimension chỉ khi đọc được từ source), so that tôi thấy bố cục.
36. As a user, I want to sau khi confirm Layout thì generate Room Render (ảnh photorealistic), so that tôi thấy không gian 3D.
37. As a user, I want to tùy chọn generate Room Panorama (equirectangular 2:1, ưu tiên 4096×2048) và xem bằng viewer 360° (Pannellum, pan/zoom/drag/fullscreen), so that tôi trải nghiệm phòng.
38. As a user, I want to bỏ qua panorama vẫn hoàn tất phòng, so that tôi tiết kiệm Credits.
39. As a user, I want to `Add Next Room` đặt marker mới mà không ảnh hưởng phòng đã làm, so that tôi thiết kế cả nhà theo từng phòng.
40. As a user, I want to marker chỉ đổi được trước khi confirm Brief; sau đó chọn vị trí khác tạo Room Design mới, so that lineage không bị diễn giải lại.
41. As a user, I want to retry stage failed chỉ chạy lại stage đó (stage đã success giữ usage), so that tôi không trả lại Credits cho phần đã xong.
42. As a user, I want to regenerate upstream tạo run mới và chỉ sau khi tôi confirm thì downstream cũ thành `stale` (vẫn trong history), so that tôi kiểm soát lineage.
43. As a user, I want to xem history các stage runs và chọn lại một run success làm lineage hiện tại, so that tôi khôi phục phương án cũ.
44. As a user, I want to Project Overview hiển thị `markedAreas` / `completeRooms` / `currentRoom`, so that tôi biết tiến độ cả nhà.
45. As a user, I want to rời trang giữa chừng và quay lại khôi phục trạng thái run từ server, so that tôi không mất việc đang chạy.

### Projects / Assets / Activity Library
46. As a user, I want to `/projects` hiển thị grid cover 4:3 với title, kind, updated time, favorite và visibility/share badge, so that tôi quản lý các phương án.
47. As a user, I want to filter theo kind/favorite/visibility + search title + sort (updated-desc mặc định), server-side với cursor pagination 24/page, so that library lớn vẫn nhanh và back/forward giữ state qua URL query.
48. As a user, I want to đánh dấu Project Favorite (không đổi visibility), so that tôi ghim phương án hay.
49. As a user, I want to tạo Project Share unlisted read-only (không cần đăng nhập để xem), có optional expiry và revoke, so that tôi gửi khách hàng xem.
50. As a share viewer, I want to chỉ thấy metadata tối thiểu + Generated Assets owner đã chọn (active/confirmed, không stale) và không có download action, so that share surface tối thiểu; UI nói rõ đây không phải DRM và không thể ngăn save/screenshot tuyệt đối.
51. As a user, I want to đổi Project về private / xóa / revoke dừng access ngay và restore không tự bật lại link cũ, so that tôi kiểm soát chia sẻ.
52. As a user, I want to `/assets` dense thumbnail grid với filter Source/Generated, lifecycle, Project, so that tôi quản lý file-level.
53. As a user, I want to xóa Asset thấy cảnh báo số Project đang tham chiếu, so that tôi không phá Project khác.
54. As a user, I want to `/activity` timeline 50 entries/page (project/asset/generation/Mock Payment events), so that tôi truy vết lịch sử.
55. As a user, I want to mọi list có loading skeleton, empty, error + retry states (empty filter result khác empty account), so that UI không bao giờ chết trắng.

## Implementation Decisions

### Stack & Runtime (ADR 0006)
- Next.js App Router + OpenNext trên Cloudflare Workers (`nodejs_compat`, Node runtime, pinned compatibility date; không `runtime = "edge"`). Tailwind + `next/font` (inter + jetbrains mono). Không NextAuth/Supabase/Vercel.
- Module boundaries: **App Worker** (HTTP/SSR, auth, authorization, upload intents, D1 transactions, task/query interface) · **D1** metadata (identity, Projects/Assets, stage/task lineage, Activity, Credit Ledger/Holds; location hint `apac`) · **R2** 3 buckets (private user assets, public static media, OpenNext cache) · **Validation Worker** (queue-driven, bounded byte/header bằng ranged reads) · **Generation Workflow** (instance ID = task ID, sleep/poll/retry, ghi output vào quarantine) · **Delivery** (authorized short-lived private delivery; public static qua `cdn.<domain>`).
- AI provider là adapter theo stage, không phải thuật ngữ domain — một interface cho image-to-image và 4 floor-plan scenes; test fake ở seam này.
- Bốn Cloudflare accounts (development/preview/staging/production); PR preview ephemeral (migrations + seed, destroy on close + janitor 72h); không environment nào đọc data của environment khác. Local/dev/preview/staging cho Free Grant + Mock Payment + test-outbox; preview dùng fake provider, staging chạy full fake failure suite và controlled real-provider smoke. Production cấm Mock Payment/Free Grant/email sign-up và tắt generation tới khi production Credits, transactional email và abuse policy được chốt.
- Release unit: pinned Next/OpenNext/Wrangler versions + compatibility date + Linux production build + workers-runtime integration suite. Free-first gate: `wrangler deploy --dry-run`, bundle ≤3MB, ≤10ms CPU/invocation; nâng Workers Paid chỉ theo evidence.

### Auth (ADR 0001)
- BetterAuth giữ origin-compatible cookie/endpoints: `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`, `POST /api/auth/send-verification-email`, `GET /api/auth/get-session`; cookie httpOnly/Secure/SameSite Lax 7 ngày. Session JSON trả metadata + user cần cho UI nhưng loại token/session secret.
- `sendVerificationEmail` dùng `EmailDelivery` adapter, `sendOnSignUp=true`, verification token/link TTL 1 giờ và `requireEmailVerification=false`; local/dev/preview/staging dùng Access-protected `test-outbox` cùng TTL, không log verification URL. Resend rate limit 1/phút và 5/giờ/user; callback chỉ same-environment allowlist.
- User chưa verify vẫn có thể đăng nhập/xem app nhưng server task acceptance trả `403 EMAIL_NOT_VERIFIED` trước task/hold. Google One Tap day-1 (`GOOGLE_CLIENT_ID` theo env). Env names: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `EMAIL_DELIVERY_MODE`.

### Credits (ADR 0002)
- Credit Ledger bất biến là nguồn chuẩn số dư; không chỉnh trực tiếp. Available Credits = tổng grants + successful Mock Payments − usage − active holds; hiển thị trên badge.
- Task acceptance tạo Credit Hold atomically (cùng transaction với task row); output ready + attach → terminal success → usage; failed/canceled/validation exhausted/DLQ/server expiry 30 phút → release. Client timeout 120s và provider completion không terminal.
- Idempotency unique theo `(user_id, operation, key)` + canonical request fingerprint: same/same trả record cũ, same/different trả `409 IDEMPOTENCY_KEY_REUSED`; record giữ cùng vòng đời domain record.
- Free Credit Grant: unique `(user_id,"free-credit-grant-v1")`, được ensure trên mọi verified session/task path, 10 Credits không hết hạn. Mock Payment 4 pack 80/160/320/640, chỉ success cộng Credits, không giới hạn số lần, chỉ local/dev/preview/staging.
- Chi phí theo `model-pricing` v2 của origin: image-to-image `gemini-2.5-flash-image` (Nano Banana) default 1; floor plan theo stage 1/2/3/4. Stage đã success giữ usage; failed/canceled/expired stage chỉ release hold của chính run đó.

### Generation contracts (research §1–§4 + ADR 0003)
- **Browser → App API:** `POST /api/ai/generate` nhận `{sourceAssetId, mediaType, scene, provider, model, intent, options{aspect_ratio,num_outputs,resolution?,quality?}, idempotencyKey}` → `{code:0,data:{id}}`. `intent` là discriminated payload cho image-to-image hoặc Floor Plan stage; server authorize Asset `ready`, Project/lineage và build prompt. Public schema reject base64, object key, arbitrary URL, `prompt` và `options.image_input`.
- **App → provider adapter:** nội bộ mới dùng origin-compatible `{mediaType,scene,provider,model,prompt,options{aspect_ratio,image_input,num_outputs,resolution?,quality?}}`; `image_input` chỉ do server resolve thành short-lived private access. Provider URL/output luôn ghi quarantine, không trả thẳng browser.
- **Browser query:** `POST /api/ai/query` `{taskId}` → `{code:0,data:{id,status,provider,model,prompt,taskInfo,taskResult}}`; `taskInfo`/`taskResult` là JSON strings. Clone `taskResult` chỉ chứa ready Asset IDs/descriptors; UI gọi authorized delivery theo `assetId`. Internal `validating` map thành public `processing`; expired map thành `failed` + stable `TASK_EXPIRED` trong `taskInfo`.
- Client poll interval 2.5s, maxWait 120s; `failed|canceled` throw, timeout chỉ dừng client. Success parse `taskResult` → Asset IDs; owner download dùng `{assetId}` endpoint, không nhận `imageUrl`.
- Interior Full Redesign dùng verbatim template tại `research/generation-pipeline.md`; Local Edit chỉ dùng instruction. Custom values thay enum với fallback `the room` / `custom design` / `a custom color palette`; preset apply set toàn bộ state + `generationMode:"redesign"`.
- Exterior exact origin template chưa recover, nên clone dùng contract snapshot-tested sau thay vì claim verbatim: `Redesign this ${area} exterior in a ${style} direction. Use ${colorScheme}. Keep the existing building footprint, roofline, doors, windows, and structural geometry. Update facade materials, exterior finishes, landscaping, lighting, and curb appeal. Create a photorealistic exterior render with natural scale and realistic daylight.`; append `Custom requirements: ${requirements}` khi có. Local Edit chỉ dùng instruction.
- Workflow instance ID = task ID; browser polling không quyết định lifecycle. Reconciler restart task thiếu Workflow bằng cùng ID, nhưng atomically expire task non-terminal quá 30 phút; late callback không resurrect.

### Upload & Asset lifecycle (ADR 0003)
- Upload intent (name, MIME, size) → Asset `pending-upload` + presigned PUT 10 phút tới quarantine key. Finalize/verified object-create atomically chuyển `pending-upload → quarantined` và converge vào một validation job; R2 notification chỉ match `quarantine/` để ready copy không loop.
- Intake Validation trong Worker: quyền, byte size ≤50MB, magic bytes, bounded PNG/JPEG header parse → width/height; ≤50MP, ≤12000px/cạnh; không decode raster. Pass → durable stream/copy sang ready key rồi `ready`; permanent input failure → `rejected` + xóa object.
- AI output tạo Generated Asset `quarantined`; provider complete giữ task `processing/validating`. Ready + attach mới success/settle; permanent rejection, initial attempt + 3 retries exhausted hoặc DLQ fail task/release hold. Source upload DLQ chỉ reject Asset, không có Credit Hold.
- Canonicalization (decode/re-encode, EXIF strip, antivirus) deferred — phase đầu chỉ raster PNG/JPEG, objects luôn private, raw Source không vào share surface.
- Retention: quarantine/dở dang/orphan 24h; delete ẩn ngay + revoke access + recovery 30 ngày rồi purge; Generation failed không xóa Source Asset.
- Quotas: 3 intake active (`pending-upload` + `quarantined`), 20 intents/giờ, 1GiB ready private. Queue at-least-once → `AssetValidationJob` idempotent, một initial attempt + tối đa 3 retries với delay 5s/30s/120s, DLQ bắt buộc, payload chỉ IDs/key/ETag.

### Floor Plan (ADR 0004)
- `FloorPlanProject` = specialization của Project, đúng một Source Floor Plan `ready`, nhiều `RoomDesign` độc lập; thay source tạo project mới.
- `RoomMarker` identity ổn định, `{x,y}` 0–100; một marker một Room Design; marker đổi được trước khi confirm Brief.
- Stage contract theo bảng ADR 0004: Brief (1) → Layout (2) → Render (3) → Panorama tùy chọn (4); gate giữa các stage là user confirm. Scenes theo origin: `room-design-brief|layout|render|panorama`; payload `{marker, roomId?, style?, stylePreference?, feedback?, recognition?, intake?}`.
- Stage run bất biến: `draft | processing | success | failed | confirmed`; success chỉ sau Generated Asset `ready` + attach + settle; `stale` là quan hệ lineage suy ra. Một Room Design tối đa một run `processing`/stage. Regenerate = run billable mới; retry failed không chạy lại stage đã success.
- Recognition chỉ suy luận room type/openings/shape hướng layout/dimensions đọc được — không CAD/BIM/topology/metric calibration; không bịa số đo.
- Panorama: equirectangular 2:1 (ưu tiên 4096×2048) + orientation; viewer Pannellum 2.5.7 (pan/zoom/drag/touch/fullscreen, không tour/hotspot/video); lỗi WebGL chỉ mất interactive view, preview tĩnh vẫn có.
- Project Overview suy ra từ các Room Designs (`markedAreas`, `completeRooms`, `currentRoom`) — không có global state machine nuốt trạng thái phòng khác.

### Projects / Sharing / Activity (ADR 0005)
- `Project.kind = interior | exterior | floor-plan`; draft Project tạo khi Source Asset `ready` đầu tiên được dùng; mọi Generation/Stage Run thuộc đúng một Project; failed work vẫn để lại Project + Source để retry.
- Source Asset share được giữa nhiều Projects của cùng owner (không nhân bản object); Generated Asset thuộc đúng một run và một Project. `PROJECT_ASSET.role = source | generated | share-selected`.
- Project Share: unlisted, read-only, opaque token entropy cao, server lưu digest; không login để xem; response chỉ metadata tối thiểu + ready Generated Assets đã chọn (active/confirmed, không stale); không hiện download action; optional expiry + revoke; private/delete/revoke dừng access ngay. Viewer vẫn có thể save/screenshot bytes đã hiển thị, nên không claim DRM.
- Restore Project/Asset không tự bật lại Share hoặc selection cũ; owner phải tạo/chọn lại. Activity Entry append-only, owner-only, idempotent theo domain event ID, giữ 90 ngày; ghi project/asset/generation/stage/Mock Payment events; không ghi polling/page view/từng hold.
- Query interface: `/projects`, `/assets`, `/activity` (chuẩn hóa route, bỏ quirk origin `/projects` 404); cursor pagination opaque `(sort_value, id)` — Projects/Assets 24/page, Activity 50/page; filter/sort/search server-side, reset cursor, URL query giữ state.
- Read model chỉ attach Generated Asset sau khi validator chuyển `ready`; không optimistic output, không provider URL trực tiếp; task terminal → invalidate/refetch project detail + first pages; phase đầu không WebSocket/SSE.

### UI/Design (prototype + DESIGN.md)
- Ground-truth: `docs/design/DESIGN.md` + 6 screenshots. Tokens: `--paper #f6f0e4`, `--ink #171411`, inter (hero 72px/600), `--radius-card 12px`, pill `9999px`.
- Từ prototype (decision đã chốt, ghi vào DESIGN.md): Before/After slider dùng native `<input type=range>` + `clip-path` + CSS var `--pos` — không lib; galleries dùng native CSS grid `auto-fill minmax(160px,1fr)` — không masonry lib; 5 thumbnails map `Show comparison 1..5`.
- Sidebar `Projects` trỏ `/projects`; account menu có `Assets`/`Activity`; header đổi theo session.

## Testing Decisions

- **Test external behavior only** — không test implementation details. Prompt strings là public behavior exception: Interior origin template và Exterior clone contract đều snapshot verbatim.
- **4 seams đã chốt:**
  1. **HTTP API (App Worker)** — auth sign-up/outbox/verify/resend/token redaction, grant/hold/settle/release, upload intent/finalize, browser generate/query DTO, projects/assets/activity, share/revoke/access và Mock Payment. Chạy workers runtime với D1/R2/Queue bindings thật; fake provider ở seam 2.
  2. **AI provider adapter + Workflow** — fake provider: accept → processing → quarantine → validating; ready attach mới settle. Cover provider failure, output rejection/DLQ, late callback, 30-minute expiry/reconciler, floor-plan lineage và idempotency fingerprint conflict.
  3. **Queue/Validation Worker** — fixture bytes: spoofed MIME/extension, truncated PNG/JPEG, malformed/late JPEG segments, oversized dimensions/pixel count, bounded range-read/CPU, 50MB streaming copy, `quarantine/` event filtering, duplicate delivery, initial attempt + retries 5s/30s/120s, DLQ và idempotent ready-key write.
  4. **Browser/E2E + visual contract** — reference desktop `1264×591` và mobile `390×844`: six DESIGN screenshots, landing/navigation, auth/unverified/resend, upload states, presets, Before/After keyboard+pointer/touch, URL-preserved library filters/back-forward, loading/empty/error/retry, share revoke, Floor Plan resume/history và panorama WebGL static fallback. Screenshot baseline changes require explicit review; automated accessibility check covers labels, focus order, keyboard operation and reduced motion.
- **Credit invariants** qua seam 1: sau mọi terminal transition, `grants + Mock Payments = usage + available + active holds`; không double-settle; provider complete/client timeout không release/settle; validation fail/DLQ/expiry release đúng một lần.
- **Lifecycle assertions:** public Generate reject base64/arbitrary URL/`image_input`; public query giữ `{code,data}` wrapper và không trả provider/R2 URL; session JSON không có token; owner download chỉ nhận `assetId`; `pending-upload → quarantined → ready|rejected` quan sát được.
- **Prior art:** không có production code — greenfield. Ticket đầu tiên thiết lập workers test harness + browser/visual harness + fixture helpers để ticket sau reuse; mỗi behavior mới một red-green slice (TDD).
- Smoke suite cho PR preview và staging theo ADR 0006 (migrations → seed → smoke/failure tests).

## Out of Scope

- Stripe/payment thật, paid-tier policy, production free-grant policy, production transactional email provider/sender, migration test credits → real và public production generation (launch decision sau; ticket 005 out of scope, pricing origin đã scrape giữ lại).
- i18n đa ngôn ngữ & SEO (English only; nút Change language của origin không clone trong phase này) — Đại Ca chốt 2026-08-26.
- Admin/CMS backoffice cho Styles/Ideas — seed tĩnh dùng content/assets do project sở hữu hoặc có license; crawl origin chỉ là design/reference evidence, không phải quyền tái phân phối.
- Canonicalization: full decode/re-encode, EXIF stripping, antivirus/CDR, SVG/PDF/archive intake (mở decision mới khi cần).
- Mobile native apps; AR/VR headset; multi-panorama tour/hotspot/video; CAD/BIM/topology; 2D drag-drop editor; Three.js scene.
- WebSocket/SSE realtime sync cho library; view count/share analytics.
- Raw source sharing / public delivery của user objects; multipart upload.
- Smart Placement, D1 read replication, Cloudflare Container, Workers Paid mặc định — bật theo evidence với ADR mới.

## Further Notes

- Vocabulary chuẩn trong `CONTEXT.md` — dùng đúng Generation / AI Task / Project / Asset / Credit Hold / Room Design / Floor Plan Stage Run / Activity Entry / Mock Payment; đây là các canonical terms duy nhất.
- Origin quirks KHÔNG clone: `/projects` 404, sidebar trỏ `/assets` — chuẩn hóa theo domain.
- Env config: `NEXT_PUBLIC_CDN_URL` thay `cdn.homedesigns.app`; auth names `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `EMAIL_DELIVERY_MODE`; secrets chỉ commit tên (`secrets.required`), values theo environment.
- Floor Plan video reference: `.ref/AI Floor Plan- Room Layouts, 3D Renders & 360° - HomeDesign.mp4`.
- Observability tối thiểu khi build: structured logs với `request_id/task_id/asset_id/job_id`; không log email, password, session/verification token, share secret, provider URL hoặc signed URL.
- Security hygiene gate: tracked docs/fixtures/HAR/chunks không chứa credentials, personal account identifiers hoặc live session material; raw captures ở `.scratch` phải được redact trước khi promote/commit.
- Blockers thứ tự tự nhiên cho `/to-tickets`: workers + browser/visual test harness → app shell → auth/test-outbox → credits/ledger → upload/validation → generation (interior/exterior) → projects/assets/activity → sharing → floor plan pipeline → panorama viewer → landing/catalog polish.
