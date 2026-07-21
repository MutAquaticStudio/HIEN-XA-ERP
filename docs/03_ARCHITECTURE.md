# Recommended Architecture

## 1. Quyết định

Sử dụng hybrid modular monolith:

- Next.js frontend/PWA
- NestJS modular monolith backend, hoặc server modules được tổ chức tương đương trong giai đoạn bootstrap
- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- PostgreSQL transaction cho posting
- SQL views/materialized views cho reporting

## 2. Vì sao không Supabase client-centric

CRUD trực tiếp từ client nhanh nhưng không đủ an toàn cho:

- Posting kho
- Phân bổ thanh toán
- Reverse chứng từ
- Direct delivery
- Giá vốn
- Tiền công
- Audit và approval

Các nghiệp vụ này cần application service phía server.

## 3. Vì sao không microservices

- Người dùng dự kiến 20–50 đồng thời
- Nhiều transaction cần nhất quán giữa module
- Đội kỹ thuật nhỏ
- Chi phí quan sát, deploy và debug microservices không hợp lý

## 4. Module layout đề xuất

```text
apps/
  web/
  api/
packages/
  ui/
  config/
  domain-types/
  validation/
modules/
  identity/
  parties/
  catalog/
  sales/
  procurement/
  inventory/
  delivery/
  receivables/
  payables/
  cash/
  workforce/
  compensation/
  reporting/
  import/
  audit/
```

Nếu dùng monorepo, ưu tiên pnpm workspace hoặc Turborepo. Không bắt buộc nếu repo nhỏ.

## 5. Integration style

Trong monolith:

- Command đồng bộ qua application service
- Domain event nội bộ sau khi transaction commit
- Outbox chỉ thêm khi có background integration thực sự

Không cần broker trong MVP.

## 6. Reporting

- Transactional DB là nguồn sự thật
- Views cho danh sách và số dư hiện tại
- Materialized views cho báo cáo tháng nặng
- Dashboard không lưu số tổng độc lập

## 7. Offline

MVP:

- Cache nhiệm vụ gần đây
- Autosave draft
- Queue ảnh
- Đồng bộ khi online
- Không offline-post phiếu thu, phiếu chi, nhập kho, duyệt công

## 8. Deployment

- Web: Vercel
- API: Render/Fly.io/Railway hoặc nền tảng tương đương
- DB/Auth/Storage: Supabase
- Error monitoring: Sentry hoặc tương đương
- Structured logs: JSON logs có correlation ID
