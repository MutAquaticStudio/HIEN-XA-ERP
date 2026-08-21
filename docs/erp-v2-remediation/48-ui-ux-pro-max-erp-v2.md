# ERP V2-only — ERP nội bộ và Partner Portal

Ngày kiểm tra: 2026-08-21
Branch: `codex/erp-v2-go-live-20260820`

## Phạm vi đã triển khai

- Một runtime V2 và `ErpV2CommandService` dùng chung cho web nội bộ, customer portal, supplier portal, mobile API, fixture và integration contract.
- Command được định tuyến qua handler theo bounded context; transaction, authorization, idempotency, CAS/revision, audit, notification và invariant vẫn nằm server-side.
- Router/component V1, `demo-store`, `service.ts` và `operations-command-service.ts` đã hết caller và được thay bằng V2. Root redirect theo role: internal → `/dashboard`, customer → `/khach-hang`, supplier → `/nha-cung-cap`.
- Các portal UI cũ (`CustomerAccountPortal`, `SupplierAccountPortal`, `CustomerPaymentProofForm`, `CustomerDeliveryReceiptPortal`, `CustomerOrderPreview`, `PartnerPortalNav`) đã được gỡ khỏi surface cũ; root/detail/action pages và flow đặt hàng dùng component trong `src/components/erp-v2`, giữ nguyên command/action server-side.
- ERP nội bộ có route V2 riêng cho dashboard, catalog, sales, procurement, inventory, delivery, receivables, payables, cash, workforce, compensation, import, audit và reporting; list/detail dùng cùng shell và authorization projection.
- Customer portal có overview, đơn hàng/list/detail, đặt hàng, theo dõi, xác nhận giao, payment proof, công nợ và tin nhắn. Giá/VAT được đọc lại tại server; read model không chứa nguồn hàng, kho, supplier, giá vốn hoặc margin.
- Supplier portal có overview, PO list/detail, response, delivery notice, công nợ/thanh toán và tin nhắn. Read model chỉ project đúng supplier identity và không chứa sales price, customer ledger hoặc dữ liệu supplier khác.
- `SalesSourceAllocation` hỗ trợ nhiều kho, PO về kho và direct supplier; delivery job liên kết `allocationIds`. Delivery một phần cập nhật từng allocation; direct delivery không tạo inventory movement.
- Thiếu nguồn tạo `negative_stock_override`; Warehouse/Dispatcher chỉ gửi yêu cầu, chỉ Owner approve/reject. Approval không tự post; issue âm chỉ xảy ra khi delivery được duyệt với approval hợp lệ và cost basis xác định được.
- Migration V2 versioned chuyển nguồn V1 chắc chắn sang allocation; active record không ánh xạ chắc chắn tạo `ERP_V2_MIGRATION_BLOCKED`. Fixture UAT A/B hiện sinh native V2 allocations và private attachment local.
- Payment proof customer chỉ tạo trạng thái `submitted`; approve mới ghi cash/ledger. Rejected proof giữ lịch sử, reviewer, thời gian và lý do.

## Invariant và authorization đã xác minh

- Multi-source allocation, partial delivery, direct delivery, negative-stock approval, stale version, concurrent allocation, retry/idempotency và AR/AP/COGS/inventory reconciliation.
- Customer A/B và Supplier A/B không đọc chéo order, ledger hoặc attachment; worker/driver A/B chỉ nhận đúng work/delivery scope.
- Portal projection loại `allocations`, `allocationIds`, warehouse, purchase source, preferred supplier, COGS, margin và ledger trái scope.
- Không mở đăng ký công khai, không thêm debug endpoint, không thay đổi production data.

## Verification checkpoint

| Gate | Result | Evidence |
|---|---|---|
| Typecheck | PASS | `npm run typecheck` |
| Unit/domain regression | PASS | 140 files / 606 tests |
| Fixture + migration focused regression | PASS | 3 files / 17 tests |
| Public Playwright + axe + keyboard | PASS | 24/24 at the six required viewports |
| Authenticated rendered role matrix | PASS | 48/48: 8 roles × 6 viewports, isolated local runtime |
| Authenticated A/B cross-scope matrix | PASS | 24/24: customer, supplier, worker and driver isolation |
| Browser responsive/interaction QA | PASS | 1440×900, 1366×768, 1024×768, 390×844, 375×812, 360×800; no horizontal overflow, framework overlay or console error; order wizard step transition verified |
| Next production build | PASS | OpenNext invoked `next build`; 58/58 static pages generated |
| OpenNext/Cloudflare bundle | PASS | `.open-next/worker.js` generated; local Windows-only dependency symlink used an ignored junction workaround |
| Production mutation/deploy | NOT RUN | Explicitly outside this implementation checkpoint |

## Local authenticated QA hygiene

The Playwright authenticated harness creates a fresh file runtime under the operating-system temp directory, generates all 12 credentials in process memory, writes no credential to the repository or test log, creates only fixture-scoped private PNGs, and removes the exact temp directory during teardown. Remote staging is used only when `PLAYWRIGHT_BASE_URL` and approved credential variables are supplied externally.

No production fixture, production mutation, upload or deployment was performed.
