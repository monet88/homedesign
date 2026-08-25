# CONTEXT — HomeDesign Clone

## Glossary

- **Generation** — một lần gọi AI tạo ảnh từ ảnh gốc + tham số (Model, Style, Room/Area, Palette, Aspect Ratio, Custom Requirements). Tiêu 1 Credits. Không nhầm với **Render** (Floor Plan → 3D/360°).
- **Project** — tập hợp các Generations + assets gốc của 1 user, hiển thị trong /projects, có trạng thái Private/Favorite/Share. Khác **Asset** (1 file ảnh/video đơn lẻ).
- **Asset** — file ảnh đã upload hoặc đã generate, lưu trên CDN (`cdn.homedesigns.app`), có metadata (size, mime, w/h). Khác **Project**.
- **Style** — bộ preset thị giác (VD: Modern Warm, Japandi, Scandinavian). Dùng cho Interior/Exterior. Khác **Area/Room Type** (Living Room, House Facade).
- **Room Type / Area** — phạm vi áp dụng Style (Interior: Living Room, Bedroom... / Exterior: House Facade, Front Porch...).
- **Palette** — lựa chọn màu chủ đạo (Neutral/Warm/Cool/Earth/Custom). Khi chọn Custom thì textbox `e.g. navy blue and brass...` enable.
- **Credits** — đơn vị thanh toán nội bộ. Tiers: Lite/Plus/Pro/Max. 1 Generation = 1 Credit (đã quan sát trên 3 tool). Claim Free Credits cho user mới.
- **Floor Plan** — domain visualization theo từng phòng: Upload sơ đồ mặt bằng → chọn Room + Style → Room Brief → 2D Furniture Layout → Photorealistic Render → 360° Panorama tùy chọn. Không phải CAD/BIM, không tạo geometry có thẩm quyền và không dùng chung pipeline Interior/Exterior image-to-image.
- **Floor Plan Project** — Project chuyên biệt gắn với đúng một sơ đồ mặt bằng nguồn và chứa nhiều Room Designs độc lập. Thay sơ đồ nguồn tạo project mới thay vì ghi đè project cũ.
- **Room Marker** — điểm người dùng chọn trên Source Floor Plan, lưu bằng tọa độ phần trăm và dùng để nhận diện phạm vi phòng. Khác polygon hoặc mô hình topology của phòng.
- **Room Design** — workflow visualization của một Room Marker, sở hữu Room Brief và các output 2D, Render, Panorama của phòng đó. Nhiều phương án được giữ dưới dạng các stage run, không tạo Room Design trùng cho cùng marker.
- **Room Brief** — intent đã xác nhận gồm room type nhận diện, Style, câu trả lời theo loại phòng, yêu cầu tự do và Design Proposal. Recognition là một hoạt động bên trong Room Brief, không phải output độc lập.
- **Room Layout** — ảnh 2D có furniture, chú thích và design rationale cho một Room Design. Không phải editor kéo-thả hoặc geometry model.
- **Room Render** — ảnh photorealistic tạo cảm giác không gian 3D từ Room Layout đã xác nhận. Không phải mesh, scene graph hoặc mô hình 3D tương tác.
- **Room Panorama** — ảnh equirectangular được xem bằng trình duyệt 360° cho một Room Design. Không phải video, virtual tour nhiều node hoặc trải nghiệm VR.
- **Floor Plan Stage Run** — một lần chạy bất biến của Room Brief, Room Layout, Room Render hoặc Room Panorama. Retry/regenerate tạo run mới; run cũ vẫn giữ lịch sử và Credits đã settle.
- **Before/After** — component so sánh ảnh gốc vs ảnh generate, có slider và 5 nút Show comparison.

## Bounded Contexts

1. **Identity & Billing** — BetterAuth (`__Secure-better-auth.session_token`), email+Google One Tap, Stripe, Credits.
2. **Catalog** — Styles, Ideas, Popular Galleries (dùng chung UI card Preview/Use style).
3. **Generation Pipeline** — Upload 50MB (PNG/JPG/JPEG), Model=Nano Banana, Full Redesign/Local Edit, Aspect Ratios (1:1,4:3,16:9,3:4,9:16), Custom Requirements 0/300.
4. **Asset & Project Library** — Projects, Assets, Activity, Private/Favorite/Share.
5. **Floor Plan Processing** — Recognition → 2D → 3D → 360° (tách pipeline).
