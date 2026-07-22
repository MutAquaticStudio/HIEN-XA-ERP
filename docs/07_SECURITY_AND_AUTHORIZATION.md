# Security and Authorization

## 1. Mô hình

Kết hợp:

- RBAC theo vai trò
- Policy theo chi nhánh/kho/đội
- Field-level restrictions cho dữ liệu tài chính
- Server-side authorization là bắt buộc
- RLS là lớp phòng thủ bổ sung

## 2. Vai trò mặc định

- Owner
- Administrator
- Accountant
- Sales
- Warehouse
- Dispatcher
- Driver
- Worker
- Supervisor
- Viewer

## 3. Nguyên tắc

- Driver chỉ xem chuyến được phân.
- Worker chỉ xem công việc và tiền công của mình.
- Worker có thể xem work order `Open` để nhận việc; server chỉ cho role `Worker` nhận và chỉ một người nhận thành công.
- Warehouse chỉ thao tác kho được gán.
- Sales xem công nợ để bán hàng nhưng không sửa ledger.
- Accountant quản lý receipt/payment, nhưng reversal lớn có thể cần Owner.
- Chỉ Owner/Accountant được xem dòng tiền đầy đủ.
- Giá vốn/lợi nhuận là quyền riêng.

Chi tiết machine-readable: `docs/data/permissions-matrix.csv`.

## 4. Role-command map hiện tại

- Owner có toàn bộ permission trong ERP registry.
- Accountant tạo/xác nhận/đảo phiếu thu chi, phân bổ thu/chi theo chứng từ, thanh toán/đảo thanh toán nhân viên và xử lý import.
- Accountant tạo/xác nhận/đảo tạm ứng nhân viên.
- Sales tạo/xác nhận đơn bán, phân bổ nguồn hàng, tạo chuyến giao và tạo phiếu thu nháp.
- Warehouse post nhập kho, đảo phát sinh kho và thao tác bốc hàng/xuất bến.
- Dispatcher tạo xe/chuyến, xác nhận hoặc đảo giao thẳng, bốc hàng, xuất bến, hoàn tất hoặc báo thất bại.
- Driver bốc hàng, xuất bến, hoàn tất hoặc báo thất bại.
- Supervisor duyệt sản lượng, post compensation và hỗ trợ kết thúc/báo lỗi giao hàng.
- Worker gửi xác nhận nhập kho và hoàn tất giao; các yêu cầu này chỉ ở trạng thái chờ duyệt và không tạo hậu quả tài chính.
- Chỉ Owner hoặc Accountant được approve/reject xác nhận nhập kho và giao hàng; reject bắt buộc lý do.
- Warehouse/Dispatcher không được bypass approval bằng lệnh post trực tiếp khi chứng từ đang có yêu cầu pending.

## 5. Bảo mật dữ liệu

- Anh xac nhan da giao dung private attachment route, chi Worker gui anh va Owner/Accountant co the xem de duyet.

- Supabase Auth hoặc OIDC-compatible auth
- Session timeout hợp lý
- MFA cho Owner/Administrator nếu khả thi
- Private storage bucket cho chứng từ
- Signed URL ngắn hạn
- Ảnh nhập kho chỉ nhận JPG/PNG/WEBP, tối đa 8 MB, kiểm tra magic bytes và hash; route xem ảnh yêu cầu session hợp lệ.
- Ảnh đính kèm đơn bán/đơn mua dùng cùng private route; người tải ảnh và Owner/Accountant mới được xem, không phát metadata attachment qua projection không thuộc phạm vi.
- Rate limiting cho auth và import
- Secrets chỉ lưu server
- Structured audit logs
- Backup hằng ngày và point-in-time recovery khi gói dịch vụ hỗ trợ

## 6. Actor resolution của runtime hiện tại

- Không còn bộ chọn demo "Góc nhìn" hoặc "Người thao tác" trong giao diện vận hành.
- Mọi server action ERP lấy actor từ cookie session `HttpOnly` đã ký; role hoặc actor do trình duyệt gửi lên bị bỏ hoàn toàn.
- Actor được tạo từ tài khoản đang hoạt động, sau đó permission theo vai trò được giao với phạm vi module đã cấp.
- Thay đổi vai trò, module hoặc trạng thái làm tăng `session_version`, vì vậy mọi session cũ bị vô hiệu hóa ngay.
- Menu chỉ là lớp UX. Backend vẫn kiểm tra permission của từng command và production Supabase dùng RLS làm lớp phòng thủ bổ sung.
- Snapshot tải đầu, snapshot realtime và state trả về sau mutation đều được project phía server theo module trước khi serialize.
- Projection của Tài xế chỉ giữ chuyến được phân, khách/vật tư/xe liên quan; giá bán, hạn mức nợ, phiếu mua, ledger và sổ quỹ không được gửi xuống trình duyệt.
- Projection của Thợ chỉ giữ phiếu công, bảng công, các dòng nhập kho còn mở và chuyến có người đó tham gia; giá mua, giá bán, VAT, giá trị quy đổi, công nợ khách/NCC và quỹ đều bị loại hoặc che trước khi serialize.

## 7. Onboarding invite-only

- Không có đăng ký công khai và không có endpoint tự tạo tài khoản.
- Chỉ Owner và Administrator được mở trang quản trị người dùng; Administrator không được cấp hoặc sửa role Owner/Administrator.
- Lời mời hết hạn sau 72 giờ, chỉ dùng một lần và chỉ lưu SHA-256 hash của token trong kho dữ liệu.
- Mật khẩu runtime file-backed được băm bằng `scrypt`; production dùng Supabase Auth làm chủ sở hữu credential.
- Sau 5 lần đăng nhập sai liên tiếp, tài khoản bị khóa tạm 15 phút.
- Owner/Administrator không thể tự thay đổi quyền tài khoản đang đăng nhập; hệ thống luôn phải còn ít nhất một Owner đang hoạt động.
- Tạo lời mời, nhận lời mời, đăng nhập thành công/thất bại và thay đổi quyền đều có identity audit trail.

### 7.1 Tài khoản Thợ do Admin quản lý

- Thợ không bắt buộc có email và không phải tự nhận lời mời.
- Owner/Administrator tạo trực tiếp bằng họ tên, tên đăng nhập ngắn và mật khẩu ban đầu.
- Tài khoản được kích hoạt ngay với role `worker`; phạm vi mặc định gồm `overview`, `procurement`, `delivery` và `workforce` để gửi xác nhận nghiệp vụ, không có quyền post/approve.
- Khi gửi phiếu nhập, Thợ bắt buộc chụp/đính kèm ảnh thực nhận; Chủ cửa hàng/Kế toán xem được ảnh trước khi duyệt.
- Tên đăng nhập dài 3-30 ký tự, chỉ dùng chữ thường không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.
- Owner/Administrator có thể đặt lại mật khẩu; thao tác này tăng `session_version`, xóa khóa tạm và đăng xuất mọi phiên cũ.
- Tạo tài khoản và đặt lại mật khẩu đều ghi identity audit; mật khẩu chỉ lưu dưới dạng `scrypt` hash trong runtime hiện tại.

## 8. Cấu hình triển khai

- Development tự khởi tạo Owner cục bộ nếu chưa có file identity.
- Production bắt buộc cấu hình `ERP_BOOTSTRAP_ADMIN_EMAIL`, `ERP_BOOTSTRAP_ADMIN_PASSWORD` và `ERP_SESSION_SECRET` tối thiểu 32 ký tự trước lần chạy đầu.
- Cấu hình `NEXT_PUBLIC_APP_URL` để liên kết lời mời dùng đúng origin public sau reverse proxy.
- Migration `202607180002_identity_invitation_admin.sql` bổ sung role/module scope, session version, invitation metadata, audit bất biến và RLS cho mục tiêu Supabase.
- Migration `202607180003_managed_worker_accounts.sql` bổ sung username duy nhất và dấu vết tài khoản do Admin quản lý.
