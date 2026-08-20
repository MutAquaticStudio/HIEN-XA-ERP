# R-004 Current Test Map

Status: `CURRENT_TEST_MAP=PASS`

| Area | Current evidence |
|---|---|
| create commands and master data | `tests/create-commands.test.ts`, `tests/product-unit-creation-regression.test.ts` |
| financial/ledger invariants | `tests/operations-invariants.test.ts`, `tests/debt-audit-workflow.test.ts` |
| inventory append/reversal/count | `tests/operations-workflow.test.ts`, `tests/inventory-delivery-version-lock.test.ts` |
| worker claim atomicity | `tests/worker-order-claim.test.ts`, `tests/backend-command-service.test.ts` |
| document unit/history | `tests/purchase-unit-settings.test.ts`, `tests/create-commands.test.ts` |
| RBAC/projection | `tests/operations-projection.test.ts`, `tests/role-projection-hardening.test.ts` |
| idempotency/revision | `tests/idempotency-hash.test.ts`, `tests/backend-command-service.test.ts`, `tests/file-operations-backend.test.ts` |
| portal/catalog baseline | `tests/customer-order-catalog.test.ts`, `tests/partner-portals.test.ts`, `tests/portal-actions.test.ts` |

No new remediation tests were added to today's clean checkpoint. The tests
added by the interrupted R-008+ execution remain only on the local WIP branch.
