# R-042 — 25-step full-system smoke

Date: 2026-08-20
Branch: `codex/erp-v2-final-gates-phase6-20260820`
Base: `6046c94b941ecd2eb9f593e3e76f9635db6eb107`

## Executed safe smoke command

```text
npm.cmd exec vitest run tests/phase1-r008-r014.test.ts tests/phase2-migration-safety.test.ts tests/phase3-ui-routes.test.ts tests/phase4-sales-purchase.test.ts tests/phase5-inventory-workforce-accounting.test.ts tests/operations-workflow.test.ts tests/reconciliation.test.ts tests/dashboard-read-model.test.ts tests/role-dashboard.test.ts tests/security-hardening.test.ts tests/role-projection-hardening.test.ts tests/worker-order-claim.test.ts
```

Result: `12 files / 85 tests passed`. All state-changing paths use the repository's in-memory or temporary test fixtures; no production or staging system was contacted.

## Smoke matrix

| # | Verified behavior | Evidence suite |
| --- | --- | --- |
| 1 | Master IDs are shared across sales, purchase, inventory, cash, workforce and delivery. | `phase1-r008-r014` |
| 2 | Party and warehouse selectors fail closed outside scope. | `phase1-r008-r014` |
| 3 | Portal policy and immutable unit snapshots survive the runtime contract. | `phase2-migration-safety` |
| 4 | Catalog list/detail routes remain addressable. | `phase3-ui-routes` |
| 5 | Detail routes retain their server guard and mobile-card grammar. | `phase3-ui-routes` |
| 6 | Sales accepts a valid backdated business date while preserving truthful creation time. | `phase4-sales-purchase` |
| 7 | Future sales business dates are rejected. | `phase4-sales-purchase` |
| 8 | Sales draft edits use versioning and retain original audit time. | `phase4-sales-purchase` |
| 9 | Purchase uses the safe base unit when no optional conversion is configured. | `phase4-sales-purchase` |
| 10 | Purchase destination contract and draft versioning remain intact. | `phase4-sales-purchase` |
| 11 | Sales sourcing stays distinct from field WorkOrder assignment. | `phase4-sales-purchase` |
| 12 | The core ERP flow posts through append-only ledgers and movements. | `operations-workflow` |
| 13 | Supplier direct delivery does not fabricate warehouse movement. | `operations-workflow` |
| 14 | Delivery requires loading and dispatch before completion. | `operations-workflow` |
| 15 | Purchase lines can split warehouse receipt and direct delivery safely. | `operations-workflow` |
| 16 | Idempotent retry cannot duplicate an inventory movement. | `operations-workflow` |
| 17 | Transfer creates linked two-sided movements. | `operations-workflow` |
| 18 | Customer payment allocation remains bounded by the confirmed receipt. | `operations-workflow` |
| 19 | Approved output creates compensation exactly once and splits it consistently. | `operations-workflow` |
| 20 | Opening stock is one audited, idempotent movement and is corrected by reversal. | `phase5-inventory-workforce-accounting` |
| 21 | Opening inventory enforces permission and warehouse scope at the server boundary. | `phase5-inventory-workforce-accounting` |
| 22 | Worker selection excludes invalid roles even when the client is bypassed. | `phase5-inventory-workforce-accounting` |
| 23 | Manager assignment uses an eligible employee and version guard. | `phase5-inventory-workforce-accounting` |
| 24 | Simultaneous work claims produce exactly one winner and `ORDER_ALREADY_CLAIMED` for the other. | `worker-order-claim` |
| 25 | Accounting XLSX uses selected authoritative datasets and parses as a valid workbook. | `phase5-inventory-workforce-accounting` |

`R-042=PASS` for the safe repository-level smoke gate. It does not substitute for the separately recorded real staging, Cloudflare, or installed-Playwright environment gates.
