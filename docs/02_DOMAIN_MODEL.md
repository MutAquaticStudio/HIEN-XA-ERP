# Domain Model

## 1. Bounded contexts

| Context | Sở hữu dữ liệu | Trách nhiệm |
|---|---|---|
| Identity | user, role, permission | Đăng nhập và quyền |
| Parties | customer, supplier, employee | Danh mục đối tượng |
| Catalog | product, unit, price, tax | Vật tư và quy tắc giá |
| Sales | sales order, return | Cam kết bán |
| Procurement | purchase order, destination | Cam kết mua |
| Inventory | movement, reservation, count | Tồn vật lý và giá vốn |
| Delivery | job, stop, confirmation | Thực thi giao nhận |
| Receivables | customer ledger, payment | Phải thu |
| Payables | supplier ledger, payment | Phải trả |
| Cash | cash account, voucher | Dòng tiền thực |
| Workforce | work order, output, assignment | Công việc và sản lượng |
| Compensation | rate, compensation, advance | Tiền công và nghĩa vụ nhân viên |
| Reporting | read models | Báo cáo, không ghi giao dịch |
| Import | import job, issue, mapping | Migration |
| Audit | logs, approval history | Truy vết |

## 2. Aggregate roots

### SalesOrder

Entities:

- SalesOrderItem
- PricingSnapshot
- DeliveryAddressSnapshot

Events:

- SalesOrderConfirmed
- SalesOrderCancelled
- SalesOrderQuantityChanged

### PurchaseOrder

Entities:

- PurchaseOrderItem
- PurchaseDestinationAllocation
- PurchasePricingSnapshot

Events:

- PurchaseOrderPlaced
- PurchaseDestinationAllocated
- PurchaseOrderClosed

### InventoryPosting

Entities:

- InventoryMovementLine

Events:

- InventoryReceived
- InventoryIssued
- InventoryTransferred
- InventoryAdjusted

### DeliveryJob

Entities:

- DeliveryStop
- DeliveryItem
- DeliveryAssignment
- DeliveryConfirmation

Events:

- DeliveryAssigned
- DeliveryStarted
- DeliveryPartiallyCompleted
- DeliveryCompleted
- DeliveryFailed

### CustomerPayment

Entities:

- CustomerPaymentAllocation

Events:

- CustomerPaymentConfirmed
- CustomerPaymentAllocated
- CustomerPaymentReversed

### WorkOrder

Entities:

- WorkOutput
- WorkParticipant
- WorkEvidence
- WorkApproval

Events:

- WorkAssigned
- WorkSubmitted
- WorkApproved
- WorkRejected

### CompensationBatch

Entities:

- CompensationLine
- CompensationParticipantShare

Events:

- CompensationCalculated
- CompensationApproved
- CompensationPosted

## 3. Value objects

- Money(amount, currency)
- Quantity(value, unit)
- DocumentUnitSnapshot(unitName, baseUnitName, conversionMode, factorToBase, quantity, unitAmount)
- Address
- PhoneNumber
- TaxRate
- DateRange
- DocumentNumber
- Percentage
- GeoPoint
- PricingSnapshot
- CostSnapshot
- WorkRateSnapshot

## 4. Domain services

- SourceAllocationService
- InventoryCostingService
- PaymentAllocationService
- DirectDeliveryPostingService
- WorkCompensationService
- DocumentReversalService
- ReconciliationService

## 5. Transaction boundaries

Các thao tác sau phải atomic:

- Post goods receipt + inventory movement + payable entry
- Confirm direct delivery + delivered quantity + receivable/payable + COGS
- Confirm customer payment + cash movement + ledger entry + allocations
- Reverse payment + reverse ledger/cash effects
- Approve work output + create compensation basis
- Post compensation batch + employee ledger entries
