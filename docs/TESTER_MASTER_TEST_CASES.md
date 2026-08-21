# Bộ test case tổng thể cho tester - VLXD Hiền Xa

> Phiên bản: 1.0  
> Ngày soạn: 11/08/2026  
> Phạm vi: Web ERP, portal Khách hàng, portal Nhà cung cấp, Android native, Cloudflare D1/R2/Queue  
> Môi trường chính: Cloudflare staging cô lập  
> Không dùng production để tạo, xác nhận, ghi sổ hoặc đảo chứng từ UAT.

## 1. Mục đích và cách dùng

Tài liệu này là bộ test case thực thi cho toàn bộ chức năng ERP hiện có. Mỗi case phải được chạy trên staging bằng dữ liệu có tiền tố `UAT-<ngày>-...`, ghi rõ mã chứng từ, tài khoản, thời gian theo giờ Việt Nam và bằng chứng đã che dữ liệu nhạy cảm.

Các kết quả hợp lệ:

| Trạng thái | Ý nghĩa |
|---|---|
| `PASS` | Kết quả thực tế đúng hoàn toàn với expected result, có bằng chứng. |
| `FAIL` | Sai nghiệp vụ, sai quyền, sai dữ liệu, lỗi UI gây cản trở hoặc lỗi bảo mật có thể tái hiện. |
| `PARTIAL` | Luồng chính chạy nhưng còn giới hạn đã được ghi rõ. Không được dùng làm điều kiện phát hành. |
| `BLOCKED` | Thiếu môi trường, account, fixture, thiết bị hoặc quyền. Không được đổi thành PASS. |
| `NOT RUN` | Chưa được thực hiện. |

### Quy tắc an toàn của tester

1. Không test mutation nghiệp vụ trên `https://app.hienxavlxd.com`.
2. Không gửi hoặc chụp mật khẩu, cookie, Bearer token, recovery token, khóa API hoặc ảnh chứng từ thật.
3. Không sửa trực tiếp D1, runtime document, ledger, inventory movement hoặc storage để làm test đạt.
4. Nếu thấy sai tồn kho, sai tiền, sai công nợ, ghi trùng hoặc lộ dữ liệu: dừng luồng liên quan và mở lỗi P0/P1 ngay.
5. Mọi retry phải dùng lại idempotency key của case. Mọi test xung đột phải dùng hai phiên đăng nhập độc lập.
6. Chỉ Owner/Accountant được chạy case có post kho, công nợ, quỹ hoặc tiền công theo quyền thực tế.

## 2. Phạm vi role và dữ liệu UAT tối thiểu

### 2.1 Role cần có

| Mã fixture | Role | Mục đích |
|---|---|---|
| `OWNER` | Chủ cửa hàng | Phê duyệt, quản trị, audit, toàn quyền theo module được cấp. |
| `ADMIN` | Quản trị hệ thống | Quản trị identity trong phạm vi được cấp, không thay Owner. |
| `ACCOUNTANT` | Kế toán | Công nợ, quỹ, phân bổ, đối soát, báo cáo tài chính. |
| `SALES` | Bán hàng | Khách hàng, báo giá/đơn bán trong quyền. |
| `WAREHOUSE` | Thủ kho | Nhập/xuất, chuyển kho, kiểm kê trong phạm vi kho. |
| `DISPATCHER` | Điều phối | Tạo/gán chuyến, theo dõi, điều phối giao hàng. |
| `DRIVER_A`, `DRIVER_B` | Tài xế | Chuyến được giao, GPS, ảnh giao, báo chênh lệch. |
| `WORKER_A`, `WORKER_B` | Thợ | Công việc, nhận việc, sản lượng, ảnh. |
| `SUPERVISOR` | Giám sát | Dashboard/báo cáo trong quyền được cấp. |
| `VIEWER` | Chỉ xem | Dữ liệu được cấp, không mutation. |
| `CUSTOMER_A`, `CUSTOMER_B` | Khách hàng | Portal, đơn, công nợ, chat, ảnh xác nhận giao của chính mình. |
| `SUPPLIER_A`, `SUPPLIER_B` | Nhà cung cấp | Portal, PO, phản hồi, báo giao, công nợ, chat của chính mình. |

### 2.2 Fixture tối thiểu

| Nhóm | Dữ liệu cần có |
|---|---|
| Danh mục | Hai khách, hai NCC, hai kho, hai xe, hai tài xế, hai thợ, ít nhất ba vật tư có đơn vị/quy đổi. |
| Bán/mua | Đơn bán A/B, PO A/B, một đơn giao thẳng và một đơn qua kho. |
| Kho | Một vật tư đủ tồn, một vật tư sắp hết, một vật tư hết hàng, một vật tư có tồn sổ bằng 0. |
| Giao hàng | Hai chuyến không trùng xe/tài xế, một chuyến `assigned`, một chuyến `in_transit`. |
| Công nợ | Một phải thu mở, một phải trả mở, một thanh toán phân bổ một phần, một chứng từ đã đảo. |
| Nhân công | Một work order mở, một đã nhận, một output chờ duyệt, một compensation/payment draft. |
| File/chat | Ảnh giao, ảnh xác nhận, minh chứng chuyển khoản, file import XLSX UAT, một chat riêng mỗi party. |

## 3. Gate trước mỗi vòng test

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-CTL-001` | P0 | Có URL staging | Mở URL staging và production | Staging dùng HTTPS, khác hostname production, không dùng nhầm production. |
| `TC-CTL-002` | P0 | Có deployment staging | Ghi deployment ID/Git SHA vào biên bản | Toàn bộ case trong vòng test truy được về một deployment bất biến. |
| `TC-CTL-003` | P0 | Có binding Cloudflare | Kiểm ID D1/R2/Queue staging và production | Mọi binding staging khác production. Nếu trùng: BLOCKED. |
| `TC-CTL-004` | P1 | Có fixture | Đăng nhập lần lượt tất cả role fixture | Mỗi role vào đúng cổng, không có tài khoản nào dùng chung party/employee trái chủ đích. |
| `TC-CTL-005` | P1 | Có browser desktop/mobile | Mở tại 390, 768, 1024, 1440px | Không scroll ngang toàn trang; chữ chính >= 16px mobile; nút chính >= 48px. |
| `TC-CTL-006` | P1 | Có log sheet | Tạo record case, defect và evidence folder | Có nơi lưu ID case, fixture, ảnh/video, request/audit ID. |
| `TC-CTL-007` | P0 | Source checkout | Chạy typecheck, full unit suite, web build, mobile typecheck/Jest theo scripts repo | Tất cả PASS; bất kỳ FAIL nào chặn UAT phát hành. |
| `TC-CTL-008` | P1 | Staging configured | Chạy authenticated E2E và Cloudflare integration | Không skip vì thiếu credential/env; kết quả được đính kèm vào biên bản. |

## 4. Identity, session và phân quyền

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-IAM-001` | P0 | Owner active | Đăng nhập đúng username/password | Tạo session hợp lệ, vào dashboard Owner. |
| `TC-IAM-002` | P1 | Tài khoản hợp lệ | Nhập sai mật khẩu nhiều lần theo ngưỡng | Bị khóa tạm thời theo policy, message không tiết lộ account tồn tại hay không. |
| `TC-IAM-003` | P1 | Owner/Admin | Tạo lời mời role nội bộ qua `/admin` | Lời mời có audit; token chỉ hiện cho admin tại thời điểm tạo, không lưu plaintext trong data. |
| `TC-IAM-004` | P1 | User invited | Dùng invitation link để đặt mật khẩu | Lời mời dùng một lần; user active và đăng nhập được sau khi chấp nhận. |
| `TC-IAM-005` | P1 | Invitation used | Mở lại invitation link | Bị từ chối an toàn, không tạo thêm session. |
| `TC-IAM-006` | P0 | Customer A, Supplier A | Thử đăng nhập Customer tại cổng NCC và ngược lại | Bị chặn, không tạo session sai portal. |
| `TC-IAM-007` | P0 | User active | Đổi role/module access của user đang đăng nhập ở phiên khác | Phiên cũ bị vô hiệu; lần gọi sau yêu cầu đăng nhập lại. |
| `TC-IAM-008` | P1 | User active | Reset password từ admin | Password cũ không còn dùng được, tất cả phiên cũ bị logout, audit đầy đủ. |
| `TC-IAM-009` | P1 | Owner + worker account | Link tài khoản thợ tới employee active bằng UI | Liên kết chỉ một-một, tăng session version, retry idempotent, có audit trước/sau. |
| `TC-IAM-010` | P0 | Employee đã link user khác | Cố link worker/driver tới employee đó | Bị từ chối rõ ràng, không thay đổi mapping cũ. |
| `TC-IAM-011` | P1 | Customer active | Tạo managed customer account | Account gắn customer ID server-side, không gắn theo tên hiển thị trình duyệt. |
| `TC-IAM-012` | P1 | Supplier active | Tạo managed supplier account | Account gắn supplier ID server-side, chỉ một partner account theo policy. |
| `TC-IAM-013` | P1 | Worker active | Tạo managed worker account với password yếu hoặc confirm sai | Validation chặn trước service mutation, không tạo user. |
| `TC-IAM-014` | P0 | Driver/Worker/Customer/Supplier A+B | Thay entity ID trong URL/API từ A sang B | Trả 403/404; không lộ tên, tiền, attachment hoặc trạng thái B. |
| `TC-IAM-015` | P1 | User logged in | Logout web | Cookie/session bị xóa; route private redirect về login. |
| `TC-IAM-016` | P1 | Request mobile | Gọi mobile route thiếu Bearer | Trả 401 trước validation/service, không fallback sang cookie web. |
| `TC-IAM-017` | P1 | Bearer valid nhưng sai role | Gọi mobile bounded route | Trả 403, không lộ entity hoặc internal error. |
| `TC-IAM-018` | P1 | URL login with Vietnamese message | Login fail/recover flow | Tiếng Việt hiển thị đúng dấu, query encode/decode đúng một lần, không mojibake. |

## 5. Nền tảng command, audit, lỗi và concurrency

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-CORE-001` | P0 | Mutation hợp lệ | Gửi cùng idempotency key hai lần | Chỉ một mutation/audit/notification; lần sau trả replay hợp lệ. |
| `TC-CORE-002` | P0 | Idempotency key đã dùng | Dùng lại key với payload khác | Bị từ chối; không thực hiện mutation mới. |
| `TC-CORE-003` | P0 | Document version N | Lưu mutation từ hai tab cùng expected version | Một thành công; tab sau nhận 409/version conflict. |
| `TC-CORE-004` | P0 | Command gây lỗi giữa transaction | Giả lập validation/storage failure | Rollback hoàn toàn; không ledger/movement/audit/attachment mồ côi. |
| `TC-CORE-005` | P1 | Các mutation chính | Kiểm audit sau create/update/approve/reverse | Audit có actor, thời điểm, correlation/reference và thay đổi trạng thái phù hợp. |
| `TC-CORE-006` | P1 | Payload sai | Gửi quantity âm, field thiếu hoặc enum sai | Trả 400 với message dễ hiểu; không gọi nghiệp vụ. |
| `TC-CORE-007` | P1 | State sai | Thử action không đúng state machine | Trả 412 kèm trạng thái/hướng dẫn; không mutation. |
| `TC-CORE-008` | P1 | UI command | Double click nút post/approve | Nút pending rõ; backend vẫn chống trùng nếu browser gửi nhiều request. |
| `TC-CORE-009` | P1 | Action tải lâu | Refresh sau timeout rồi retry | Hiển thị kết quả thực tế hoặc safe retry; không ghi kép. |
| `TC-CORE-010` | P1 | Error route | Tạo error non-sensitive | UI có Thử lại/Về trang chính/mã đối chiếu; không stack trace/secret. |

## 6. Danh mục, đối tác, giá và điều khoản thương mại

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-CAT-001` | P1 | Sales/Owner permission | Tạo khách hàng mới | Không tạo ledger/công nợ lúc tạo master data; mã/tên theo rule. |
| `TC-CAT-002` | P1 | Tên có dấu/không dấu | Tạo customer/product trùng tên khác dấu | Bị chặn bằng so sánh tiếng Việt không dấu. |
| `TC-CAT-003` | P1 | Owner permission | Tạo NCC active/inactive | Chỉ partner active dùng được cho PO/account portal. |
| `TC-CAT-004` | P1 | Owner permission | Tạo xe trùng biển số | Bị chặn; không tạo bản ghi thứ hai. |
| `TC-CAT-005` | P1 | Product stock unit | Tạo đơn vị mua khác đơn vị tồn có quy đổi dương | Snapshot conversion đúng, quantity stock được chuẩn hóa. |
| `TC-CAT-006` | P1 | Product stock unit | Nhập conversion 0/âm/thiếu | Bị chặn trước khi tạo document. |
| `TC-CAT-007` | P1 | Product policy | Lưu lead time, margin target, public price, VAT | Giá/chính sách mới có hiệu lực cho draft mới; chứng từ cũ không đổi. |
| `TC-CAT-008` | P1 | Product commercial policy | Đổi giá bán/VAT/margin/lead time | Lưu lịch sử bất biến: cũ/mới/lý do/actor/time/version/audit. |
| `TC-CAT-009` | P0 | Role non-owner | Thử đổi giá dưới target margin | Bị chặn hoặc yêu cầu Owner + lý do; audit override bắt buộc. |
| `TC-CAT-010` | P1 | Posted receipt/direct delivery | Xem giá nhập gần nhất | Chỉ lấy posted/latest, có discount + freight allocated, bỏ draft/reversed. |
| `TC-CAT-011` | P1 | Product with landed cost | Xem giá bán đề xuất | Công thức margin đúng; chỉ là gợi ý, không tự update bảng giá. |
| `TC-CAT-012` | P0 | Customer/Supplier/Driver/Worker | Mở product/detail/API projection | Không thấy giá vốn, margin target, history giá hay tồn nội bộ trái quyền. |

## 7. Bán hàng và báo giá/đơn bán

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-SAL-001` | P1 | Sales/Owner | Tạo sales draft một dòng quantity > 0 | Draft có customer, unit, line snapshot; chưa doanh thu/công nợ/tồn. |
| `TC-SAL-002` | P1 | Sales/Owner | Tạo sales draft nhiều dòng | Một aggregate document với tất cả line hợp lệ; retry không tạo order khác. |
| `TC-SAL-003` | P1 | Sales draft | Nhập quantity 0/âm/unit không hợp lệ | Bị chặn; không tạo draft. |
| `TC-SAL-004` | P0 | Customer portal | Sửa giá/VAT/tổng tiền ở request browser | Server tự tính lại theo snapshot/policy; không tin giá client. |
| `TC-SAL-005` | P1 | Sales draft | Áp dụng discount % và discount tiền theo line | Discount normalized/snapshotted; total/VAT đúng. |
| `TC-SAL-006` | P1 | Sales draft | Thêm phí giao khách và VAT phí | Charge riêng, hiển thị trước confirm, không ảnh hưởng giá line sai. |
| `TC-SAL-007` | P1 | Customer/payment terms | Chọn transfer hoặc credit_requested | Payment method/address/terms snapshot vào order; chưa post debt ở draft. |
| `TC-SAL-008` | P0 | Customer vượt hạn mức | Owner/Sales xác nhận order credit | Server từ chối với business error rõ, không tạo receivable. |
| `TC-SAL-009` | P0 | Customer active + credit available | Xác nhận order credit | Một receivable đúng theo workflow, due date dựa giao thực tế/terms; audit. |
| `TC-SAL-010` | P1 | Confirmed order | Thay master price/terms | Sales order snapshot không thay đổi. |
| `TC-SAL-011` | P1 | Confirmed order | Allocate stock hoặc direct delivery | Allocation đúng line/source; direct delivery không tạo tồn kho cửa hàng. |
| `TC-SAL-012` | P1 | Allocated order | Giao một phần | Chỉ quantity thực giao được xử lý; phần còn lại mở cho chuyến sau. |
| `TC-SAL-013` | P0 | Posted sales/delivery | Thử sửa line/price đã post | Bị chặn; chỉ reversal/return theo workflow. |
| `TC-SAL-014` | P1 | Posted sales event | Reverse hợp lệ | Tạo entry/movement reversal append-only, giữ lịch sử nguyên bản. |
| `TC-SAL-015` | P1 | Customer portal | Tạo order rồi logout/login | Chỉ order party của customer hiện tại hiển thị. |

## 8. Mua hàng, nhận hàng và giao thẳng

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-PUR-001` | P1 | Procurement permission | Tạo PO draft nhiều dòng | Snapshot NCC, units, price, discount, freight, lead time, terms. |
| `TC-PUR-002` | P1 | PO direct delivery | Không chọn customer/destination | Bị chặn trước create/confirm. |
| `TC-PUR-003` | P1 | PO | Nhập discount mua %/tiền | Discount normalized vào snapshot, net/freight allocation đúng. |
| `TC-PUR-004` | P1 | PO with freight | Phân bổ cước mua theo net discounted value | Tổng allocation bằng freight, không làm tròn sai tổng. |
| `TC-PUR-005` | P1 | PO with product lead time | Xem ngày giao hứa | Theo lead time lớn nhất; product thiếu lead time yêu cầu xác nhận thủ công. |
| `TC-PUR-006` | P1 | Supplier A portal | Xem PO A | Chỉ thấy PO/lines/price agreed/location của A. |
| `TC-PUR-007` | P0 | Supplier A | Đổi PO ID sang B | Trả 403/404, không lộ PO B. |
| `TC-PUR-008` | P1 | Supplier A | Gửi phản hồi năng lực/ngày giao | Tạo acknowledgement chờ duyệt, version/audit/idempotency. |
| `TC-PUR-009` | P1 | Supplier A | Gửi delivery notice + evidence | Chỉ tạo yêu cầu chờ duyệt, không post inventory/payable. |
| `TC-PUR-010` | P0 | Warehouse/approval | Receive một phần PO | Inventory/payable đúng quantity/unit/cost; receipt không duplicate khi retry. |
| `TC-PUR-011` | P0 | Worker-created receipt | Chưa Owner/Accountant duyệt | Receipt không post inventory/payable trước approval. |
| `TC-PUR-012` | P1 | Accountant | Reject receipt | Không inventory/payable, có status/audit/reason. |
| `TC-PUR-013` | P1 | Posted receipt/direct delivery | Reverse | Reversal append-only, payable/inventory đúng theo nguồn; không edit chứng từ lịch sử. |

## 9. Kho, movements, cảnh báo và kiểm kê

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-INV-001` | P0 | Any inventory post | Kiểm sourceDocument, posting group, idempotency key | Mọi movement append-only, có nguồn và key. |
| `TC-INV-002` | P0 | Stock insufficient | Thử xuất/chuyển làm tồn âm | Bị chặn; không movement mới. |
| `TC-INV-003` | P1 | Warehouse scope A/B | Transfer giữa kho | Quantity cân đối nguồn/đích, chỉ scope kho được cấp quyền. |
| `TC-INV-004` | P1 | Warehouse role | Thử transfer kho ngoài scope | 403, không movement. |
| `TC-INV-005` | P1 | Direct delivery PO | Post direct delivery | Không tạo nhập/xuất tại kho cửa hàng. |
| `TC-INV-006` | P1 | Product thresholds | Tồn qua ngưỡng sắp hết | Dashboard cảnh báo đúng product-kho/số hiện tại/việc cần nhập. |
| `TC-INV-007` | P1 | Product zero stock | Tồn bằng 0 | Hiện Hết hàng; không cảnh báo trùng cùng ngày/chứng từ. |
| `TC-INV-008` | P1 | Posted receiving/reversal | Post rồi reverse | Cảnh báo tồn cập nhật theo movements sau cả hai bước. |
| `TC-INV-009` | P1 | Warehouse user | Tạo phiếu kiểm kê kho | Mã KK, snapshot tồn sổ/fingerprint/version/status, tự nạp vật tư phù hợp. |
| `TC-INV-010` | P1 | Count session | Bỏ qua một line hoặc thêm product book stock 0 | Được phép theo rule; audit trạng thái line. |
| `TC-INV-011` | P0 | Count line chênh lệch | Lưu count không reason/evidence | Bị chặn; reason và private proof bắt buộc. |
| `TC-INV-012` | P1 | Count session | Upload proof của actor khác | Bị chặn ownership; không attach file. |
| `TC-INV-013` | P1 | Warehouse | Gửi phiếu chờ duyệt | Status submitted, thủ kho không thấy/hay gọi được post action. |
| `TC-INV-014` | P0 | Submitted count | Tạo movement cho line trước duyệt | Line chuyển needs_recount; session không post tới khi recount. |
| `TC-INV-015` | P0 | Submitted valid count | Owner/Accountant duyệt và ghi kho | Một movement cho mỗi line chênh lệch, transaction/audit/idempotency, không update balance trực tiếp. |
| `TC-INV-016` | P1 | Count posted | Retry approve cùng key | Không movement/audit/notification trùng. |
| `TC-INV-017` | P1 | Count posted | Đảo phiếu | Movement ngược, không tồn âm, history giữ nguyên. |
| `TC-INV-018` | P0 | Driver/Worker/Customer/Supplier | Truy cập count/report/cost variance | Bị chặn và không lộ tồn/cost/ảnh kiểm kê. |

## 10. Giao hàng, ảnh xác nhận, GPS và tracking link

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-DEL-001` | P1 | Dispatcher | Tạo/gán chuyến valid | Không trùng lịch driver hoặc xe; đúng delivery/order source. |
| `TC-DEL-002` | P0 | Existing schedule overlap | Gán driver/xe trùng lịch | Bị chặn trước mutation. |
| `TC-DEL-003` | P1 | Assigned trip | Transition assigned -> loading -> in_transit | Chỉ transitions hợp lệ, status/audit rõ. |
| `TC-DEL-004` | P0 | Driver A assigned | Driver B mở/submit trip A | 403/404, không đọc/ghi trip A. |
| `TC-DEL-005` | P0 | Driver A | Cố gửi lineQuantities khác order | API/UI không có quyền sửa quantity. |
| `TC-DEL-006` | P1 | Driver A in transit | Báo chênh lệch với reason/evidence | Tạo request chờ duyệt, chưa post kho/receivable. |
| `TC-DEL-007` | P1 | Driver A | Submit photo delivery proof | Evidence private, idempotent retry không duplicate, chưa post financial result. |
| `TC-DEL-008` | P0 | Delivery proof pending | Driver hoàn tất giao | Không post issue/receivable cho tới khi approval theo workflow. |
| `TC-DEL-009` | P0 | Customer A own delivery | Customer gửi ảnh xác nhận | Chỉ trip của mình; file private; approval requirement satisfied. |
| `TC-DEL-010` | P1 | Customer proof absent | Owner attempt exception | Chỉ Owner override, reason/audit/cảnh báo bắt buộc. |
| `TC-DEL-011` | P0 | Approved completion | Approve hai lần hoặc hai người đồng thời | Một post duy nhất; bên sau replay/conflict rõ. |
| `TC-DEL-012` | P1 | Customer delivery A/B | Customer A xem tracking B | Không lộ B; portal chỉ location blurred/trail giới hạn của A. |
| `TC-DEL-013` | P1 | Dispatcher/Owner | Tạo public tracking link | Chỉ role được phép; không tự tạo khi driver bật GPS; audit tạo link. |
| `TC-DEL-014` | P1 | Public link | Mở sau 4 giờ, complete/cancel/revoke | Không tiết lộ tồn tại hoặc tracking sau revoke/expiry. |
| `TC-DEL-015` | P0 | Driver assigned/in_transit | Start GPS consent | Chỉ assigned driver và in_transit; consent versioned + audit. |
| `TC-DEL-016` | P1 | GPS active | Gửi duplicate clientPointId/stale/future/low accuracy/jump | Deduplicate/rate-limit/flag đúng; suspicious point không hiện cho khách. |
| `TC-DEL-017` | P1 | GPS active | Stop GPS, complete, cancel, logout, session expire | Tracking dừng, queue/consent bị xóa theo policy. |
| `TC-DEL-018` | P1 | Retention job staging | Dry-run/purge raw point >90 ngày | Raw point bị purge, audit summary được giữ; link expired revoke. |

## 11. Công nợ khách/NCC, quỹ và ngân hàng

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-FIN-001` | P0 | Confirmed sales credit | Kiểm receivable tạo từ event confirm/delivery theo workflow | Không lưu/sửa trực tiếp số dư; ledger/sub-ledger là nguồn tính số dư. |
| `TC-FIN-002` | P0 | Posted receipt | Thử sửa amount/reference trực tiếp | Bị chặn; sửa bằng reversal/adjustment có audit. |
| `TC-FIN-003` | P1 | Customer debt | Tính due date từ giao thực tế + terms snapshot | Due date đúng; đổi master terms không đổi debt lịch sử. |
| `TC-FIN-004` | P1 | Open debt nearing/overdue | Chạy notification due 7/3/1/overdue | Đúng mốc/deduplicate theo document-ngày; in-app mandatory, push chỉ bổ sung. |
| `TC-FIN-005` | P1 | Customer collection owner | Mở debt queue bằng collector A/B | Staff chỉ khách được giao; Owner/Accountant xem toàn bộ. |
| `TC-FIN-006` | P1 | Open payable | Tạo supplier payment một phần và allocate nhiều chứng từ | Tổng allocation đúng; không vượt open obligation; ledger/reconciliation đúng. |
| `TC-FIN-007` | P0 | Supplier payment A | Allocate vào payable supplier B | Bị chặn; không cross-party allocation. |
| `TC-FIN-008` | P1 | Allocation posted | Reverse allocation | Lịch sử reversal giữ lại, số active reconciliation cập nhật đúng. |
| `TC-FIN-009` | P1 | Cash/bank account | Tạo voucher thu/chi/transfer với review | Server kiểm balance/permission; UI hiển thị hậu quả trước confirm. |
| `TC-FIN-010` | P0 | Cash insufficient | Post voucher gây âm quỹ khi không override | Bị chặn, không ledger entry. |
| `TC-FIN-011` | P1 | QR transfer payment | Customer upload proof | Chỉ là yêu cầu đối soát, không tự post cash/debt allocation. |
| `TC-FIN-012` | P0 | Proof attachment | Worker/other party download financial proof | 403/404; Accountant/authorized owner mới đọc private file. |
| `TC-FIN-013` | P1 | Finance role | Reconcile internal bank statement | Chỉ tạo/review request theo policy, không auto ledger từ webhook chưa cấu hình. |
| `TC-FIN-014` | P1 | Closed period | Thử post/reverse trái policy khóa sổ | Bị chặn hoặc đòi Owner override/audit theo rule. |
| `TC-FIN-015` | P1 | Customer/Supplier portal | Mở debt statement | Chỉ công nợ của party hiện tại; không ledger bên khác hoặc internal cost. |

## 12. Nhân công, sản lượng, tạm ứng và thanh toán

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-WRK-001` | P0 | Work order open | Worker A/B claim đồng thời | Một người thắng; người sau nhận ORDER_ALREADY_CLAIMED/equivalent; audit success/failure. |
| `TC-WRK-002` | P1 | Work assigned | Retry claim cùng key | Không duplicate assignment/audit/payment basis. |
| `TC-WRK-003` | P0 | Worker not eligible | Claim work outside assignment/role/state | Bị chặn server-side. |
| `TC-WRK-004` | P1 | Worker assigned | Submit output quantity/photo | Tạo output chờ duyệt; chưa employee ledger/payment. |
| `TC-WRK-005` | P0 | Output confirmed/compensated | Sửa quantity output sau confirm | Bị chặn; phải reversal/new controlled adjustment. |
| `TC-WRK-006` | P0 | Same assignment/shift/batch | Submit duplicate output | Global dedupe chặn tính công trùng. |
| `TC-WRK-007` | P1 | Output pending | Supervisor/Owner approve/reject | Correct state/audit; reject không compensation ledger. |
| `TC-WRK-008` | P1 | Compensation split | Chia tiền cho nhiều thợ | Tổng split = total compensation, không negative/over-allocate. |
| `TC-WRK-009` | P1 | Compensation batch | Tạo employee payment draft | Gắn đúng work order/batch; retry không draft trùng. |
| `TC-WRK-010` | P1 | Employee advance | Tạo/approve/payment/reversal | Permission, ledger, idempotency và audit đúng; không sửa direct posted amount. |
| `TC-WRK-011` | P0 | Worker/Driver UI/API | Xem money/cost/stock/customer debt | Không có price, margin, stock, debt tổng hoặc data đối tác khác. |
| `TC-WRK-012` | P1 | Worker mobile offline | Mất mạng khi output draft | Chỉ local draft hợp lệ; không post financial mutation offline. |

## 13. Portal Khách/NCC, chat, thông báo và attachment

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-PRT-001` | P1 | Customer A | Mở catalog public | Chỉ public selling price/availability safe, không cost/margin/internal stock detail. |
| `TC-PRT-002` | P1 | Customer A | Giữ cart rồi bị yêu cầu login | Cart non-financial được giữ hợp lý; không lưu dữ liệu nhạy cảm lâu dài. |
| `TC-PRT-003` | P0 | Customer A/B | Mở orders/debt/messages/attachments bằng A rồi đổi ID B | Bị chặn toàn bộ object types. |
| `TC-PRT-004` | P1 | Customer A | Send payment proof | Private ownership, status chờ kế toán; retry không proof/audit duplicate. |
| `TC-PRT-005` | P1 | Supplier A | Gửi PO acknowledgement/delivery notice/evidence | Chỉ PO A, tạo pending request, không post inventory/payable. |
| `TC-PRT-006` | P0 | Supplier A/B | Truy cập PO/statement/attachment B | 403/404 safe, no data leakage. |
| `TC-PRT-007` | P1 | Partner + shop | Gửi chat message | Message thuộc đúng conversation/party/document context, audit nếu required. |
| `TC-PRT-008` | P1 | Chat open | Refresh trong khi vừa gửi message | Không mất message mới hoặc ghi đè bằng response cũ. |
| `TC-PRT-009` | P1 | Owner/Accountant | Mở side chat và presence | Hiện partner online theo policy; không lộ trạng thái/tên ngoài scope. |
| `TC-PRT-010` | P1 | Upload private attachment | Upload/download valid file | Metadata owner/source document đúng; URL private/no-store/no-referrer theo policy. |
| `TC-PRT-011` | P1 | Bad attachment ID | Direct download malformed/nonexistent ID | Trả 404 safe, không enumeration metadata. |
| `TC-PRT-012` | P1 | Web push configured/unconfigured | Bật/tắt notification | Toggle thật, unsubscribe khi logout; khi VAPID chưa valid hiện lý do rõ, không giả bật. |
| `TC-PRT-013` | P1 | Notification events | Trigger work/delivery update | Dedupe theo document/time bucket; payload không chứa tiền/công nợ/data nhạy cảm. |

## 14. Import, báo cáo, audit và export

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-IMP-001` | P1 | Authorized role | Upload valid XLSX <=40MB | Tạo dry-run/job, không post ledger/inventory/financial document. |
| `TC-IMP-002` | P1 | Invalid upload | Upload non-XLSX/oversize/corrupt file | Bị chặn rõ, không tạo command/batch. |
| `TC-IMP-003` | P1 | Same workbook | Dry-run lại cùng fingerprint | Idempotency/fingerprint chặn duplicate batch. |
| `TC-IMP-004` | P1 | Import issues | Review/resolve/ignore issue | Không silent ignore errors; audit đủ trạng thái/reason. |
| `TC-IMP-005` | P0 | Import UI/mobile | Thử bulk post khi workflow safe approve chưa có | Không có action hoặc action khóa giải thích rõ. |
| `TC-RPT-001` | P1 | Finance/inventory events | So dashboard/report với ledger/movement | Số liệu lấy read model ledger/movement, không từ số dư chỉnh tay. |
| `TC-RPT-002` | P1 | Role restrictions | Viewer/Worker/Customer/NCC mở report/export | Chỉ projection được phép; redaction giá vốn, margin, debt chéo. |
| `TC-RPT-003` | P1 | Audit event | Filter theo actor/document/time/correlation | Có kết quả đúng, detail không leak secret, integrity status hiển thị. |
| `TC-RPT-004` | P1 | Authorized export | Export CSV/HTML/ZIP | UTF-8 đúng dấu, chỉ dữ liệu trong scope, file download authenticated/private. |
| `TC-RPT-005` | P1 | Unauthorized request | Direct export URL/query trái scope | 403/404 và không stream partial file. |

## 15. Android native, PWA, offline và update

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-MOB-001` | P0 | Android build | Login tất cả role core | Điều hướng theo role, không WebView/Chrome/browser fallback. |
| `TC-MOB-002` | P1 | Internal/release build | Kiểm ERP URL | Chỉ HTTPS `https://app.hienxavlxd.com`; debug localhost/10.0.2.2 chỉ explicit dev config. |
| `TC-MOB-003` | P1 | Any role | Kiểm tabs/menu | Chỉ module được role và module grant cho phép; label tiếng Việt rõ. |
| `TC-MOB-004` | P1 | Management role | Tạo mutation sales/procurement/delivery/import | Có native form + review sheet + explicit confirm, server re-calculates. |
| `TC-MOB-005` | P0 | Driver/Worker | Mở delivery/work detail | Không price/cost/margin/stock/debt, không edit delivery quantity. |
| `TC-MOB-006` | P1 | Customer/Supplier | Mở portal native | Chỉ party-owned orders/PO/debt/chat/proofs. |
| `TC-MOB-007` | P1 | Native API | Send invalid JSON/missing bearer/wrong role | 400/401/403 đúng contract, body lỗi không parse HTML crash. |
| `TC-MOB-008` | P1 | Device offline | Read cache, non-financial draft, photo/GPS queue | Bounded queue/retry; financial post/approval/allocation/reversal không queue offline. |
| `TC-MOB-009` | P1 | Device 401 | Expire token/call API | Một cleanup: SecureStore session, push subscription, GPS session, queue, consent bị xóa. |
| `TC-MOB-010` | P1 | Android back/foreground | Back, pause/resume, rotate, foreground refresh | Không duplicate refresh, state/form hợp lý, không crash. |
| `TC-MOB-011` | P1 | Private file | Upload ảnh/XLSX và download/share file | Bearer/private adapter, temp file safe, không external public URL. |
| `TC-MOB-012` | P1 | Push | Enable/disable, failed unsubscribe, logout | State thật, retry rõ khi non-auth failure, auth failure cleanup. |
| `TC-MOB-013` | P1 | GPS route | Permission deny/allow/stop | Consent versioned; map only valid accepted points; stop cleanup on logout/complete/cancel. |
| `TC-MOB-014` | P1 | Accessibility | TalkBack, font scale, touch targets | Label đọc được, focus order hợp lý, button >=48px, essential text >=16px. |
| `TC-MOB-015` | P1 | Release policy | Kiểm version/upgrade message | Semantic version compare đúng; chỉ build unsupported bị bắt buộc update; release URL không leak secret. |

## 16. Cloudflare, security headers và vận hành release

| ID | Ưu tiên | Tiền điều kiện | Bước thực hiện | Kết quả mong đợi |
|---|---|---|---|---|
| `TC-CF-001` | P0 | Staging bindings | Chạy Cloudflare staging contract | Xác nhận D1 CAS, idempotency replay, R2 private round trip, Queue enqueue, reconciliation = 0. |
| `TC-CF-002` | P0 | Integration env | Đặt staging host/binding giống production | Harness fail closed trước bất kỳ mutation. |
| `TC-CF-003` | P1 | Private R2 object | Download as owner/other role | Owner authorized; role sai 403/404; không public URL. |
| `TC-CF-004` | P1 | Queue configured | Trigger async request | Queue chỉ tạo request chờ xử lý, không tự post kho/tiền/công nợ trái workflow. |
| `TC-CF-005` | P1 | Live/staging routes | Check `/`, `/login`, customer portal, supplier portal | HTTPS 200/expected redirect, no-store cho auth/private page. |
| `TC-CF-006` | P1 | Live routes | Check security headers | `X-Content-Type-Options`, frame protection, referrer policy, cache policy và HSTS theo production policy. |
| `TC-CF-007` | P1 | Worker version | Verify deployment 100% + current route binding | Deployment metadata ghi rõ version ID/time; release note/semantic app version phải truy được. |
| `TC-CF-008` | P1 | Error route | Force safe server error on staging | Không lộ stack/secret; correlation ID usable. |
| `TC-CF-009` | P1 | Retention cron | Run staging dry-run | GPS >90 ngày/expired links xử lý theo retention, audit purge có mặt. |
| `TC-CF-010` | P1 | Release candidate | Smoke production read-only sau deploy | Login/logout/read route/API missing bearer/header check; không mutation dữ liệu thật. |

## 17. Kịch bản end-to-end bắt buộc

| ID | Ưu tiên | Kịch bản | Expected result |
|---|---|---|---|
| `TC-E2E-001` | P0 | Customer A tạo đơn -> shop xác nhận -> cấp nguồn kho -> giao -> customer ảnh xác nhận -> Owner/Accountant duyệt -> kế toán thu/allocate | Snapshot giá giữ nguyên; kho/receivable/payment đúng một lần; audit và notification đủ; Customer B không thấy dữ liệu. |
| `TC-E2E-002` | P0 | Customer order -> PO Supplier A -> supplier acknowledgement -> partial receipt -> delivery -> payable -> supplier payment allocation | NCC không tự post; inventory/payable đúng sau approval; allocation không vượt số dư; Supplier B bị chặn. |
| `TC-E2E-003` | P0 | PO giao thẳng khách -> customer confirm -> accounting approval | Không tạo tồn kho cửa hàng; cost/payment obligations theo direct delivery source. |
| `TC-E2E-004` | P0 | Work order open -> Worker A/B concurrent claim -> output -> approve -> compensation -> employee payment -> reversal | Một claimant, không output/compensation trùng, payment/reversal audit đầy đủ. |
| `TC-E2E-005` | P0 | Inventory count -> count discrepancy proof -> stock changes -> recount -> approve -> reverse | Không post khi fingerprint thay đổi; post/reverse movements đúng, không tồn âm. |
| `TC-E2E-006` | P1 | Dispatcher creates trip -> Driver GPS -> customer tracking -> public link revoke -> retention dry-run | GPS consent/scope/privacy đúng, link không hoạt động sau revoke/expiry. |
| `TC-E2E-007` | P1 | Customer/Supplier/Worker A-B IDOR matrix over browser, API, attachment, export, chat, notification | Không lộ cross-party/employee data; 403/404 safe và audit không leak. |
| `TC-E2E-008` | P1 | Android login -> role navigation -> upload -> GPS deny/allow/stop -> push toggle -> logout -> offline retry | Native-only; cleanup đúng; no financial offline post; no sensitive push data. |

## 18. Tiêu chí kết thúc và báo cáo

Chỉ đề xuất `READY FOR RELEASE` khi toàn bộ mục sau PASS:

1. Không có P0/P1 mở.
2. Typecheck, full unit suite, web build, mobile typecheck và mobile Jest PASS.
3. Cloudflare staging contract PASS và reconciliation bằng `0`.
4. Authenticated E2E chạy đủ role A/B, không skip vì thiếu credential.
5. Toàn bộ case P0 và ít nhất 95% case P1 PASS; phần còn lại phải có quyết định rủi ro bằng văn bản.
6. Có evidence Android trên emulator và hai máy thật thuộc hai dải Android version.
7. Production chỉ chạy smoke read-only sau deploy thành công.

Mẫu defect bắt buộc:

```text
Mã lỗi: UAT-YYYYMMDD-###
Mức độ: P0 / P1 / P2 / P3
Test case: TC-...
Môi trường và deployment:
Vai trò/tài khoản fixture:
Dữ liệu/chứng từ liên quan:
Bước tái hiện:
Kết quả mong đợi:
Kết quả thực tế:
Ảnh hưởng: tiền / kho / công nợ / quyền / privacy / UX / mobile
Bằng chứng đã che dữ liệu nhạy cảm:
Tần suất tái hiện:
Regression test cần thêm:
```

Không được đóng `BLOCKED` thành `PASS` chỉ vì build hoặc anonymous route trả 200. Mọi lỗi P0/P1 phải có root cause, bản sửa, regression test và evidence chạy lại luồng liên quan.
