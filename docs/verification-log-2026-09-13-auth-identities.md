# Verification log — Firebase service account và Google Cloud access

**Thời điểm:** 2026-09-13
**Phạm vi:** Phân biệt service-account credential, tài khoản Google đang mở Console, và blocker tạo OAuth Web Client cho demo.

## Bằng chứng đã kiểm tra

- Tại thời điểm kiểm tra, file service-account được cung cấp có hậu tố `3078da1db8.json` tồn tại, parse được là `service_account`, và trỏ tới project `aiphotonew`.
- File có hậu tố `bde8fa6744.json` không còn tại đường dẫn được nêu nên không thể dùng làm bằng chứng hiện tại.
- JSON service account chỉ chứa principal kỹ thuật `*.iam.gserviceaccount.com`, project ID, client ID và private-key material. Nó không có trường về Gmail người tạo, người sở hữu, hay IAM bindings; không thể suy ra Gmail cá nhân nào từ nó.
- Service account lấy được access token và đọc metadata project qua Cloud Resource Manager (HTTP 200). Điều này chỉ chứng minh quyền đọc metadata của principal đó.
- Google Cloud Console được mở bằng một phiên Chrome khác. UI hiển thị một tài khoản Google người dùng khác và báo thiếu quyền đối với project `aiphotonew`. Identity của phiên Chrome là quan sát UI độc lập, không được lấy từ JSON service account.

## Kết luận giới hạn

Chưa có bằng chứng rằng service account sở hữu toàn quyền trên project hoặc có quyền quản lý OAuth client. Cũng chưa có bằng chứng về Gmail người sở hữu file JSON. Không được gán identity của phiên Chrome cho file service account.

## Trạng thái deploy liên quan

Cloudflare Worker `homedesign-demo` chưa tồn tại nên `design.7app.online` chưa có deployment phục vụ. Chưa deploy public vì source demo yêu cầu Google OAuth client ID và secret hợp lệ.

## Refresh 2026-09-13

- Đã kiểm tra `.env.local` theo tên biến, không đọc hoặc ghi lại giá trị: Cloudflare Worker token và `BETTER_AUTH_SECRET` đều hiện diện; `BETTER_AUTH_SECRET` đạt ngưỡng độ dài yêu cầu.
- `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET` chưa hiện diện trong `.env.local`.
- Đã chạy `npx wrangler deployments list --env demo` với Cloudflare token cục bộ. Lệnh không trả về deployment demo nào. Wrangler cũng cảnh báo biến top-level không tự kế thừa vào `env.demo`; các secrets production phải được nạp bằng Worker Secrets, không chép vào file cấu hình công khai.

## Kiểm tra Firebase service-account bằng API — 2026-09-13

- File JSON được cung cấp mint được Google access token thành công bằng service-account flow. Firebase CLI cũng có sẵn trên máy; Firebase Admin SDK không được cài trong dependency của repo này.
- Đã gọi `projects.testIamPermissions` với chính access token đó. API trả HTTP 200 và chỉ liệt kê `resourcemanager.projects.get`.
- Cùng phép kiểm tra không trả `clientauthconfig.clients.create`, `clientauthconfig.clients.get`, hoặc `clientauthconfig.clients.createSecret`.

**Kết luận có thể kiểm chứng:** principal trong JSON hiện không có các quyền cần để tạo hay tạo secret cho Google OAuth client. Dùng Firebase CLI hoặc Admin SDK với cùng credential không thể vượt qua IAM này. Muốn tự động tạo credential qua JSON, project owner phải cấp quyền OAuth configuration phù hợp cho chính principal đó; nếu không, cần tạo OAuth Web Client bằng một Google user đã có quyền.

Principal kỹ thuật đã xác minh từ JSON để gán quyền: `firebase-adminsdk-fbsvc@aiphotonew.iam.gserviceaccount.com` (project `aiphotonew`). Không ghi private-key material.

## Recheck sau khi gán OAuth Config Editor — 2026-09-13

- `projects.testIamPermissions` bằng chính service-account token trả HTTP 200 và xác nhận các quyền: tạo/list brand, tạo/get/list OAuth client, tạo secret, đọc client policy, cập nhật test users, và đọc project.
- Ảnh Console do người dùng cung cấp cũng hiển thị role `OAuth Config Editor (Beta)` trên đúng principal kỹ thuật.
- Đã thử các endpoint đọc công khai liên quan để tránh tạo nhầm resource. IAM API OAuth-client hiện báo API chưa enable và tài nguyên đó dành cho Workforce Identity, không phải Google Sign-In Web client của ứng dụng; không bật API và không tạo resource ở đường này.

**Trạng thái:** quyền OAuth configuration đã được xác minh. Việc còn lại là tạo một OAuth Web Client cho `design.7app.online`; hành động này sẽ sinh client secret mới và chưa được thực hiện.

## Browser gate trước khi tạo client — 2026-09-13

- Trang Google Auth Platform > Clients của project `aiphotonew` được mở trong Chrome hiện có. Phiên Google user của trình duyệt khác với principal service account, và UI trả `You need additional access` với các quyền thiếu gồm `iam.serviceAccounts.list`, `oauthconfig.verification.get`, và `resourcemanager.projects.get`.
- Service account đã có OAuth Config Editor, nhưng service-account JSON không phải một phiên Google user để vận hành Console UI. Firebase Admin SDK/Firebase CLI không cung cấp lệnh công khai để tạo Google Auth Platform Web OAuth client thay thế UI đó.
- Không nhấn `Request access` (sẽ gửi yêu cầu quyền ra ngoài). Tab Clients được giữ lại để owner project đăng nhập/đổi đúng account; sau đó có thể tạo credential trong UI và tiếp tục deployment.

## Tiếp tục sau xác nhận tạo credential — 2026-09-13

- Ảnh mới do người dùng cung cấp cho thấy account Owner mở IAM của `aiphotonew`; đây là bằng chứng UI do người dùng cung cấp, không phải phiên browser mà agent hiện điều khiển.
- Browser automation hiện chỉ thấy một phiên Google Cloud khác, vẫn bị từ chối quyền đối với project. Tab Owner không xuất hiện trong danh sách tab có thể điều khiển, nên không thể tạo OAuth client trong phiên đó.
- Kiểm tra CLI cục bộ: `gcloud` không có trên máy; Firebase CLI có nhưng không có lệnh tạo Google Auth Platform Web OAuth client. Không cài thêm phần mềm, không gửi yêu cầu access, và không tạo credential qua API không được xác minh.

**Blocker hiện tại:** kết nối tab Console của account Owner vào browser session mà agent điều khiển, hoặc đăng nhập account Owner vào phiên Chrome đang được điều khiển. Khi đó có thể tiếp tục tạo credential và deploy.

## Ranh giới browser được người dùng chỉ định — 2026-09-13

- Người dùng xác định account Owner nằm ở Chrome `Profile 43`. Không được dùng các Chrome profile khác cho Google Cloud workflow này.
- Kiểm tra read-only danh sách browser automation hiện chỉ thấy hai profile khác; `Profile 43` chưa được kết nối. Không mở tab, không chuyển account, và không gửi yêu cầu access từ các profile khác.

## Profile Owner đã kết nối — 2026-09-13

- Browser do người dùng chỉ định hiện đã kết nối (tên hiển thị `flux`), có phiên Owner của project `aiphotonew`; UI và IAM role khớp với principal dự kiến.
- Google Auth Platform đã có một Web client auto-created cho Firebase. Không sửa client đó để tránh trộn callback Firebase với HomeDesign.
- Đã chuẩn bị một Web OAuth client riêng, chưa tạo: tên `HomeDesign — design.7app.online`; JavaScript origin `https://design.7app.online`; redirect URI `https://design.7app.online/api/auth/callback/google`.
- Form đang chờ xác nhận cuối cùng trước khi nhấn Create; client secret chưa được sinh, đọc, hay lưu.

## OAuth credential và deploy demo — 2026-09-13

- Sau xác nhận cuối cùng của người dùng, Google Console đã tạo Web OAuth client riêng cho HomeDesign. Client Firebase auto-created không bị sửa.
- Client ID và secret mới đã được lưu vào `.env.local`; file này được kiểm tra là ignored bởi Git. Không ghi giá trị credential vào log.
- Cloudflare Worker Secrets của `homedesign-demo` đã có đủ `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, và `GOOGLE_CLIENT_SECRET`.
- `wrangler deploy --env demo` hoàn tất thành công: Worker `homedesign-demo` phục vụ custom domain `design.7app.online`.
- Smoke checks: `GET /` trả HTTP 200 với title HomeDesign; `GET /api/auth/client-config` trả HTTP 200 và chỉ xác nhận Google client ID hiện diện/đúng định dạng. Không kiểm thử đăng nhập người dùng để tránh tạo session OAuth ngoài phạm vi smoke check.
- Validation cục bộ sau deploy: `npm.cmd test -- tests/deploy.test.ts` (30 tests pass), `npm.cmd run typecheck` pass, `git diff --check` pass, và secret scan delivery files không tìm thấy private key/token/client secret.

## Bước tiếp theo cần xác minh

Đăng nhập Google Cloud Console bằng đúng tài khoản người có quyền project `aiphotonew`, hoặc để project owner cấp quyền OAuth configuration cho principal được chọn. Sau đó kiểm tra lại quyền trước khi tạo OAuth Web Client và deploy.

## An toàn

Không ghi private key, access token, client secret, hoặc email cá nhân vào log này.
