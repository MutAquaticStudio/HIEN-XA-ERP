# R-003 Current Code Map

Status: `CURRENT_CODE_MAP=PASS`

## Runtime layers

| Layer | Canonical paths | Responsibility |
|---|---|---|
| domain state/types | `src/modules/operations/types.ts`, `sample-data.ts` | OperationsState, master roots, orders, inventory, ledgers, workforce, audit |
| create commands | `src/modules/operations/create-commands.ts` | server-side creation validation, snapshots, audit, idempotency boundary |
| domain operations | `src/modules/operations/service.ts` | workflow transitions, allocation, payments, inventory, claims, approvals |
| invariants | `src/modules/operations/invariants.ts` | financial, inventory, document, workflow consistency checks |
| selectors/read helpers | `src/modules/operations/selectors.ts`, `unit-settings.ts` | current derived totals, labels, conversion helpers |
| registry/identity | `erp-registry.ts`, `identity.ts`, `auth-context.ts` | operation permissions, role/module policy, actor context |
| projection | `src/server/identity/operations-projection.ts` | field/row projection by effective role and linked scope |
| command application | `src/server/application/operations-command-service.ts` | registry permission, backend read/CAS/write, idempotency orchestration |
| persistence backends | `src/server/infrastructure/*operations-backend*` | memory/file/postgres/D1 adapters and revision persistence |
| server routes/actions | `src/app/actions.ts`, `src/app/api/**`, `src/server/mobile/**` | transport, authentication, projection, command invocation |
| web forms | `src/components/operations/*-view.tsx` | projected state rendering and command submission |
| tests | `tests/*operations*`, `tests/*projection*`, `tests/*invariants*`, `tests/integration/**`, `tests/e2e/**` | unit/characterization/integration/browser evidence |

## Domain roots

```text
customers, suppliers, employees, productUnits, unitDefinitions,
purchaseUnitConversions, warehouses, vehicles,
salesOrders, purchaseOrders, inventoryMovements, deliveryJobs,
customerLedgerEntries, supplierLedgerEntries, employeeLedgerEntries,
customerPayments, supplierPayments, employeePayments, employeeAdvances,
workOrders, compensationBatches, auditLogs, processedOperations
```

## Current implementation boundary

This map describes the canonical source before R-008+ remediation. It does
not claim that shared selectors, portal policy, cross-module propagation, or
dropdown cleanup are complete. Those are explicitly future scope.
