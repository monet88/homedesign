# CONTEXT — HomeDesign Clone

## Glossary

- **Generation** — một lần gọi AI tạo ảnh từ ảnh gốc + tham số (Model, Style, Room/Area, Palette, Aspect Ratio, Custom Requirements). Chi phí Credits phụ thuộc model/action; luồng mặc định hiện có giá 1 Credit. Không nhầm với **Render** (Floor Plan → 3D/360°).
- **AI Task** — bản ghi thực thi phía server cho đúng một Generation hoặc Floor Plan Stage Run. Provider hoàn tất chưa đồng nghĩa task thành công; task chỉ success khi mọi Generated Asset mong đợi đã qua validation thành `ready`.
- **AI Provider Adapter** — module trừu tượng hóa giao tiếp với backend AI ngoài (`ProviderAdapter`). Hiện hỗ trợ `FakeProviderAdapter` (test/stub) và `GeminiFlashImageAdapter` (kết nối endpoint thật `https://cliproxy.monet.uno/v1` với model `gemini-3.1-flash-image`).
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
3. **Generation Pipeline** — Upload 50MB (PNG/JPG/JPEG), Model=gemini-3.1-flash-image (Nano Banana), Full Redesign/Local Edit, Aspect Ratios (1:1,4:3,16:9,3:4,9:16), Custom Requirements 0/300, tích hợp endpoint `https://cliproxy.monet.uno/v1`.
4. **Asset & Project Library** — Projects, Assets, Activity, Private/Favorite/Share.
5. **Floor Plan Processing** — Recognition → 2D → 3D → 360° (tách pipeline).
6. **Admin & Operations** — Admin Dashboard (`/admin`), User & Credit Management, Task Monitor, Provider Health Check.

## Session state — Sprint 1 Cloudflare + OAuth deploy (2026-09-13)

- **Rollback anchor:** `bca7718` before local deployment configuration changes.
- **Completed:** Project-local skills imported; demo D1 binding moved to `homeds`; migrations applied; Google OAuth Web Client created through the project Owner profile; its values are only in ignored `.env.local` and Cloudflare Worker Secrets; `homedesign-demo` deployed to `https://design.7app.online`.
- **Verified:** deployment exists, root URL returns HTTP 200, public auth client-config returns a syntactically valid Google Client ID, focused deploy tests pass, and TypeScript typecheck passes.
- **Not verified:** an interactive end-user OAuth login was deliberately not run, so it does not create a real user session. Full behavioral audit of generation, credits, library, admin, and floor-plan journeys is Sprint 2.
- **Next:** Read `plans/260913-1810-behavioral-audit-and-production-readiness/plan.md` and the latest handoff before changing user-facing auth or generation behavior. Never record credentials in this file.
