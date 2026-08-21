# UI/UX đồng bộ ERP V2 — ui-ux-pro-max

Ngày kiểm tra: 2026-08-21
Branch: `codex/erp-v2-go-live-20260820`

## Phạm vi đã triển khai

- Persisted design system tại `design-system/hi-n-xa-erp-v2/MASTER.md` với override cho `dashboard`, `catalog`, `operations`.
- Token-first UI layer trong `src/app/design-system.css`: navy/blue data palette, amber attention, Be Vietnam Pro, spacing/radius/shadow, visible focus ring, reduced motion, responsive breakpoints 1440/1366/1024/768/390/375/360.
- ERP V2 shell/navigation và workbench dùng cùng visual primitives: sidebar, panel, table, form control, status, empty/error/loading/pending state.
- Dashboard: cùng ngày/bộ lọc/đơn vị cho KPI, doanh thu, quỹ, top vật tư và attention list; chart có bảng fallback và giá trị focusable.
- Catalog: khách hàng, nhà cung cấp, vật tư, kho/bãi, phương tiện, nhân sự; tìm kiếm không dấu, table/card responsive, tab/hash navigation và semantic labels.
- Operations workbench: pending mutation state (`aria-busy` + status) áp dụng cho sales, procurement, inventory, delivery, workforce, receivables, payables, cash, import, audit, reporting.

Không thay đổi command payload, read-model formula, schema, API contract, RBAC/scope, idempotency, audit, CAS/revision hoặc dữ liệu production.

## Verification

| Gate | Result | Evidence |
|---|---|---|
| Typecheck | PASS | `npm run typecheck` |
| Unit/domain regression | PASS | `npm test` — 134 files / 555 tests |
| Focused UI/read-model tests | PASS | 7 files / 21 tests; later 3 files / 10 tests |
| Public Playwright + axe | PASS | 32/32 across 320, 375, 390, 768, 1024, 1280, 1440, 1920 |
| Visual baselines | PASS | Existing login/order snapshots regenerated only for intentional visual change at 390/1440 |
| Manual responsive smoke | PASS | Browser inspection at 1440×900 and 390×844; mobile `scrollWidth === clientWidth` |
| Next production build | PASS | `npm run build` |
| OpenNext/Cloudflare build | BLOCKED | App compile/typecheck passed; Windows bundling stopped at `EPERM` creating symlink for `read-excel-file` after earlier disk-full attempt. No deploy performed. |

## Module/route coverage

Shared layer is consumed by the full ERP navigation: Dashboard, Catalog, Sales, Purchase/Sourcing, Inventory, Delivery/Dispatch, Workforce, Receivables, Payables, Cash/Finance, Import, Audit, Reporting, customer portal, supplier portal, admin, and mobile/PWA routes. Authenticated staging credentials were not entered or transmitted during local visual QA.
