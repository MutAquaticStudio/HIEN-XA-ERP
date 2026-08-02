# Android native-only: phạm vi nghiệp vụ và điều kiện phát hành

## Mục đích

Ứng dụng Expo Android là giao diện native theo quyền, không dùng WebView, không mở Chrome và không có fallback sang web. Server vẫn là nơi duy nhất quyết định giá, VAT, tồn, công nợ, tiền công và bút toán. Transaction boundary hiện tại là `OperationsCommandService` cùng runtime CAS; đợt này không thực hiện cutover Supabase/PostgreSQL.

## Phạm vi theo vai trò

| Vai trò | Phạm vi native được phép |
| --- | --- |
| Chủ shop/Admin | Danh mục, bán/mua hàng, kho, giao hàng, công nợ, quỹ, nhân công, import, audit, báo cáo và quản trị theo quyền được cấp. |
| Kế toán | Quỹ, công nợ, phân bổ, đối soát, duyệt và báo cáo tài chính. |
| Bán hàng | Khách hàng, báo giá/đơn bán, phân bổ trong quyền và giao hàng liên quan. |
| Kho | Nhận hàng, chuyển kho, kiểm kho, điều chỉnh/reversal trong phạm vi kho. |
| Điều phối | Tạo/gán/chuyển trạng thái chuyến, map điều hành và duyệt giao. |
| Tài xế/Thợ | Chỉ chuyến hoặc việc được gán, GPS, ảnh, claim, báo chênh lệch và gửi sản lượng. Không được sửa trực tiếp số lượng hay post kho/công nợ. |
| Khách hàng/NCC | Chỉ dữ liệu của chính mình, chat, chứng từ, xác nhận/phản hồi chờ duyệt. Không tự post kho, tiền hoặc công nợ. |
| Supervisor/Viewer | Dashboard, báo cáo và audit trong phạm vi quyền; không post nghiệp vụ tài chính. |

## Ranh giới API native

Native chỉ gọi API Bearer-only theo bounded context, không dùng cookie web hoặc endpoint command chung. Các nhóm route hiện có gồm:

- `/api/mobile/catalog`, `/api/mobile/inventory/*`, `/api/mobile/delivery/*`
- `/api/mobile/sales/*`, `/api/mobile/procurement/*`
- `/api/mobile/receivables`, `/api/mobile/payables`, `/api/mobile/cash`, `/api/mobile/workforce`
- `/api/mobile/import/*`, `/api/mobile/audit/*`, `/api/mobile/reporting`, `/api/mobile/admin`

Hai action cũ trong `/api/mobile/management/operations` chỉ giữ tương thích APK `1.0.2`; tính năng native mới không được mở rộng vào endpoint này.

## Bất biến nghiệp vụ bắt buộc

- Mutation bắt buộc Bearer, Zod validation, RBAC và scope party/assignment ở server.
- Lệnh tạo, post, duyệt, allocation, reversal và chỉnh kho dùng `idempotencyKey`, `expectedVersion`, transaction và audit event.
- Mọi nghiệp vụ tiền/kho hiển thị bước rà soát trước khi xác nhận; server tính lại hậu quả trước khi post.
- Retry cùng idempotency key không tạo chứng từ, attachment, allocation hoặc bút toán trùng; version cũ phải trả conflict rõ ràng.
- Inventory movement và ledger là append-only; sửa sai bằng reversal/adjustment có audit, không sửa trực tiếp số dư hay chứng từ đã post.

## Dữ liệu nhạy cảm và riêng tư

- Tài xế, thợ, NCC không nhận giá vốn, margin, tồn nội bộ, VAT/giá bán không cần thiết hoặc dữ liệu đối tác khác.
- Khách chỉ thấy giá công khai, đơn, công nợ, chứng từ và chuyến của chính mình.
- Ảnh giao hàng, minh chứng và chứng từ là private attachment; server kiểm tra ownership trước khi trả dữ liệu.
- GPS chỉ dành cho tài xế được phân công trong chuyến hợp lệ, có consent rõ ràng; không tự tạo public tracking link.

## Offline, bản đồ và thông báo

- Offline chỉ lưu cached read, nháp không tài chính, ảnh và GPS giới hạn. Không queue approval, posting, allocation, reversal hay điều chỉnh kho.
- Logout, `401`, hủy/kết thúc chuyến phải dừng tracking và xóa queue/consent cục bộ.
- Bản đồ và GPS dùng native MapLibre; nút dẫn đường chỉ mở ứng dụng bản đồ của thiết bị, không mở trình duyệt.
- Push chỉ đăng ký khi cấu hình Expo hợp lệ; payload không được chứa tiền, công nợ hoặc thông tin nhạy cảm và phải unsubscribe khi logout.

## Giới hạn có chủ đích trong pilot

- Android là pilot; mã nguồn giữ tương thích iOS nhưng chưa phát hành TestFlight.
- QR chuyển khoản và đối soát kế toán thủ công vẫn là phương thức thanh toán online.
- Không tích hợp bank webhook, VNPay/MoMo, e-invoice provider, Supabase Auth cutover, PostgreSQL cutover hoặc import bulk-post trong phạm vi này.
- Tính năng chỉ được xem là parity khi màn native, bounded API, phân quyền, review và test của workflow tương ứng cùng đạt; không suy diễn parity từ việc có route hoặc màn danh sách.

## Cổng phát hành Android Internal

Trước khi tạo một APK EAS Internal cuối, mỗi batch phải đạt:

1. Root/mobile typecheck, full unit suite, web build, Expo export và Expo Doctor.
2. Route/domain regression cho `401`, `403`, `400`, `409`, idempotency, audit, redaction, ownership attachment, reversal và chặn số dư âm.
3. RNTL cho wizard, review, loading/error/success, logout, push, GPS consent/cleanup; Maestro cho các vai trò, upload, offline retry, map và isolation.
4. Gradle Android build, emulator và UAT thiết bị thật theo đúng role.

Hiện cổng Gradle Android bị chặn bởi thiếu dung lượng ổ `C:`. Cần giải phóng dung lượng và chạy lại build thành công trước khi tăng version hoặc tạo APK EAS mới. Build APK hiện có vẫn là fallback và chỉ được xóa sau khi bản mới cài được, UAT thành công.
