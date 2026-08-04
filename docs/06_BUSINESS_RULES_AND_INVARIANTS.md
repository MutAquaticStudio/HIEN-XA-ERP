# Business Rules and Invariants

## Kiểm kê theo kho

- Chênh lệch kiểm kê không được sửa số tồn trực tiếp; chỉ tạo phát sinh kho chỉ ghi thêm khi phiếu đã duyệt.
- Mỗi dòng chênh lệch phải có lý do và ít nhất một ảnh hoặc biên bản riêng tư.
- Phiếu kiểm kê phải so sánh dấu vết phát sinh kho trước khi duyệt. Có thay đổi thì yêu cầu kiểm lại, không được ghi một phần.
- Phiếu đã ghi kho chỉ được đảo bằng toàn bộ phiếu; không đảo riêng từng phát sinh thuộc phiếu.

## Công nợ

- Tổng payment allocations của phiếu thu hoặc phiếu chi không vượt payment amount.
- Không phân bổ số âm.
- Không phân bổ vào nghĩa vụ sai đối tượng, sai chiều sổ hoặc bị reversed/cancelled.
- Tổng allocation active trên một nghĩa vụ không vượt giá trị gốc của nghĩa vụ.
- Allocation của phiếu thu/chi đã reversed không được tính là allocation active khi phân bổ phiếu mới.
- `confirmed` chưa có allocation, `partially_allocated` có allocation nhỏ hơn payment amount, `allocated` phải khớp đủ payment amount.
- Ledger entry đã post không update/delete.
- Số dư là tổng debit trừ credit, không phải field nhập tay.
- Tiền khách trả dư được giữ là unallocated credit.

## Kho

- Mọi movement có source type, source id và posting key.
- Posting key duy nhất ngăn post trùng.
- Direct delivery không tạo movement tại kho cửa hàng.
- Transfer tạo một xuất và một nhập liên kết.
- Không xuất vượt available stock nếu không có approved override.
- Posted movement chỉ reverse.
- Reverse movement phải link hai chiều với movement gốc và có quantity ngược chiều chính xác.
- Mỗi receipt/issue kho dùng cùng `posting_group_id` với bút toán phải trả/phải thu nguồn để đối soát chính xác từng lần ghi nhận.
- Không đảo receipt nếu làm âm tồn hoặc nếu chính payable nguồn đã có phân bổ phiếu chi active; không dùng số dư tổng nhà cung cấp để suy đoán.
- Không đảo issue nếu chính receivable nguồn đã được phân bổ phiếu thu active.
- Stock balance là read model.
- Moving average = tổng giá trị có dấu của toàn bộ movement / số lượng tồn hiện tại; lần xuất trước phải được trừ khỏi cả lượng và giá trị trước lần nhập sau.

## Sales/Procurement

- Quantity > 0.
- Unit phải hợp lệ cho product.
- Đơn vị giao dịch khác đơn vị tồn kho phải dùng cách tính `fixed` hoặc `variable` và được lưu snapshot trên dòng chứng từ.
- Cấu hình đơn vị mua là duy nhất theo vật tư/đơn vị, có version và phải được kiểm tra lại phía server khi tạo đơn mua.
- Đơn vị `fixed` bắt buộc có hệ số dương. Đơn vị `variable` không được có hệ số cấu hình và bắt buộc nhập tổng số lượng tồn kho thực nhận dương trên dòng mua.
- Không được xóa đơn vị đang là đơn vị tồn kho gốc. Xóa đơn vị mua có thể dọn quy đổi hiện tại nhưng không được thay đổi snapshot chứng từ cũ.
- Với `fixed`, số lượng tồn kho = số lượng chứng từ × hệ số cấu hình. Với `variable`, hệ số hiệu lực = tổng số lượng tồn kho thực nhận / số lượng chứng từ. Cả hai đều phải đối soát tổng giá trị giữa đơn vị chứng từ và đơn vị tồn kho.
- Nhận/giao từng phần có thể nhập theo đơn vị chứng từ nhưng movement và ledger quantity luôn dùng đơn vị tồn kho gốc.
- Pricing snapshot bắt buộc khi confirm.
- Delivered quantity không vượt confirmed quantity nếu không có override.
- Received quantity không vượt ordered quantity nếu không có override.
- Tổng destination allocation bằng ordered quantity.
- Không giảm quantity dưới mức đã giao/nhận.

## Giá vốn

- Moving average chỉ thay đổi bởi receipt/adjustment hợp lệ.
- Direct delivery dùng actual purchase cost.
- Giá vốn kỳ gồm issue kho theo moving average và direct delivery theo giá mua thực tế; reversal trừ ngược đúng posting group.
- Landed cost không được phân bổ hai lần.
- Cost snapshot của giao dịch lịch sử không thay đổi theo bảng giá mới.

## Nhân công

- Work order `Open` từ đơn bán phải liên kết đúng một sales order, không có participant/output; khi đã nhận phải có đúng một worker active, thời điểm nhận và version tăng.
- Worker chỉ thấy thông báo work order mở và work order của chính mình; giá bán, giá vốn và công nợ không nằm trong projection cho worker.
- Work output đã compensated không được dùng lại.
- Compensated output không vượt approved output.
- Tổng share của thành viên bằng total compensation.
- Rate snapshot được khóa khi compensation post.
- Attendance và piece-rate không tự động cộng chồng; phải có compensation policy rõ.
- Hoàn thành delivery không mặc định kết thúc attendance shift.

## Giao hàng

- Worker chi duoc gui xac nhan cho chuyen duoc phan cong va phai co it nhat mot anh giao hang. Approval delivery khong hop le neu thieu metadata anh.
- WorkOrder da duoc thợ nhan va DeliveryJob cung don ban phai co cung worker trong helperIds.

- Chuyến giao phải đi qua `assigned -> loading -> in_transit` trước khi được hoàn tất từ kho.
- `failed` không được tạo inventory movement, cash transaction hoặc receivable entry.
- Hoàn tất giao từ kho luôn kiểm tra tồn khả dụng và chỉ ghi append-only movement/ledger.
- Một tài xế hoặc xe không được có hai chuyến active cùng ngày.
- Chuyến delivered bắt buộc có người nhận, evidence và thời điểm xác nhận; failed bắt buộc có lý do.
- Giao thẳng chỉ đảo khi phải thu chưa phân bổ và phải trả liên quan chưa được chi.

## Sổ quỹ

- Cash balance là tổng giao dịch quỹ `in - out`, không phải field nhập tay.
- Phiếu thu/chi đã xác nhận chỉ đảo bằng cash transaction ngược chiều và ledger entry liên quan.
- Mọi cash out kiểm tra số dư quỹ trong transaction; trạng thái sau lệnh không được làm quỹ âm.
- Trạng thái payment/voucher/advance phải khớp đúng một cặp cash transaction và sub-ledger posting; reversed phải có đúng một cặp bút toán ngược.
- Tạm ứng nhân viên ghi employee debit loại `advance`, không được báo cáo nhầm thành thanh toán công hoặc tiền công mới.

## Import

- Error import không được bỏ qua.
- Warning import có thể chuyển `ignored` nhưng phải ghi audit.
- Vấn đề import đã `resolved` hoặc `ignored` không được xử lý lại bằng cùng command.
- Workbook fingerprint không được tạo batch trùng; batch `reviewed` không được còn issue mở.

## Audit và quyền

- Mọi override cần reason.
- Mọi reversal cần liên kết chứng từ gốc.
- Reversal phiếu thu/chi tạo cash transaction và sub-ledger entry ngược chiều, không sửa số tiền chứng từ gốc.
- Reversal phát sinh kho tạo movement ngược chiều và bút toán công nợ liên quan trong cùng transaction.
- Mọi approval lưu người, thời gian và trạng thái trước/sau.
- Audit log của command phải lưu actor role, permission và target id nếu có.
- Mỗi command đã xử lý phải có đúng một audit event cùng correlation/idempotency key; command và summary phải khớp.
- Khoảng trống audit lịch sử được giữ nguyên như finding để đối soát, không được dùng để khóa các giao dịch mới hợp lệ.
- Transaction mới không được làm tăng số lỗi audit; mọi lỗi audit phát sinh mới phải rollback cùng transaction.
- Audit reversal bắt buộc có target và lý do tối thiểu 5 ký tự; log đã ghi là append-only.
- Tài xế/thợ không xem giá vốn hoặc lợi nhuận.
- Client không được gọi trực tiếp mutation tài chính quan trọng.
- Production không tin role do client gửi; phải có actor server-side hoặc khóa vai trò bằng cấu hình server và mặc định fail-closed.

## Chống trùng

- Mọi create/post endpoint nhận idempotency key.
- External/import source row có unique source fingerprint.
- Upload lại cùng một import file không được tạo trùng chứng từ.
