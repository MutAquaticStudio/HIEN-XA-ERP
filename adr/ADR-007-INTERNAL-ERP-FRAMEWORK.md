# ADR-007: Internal ERP Framework Layer

- Status: Accepted

## Decision

Xây dựng một lớp ERP framework nội bộ trên nền Next.js modular monolith thay vì chuyển toàn bộ sang Odoo hoặc một ERP framework ngoài ở thời điểm MVP.

## Rationale

Dự án cần các primitive giống ERP:

- Module registry
- Menu/action metadata
- Command registry
- Permission mapping
- Workflow/state-machine metadata
- Read model declaration
- Audit and idempotency contract
- Bounded-context ownership

Các primitive này đủ để chuẩn hóa cách phát triển module mà vẫn giữ quyền kiểm soát các rule đặc thù của cửa hàng vật liệu xây dựng:

- Giao thẳng nhà cung cấp đến khách không tạo movement kho cửa hàng.
- Công nợ được tính từ sub-ledger append-only.
- Phiếu thu/chi và posting kho phải idempotent.
- Tiền công phát sinh từ sản lượng đã duyệt, không tự cộng attendance.

## Consequences

- Mỗi module nghiệp vụ phải đăng ký metadata trong ERP registry trước khi command được backend chạy.
- UI navigation, workflow panel và owner permission set được sinh từ registry.
- Command chưa đăng ký bị backend command service từ chối.
- Registry chưa thay thế domain service; domain invariant vẫn phải nằm trong service và database transaction.
- Nếu sau này tích hợp Odoo hoặc ERP ngoài, registry nội bộ đóng vai trò anti-corruption layer và mapping contract.
