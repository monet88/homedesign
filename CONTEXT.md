# CONTEXT — HomeDesign Clone

## Glossary

- **Generation** — một lần gọi AI tạo ảnh từ ảnh gốc + tham số (Model, Style, Room/Area, Palette, Aspect Ratio, Custom Requirements). Tiêu 1 Credits. Không nhầm với **Render** (Floor Plan → 3D/360°).
- **Project** — tập hợp các Generations + assets gốc của 1 user, hiển thị trong /projects, có trạng thái Private/Favorite/Share. Khác **Asset** (1 file ảnh/video đơn lẻ).
- **Asset** — file ảnh đã upload hoặc đã generate, lưu trên CDN (`cdn.homedesigns.app`), có metadata (size, mime, w/h). Khác **Project**.
- **Style** — bộ preset thị giác (VD: Modern Warm, Japandi, Scandinavian). Dùng cho Interior/Exterior. Khác **Area/Room Type** (Living Room, House Facade).
- **Room Type / Area** — phạm vi áp dụng Style (Interior: Living Room, Bedroom... / Exterior: House Facade, Front Porch...).
- **Palette** — lựa chọn màu chủ đạo (Neutral/Warm/Cool/Earth/Custom). Khi chọn Custom thì textbox `e.g. navy blue and brass...` enable.
- **Credits** — đơn vị thanh toán nội bộ. Tiers: Lite/Plus/Pro/Max. 1 Generation = 1 Credit (đã quan sát trên 3 tool). Claim Free Credits cho user mới.
- **Floor Plan** — domain riêng: Upload sơ đồ mặt bằng → Recognition → chọn Room + Style → 2D Furniture Layouts → 3D Renders → 360° Views. Không dùng chung pipeline Interior/Exterior image-to-image.
- **Before/After** — component so sánh ảnh gốc vs ảnh generate, có slider và 5 nút Show comparison.

## Bounded Contexts

1. **Identity & Billing** — BetterAuth (`__Secure-better-auth.session_token`), email+Google One Tap, Stripe, Credits.
2. **Catalog** — Styles, Ideas, Popular Galleries (dùng chung UI card Preview/Use style).
3. **Generation Pipeline** — Upload 50MB (PNG/JPG/JPEG), Model=Nano Banana, Full Redesign/Local Edit, Aspect Ratios (1:1,4:3,16:9,3:4,9:16), Custom Requirements 0/300.
4. **Asset & Project Library** — Projects, Assets, Activity, Private/Favorite/Share.
5. **Floor Plan Processing** — Recognition → 2D → 3D → 360° (tách pipeline).
