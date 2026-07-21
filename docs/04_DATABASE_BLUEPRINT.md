# Database Blueprint

## 1. Quy tắc chung

Mỗi bảng giao dịch nên có:

- `id uuid primary key`
- `document_no text unique`
- `status`
- `version integer`
- `created_at`, `created_by`
- `updated_at`, `updated_by`
- `posted_at`, `posted_by` khi có posting
- `reversed_by_id` khi bị đảo
- Không hard delete chứng từ post

## 2. Nhóm bảng

### Parties

- customers
- customer_addresses
- customer_contacts
- suppliers
- supplier_addresses
- employees
- employee_teams

### Catalog

- products
- product_categories
- units
- product_units
- price_lists
- price_rules
- work_types
- work_rate_rules

`units` là danh mục do cửa hàng tự quản lý. `product_units` giữ đơn vị tồn kho gốc và cách tính đơn vị mua theo từng vật tư. `conversion_mode = fixed` yêu cầu hệ số dương; `conversion_mode = variable` để hệ số cấu hình là `null` và yêu cầu nhập số lượng tồn kho thực tế trên từng dòng mua. Thay đổi cấu hình dùng `version` để khóa lạc quan, còn chứng từ đã tạo giữ snapshot độc lập.

### Sales

- sales_orders
- sales_order_items
- sales_order_source_allocations
- sales_returns
- sales_return_items

### Procurement

- purchase_orders
- purchase_order_items
- purchase_destination_allocations
- purchase_returns
- purchase_return_items

### Inventory

- warehouses
- inventory_postings
- inventory_movement_lines
- stock_reservations
- stock_counts
- stock_count_lines
- inventory_cost_states

### Delivery

- vehicles
- delivery_jobs
- delivery_stops
- delivery_items
- delivery_assignments
- delivery_confirmations

### Receivables/Payables

- customer_ledger_entries
- customer_payments
- customer_payment_allocations
- supplier_ledger_entries
- supplier_payments
- supplier_payment_allocations
- debt_adjustments

### Cash

- cash_accounts
- cash_transactions
- receipt_vouchers
- payment_vouchers

### Workforce/Compensation

- work_orders
- work_order_items
- work_outputs
- work_participants
- work_approvals
- compensation_batches
- compensation_lines
- employee_ledger_entries
- employee_advances
- employee_payments

### Platform

- attachments
- audit_logs
- status_history
- approval_history
- idempotency_keys
- import_jobs
- import_rows
- import_issues

## 3. Index quan trọng

- customers(normalized_name)
- customers(phone)
- product_units(product_id, unit_id) unique
- sales_orders(customer_id, order_date)
- purchase_orders(supplier_id, order_date)
- inventory_movement_lines(warehouse_id, product_unit_id, posted_at)
- customer_ledger_entries(customer_id, posting_date)
- supplier_ledger_entries(supplier_id, posting_date)
- work_orders(work_date, status)
- delivery_jobs(planned_date, status)
- audit_logs(entity_type, entity_id, created_at)

Dùng extension `unaccent` và trigram index cho tìm kiếm tiếng Việt không dấu/gần đúng.

## 4. Read models

- customer_balance_view
- supplier_balance_view
- stock_balance_view
- available_stock_view
- order_fulfillment_view
- employee_balance_view
- daily_operations_dashboard_view

Các view chỉ đọc, không update trực tiếp.

## 5. Concurrency

- `version` cho optimistic locking
- Row lock khi allocation/posting có thể cạnh tranh
- Unique idempotency constraint cho mọi posting endpoint
- Không dùng “last write wins” cho chứng từ tài chính
