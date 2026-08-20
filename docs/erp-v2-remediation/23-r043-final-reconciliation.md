# R-043 — Final reconciliation

Date: 2026-08-20

## Local canonical reconciliation

`tests/reconciliation.test.ts` passed as part of the R-042 command. It proves that the reconciliation snapshot derives customer AR, supplier AP, employee payables, cash, inventory quantities, payment allocations and unallocated amounts from their accepted ledgers and movements. It also proves that portal/unit policy changes do not alter derived balances, and that payment reversal restores the cash/ledger pair while preserving audit integrity.

The implementation is read-only at `src/modules/operations/reconciliation.ts`; it derives values through selector/read-model functions rather than editable balance fields. `src/modules/operations/audit-integrity.ts` is asserted healthy by the suite.

## Environment boundary

The final staging reconciliation was intentionally not run. `npm.cmd run test:integration` exited before tests with its fail-closed guard because `ERP_RUN_INTEGRATION_TESTS=1`, a dedicated staging database, and `ERP_TEST_DATABASE_CONFIRMATION=hien-xa-staging` are absent. No guard was weakened and no production/staging data was read or changed.

```text
LOCAL_RECONCILIATION=PASS
STAGING_RECONCILIATION=BLOCKED (dedicated guarded environment unavailable)
PRODUCTION_RECONCILIATION=NOT RUN (not authorized)
R-043=PARTIAL
```
