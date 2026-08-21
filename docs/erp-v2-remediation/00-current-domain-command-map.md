# R-003 Current Domain and Command Map

Status: `CURRENT_DOMAIN_COMMAND_MAP=PASS`

## Create command roots

| Command family | Source | Main state roots |
|---|---|---|
| customer/supplier/product | `create-commands.ts` | customers, suppliers, productUnits, auditLogs |
| unit settings | `create-commands.ts` | unitDefinitions, purchaseUnitConversions |
| warehouse/vehicle/employee | `create-commands.ts` | warehouses, vehicles, employees |
| sales draft/portal order | `create-commands.ts` | salesOrders, auditLogs, processedOperations |
| purchase draft | `create-commands.ts` | purchaseOrders and optional linked salesOrders |
| delivery job | `create-commands.ts` | deliveryJobs |
| payment drafts/proofs | `create-commands.ts` | customerPayments, supplierPayments, employeePayments, proofs |
| work order/import | `create-commands.ts` | workOrders, compensationBatches, importJobs, importIssues |

## Operation command roots

`service.ts` owns product commercial policy, customer collection, sales
confirmation/allocation, purchase confirmation/receipt, inventory movement and
count workflow, delivery workflow, worker claim, payments, audit, idempotency,
and revision checks. `OperationsCommandService` is the server entry point and
the backend owns compare-and-swap persistence.

## Invariants

`invariants.ts` checks append-only movement/reversal behavior, ledger balance
relationships, payment allocation limits, document-unit reconciliation,
workflow versions, warehouse scope assumptions, and worker/delivery links.

R-008+ fixes are intentionally not started in this checkpoint.
