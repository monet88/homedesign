# CONTEXT — HomeDesign Clone

## Glossary

- **Generation** — một lần gọi AI tạo ảnh từ ảnh gốc + tham số (Model, Style, Room/Area, Palette, Aspect Ratio, Custom Requirements). Chi phí Credits phụ thuộc model/action; luồng mặc định hiện có giá 1 Credit. Không nhầm với **Render** (Floor Plan → 3D/360°).
- **AI Task** — bản ghi thực thi phía server cho đúng một Generation hoặc Floor Plan Stage Run. Provider hoàn tất chưa đồng nghĩa task thành công; task chỉ success khi mọi Generated Asset mong đợi đã qua validation thành `ready`.
- **AI Provider Adapter** — module trừu tượng hóa giao tiếp với backend AI ngoài (`ProviderAdapter`). Hiện hỗ trợ `FakeProviderAdapter` (test/stub) và `GeminiFlashImageAdapter` (kết nối endpoint thật `https://pro.autommo.online/v1` với model `gemini-3.1-flash-image`).
- **Admin** — người dùng có role `admin`, có quyền truy cập Admin Panel, xem/điều chỉnh Credits của người dùng và giám sát AI Tasks toàn hệ thống. Admin role không tự mang một số dư Credits đặc quyền; trên Public Demo, Credits của Admin cũng chỉ thay đổi qua Credit Ledger như các user khác.
- **Admin Panel** — giao diện quản trị riêng tại `/admin` dành cho role `admin`, cung cấp các bảng điều khiển: Quản lý Người dùng, Điều chỉnh Credits thủ công, Giám sát AI Tasks & Logs, và Kiểm tra kết nối AI Provider.
- **Project** — workspace thuộc một user, gom intent thiết kế, Generations và các Source/Generated Assets cho một phương án Interior, Exterior hoặc Floor Plan. Project là aggregate duy nhất mang visibility, favorite và sharing; khác **Asset** là một ảnh độc lập.
- **Project Favorite** — dấu lưu cá nhân của owner trên một Project, không thay đổi visibility hoặc quyền truy cập và không áp dụng riêng cho Asset.
- **Project Share** — quyền xem read-only qua một link unlisted có thể thu hồi, chỉ trình bày các Generated Assets được chọn từ lineage hiện hành. Không đồng nghĩa với public Asset hoặc raw object access.
- **Asset** — ảnh thuộc user với metadata và lifecycle `pending-upload | quarantined | ready | rejected | deleted`; `quarantined` nghĩa là object đã tồn tại và đang chờ/đang qua Intake Validation. Asset private mặc định, có thể được Project tham chiếu nhưng không tự mang favorite hoặc share. Khác **Project**.
- **Source Asset** — Asset do user upload để làm đầu vào cho Interior, Exterior hoặc Floor Plan.
- **Generated Asset** — Asset là đầu ra của một Generation hoặc một stage Floor Plan.
- **Static Media** — ảnh marketing/catalog do hệ thống quản lý và phát public qua CDN; không phải Asset của user.
- **Style** — bộ preset thị giác (VD: Modern Warm, Japandi, Scandinavian). Dùng cho Interior/Exterior. Khác **Area/Room Type** (Living Room, House Facade).
- **Room Type / Area** — phạm vi áp dụng Style (Interior: Living Room, Bedroom... / Exterior: House Facade, Front Porch...).
- **Palette** — lựa chọn màu chủ đạo (Neutral/Warm/Cool/Earth/Custom). Khi chọn Custom thì textbox `e.g. navy blue and brass...` enable.
- **Credits** — đơn vị quota đo quyền sử dụng AI, không đồng nghĩa với Payment. Chi phí thay đổi theo action/model (Generation, Floor Plan Render, panorama...).
- **Free Credit Grant** — 10 Credits không hết hạn được cấp một lần cho mỗi user đã xác thực trong các môi trường testing nội bộ. Public Demo không tự cấp Free Credit Grant.
- **Admin Credit Grant** — Credits do Admin chủ động cấp cho một user cụ thể. Trên Public Demo, đây là cách duy nhất để user có Credits; đăng nhập thành công không tự tạo quyền sử dụng AI.
- **Public Demo** — deployment public tại `homedesign.monet.uno` để người ngoài xem và đăng nhập bằng Google. User mới bắt đầu với 0 Credits; chỉ user được Admin chủ động cấp Credits mới có thể tạo workload AI mới.
- **Credit Ledger** — lịch sử bất biến của mọi Free Credit Grant, Admin Credit Grant, Mock Payment, Credit Hold, usage và release; là nguồn chuẩn của số dư Credits.
- **Credit Hold** — phần Credits được giữ chỗ khi một AI Task được chấp nhận: được chốt thành usage khi Generated Asset đã `ready` và task thành công, hoặc trả lại ở terminal failed/canceled/output-validation exhausted/server expiry. Client polling timeout không kết thúc hold.
- **Available Credits** — số Credits user còn có thể dùng sau khi trừ các Credit Hold đang hoạt động; đây là số hiển thị trên badge.
- **Mock Payment** — mô phỏng luồng mua và cộng Credits cho user đã xác thực trong local/development/preview/staging, không chuyển tiền và không gọi Stripe hay payment provider thật. Đây là tên chuẩn duy nhất cho khái niệm này.
- **Floor Plan** — domain visualization theo từng phòng: Upload sơ đồ mặt bằng → chọn Room + Style → Room Brief → 2D Furniture Layout → Photorealistic Render → 360° Panorama tùy chọn. Không phải CAD/BIM, không tạo geometry có thẩm quyền và không dùng chung pipeline Interior/Exterior image-to-image.
- **Floor Plan Project** — Project chuyên biệt gắn với đúng một sơ đồ mặt bằng nguồn và chứa nhiều Room Designs độc lập. Thay sơ đồ nguồn tạo project mới thay vì ghi đè project cũ.
- **Room Marker** — điểm người dùng chọn trên Source Floor Plan, lưu bằng tọa độ phần trăm và dùng để nhận diện phạm vi phòng. Khác polygon hoặc mô hình topology của phòng.
- **Room Design** — workflow visualization của một Room Marker, sở hữu Room Brief và các output 2D, Render, Panorama của phòng đó. Nhiều phương án được giữ dưới dạng các stage run, không tạo Room Design trùng cho cùng marker.
- **Room Brief** — intent đã xác nhận gồm room type nhận diện, Style, câu trả lời theo loại phòng, yêu cầu tự do và Design Proposal. Recognition là một hoạt động bên trong Room Brief, không phải output độc lập.
- **Room Layout** — ảnh 2D có furniture, chú thích và design rationale cho một Room Design. Không phải editor kéo-thả hoặc geometry model.
- **Room Render** — ảnh photorealistic tạo cảm giác không gian 3D từ Room Layout đã xác nhận. Không phải mesh, scene graph hoặc mô hình 3D tương tác.
- **Room Panorama** — ảnh equirectangular được xem bằng trình duyệt 360° cho một Room Design. Không phải video, virtual tour nhiều node hoặc trải nghiệm VR.
- **Floor Plan Stage Run** — một lần chạy bất biến của Room Brief, Room Layout, Room Render hoặc Room Panorama. Retry/regenerate tạo run mới; run cũ vẫn giữ lịch sử và Credits đã settle.
- **Activity Entry** — mục timeline append-only, owner-only ghi lại một thay đổi có ý nghĩa với Project, Asset, Generation hoặc Mock Payment. Không phải security audit log hoặc Credit Ledger.
- **Before/After** — component so sánh ảnh gốc vs ảnh generate, có slider và 5 nút Show comparison.
- **E2E Test Journey** — chuỗi kiểm thử tự động toàn trình giả lập tương tác người dùng qua Playwright từ đăng nhập $\rightarrow$ upload ảnh $\rightarrow$ sinh ảnh qua AI Provider $\rightarrow$ xác thực kết quả hiển thị & trừ Credits $\rightarrow$ kiểm tra Admin Dashboard.

## Bounded Contexts

1. **Identity & Credits** — BetterAuth identities, Admin role, testing-only Free Credit Grant, Public Demo Admin Credit Grant và Mock Payment ngoài Public Demo.
2. **Catalog** — Styles, Ideas, Popular Galleries (dùng chung UI card Preview/Use style).
3. **Generation Pipeline** — Upload 50MB (PNG/JPG/JPEG), Model=gemini-3.1-flash-image (Nano Banana), Full Redesign/Local Edit, Aspect Ratios (1:1,4:3,16:9,3:4,9:16), Custom Requirements 0/300, tích hợp endpoint `https://pro.autommo.online/v1`.
4. **Asset & Project Library** — Projects, Assets, Activity, Private/Favorite/Share.
5. **Floor Plan Processing** — Recognition → 2D → 3D → 360° (tách pipeline).
6. **Admin & Operations** — Admin Dashboard (`/admin`), User & Credit Management, Task Monitor, Provider Health Check.

## Session state — v1.0.0 Commercial Release Finalized (2026-09-18)

- **Release Tag:** `v1.0.0` (Commit `2c77a35` on `main`, PR #5 merged).
- **Current Branch:** `main`.
- **Status:** **CHÍNH THỨC CHỐT HẠ BẢN V1.0.0 THƯƠNG MẠI (GO-TO-MARKET READY)**.
- **Completed in v1.0.0:**
  - AI Batch 360° Panorama Generator (1-click sinh trọn bộ 3–5 phòng 360° đồng bộ).
  - Auto-Link Portals Engine (Tự động tính toán góc Yaw/Pitch và liên kết cửa đi lại Hub & Spoke / Sequential).
  - Interactive 360° VR Tour Studio (Pannellum engine, Gyroscope di động, VR Cardboard).
  - High-Res CAD QR Code Exporter (1024px PNG + Vector SVG in bản vẽ kỹ thuật A0–A3).
  - Seed Demo Penthouse Horizon Sky Villa 3 phòng chạy độc lập zero-DB (`/tour/demo-penthouse`).
  - Thanh toán VietQR SePay tự động 100% + Stripe quốc tế, chống Double Spend.
  - Toàn bộ 669/669 unit tests passed, 0 lỗi TypeScript, Cloudflare Worker build 2.16 MB / 3.0 MB.
- **Strategic Decision:**
  - Đóng băng Phase 02 (Client Portal) vào Backlog để tránh rủi ro phình to codebase và lỗi ngoài tầm kiểm soát.
  - Chuyển toàn bộ trọng tâm sang Giai đoạn Chào hàng & Bán hàng (Go-To-Market Execution).

## Session state — v1.0.1 Tour Security Hardening & Commercial Pilot B2B Ready (2026-09-19)

- **Release Tag:** [`v1.0.1`](https://github.com/newmylab/hmdesign/releases/tag/v1.0.1) (Commit `078c393` on `main`, pushed to `origin`).
- **Current Branch:** `main`.
- **Live Production URL:** [https://design.7app.online](https://design.7app.online) (Cloudflare Version `3a132754-d14f-4f46-841d-85e8890c3bc6`).
- **Live Interactive Demo:** [https://design.7app.online/tour/demo-penthouse](https://design.7app.online/tour/demo-penthouse).
- **Current Status:** **HOÀN TẤT VÁ 3 BLOCKERS BẢO MẬT TOUR 360 TỪ PHẢN BIỆN CODEX & CHÍNH THỨC SẴN SÀNG CHO PILOT B2B CÓ BẢN VẼ MẬT**.
- **Blockers Resolved & Hardened:**
  1. **Khóa van IDOR tại `GET /api/tours/[id]`:** Yêu cầu `authorizeVerified`, kiểm tra quyền sở hữu `tour.userId === auth.userId` hoặc quyền thành viên `workspace_members`. Chặn 401 unauthenticated và 403 unauthorized.
  2. **Chuẩn hóa Private-by-Default:** `CreateTourSchema` và `createTour()` chuyển mặc định sang `isPublic: false`. Tour chỉ công khai khi người dùng chủ động bấm chia sẻ.
  3. **Chống BOLA / Asset Substitution tại `addSceneToTour()`:** Kiểm tra quyền sở hữu asset trong bảng `assets`, chỉ cho phép gắn asset thuộc về user hoặc cùng workspace của tour.
  4. **Single Source of Truth Pricing & Quota Defense:** `pricing-constants.ts` cấp phát 1-1 cho Stripe, SePay, Landing Page và Catalog. Quota 50 calls/ngày van 2 lớp khóa triệt để.
- **Verification Summary:**
  - **Unit Tests:** **706 / 706 passed (100%)** (65 test files, Exit Code 0).
  - **TypeScript:** `npm run typecheck` (`tsc --noEmit`) **0 errors** (Exit Code 0).
  - **Cloudflare Worker Bundle:** **2.17 MB / 3.0 MB** (dư 27.6% hạn mức).
  - **Live Verification:** Verified `GET /api/tours/tour-test-idor` trả về 401 UNAUTHENTICATED; Verified `GET /tour/demo-penthouse` và `/api/tours/share/demo-penthouse` trả về 200 OK.

## Session state — Hotfix CI Secret Gate & GitHub CI Green (2026-09-19)

- **Head Commit:** `50b0346` (PR #6 merged into `main`).
- **Base Anchor / Rollback:** `d54d069` (v1.0.1 tag).
- **PR:** [#6](https://github.com/newmylab/hmdesign/pull/6) — `fix(ci): eliminate false-positive secret gate violations and restore deploy policy presign contract`.
- **Issues Resolved:**
  1. **Triệt tiêu 20 false positives tại Secret Regression Gate (`scripts/secret-gate.sh`):** Allowlist `src/lib/panorama/demo-tour.ts` và mở rộng skip prefix regex cho dummy mock tokens (`demo-`, `demo_`, `token`, `tok-`, `share`). Đảm bảo `scripts/secret-gate.sh` PASS (0 violations) và dứt điểm việc spam email báo lỗi CI từ GitHub.
  2. **Đồng bộ hợp đồng S3 Presign môi trường Demo:** Gỡ bỏ điều kiện thừa `ENVIRONMENT === 'demo'` ở `upload-intent/route.ts` và `lifecycle.ts`, đảm bảo bài test Workers runtime `deploy-policy.wtest.ts` pass 100% khi có credentials S3/R2.
- **Verification Evidence:**
  - **GitHub CI Actions:** PR #6 checks: `provision` (PASS), `verify` (PASS 100% toàn bộ lint, typecheck, unit tests, workers-runtime tests, smoke suite, free-first gate, e2e suite).
  - **Local Smoke & Test Suites:** 706/706 unit tests passed, 269/269 workers-runtime tests passed, bundle 2.17 MB / 3.0 MB.
- **Next Steps:**
  1. Duy trì Code Freeze trên core logic, tiếp tục hỗ trợ giám sát vận hành Pilot B2B thương mại.
  2. Xây dựng kế hoạch và backlog chi tiết cho bản v2 (Client Portal & Subscription model) dựa trên `/behavior-model-debugger`.

## Session state — Sprint 11 Phase 04: Behavioral Audit & Commercial Go-To-Market Strategy (2026-09-19)

- **Head Commit:** `ac6b8ba` on `main` (synced with `origin/main`).
- **Base Anchor / Rollback Point:** `d54d069` (v1.0.1 tag) & Snapshot `backup/v1.0.1-stable-20260919-150000`.
- **Handover Documents:** 
  - `docs/2026-09-19-sprint-11-phase-04-behavioral-audit-and-master-handover.md`
  - `docs/2026-09-19-v1-0-1-commercial-go-to-market-and-behavioral-playbook.md`
- **Verification Evidence:**
  - 708 / 708 unit tests passed (100%).
  - 269 / 269 workers-runtime tests passed (100%).
  - Typecheck (`tsc --noEmit`): 0 errors.
  - Secret Gate: PASS (0 violations).
  - Cloudflare Worker Bundle: 2.17 MB / 3.0 MB (free-first quota compliant).
- **Strategic Product Decision (Lean Startup & Simplicity First):**
  - **Tạm hoãn code Sprint 12 (v2 Feature Expansion):** Giữ nguyên nhánh `main` ở trạng thái ổn định và hiệu năng cao nhất, tránh bẫy "Feature Creep" khi thị trường chưa kiểm chứng.
  - **Kích hoạt Commercial Go-To-Market (GTM):** Sử dụng trực tiếp bản v1.0.1 đang chạy live tại `https://design.7app.online` để tiếp cận và chào hàng cho 5–10 Studio kiến trúc / Xưởng thiết kế nội thất đầu tiên.
  - **Bảo lưu Backlog v2:** Kế hoạch kiến trúc Client Portal (`/portal/[token]`) và 360° Pin Comments đã được hoàn chỉnh trong `implementation_plan.md` và sẽ kích hoạt ngay khi nhận được tín hiệu trả tiền / yêu cầu thực tế từ khách hàng pilot.

