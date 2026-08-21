# Cutover PostgreSQL chuẩn hóa: cổng sẵn sàng

Tài liệu này là cổng kiểm soát cho việc chuyển một chiều từ runtime document
CAS sang PostgreSQL chuẩn hóa. Nó không tự chạy migration, không chuyển traffic
và không được dùng để coi production đã sẵn sàng.

## Quy tắc bắt buộc

- Runtime document vẫn là nguồn dữ liệu duy nhất cho đến khi một cutover run
  được kích hoạt hợp lệ.
- Không dual-write. Repository PostgreSQL phải xử lý toàn bộ mutation trước khi
  traffic được chuyển.
- Chỉ dùng Supabase staging cô lập cho rehearsal và integration test.
- Không đưa khóa, URL service role, snapshot chứa dữ liệu nhạy cảm hoặc output
  backup vào source control, log ứng dụng hay ticket.
- `production_active` chỉ được ghi theo runbook sau backup, reconciliation và
  rollback đã có evidence.

## Hợp đồng evidence

`src/server/infrastructure/operations-cutover-readiness.ts` đánh giá evidence
thuần dữ liệu, fail-closed với mã blocker cụ thể. Một evidence phải bao phủ:

1. Snapshot nguồn: namespace, revision, SHA-256 checksum, schema version.
2. Từng boundary: identity, master data, sales, procurement, inventory,
   delivery, receivables, payables, cash, workforce, compensation, attachment,
   approval, chat, push, GPS, import, audit và idempotency.
3. Repository PostgreSQL transaction, authorization/RLS và integration test cho
   từng boundary.
4. Control plane: schema, RLS/RPC, Storage private, rehearsal migration,
   reconciliation, backup, rollback, maintenance window, live-route, E2E/UAT
   và deep security scan.

`staging_rehearsal` yêu cầu toàn bộ evidence kỹ thuật. `production_activation`
yêu cầu thêm toàn bộ evidence vận hành; thiếu một điều kiện đều trả blocker.

## Kiểm thử staging

Contract test `tests/integration/normalized-cutover-control-plane.contract.test.ts`
không ghi dữ liệu. Nó xác nhận ba bảng control plane, RLS/private grants và hai
trigger fail-closed. Chỉ chạy trên staging đã xác nhận bằng các biến hiện có:

```powershell
$env:ERP_RUN_INTEGRATION_TESTS = "1"
$env:ERP_TEST_DATABASE_CONFIRMATION = "hien-xa-staging"
$env:ERP_TEST_DATABASE_URL = "postgresql://..."
$env:SUPABASE_TEST_URL = "https://<staging>.supabase.co"
$env:SUPABASE_TEST_ANON_KEY = "..."
$env:SUPABASE_TEST_SERVICE_ROLE_KEY = "..."
$env:SUPABASE_TEST_PROJECT_REF = "..."
npm.cmd run test:integration
```

Không thay thế `staging` bằng production. Test helper hiện có sẽ từ chối endpoint
production-looking; đó là một phần của cổng an toàn.

## Trình tự cutover

1. Freeze scope mutation runtime và tạo repository PostgreSQL cho mọi boundary.
2. Áp dụng migration trên staging; chạy Supabase Advisor, RLS/RPC/Storage tests.
3. Chụp snapshot runtime cố định, nạp theo dependency và ghi `erp_legacy_id_map`.
4. Đối chiếu kho, công nợ, quỹ, tiền công, ledger, audit và attachment với sai
   lệch bằng `0`.
5. Chạy UAT theo toàn bộ vai trò và deep security scan mới.
6. Backup có thể restore, rehearsal rollback, maintenance/read-only và live
   route check đều phải có evidence.
7. Chỉ khi `assessCutoverReadiness` không còn blocker mới ghi checkpoint và
   kích hoạt `production_active` theo `docs/13_PRODUCTION_CUTOVER_RUNBOOK.md`.

Nếu bất kỳ bước nào không đạt: giữ runtime source of truth, không chuyển traffic
và lập run cutover mới với checksum snapshot mới sau khi đã khắc phục.
