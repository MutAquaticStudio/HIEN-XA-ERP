# AGENTS.md — Chỉ dẫn bắt buộc cho Codex

## 1. Sứ mệnh dự án

Xây dựng web app vận hành cho cửa hàng vật liệu xây dựng tại Việt Nam, thay thế quy trình Excel hiện tại.

Đây không phải landing page, dashboard trình diễn hay CRUD generator. Đây là hệ thống nghiệp vụ có dữ liệu tài chính quan trọng, gồm:

- Bán hàng và giao hàng
- Mua hàng, nhập kho và giao thẳng khách
- Kho và giá vốn
- Công nợ khách hàng và nhà cung cấp
- Thu, chi và phân bổ thanh toán
- Công việc, sản lượng và tiền công
- Tạm ứng, thanh toán nhân viên
- Import và đối soát dữ liệu Excel

## 2. Thứ tự tài liệu phải đọc trước khi sửa code

1. `PROJECT_BRIEF.md`
2. `docs/00_CURRENT_STATE_AND_EXCEL_FINDINGS.md`
3. `docs/01_FUTURE_OPERATING_MODEL.md`
4. `docs/02_DOMAIN_MODEL.md`
5. `docs/03_ARCHITECTURE.md`
6. `docs/04_DATABASE_BLUEPRINT.md`
7. `docs/05_WORKFLOWS_AND_STATE_MACHINES.md`
8. `docs/06_BUSINESS_RULES_AND_INVARIANTS.md`
9. `docs/07_SECURITY_AND_AUTHORIZATION.md`
10. `docs/08_UX_FOR_MIDDLE_AGED_USERS.md`
11. `docs/09_MIGRATION_PLAN.md`
12. `docs/10_TEST_STRATEGY.md`
13. `docs/11_ROADMAP_AND_BACKLOG.md`
14. `docs/12_OPEN_QUESTIONS.md`
15. Các ADR trong thư mục `adr/`

Khi tài liệu mâu thuẫn, ưu tiên theo thứ tự:

1. `AGENTS.md`
2. ADR đã được đánh dấu Accepted
3. Business rules và invariants
4. Domain model
5. Database blueprint
6. Backlog hoặc UI notes

## 3. Những nguyên tắc không được vi phạm

### 3.1 Công nợ

- Không lưu công nợ như một ô số có thể sửa trực tiếp.
- Số dư phải được tính từ sub-ledger.
- Phiếu thu/chi đã xác nhận không được sửa số tiền trực tiếp.
- Sửa sai bằng reversal hoặc adjustment có audit trail.
- Một phiếu thu có thể phân bổ cho nhiều đơn.
- Một đơn có thể được thanh toán nhiều lần.
- Tổng phân bổ không được vượt số tiền phiếu.

### 3.2 Kho

- Tồn kho được hình thành từ inventory movements append-only.
- Không cho phép frontend sửa trực tiếp `stock_balance`.
- Hàng nhà cung cấp giao thẳng khách không tạo nhập/xuất kho tại kho cửa hàng.
- Mọi posting kho phải có `source_document` và `idempotency_key`.
- Chứng từ kho đã post chỉ được reverse, không update trực tiếp.

### 3.3 Giá và giá vốn

- Đơn bán/đơn mua phải lưu pricing snapshot.
- Thay đổi bảng giá không được làm thay đổi chứng từ lịch sử.
- Hàng trong kho dùng moving weighted average ở MVP.
- Hàng giao thẳng dùng giá mua thực tế và landed cost liên quan.

### 3.4 Nhân công

- Tiền công của thợ chủ yếu phát sinh từ sản lượng/nhiệm vụ đã duyệt.
- Attendance không mặc định tạo tiền công.
- Không được tính một output hai lần.
- Tổng tiền chia cho thành viên phải bằng tổng tiền công của phiếu.
- Bảng giá công mới không được sửa ngược phiếu đã duyệt.

### 3.5 Tài chính và audit

- Logic tài chính quan trọng phải chạy phía server trong database transaction.
- Không hard delete chứng từ đã xác nhận.
- Mọi thay đổi trạng thái, reversal, approval và override phải ghi audit.
- Dùng optimistic locking/version cho chứng từ có thể được nhiều người sửa.
- Mọi endpoint tạo/post chứng từ phải idempotent.

## 4. Kiến trúc mục tiêu

Kiến trúc mặc định:

- Frontend: Next.js + TypeScript
- Backend: modular monolith, ưu tiên NestJS khi tách service; có thể bắt đầu bằng server modules của Next.js nếu repo nhỏ
- Database/Auth/Storage: Supabase PostgreSQL, Supabase Auth, Supabase Storage
- Validation: Zod
- Form: React Hook Form
- Server state: TanStack Query khi phù hợp
- Mobile: responsive PWA
- Offline MVP: cached read + local draft + queued photos, không offline-post chứng từ tài chính

Không tự ý chuyển sang microservices, event sourcing, Kafka, Elasticsearch hay data warehouse nếu chưa có ADR mới được chấp nhận.

## 5. Ranh giới module

Các module logic:

- identity
- parties
- catalog
- sales
- procurement
- inventory
- delivery
- receivables
- payables
- cash
- workforce
- compensation
- reporting
- import
- audit

Không truy cập bảng module khác tùy ý. Dùng application service hoặc contract rõ ràng.

## 6. Quy tắc triển khai

Trước mỗi feature:

1. Xác định bounded context sở hữu dữ liệu.
2. Xác định aggregate và transaction boundary.
3. Liệt kê invariant bị ảnh hưởng.
4. Viết test domain rule trước hoặc đồng thời.
5. Thêm audit và authorization.
6. Kiểm tra trạng thái mobile và người dùng trung niên.
7. Kiểm tra idempotency nếu feature tạo chứng từ.

Mọi feature phải có:

- loading, empty, error, success state
- server-side authorization
- input validation
- audit event phù hợp
- test cho happy path và critical failure path
- nội dung UI tiếng Việt dễ hiểu

## 7. UX bắt buộc

- Font nội dung tối thiểu 16px trên mobile.
- Vùng bấm chính tối thiểu 48px.
- Không dùng icon đơn lẻ cho thao tác quan trọng.
- Trạng thái phải có chữ, không chỉ có màu.
- Form dài phải chia bước.
- Tìm kiếm hỗ trợ không dấu.
- Vai trò khác nhau không dùng cùng một dashboard.
- Thợ/tài xế chỉ thấy thông tin cần để hoàn thành việc.
- Người dùng luôn thấy số tiền, số lượng và hậu quả trước khi xác nhận.

## 8. Definition of Done

Một feature chỉ hoàn tất khi:

- Đúng domain rule và state machine
- Không phá invariant
- Có migration/schema hợp lệ
- Có authorization phía server
- Có audit
- Có test cần thiết
- Responsive và sử dụng được trên Android phổ thông
- Không gây tính trùng công nợ, tồn kho, doanh thu, chi phí hoặc tiền công
- Tài liệu liên quan được cập nhật

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
