# Future-State Operating Model

## 1. Năm luồng lõi

### 1.1 Bán hàng

`Đơn bán → xác định nguồn hàng → giao hàng → ghi nhận phải thu → thu tiền → hoàn tất`

### 1.2 Mua hàng

`Đơn mua → phân bổ điểm nhận → nhập kho hoặc giao thẳng → ghi nhận phải trả → thanh toán`

### 1.3 Kho

`Chứng từ nguồn → inventory movement → cập nhật read model tồn kho`

### 1.4 Nhân công

`Phiếu công việc → sản lượng thực tế → duyệt → tính/chia công → employee ledger → thanh toán`

### 1.5 Dịch vụ

`Yêu cầu dịch vụ → phân công xe/người → hoàn thành → doanh thu dịch vụ + chi phí xe + tiền công → lợi nhuận`

## 2. Chứng từ nguồn

### Sales

- Quotation
- Sales Order
- Delivery Confirmation
- Sales Return
- Customer Payment
- Receivable Adjustment

### Procurement

- Purchase Order
- Goods Receipt
- Direct Delivery Confirmation
- Purchase Return
- Supplier Payment
- Payable Adjustment

### Inventory

- Opening Movement
- Receipt Movement
- Issue Movement
- Transfer
- Count Adjustment
- Return Movement

### Workforce

- Work Order
- Work Output
- Work Approval
- Compensation Batch
- Employee Advance
- Employee Payment

## 3. Điểm kiểm soát

- Không post chứng từ khi thiếu đối tượng, đơn vị hoặc số lượng hợp lệ.
- Không để một dòng mua vừa nhập kho vừa giao thẳng nếu chưa có allocation chi tiết.
- Không phát sinh công nợ từ chứng từ nháp.
- Không post kho hoặc thanh toán trùng.
- Không tự động lấy toàn bộ số lượng giao làm sản lượng tính công.
- Không tính công trước khi sản lượng được duyệt.
- Không sửa trực tiếp chứng từ đã post.

## 4. Thời điểm ghi nhận đề xuất cho MVP

- Phải thu khách hàng: khi giao hàng được xác nhận
- Phải trả nhà cung cấp: khi hàng được nhận hoặc direct delivery được xác nhận
- Giá vốn hàng kho: khi xuất kho
- Giá vốn direct delivery: khi direct delivery được xác nhận
- Tiền công: khi work output được duyệt và compensation được chốt
- Dòng tiền: khi phiếu thu/chi được confirm

Các mốc này cần được chủ doanh nghiệp xác nhận trước migration cuối.
