# Workflows and State Machines

## 1. Sales order

`Draft → Confirmed → Partially Allocated/Ready to Deliver → Partially Delivered → Delivered → Completed`

- Draft có thể sửa/xóa.
- Confirmed khóa pricing snapshot.
- Dòng bán giữ snapshot đơn vị giao dịch và hệ số quy đổi; giao từng phần được nhập theo đơn vị chứng từ nhưng post kho theo đơn vị tồn kho gốc.
- Delivered làm phát sinh phải thu theo chính sách MVP.
- Completed không đồng nghĩa Paid.
- Đơn bán nháp có thể đính kèm tối đa 3 ảnh chứng từ; ảnh được lưu ngoài state dưới dạng attachment private, đơn chỉ giữ metadata và SHA-256.
- Sau khi đã giao, không cancel; dùng return/adjustment.

## 2. Purchase order

`Draft → Ordered → Partially Received → Fully Received`

- Một item có nhiều destination allocation.
- Receipt vào kho tạo inventory movement.
- Direct delivery không tạo movement kho cửa hàng.
- Nhận kho và giao thẳng hỗ trợ nhiều lần, mỗi lần có posting riêng.
- Đơn mua chỉ cho chọn đơn vị đã được cấu hình cho đúng vật tư. Đơn vị cố định khóa snapshot `1 đơn vị mua = n đơn vị tồn kho`; đơn vị biến đổi như `Xe` nhập tổng số lượng tồn kho thực nhận trên từng dòng và khóa hệ số hiệu lực của chính dòng đó.
- Chủ cửa hàng hoặc kho có thể thêm/xóa đơn vị và cập nhật quy đổi. Không xóa được đơn vị đang là đơn vị tồn kho gốc; xóa cấu hình không sửa chứng từ lịch sử.
- Giao thẳng đã ghi chỉ được sửa sai bằng `reverseDirectDelivery`, không sửa số lượng đã post.
- Khi tạo đơn mua giao thẳng, người có cả quyền mua và bán có thể tạo kèm đơn bán nháp trong cùng transaction. Giá mua và giá bán được chụp riêng, hai dòng liên kết hai chiều, chưa phát sinh kho hoặc công nợ cho tới khi xác nhận giao thẳng.
- Completed không đồng nghĩa Paid.
- Đơn mua nháp có thể đính kèm tối đa 3 ảnh chứng từ; ảnh không bắt buộc để tạo nháp nhưng phải qua kiểm tra định dạng, dung lượng và quyền sở hữu ở server.

## 3. Delivery job

- Worker phai chup/dinh kem it nhat mot anh JPG, PNG hoac WEBP khi xac nhan da giao. Anh nam tren ApprovalRequest pending; chua co posting kho hay phai thu truoc khi Owner/Accountant duyet.
- Worker tu nhan don: nguoi nhan hop le dau tien duoc khoa WorkOrder va tu dong tro thanh tho cua DeliveryJob. Neu chuyen da bat dau boc/giao thi khong duoc nhan muon.

`Assigned → Loading → In Transit → Delivered`

Nhánh lỗi:

`Assigned/Loading/In Transit → Failed → Reassigned/Cancelled`

Delivered yêu cầu:

- Đơn bán đã phân bổ nguồn.
- Chuyến giao đã `In Transit`.
- Số lượng thực giao
- Người nhận hoặc lý do không nhận
- Evidence phù hợp
- Nếu người gửi là `Worker`, thao tác chuyển sang `ApprovalRequest pending`; chưa được xuất kho hoặc ghi phải thu.
- Chỉ `Owner` hoặc `Accountant` được approve/reject yêu cầu; approve mới xử lý xuất kho và phải thu trong cùng transaction.
- Reject bắt buộc lý do, giữ chuyến ở `In Transit` để xử lý lại.
- Phát sinh xuất kho và phải thu sau approve được xử lý trong cùng transaction.
- Failed không tạo xuất kho, không tạo công nợ.
- Một tài xế hoặc xe không có hai chuyến `Assigned/Loading/In Transit` cùng ngày.

## 4. Inventory movement

`Posted -> Reversed`

- Reversal tạo movement `reverse` ngược chiều với posting key `reverse-{movementId}`.
- Receipt reversal giảm received quantity và tạo supplier ledger debit tương ứng.
- Issue reversal giảm delivered quantity và tạo customer ledger credit tương ứng.
- Không cho đảo nếu làm âm tồn kho hoặc nếu công nợ nguồn đã được phân bổ/thanh toán chưa đảo.

## 5. Customer payment

`Draft -> Confirmed -> Partially Allocated/Allocated -> Reversed`

- Confirmed tạo cash transaction và ledger credit.
- Allocation có thể thực hiện ngay hoặc sau.
- Reversal tạo bút toán đảo, không sửa bản gốc.
- Phiếu thu đã reversed không còn được tính vào phân bổ active; allocations cũ chỉ giữ lịch sử.

## 6. Supplier payment

`Draft -> Confirmed -> Partially Allocated/Allocated -> Reversed`

- Confirmed tạo cash out và supplier ledger debit.
- Allocation khớp một phiếu chi với một hoặc nhiều nghĩa vụ phải trả; có thể thực hiện nhiều lần.
- Tổng allocation active không vượt số tiền phiếu chi hoặc số còn mở của nghĩa vụ.
- Reversed tạo cash in và supplier ledger credit với `REV-{documentNo}`.
- Allocation của phiếu đã reversed chỉ còn giá trị lịch sử và không làm giảm nghĩa vụ đang mở.
- Không sửa/xóa phiếu chi đã confirmed.

## 7. Employee payment

`Draft -> Confirmed -> Reversed`

- Confirmed tạo cash out và employee ledger debit.
- Reversed tạo cash in và employee ledger credit với `REV-{documentNo}`.
- Reversal không sửa bảng công đã posted.

## 8. Employee advance

`Draft -> Confirmed -> Reversed`

- Confirmed tạo cash out và employee ledger debit loại `advance`.
- Tạm ứng được khấu trừ khi tính số công còn phải trả.
- Reversed tạo cash in và employee ledger credit, bắt buộc có lý do.

## 9. Work order

`Draft → Assigned → Accepted → In Progress → Submitted → Awaiting Approval → Approved → Compensated → Paid`

Với đơn bán đã xác nhận cần thợ nhận trước, hệ thống tạo work order `Open`. Tài khoản `Worker` nhìn thấy thông báo trong ứng dụng và chuyển `Open → Assigned` bằng lệnh nhận đơn. Transaction khóa work order cho người nhận hợp lệ đầu tiên, ghi audit và idempotency key; thao tác nhận đơn không phát sinh output, tiền công, kho hoặc công nợ.

Nhánh:

`Submitted → Rejected → In Progress/Cancelled`

- Approved khóa output.
- Compensated khóa rate snapshot và tiền chia.
- Paid phải liên kết payment/settlement.

## 10. Goods receipt transaction

Trong một database transaction:

1. Validate purchase order và remaining quantity.
2. Nếu người gửi là `Worker`, kiểm tra và lưu ít nhất một ảnh JPG/PNG/WEBP, tạo `ApprovalRequest pending`, không tạo posting.
3. `Owner` hoặc `Accountant` xem ảnh qua private attachment route, approve trong transaction và mới tạo goods receipt/posting.
4. Tạo inventory movements nếu destination là kho mình.
5. Cập nhật received quantity.
6. Cập nhật moving average cost.
7. Tạo supplier payable entry theo policy.
8. Ghi audit cho submit, approve hoặc reject và domain event; metadata ảnh giữ SHA-256, không nhúng binary vào state nghiệp vụ.

## 11. Direct delivery transaction

Trong một database transaction:

1. Validate purchase-sales linkage.
2. Xác nhận quantity thực giao.
3. Không tạo kho movement tại warehouse.
4. Cập nhật purchased/delivered quantity.
5. Ghi payable supplier.
6. Ghi receivable customer.
7. Ghi actual direct cost/COGS.
8. Ghi audit và event.

Nhánh đảo chạy trong một transaction:

1. Chọn posting group giao thẳng gần nhất chưa đảo.
2. Chặn nếu phải thu đã phân bổ hoặc phải trả đã thanh toán.
3. Giảm received/delivered quantity.
4. Ghi customer credit và supplier debit cùng posting group.
5. Không tạo inventory movement.

## 12. Import issue

`Open -> Resolved/Ignored`

- `Resolved` dùng cho cả warning và error sau khi người dùng xử lý dữ liệu nguồn.
- `Ignored` chỉ dùng cho warning; error import bắt buộc phải xử lý.
- Mọi thao tác import issue ghi audit role, permission và target id.
- Mỗi issue từ workbook liên kết `importJobId`; batch chỉ chuyển `Reviewed` khi không còn issue mở.
