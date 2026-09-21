# SPRINT 5 HOÀN TẤT & SPRINT 6 MASTER HANDOVER CONTRACT

> **Ngày lập**: 16/09/2026  
> **Dự án**: HomeDesign Clone (AI Architecture & Interior/Exterior Design SaaS)  
> **Trạng thái hiện tại**: **SPRINT 5 — HOÀN THÀNH 100% CẢ PHASE 1 & PHASE 2, DEPLOYED PRODUCTION**  
> **Production Domain**: [https://design.7app.online](https://design.7app.online)  
> **Active Cloudflare Worker Version ID**: `d5cc1a61-5884-4870-8c0c-6ad36a5b7b65`  
> **Nhánh hoàn thành**: `feat/sprint-05-saas-polish-and-inpainting` (PR #1 trên GitHub)  
> **Giai đoạn tiếp theo**: **SPRINT 6 — INTERNATIONALIZATION (i18n), ONBOARDING FREE CLAIMS, GLOBAL PAYMENTS & LUXURY UI OVERHAUL**  

---

## 1. TỔNG KẾT TOÀN DIỆN SPRINT 5 (PHASE 1 & PHASE 2)

### A. Mục Tiêu Đã Hoàn Thành 100%
1. **Ticket 5.1 (AI Inpainting Mask Pipeline)**:
   - Kết nối dữ liệu vẽ cọ `maskDataUrl` từ Studio UI vào server adapter và Gemini 2.5 Flash prompt engine.
   - Kiến trúc prompt 3 tầng: Target & Mask reference, Preservation Invariants, và PBR Seamless Blending.
2. **Ticket 5.2 (Mobile Touch Ergonomics & VietQR Helper)**:
   - Tối ưu Before/After Slider với `setPointerCapture` và `touch-none` chống giật lag / cuộn dọc trên điện thoại.
   - Bổ sung tính năng "Lưu mã QR về máy" và hướng dẫn quét mã trên cùng một thiết bị di động.
3. **Ticket 5.3 (Studio Keyboard Shortcuts & Mask Undo/Redo)**:
   - Bổ sung phím tắt `[` / `]` để tăng giảm Brush size theo nấc (15 / 30 / 50px).
   - Bổ sung `Ctrl+Z` / `Cmd+Z` (Undo) và `Ctrl+Y` / `Ctrl+Shift+Z` (Redo) cho nét vẽ mask inpainting.
   - Bổ sung nút bấm ↶ Undo và ↷ Redo trên thanh toolbar cho người dùng cảm ứng (tablet/mobile).
   - Quản lý lịch sử bằng stack `ImageData` snapshot (giới hạn 25 states) chống rò rỉ RAM.
4. **Ticket 5.4 (Tích hợp Stripe song song VietQR)**:
   - Nâng cấp `MockPaymentModal` với tab chuyển đổi phương thức thanh toán: **🇻🇳 VietQR Chuyển Khoản** (Nội địa 24/7, giá VND) và **💳 Thẻ Quốc Tế / Stripe** (USD, Visa/Mastercard/Amex/Apple Pay).
   - Kết nối với backend `POST /api/payments/stripe/checkout`.
5. **Ticket 5.5 (Showcase Gallery & Conversion CTA)**:
   - Bổ sung **Thumbnail Showcase Grid** trực quan bên dưới slider Before/After.
   - Bổ sung nút CTA **"Thiết kế kiểu này →"** dẫn thẳng vào Studio tương ứng.
6. **Kiểm toán & Đóng gói Production**:
   - Chạy toàn bộ 34 test files đạt **541/541 unit tests pass (100%)**.
   - Build OpenNext thành công với bundle gzip `1.93 MB` (dưới trần 3MB Free Tier).
   - Deploy thành công lên Cloudflare Worker version `d5cc1a61-5884-4870-8c0c-6ad36a5b7b65`.
   - Xác thực live 200 OK trên `https://design.7app.online`.

---

## 2. BÁO CÁO THẨM ĐỊNH TỪ 4 GÓC NHÌN CHUYÊN GIA

### 👑 1. Góc nhìn CEO / Startup Founder (Tăng trưởng & Chuyển đổi doanh thu)
* **Điểm nghẽn lớn nhất hiện tại (Friction Chasm)**:
  * Khách hàng truy cập chưa có cơ hội trải nghiệm thử (Zero-friction Aha! moment). Bắt buộc người dùng phải nạp tiền ngay lập tức khi chưa tin vào chất lượng AI sẽ khiến tỷ lệ thoát trang (Drop-off Rate) lên tới trên 80%.
  * **Giải pháp đột phá cho Sprint 6**: Cung cấp chính sách **"Onboarding Free Trial: Tặng ngay 3-5 Credits khi đăng ký tài khoản"**. Cho phép người dùng render thử miễn phí ít nhất 1-2 phòng. Khi người dùng nhìn thấy phòng ngủ/phòng khách thực tế của họ biến thành không gian sang trọng trong 60 giây, họ sẽ chủ động mua các gói Plus/Pro/Max.
* **Mở rộng thị trường toàn cầu (Global Expansion)**:
  * Khách hàng quốc tế (US, EU, JP, KR, SG) sẵn sàng chi trả từ $19 - $49/tháng cho giải pháp AI bất động sản. Cần hỗ trợ **Đa ngôn ngữ (i18n)** (Tiếng Anh, Tiếng Việt, Tiếng Nhật, Tiếng Hàn, Tiếng Trung giản thể/phồn thể) và kích hoạt cổng thẻ Stripe song song VietQR.

---

### 📋 2. Góc nhìn Product Manager (PM - Thiết kế trải nghiệm & Định vị sản phẩm)
* **Nâng tầm thẩm mỹ đạt chuẩn Luxury / Anti-Slop (`taste-skill`)**:
  * Giao diện hiện tại hoạt động rất chuẩn chỉ về mặt kỹ thuật, nhưng phong cách thiết kế còn mang cảm giác "MVP template", màu sắc và độ tương phản chưa toát lên sự đắt giá của một thương hiệu bất động sản cao cấp.
  * **Định hướng thẩm mỹ Sprint 6**:
    - **Typography Architecture**: Kết hợp font tiêu đề Serif/Display sang trọng (như *Cormorant Garamond*, *Plus Jakarta Sans*, hoặc *Geist*) với font nội dung siêu rõ nét.
    - **Color & Texture Palette**: Sử dụng tone màu vàng sâm banh (Champagne Gold), đồng cổ (Warm Bronze), đá cẩm thạch trắng (Calacatta Marble) và nền Dark Graphite sâu thẳm.
    - **Micro-interactions**: Chuyển động mượt mà với spring physics, card có ánh sáng viền chạy tinh tế khi di chuột (border glow), triệt tiêu các khối card AI generic.
* **Cắt giảm những yếu tố rườm rà (What to Cut)**:
  * Rút ngắn các đoạn văn bản giải thích kỹ thuật credit dài dòng trên landing page. Người dùng cá nhân không quan tâm model nào chạy phía sau, họ chỉ muốn thấy: Ảnh thật -> Kết quả lộng lẫy -> Thử ngay 1 click.

---

### 🧪 3. Góc nhìn QA & Senior Security Tester (Độ tin cậy & Kiểm soát rủi ro)
* **Bảo vệ Free Claim Credits (Anti-Abuse / Sybil Attack)**:
  * Khi mở tính năng tặng Free Credits, nguy cơ người dùng tạo hàng loạt tài khoản rác (spam Google accounts) để bào tài nguyên AI miễn phí là rất cao.
  * **Hàng rào bảo vệ kỹ thuật**:
    - Gắn `claim_fingerprint` kết hợp IP hash và Canvas Fingerprinting.
    - Giới hạn mỗi dải IP/thiết bị chỉ được claim free trial tối đa 1 lần/tuần.
    - Credit tặng có thời hạn sử dụng (ví dụ: hết hạn sau 7 ngày) để thúc đẩy hành vi sử dụng ngay.
* **Độ ổn định thanh toán kép**:
  * Tự động điều chỉnh đơn vị tiền tệ: Người dùng duyệt bằng IP Việt Nam hoặc chọn ngôn ngữ Tiếng Việt ➜ Tự động hiển thị VND và VietQR. Người dùng quốc tế ➜ Tự động hiển thị USD và Stripe Elements.

---

### 🛋️ 4. Góc nhìn Retail User (Khách hàng cá nhân sửa nhà)
* *"Tôi không phải kiến trúc sư, tôi chỉ muốn nhà tôi đẹp như resort 5 sao mà không mất hàng chục triệu tiền thiết kế."*
* **Tính năng mong muốn nhất**:
  * **Phong cách chọn 1 chạm (Curated Style Presets)**: "Wabi Sabi Thiền Định", "Indochine Đông Dương", "Modern Luxury Thượng Lưu", "Scandinavian Tối Giản", "Minimalist Bauhaus". Chỉ cần upload ảnh phòng cũ, chọn 1 preset là xong, không cần nhập prompt phức tạp.

---

## 3. KHO SKILLS MỚI ĐÃ ĐƯỢC TÍCH HỢP CHO DỰ ÁN

Đã kiểm tra repo `https://github.com/leonxlnx/taste-skill` và tích hợp các module phù hợp nhất vào hệ thống:

1. **`taste-skill` (Anti-Slop Frontend Framework)**:
   - Đã cài đặt tại [`.agents/skills/taste-skill/SKILL.md`](file:///e:/monetwork/hmdesign/.agents/skills/taste-skill/SKILL.md) và có sẵn tại [`design-taste-frontend`](file:///C:/Users/User/.gemini/config/skills/design-taste-frontend/SKILL.md).
   - Giúp AI loại bỏ hoàn toàn các lỗi thiết kế AI phổ biến (AI-purple gradients, 3 feature cards nhàm chán, generic glassmorphism) và áp dụng tiêu chuẩn thiết kế tinh tế (variance, motion intensity, visual density).
2. **`redesign-skill` (High-End SaaS Interface Refactor)**:
   - Đã cài đặt tại [`.agents/skills/redesign-skill/SKILL.md`](file:///e:/monetwork/hmdesign/.agents/skills/redesign-skill/SKILL.md).
   - Cung cấp quy trình từng bước biến đổi giao diện từ MVP thành tác phẩm đạt chuẩn Awwwards / Linear-grade.

---

## 4. BẢNG KẾ HOẠCH CHI TIẾT SPRINT 6: GLOBAL EXPANSION & LUXURY REDESIGN

### Danh sách Tickets cho Sprint 6:
* **Ticket 6.1 (Onboarding Free Claim & Anti-Abuse)**:
  - Tự động cấp 3-5 free credits cho tài khoản mới đăng ký lần đầu.
  - Xây dựng bảng `user_claims` trong Cloudflare D1 với rate-limiting chống lạm dụng.
* **Ticket 6.2 (Internationalization - i18n Engine)**:
  - Tích hợp bộ từ điển đa ngôn ngữ nhẹ, tương thích 100% Cloudflare Workers edge (English, Tiếng Việt, 日本語, 한국어, 中文).
  - Language Switcher dropdown sang trọng trên thanh Header.
* **Ticket 6.3 (Luxury UI Overhaul theo `taste-skill`)**:
  - Tái thiết kế Hero Section, Cards, Sliders và Studio với phong cách Luxury Modernist (Champagne Gold accents, Dark Slate depth, typography cao cấp).
  - Tối ưu hóa chuyển động vi mô (Micro-interactions) và cảm giác chạm/vuốt trên điện thoại.
* **Ticket 6.4 (Production Stripe Keys & Global Currency Switcher)**:
  - Hoàn thiện luồng thanh toán quốc tế thẻ Visa/Mastercard với Stripe Elements, tự động chuyển đổi VND ⇋ USD theo ngôn ngữ/quốc gia.

---

## 5. MASTER PROMPT SẴN SÀNG CHO SESSION MỚI (COPY & PASTE SANG CỬA SỔ MỚI)

Đại Ka chỉ cần copy toàn bộ đoạn text dưới đây và dán vào cửa sổ chat mới:

```text
Chào em, tiếp tục dự án HomeDesign Clone từ tài liệu bàn giao:
docs/2026-09-16-sprint-05-completion-and-sprint-06-handover.md.

### Vị trí hiện tại:
- SPRINT 5 ĐÃ HOÀN TẤT 100% & DEPLOYED PRODUCTION.
- BẮT ĐẦU SPRINT 6: Internationalization (i18n), Onboarding Free Claims, Global Payments & Luxury UI Overhaul (Anti-Slop Taste).
- Production domain: https://design.7app.online (Worker Version: d5cc1a61-5884-4870-8c0c-6ad36a5b7b65).
- Nhánh Sprint 5: feat/sprint-05-saas-polish-and-inpainting (Đã commit & push PR #1 lên GitHub).
- Nhánh làm việc mới cho Sprint 6: Tạo nhánh feat/sprint-06-i18n-free-claims-luxury-ui từ main (hoặc tiếp tục sau khi merge PR #1).
- Các skills thiết kế cao cấp đã sẵn sàng trong dự án: /taste-skill, /redesign-skill, /vibe-git-manager, /vibe-engineering-workflow, /behavior-model-debugger.

### Nhiệm vụ trọng tâm Sprint 6:
1. Tiếp tục tuân thủ nghiêm ngặt các quy tắc:
   - Xưng hô "Đại Ka", trả lời bằng tiếng Việt, giữ thuật ngữ chuyên môn English.
   - Tuyệt đối không leak secret/token vào Git tree.
2. Triển khai Ticket 6.1: Onboarding Free Trial — Tặng 3-5 Credits trải nghiệm khi đăng ký tài khoản (kèm cơ chế anti-abuse).
3. Triển khai Ticket 6.2: Hệ thống Đa Ngôn Ngữ (i18n) nhẹ, chuẩn Edge Worker cho Tiếng Anh, Tiếng Việt, Tiếng Nhật, Tiếng Hàn, Tiếng Trung.
4. Triển khai Ticket 6.3: Đại tu toàn diện giao diện (Luxury UI Overhaul) theo tiêu chuẩn /taste-skill (Champagne Gold / Bronze accents, Dark Slate depth, typography đẳng cấp, chống giao diện đơn điệu AI slop).
5. Triển khai Ticket 6.4: Hoàn thiện cổng thanh toán quốc tế Stripe song song với VietQR SePay.
```
