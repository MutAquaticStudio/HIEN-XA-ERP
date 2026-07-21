# Roadmap and Backlog

## Product direction — Full ERP

Từ 2026-07-16, dự án đi theo hướng ERP vận hành hoàn chỉnh thay vì đóng phạm vi ở bản tối thiểu. Phase 1 vẫn triển khai theo lát cắt ưu tiên để giảm rủi ro, nhưng phạm vi quản trị phải bao phủ đầy đủ identity, parties, catalog, sales, procurement, inventory, delivery, receivables, payables, cash, workforce, compensation, reporting, import và audit.

Nguồn kiểm soát phạm vi trong code: `src/modules/operations/full-erp-scope.ts`.

## Phase 0 — Discovery and normalization

- Chốt thời điểm phát sinh phải thu/phải trả
- Chuẩn hóa customer, supplier, product, unit
- Kiểm kê tồn đầu kỳ
- Đối chiếu công nợ
- Chốt rule VAT
- Chốt compensation policy

## Phase 1 — Full ERP operating core

### Foundation

- Auth
- Roles and permissions
- Audit
- Document numbering
- Attachments
- Idempotency

### Master data

- Customers
- Suppliers
- Employees
- Products
- Units
- Warehouses
- Vehicles
- Work types/rates

### Sales and receivables

- Sales order
- Source allocation
- Delivery confirmation
- Customer payment
- Customer ledger

### Procurement and payables

- Purchase order
- Destination allocation
- Goods receipt
- Direct delivery
- Supplier payment
- Supplier ledger

### Inventory

- Inventory movements
- Reservations
- Stock view
- Moving average cost
- Count adjustment

### Workforce

- Work order
- Output
- Approval
- Compensation
- Employee advance/payment

### Migration/reporting

- Excel import
- Reconciliation
- Management dashboard
- Export Excel/PDF

## Phase 2 — Operational optimization

- Multi-stop dispatch
- Advanced vehicle costing
- Mobile offline draft
- Work team splitting
- Alerts
- Profitability reports
- Leave/attendance enhancements

## Phase 3 — Automation

- Bank reconciliation
- QR payment
- Zalo notifications
- E-invoice
- Routing optimization
- Forecasting

Machine-readable backlog hiện tại: `docs/data/full-erp-backlog.csv`.
Full ERP scope registry: `src/modules/operations/full-erp-scope.ts`.
