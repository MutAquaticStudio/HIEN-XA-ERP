# Supabase staging rehearsal và fixture UAT UXV2

## Mục đích

Bộ công cụ này chuẩn bị một Supabase staging hoàn toàn tách biệt để chạy 27 migration,
integration test và authenticated UAT. Nó không relink Supabase CLI, không dùng production
làm staging và không ghi secret vào repository.

Fixture `UAT-UXV2` tạo tám tài khoản không chứa PII và dữ liệu liên kết cho Chủ cửa hàng,
Kế toán, Kho, Điều phối, Tài xế, Thợ, Khách hàng và Nhà cung cấp. Dữ liệu được ghi vào
runtime document hiện hành bằng compare-and-swap; chạy lại cùng credential không tạo bản ghi
hoặc audit trùng.

## Chuẩn bị biến môi trường

1. Tạo Supabase project staging riêng.
2. Sao chép các tên biến từ `.env.integration.example` vào `.env.integration.local` hoặc
   secret store của phiên terminal. Không commit file local.
3. Dùng tám mật khẩu ngẫu nhiên khác nhau, dài ít nhất 20 ký tự.
4. Cung cấp cả project ref staging và production. Runner từ chối nếu hai ref trùng nhau.

Không dot-source một file env không tin cậy. Nạp secret qua secret manager hoặc gán trực tiếp
trong phiên PowerShell được kiểm soát.

## Chạy rehearsal

```powershell
powershell -ExecutionPolicy Bypass -File scripts/uat/run-staging-rehearsal.ps1
```

Khi stable Preview alias đã sẵn sàng, chạy thêm authenticated Playwright trong cùng pipeline:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/uat/run-staging-rehearsal.ps1 `
  -BaseUrl https://vlxd-hien-xa-uat.vercel.app
```

Runner luôn chạy tuần tự:

1. Đối chiếu manifest đúng 27 migration.
2. `supabase db push --db-url ... --dry-run` lần một.
3. `supabase db push --db-url ...` lên staging.
4. Kiểm tra lịch sử database đúng `27/27`.
5. Dry-run lần hai để xác nhận không còn migration pending.
6. Database lint.
7. Áp dụng fixture idempotent qua service-role server-side.
8. Chạy full integration test và tùy chọn authenticated Playwright.

## Cổng an toàn

- Thiếu biến, dùng project production, sai project ref hoặc mật khẩu trùng đều fail trước mutation.
- Fixture chỉ được ghi khi `ERP_UAT_FIXTURE_CONFIRMATION=UAT-UXV2` và
  `ERP_UAT_FIXTURE_APPLY=1`; runner chỉ bật biến thứ hai trong đúng bước fixture.
- Log chỉ nêu tên bước và username cố định, không in database URL, service-role key hoặc mật khẩu.
- Rehearsal này không promote Vercel, không chạy migration production và không kích hoạt
  `production_active`.
