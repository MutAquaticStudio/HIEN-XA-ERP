# Phase 4 functional gate — R-028 to R-034

## Checkpoint

- Branch: `codex/erp-v2-sales-purchase-phase4-20260820`
- Base checked: `62c4c98`
- Scope: R-028 through R-034 only. No R-035-or-later work, deployment, migration, or production-data mutation was performed.
- Verification date: 2026-08-20

## Delivered contract

- Sales and Purchase drafts support explicit V2 edit mode. The edit commands use optimistic `expectedVersion` checks, preserve the original `createdAt`, and record `updatedAt` and the next version.
- The server-action boundary validates both create and draft-update payloads, including business dates and commercial fields. Both update commands are registered in the ERP registry with their existing server-side permissions (`sales.create` and `procurement.create`), idempotency metadata, transaction boundary, and audit event.
- Business document dates accept backdates but reject future dates; server creation time remains distinct from the document date.
- Sales totals retain line discounts, VAT, customer payable, and internal commission as separate values. Commission is not added to the customer payable total.
- Sales sourcing and field work remain separate lifecycles: allocation selects line sources; the pre-existing Work Order lifecycle handles field assignment without creating a second work system.
- Purchase creation now exposes the product stock unit as an implicit, fixed 1:1 purchase unit when no optional purchase conversion exists. It creates no conversion record and leaves configured non-base purchase units unchanged.

## Automated evidence

| Gate | Result |
| --- | --- |
| `npm.cmd run typecheck` | PASS |
| Focused Phase 4 and regression suite | PASS — 10 files, 90 tests |
| `npm.cmd test` | PASS — 132 files, 543 tests |
| `npm.cmd run build` | PASS — optimized Next.js production build |
| `git diff --check` | Pending final pre-commit check |

Focused coverage includes backdated dates, future-date rejection, commercial totals, draft version conflict handling, implicit base purchase unit, warehouse destination preservation, direct-sales linkage, source allocation versus Work Order lifecycle, approval workflow, worker claiming, selectors, and sales/purchase version regressions.

## Rendered QA — isolated local fixture

The browser pass used a new local file-backed fixture and a local-only bootstrap owner on `127.0.0.1:3101`. It did not read or write production data.

- Desktop Sales: authenticated owner view rendered the July business date, versioned draft summary, customer-payable/discount/commission totals, and separate `Cấp nguồn hàng` / `Phân việc hiện trường` states.
- Sales editor: opened the draft and saved it through the server action. The UI confirmed `Cập nhật đơn bán nháp SO-2026-0001` and showed version 2.
- Purchase editor: selected the implicit base unit `bao`, created a disposable fixture draft, opened `Sửa đơn mua nháp PO-2026-0003`, and saved it through the server action. The UI confirmed `Cập nhật đơn mua nháp PO-2026-0003`.
- Mobile at a 390 px viewport: Sales and Purchase rendered without document-level horizontal overflow (`375px` scroll width / `375px` client width for Purchase). The only console entry was Next.js's development-only smooth-scroll warning; there were no application errors or framework error overlays.

## Roadmap result

| Roadmap | Result | Evidence |
| --- | --- | --- |
| R-028 Sales editor V2 | PASS | explicit draft editor, server-validated update command, local save |
| R-029 Business document date | PASS | date contract tests and rendered backdated date |
| R-030 Sales commercial totals | PASS | totals/commission tests and rendered totals |
| R-031 Sourcing vs Work Assignment | PASS | lifecycle regression test and rendered separate states |
| R-032 Purchase editor V2 | PASS | base-unit fallback, explicit draft editor, server-validated local create/save |
| R-033 Purchase regression | PASS | focused purchase/direct-sale/version suite plus full suite |
| R-034 Sales/Purchase functional gate | PASS (local) | authenticated desktop/mobile rendered QA and all automated gates |

This is a local implementation checkpoint only. Production authorization, production data, and deployment remain untouched.
