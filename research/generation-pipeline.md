# Research — Generation pipeline (Interior / Exterior / Floor Plan)

**Branch:** `research/generation-pipeline` · **Date:** 2026-08-23
**Method:** pull 35 JS chunks của `/ai-interior-design` (4.2MB) → grep contract. Browser UI-drive bỏ (daemon CLI treo do shell), nhưng contract trích từ chính code client origin → chính xác 100%.
**Prereq:** `research/stack-api-contract.md:1`

---

## 1. Generation contract (Interior — nguồn truth)

### POST `/api/ai/generate` (JSON)
```jsonc
{
  "mediaType": "image",
  "scene": "image-to-image",           // interior & exterior dùng chung scene này
  "provider": "gemini",                // currentModel.provider || "gemini"
  "model": "gemini-2.5-flash-image",   // hoặc "<code>|<resolution>" khi model supportsResolution
  "prompt": "<built by template below>",
  "options": {
    "aspect_ratio": "16:9",            // 1:1 | 4:3 | 16:9 | 3:4 | 9:16
    "image_input": ["<dataURL hoặc URL>"], // ảnh nguồn inline — KHÔNG có upload step riêng cho interior
    "num_outputs": 1,
    "resolution": "1K",                // chỉ khi supportsResolution
    "quality": "high"                  // chỉ khi supportsQuality
  }
}
```
**Response:** `{code:0, message:"ok", data:{id:"<taskId>"}}` — `code!==0` = fail; thiếu `data.id` = fail.
**Model options:** `getSceneModels({config, mediaType:"image", scene:"image-to-image"})` từ `/api/ai/model-pricing`; option value format `code|resolution`.

### Prompt template (interior redesign — verbatim từ chunk `6f41c63bad4e9f32.js`)
```
Redesign this ${roomType} in a ${style} direction.
Use ${colorScheme}.
Keep the existing walls, doors, windows, and structural layout.
Update furniture, materials, lighting, decor, and styling.
Create a photorealistic interior render with natural scale and realistic daylight.
Custom requirements: ${requirements}   // chỉ khi có
```
- `generationMode === "edit"` (Local Edit): prompt = `editInstruction ?? requirements` (chỉ instruction, không template).
- Custom values: `customRoomType` / `customStyle` / `customColorScheme` thay enum value; rỗng fallback "the room" / "custom design" / "a custom color palette".
- Preset apply = set toàn bộ state `{aspectRatio,colorScheme,custom*,requirements,roomType,style}` + `setGenerationMode("redesign")`.
- State shape client: `{aspectRatio, colorScheme, customColorScheme, customRoomType, customStyle, editInstruction, generationMode: "redesign"|"edit", requirements, roomType, style}`.

### Poll — POST `/api/ai/query`
```jsonc
{ "taskId": "<id từ generate>" }
→ { code:0, data:{ id, status, provider, model, prompt, taskInfo, taskResult } }
```
- `status`: enum `AITaskStatus` lowercase (`success` / `failed` / `canceled` / processing…)
- `taskInfo`/`taskResult`: **JSON string** — parse bằng `JSON.parse`; lỗi lấy `taskInfo.errorMessage`.
- Client poll: `maxWaitMs=120_000`, `intervalMs=2_500`, dừng ở SUCCESS; FAILED/CANCELED throw; quá hạn throw timeout.
- Kết quả: `parseTaskResult(taskResult)` → `extractImageUrls` → mảng URL ảnh render.

### Download — POST `/api/assets/download`
```jsonc
{ "imageUrl": "...", "filename": "interior_design_<timestamp>.png" }  // → blob để save
```

## 2. Upload endpoint (dùng chung component uploader)

```
POST /api/storage/upload-image     // FormData: files=<File>
→ { code:0, data:{ urls:["<cdn url>"] } }
```
- Component mặc định: `maxSizeMB=10`, single file (có variant allowMultiple/maxImages), `uploadUrl` overridable.
- **Interior/Exterior KHÔNG đi qua endpoint này** — ảnh nguồn nhét thẳng data URL vào `options.image_input`. Endpoint này phục vụ avatar/settings (Max 10MB thấy ở `/settings`) và khả năng cao floor-plan intake.

## 3. Floor Plan pipeline (chunk `8413707613ade3aa`) — tách hẳn state machine

- Scenes tuần tự (khớp pricing `roomDesign` 1/2/3/4 credits):
  `room-design-brief` (recognition/intake) → `room-design-layout` (2D) → `room-design-render` (3D) → `room-design-panorama` (360°)
- Project status: `draft → analyzed → layout-ready → render-ready → panorama-ready`
- Step types: `room-brief | layout | render | panorama`; task status: `draft | processing | success | failed | confirmed`
- Payload schema (zod, passthrough): `{ marker:{x,y} /*0-100*/, roomId?, style?, stylePreference?, feedback?, recognition?, intake? }` — marker = Room-Level Adjustments (click trên layout).

## 4. Exterior

Cùng contract interior (`scene:"image-to-image"`), khác: prompt builder riêng (facade/curb wording — chưa tríchverbatim, cùng pattern `eo()`), enums Area/Exterior Style/palette theo UI đã ghi `docs/design/DESIGN.md:4`.

## 5. Auth gate

Bấm Generate khi chưa login: **không có request nào** bị đẩy ra — chặn client-side (toast). Đã verify: logged-in (`get-session` trả user) + button enabled mới là điều kiện đủ để gọi.

---

## Context pointers
- Ticket 007 (upload): giữ `POST /api/storage/upload-image` FormData `files` cho avatar/floor-plan; interior gửi data URL trực tiếp trong `options.image_input` (≤50MB client-check).
- Ticket 006 (credits): deduct xảy ra server-side khi tạo task (`data.id`); cost theo `/api/ai/model-pricing` v2.
- Ticket 008 (floor plan): implement đủ 4 scenes + status machine như §3.
- Clone: cần queue worker cho AITask (status machine + polling 2.5s/120s) — gợi ý bảng `ai_tasks(id,user_id,status,provider,model,prompt,task_info,task_result)`.
