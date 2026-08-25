# ADR 0003 — R2 storage-first with private user Assets

Mọi ảnh nguồn và ảnh generated dùng chung một storage-first lifecycle trên Cloudflare R2 thay vì gửi data URL lớn qua API. User Assets private mặc định; chỉ static marketing/catalog media được public qua custom CDN domain, nhằm giữ đúng nghĩa của Project Private/Share và tạo một seam ổn định cho Interior, Exterior, Floor Plan và Projects.

**Status:** accepted

**Revision 2026-08-26:** Phase đầu chỉ bắt buộc **Intake Validation** bằng kiểm tra byte/header có giới hạn trong Worker. Full decode/re-encode, metadata stripping và antivirus được xem là **Canonicalization**, hoãn tới khi có yêu cầu cụ thể; không cần Cloudflare Container cho upload contract hiện tại.

## Storage and delivery

- Dùng hai R2 buckets tách quyền: private user Assets và public static/catalog media. Production public media đi qua `cdn.<domain>`; `r2.dev` chỉ dùng development.
- Source Asset của cả Interior, Exterior và Floor Plan đều upload trước; AI task nhận Asset reference, không nhận base64 từ client.
- Asset private được đọc qua authorization và signed delivery sống ngắn. Share Project cấp quyền truy cập có kiểm soát, không đổi bucket hoặc raw object thành public.
- Giữ giới hạn intake PNG/JPG/JPEG 50MB để khớp UI origin. Single PUT đủ cho mức này; chưa dùng multipart.

## Upload contract and validation

- User đã xác thực tạo upload intent với tên, MIME và size khai báo. Server sinh Asset ID/object key ngẫu nhiên và presigned PUT hết hạn sau 10 phút; URL là bearer token, chỉ cho đúng operation/key.
- Presigned upload dùng R2 S3 API domain, không dùng custom CDN domain; bucket CORS chỉ cho các app origins đã khai báo. Mỗi user tối đa 3 pending uploads đồng thời, 20 upload intents/giờ và 1GiB ready private Assets trong testing.
- Client kiểm tra extension/MIME/size để phản hồi sớm; các giá trị client khai báo không phải security evidence. Intake Validation trong Worker mới là nguồn chuẩn: kiểm tra quyền, byte size thực tối đa 50MB, magic bytes và parse bounded PNG/JPEG headers để lấy width/height; giới hạn 50 megapixels và 12,000 px mỗi cạnh mà không decode raster hoặc buffer toàn file.
- Object mới nằm ở quarantine. R2 object-create notification hoặc finalize request kích hoạt validation job idempotent; Worker dùng ranged reads cho prefix có giới hạn, từ chối header truncated/malformed, type mismatch hoặc dimension violation, rồi stream/copy object đạt chuẩn sang private ready key trước khi chuyển Asset sang `ready`. Validation failure chuyển `rejected` và xóa object; retry không tạo bản sao logic mới.
- Output từ AI provider cũng đi qua quarantine và cùng validator trước khi trở thành Generated Asset `ready`.
- Phase đầu không full decode/re-encode, không strip EXIF và không gọi antivirus: allowlist chỉ có raster PNG/JPEG, user objects luôn private và raw Source Asset không được đưa vào Project Share. Nếu mở raw-source sharing/public delivery, thêm SVG/PDF/archive, hoặc provider yêu cầu normalized bytes thì phải mở decision mới cho Canonicalization và malware/CDR gate trước khi release.
- Generate chỉ nhận Asset `ready`. Retry upload intent/finalize và duplicate object events không được tạo Asset hoặc validation job lần hai.

## Retention

- Quarantine, upload dở dang và Asset chưa attach tự hết hạn sau 24 giờ.
- Source và Generated Assets đã attach vào Project được giữ cho tới khi user xóa Project/Asset hoặc account.
- User deletion ẩn Asset ngay, thu hồi signed access/share ngay và cho recovery 30 ngày; hết 30 ngày thì purge object cùng metadata. Static/catalog media versioned được giữ tới khi có release cleanup riêng.
- Generation failed không xóa Source Asset; partial/generated output chưa attach được xem là orphan và chịu lifecycle 24 giờ.

## Sequence diagram

```mermaid
sequenceDiagram
    actor U as User browser
    participant A as App API
    participant D as Asset metadata
    participant R as Private R2
    participant Q as Queue / validator
    participant G as AI worker

    U->>A: Create upload intent (name, MIME, size)
    A->>A: Authenticate, authorize, validate intent
    A->>D: Create Source Asset (pending-upload)
    A-->>U: Asset ID + 10-minute presigned PUT
    U->>R: Direct PUT to quarantine key
    R-->>Q: object-create event
    U->>A: Finalize upload (Asset ID, ETag)
    A->>R: HEAD object
    A->>Q: Ensure validation job (idempotent)
    Q->>R: HEAD + bounded ranged reads; validate bytes/header/dimensions
    Q->>R: Stream/copy approved object to private ready key; delete quarantine
    Q->>D: Mark Asset ready or rejected
    U->>A: Generate with ready Asset ID
    A->>G: Authorized task + short-lived object access
    G->>R: Store Generated Asset in quarantine
    R-->>Q: object-create event
    Q->>R: Validate and promote output to ready key
    Q->>D: Attach ready output to Project
    U->>A: Request Asset view/share
    A-->>U: Authorized short-lived delivery
```

## Sources

- Local observed contract: `research/generation-pipeline.md` and `research/stack-api-contract.md`.
- Cloudflare R2: [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [user-generated content architecture](https://developers.cloudflare.com/reference-architecture/diagrams/storage/storing-user-generated-content/), [event notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/), [object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/), [public buckets/custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/).
- Security validation: [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [R2 Workers API ranged reads](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#ranged-reads).
