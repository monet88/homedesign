# Báo Cáo Kỹ Thuật: Sửa Lỗi HTTP 400 Bad Request Khi Tạo Thiết Kế AI Interior Design & Virtual Staging

- **Dự án:** HomeDesign AI Architecture Studio
- **Mã sự cố:** BUG-400-DESIGN-PAYLOAD-VALIDATION
- **Sprint:** Sprint 09 — Phase 02 (Hardening & Multi-Model Engine)
- **Ngày thực hiện:** 17/09/2026
- **Kỹ sư phụ trách:** Antigravity Agent (Cặp đôi lập trình cùng Đại Ka)
- **Phương pháp luận:** `/vibe-engineering-workflow`, `/vibe-git-manager`, `/behavior-model-debugger`, Karpathy Behavioral Guidelines.

---

## 1. Mục Tiêu (Objective)
1. **Khắc phục triệt để lỗi HTTP 400 (Bad Request)** văng ra trên Console khi người dùng nhấn nút **Generate** tại trang AI Interior Design (`/ai-interior-design`), cụ thể ở chế độ:
   - Mode: **Dựng Trống** (Virtual Staging)
   - Mẫu Dựng Sẵn Dành Cho Môi Giới BĐS: **Living Room Luxury**
   - Mô hình AI: **Nano Banana** (hoặc Fal.ai Flux Schnell / Gemini Flash)
   - Bảng phối màu: **Warm** (hoặc Neutral / Cool / Earth / Custom)
2. **Tuân thủ quy chuẩn bảo mật bất biến:** Đảm bảo không nới lỏng các chốt chặn fail-closed chống SSRF, chống Client Prompt Injection và chống Server-side Image Input Bypass.
3. **Kiểm thử tự động & Triển khai an toàn:** Viết unit test tái hiện, typecheck 100% sạch lỗi, commit lên repo GitHub duy nhất và deploy live lên Cloudflare Worker `homedesign-demo`.

---

## 2. Phân Tích Nguyên Nhân Gốc Rễ (/behavior-model-debugger Audit)

Khi phân tích call graph và trace đường đi của dữ liệu từ Client Browser lên Cloudflare App Worker:

```
[Giao diện DesignForm] (design-form.tsx)
       │
       ▼  (Người dùng chọn Virtual Staging Preset + Color)
[buildDesignConfig] (src/lib/design/state.ts)
       │
       ├──> sceneIntent(): gán style, colorScheme, customColorScheme, stagingPreset...
       │
       ▼  (Gửi POST /api/designs)
[POST /api/designs] (src/app/api/designs/route.ts)
       │
       ▼
[handleDesignGeneration] (src/lib/ai/handler.ts)
       │
       ▼
[createDesign] (src/lib/ai/lifecycle.ts)
       │
       ▼
[validateDesignConfig] (src/lib/ai/config.ts)
       │
       ▼
[validateInteriorIntent] (src/lib/ai/config.ts)
       │
       ├──> Whitelist: allowedInterior = Set([ "mode", "roomType", ... ])
       │
       └──> ❌ THIẾU "customColorScheme" trong allowedInterior!
            Vì sceneIntent luôn gửi customColorScheme: "" (kể cả khi không chọn custom)
            ==> !allowedInterior.has("customColorScheme") trả về TRUE!
            ==> Ném ngay DesignError("INVALID_INTENT", 400, "unrecognized field in intent: customColorScheme")!
```

### Chi tiết 2 lỗ hổng schema validation:
1. **Lỗ hổng 1 (Chính):**
   - Trong `src/lib/ai/types.ts`, `InteriorIntent` đã định nghĩa: `customColorScheme?: string;`.
   - Trong `src/lib/ai/config.ts`, `validateExteriorIntent` đã có `"customColorScheme"`.
   - **Tuy nhiên**, trong `validateInteriorIntent`, `allowedInterior` chỉ có:
     `["mode", "roomType", "customRoomType", "style", "customStyle", "colorScheme", "requirements", "editInstruction", "stagingPreset", "customPresetId"]`
     $\rightarrow$ Hoàn toàn thiếu `"customColorScheme"`. Do đó mọi form submit Interior đều bị từ chối 400 Bad Request!
2. **Lỗ hổng 2 (Phụ):**
   - Trong `design-flow.tsx`, khi user thao tác trong Team Workspace Studio có chọn preset tuỳ chỉnh, client gán `body.customPresetId = selectedCustomPresetId`.
   - Tuy nhiên `allowedRoot` trong `validateDesignConfig` chỉ có `workspaceId` mà thiếu `customPresetId` ở root level.

---

## 3. Việc Đã Làm (Implementation & Verification)

### 3.1. Sửa đổi mã nguồn (`Surgical Changes`)
1. **`src/lib/ai/config.ts`**:
   - Thêm `"customColorScheme"` vào `allowedInterior`.
   - Thêm `"customPresetId"` vào `allowedRoot`.
   - Parse `customPresetId` và truyền vào return object của `validateDesignConfig`.
2. **`src/lib/ai/types.ts`**:
   - Bổ sung `customPresetId?: string;` vào interface `DesignConfigInput` và `DesignConfig`.
3. **`src/lib/ai/config.test.ts`**:
   - Thêm test case `it("accepts interior virtual staging with customColorScheme and stagingPreset")` kiểm tra chính xác payload thực tế của giao diện Virtual Staging.

### 3.2. Kết quả kiểm thử tự động
- **Unit Test Config:** `npx vitest run src/lib/ai/config.test.ts` $\rightarrow$ **31/31 tests PASS (100%)**.
- **Design API Test:** `npx vitest run src/app/api/designs/design-api.test.ts` $\rightarrow$ **48/48 tests PASS (100%)**.
- **Typecheck:** TypeScript `tsc --noEmit` hoàn toàn không có lỗi type.

---

## 4. Kế Hoạch Tiếp Theo Theo Quy Trình (/vibe-engineering-workflow & /vibe-git-manager)

1. **Commit Code:** Tạo commit theo chuẩn Conventional Commits:
   `fix(ai): allow customColorScheme in interior intent and customPresetId in design config`
2. **Merge & Push:** Merge branch `fix/design-payload-validation-400` vào `main` và push lên remote duy nhất `https://github.com/newmylab/hmdesign.git`.
3. **Production Deployment:** Chạy wrapper build worker `npm run build:worker` và deploy lên Cloudflare `wrangler deploy --env demo`.
4. **Handoff:** Bàn giao phiên làm việc qua Master Prompt cho Đại Ka chuyển sang session mới mượt mà, định vị chính xác vị trí Sprint 9.
