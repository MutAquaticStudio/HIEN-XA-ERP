# R-004 Current RBAC and Projection Map

Status: `CURRENT_RBAC_PROJECTION_MAP=PASS`; R-009 projection dependencies verified.

## Authorization path

1. `identity.ts` defines roles, permissions, and visible modules.
2. `auth-context.ts` builds the effective actor from persisted identity and
   selected modules.
3. `OperationsCommandService` checks registry permission before mutation.
4. `service.ts` repeats actor, status, linked-ID, warehouse-scope, and version
   checks inside domain commands.
5. `operations-projection.ts` removes state fields and rows outside role and
   linked-party/employee/warehouse scope.

## Projection behavior characterized in the current source

| Role | Current projection |
|---|---|
| customer | linked customer orders/products/delivery/ledger/proof rows; private fields removed |
| supplier | linked purchase/orders/products/warehouse/customer context; retail internals removed |
| driver | assigned delivery/order/vehicle/customer context; financial/commercial fields redacted |
| worker | own/claimable work and assigned operational rows; cost/price/tax/ledger fields redacted |
| warehouse | warehouse-scoped inventory/count and related workflow data |
| owner/admin/accountant | broad authorized operational/financial projection according to module visibility |

Positive and negative projection tests are included in
`tests/operations-projection.test.ts`, `tests/role-projection-hardening.test.ts`,
`tests/selectors.test.ts`, `tests/phase1-r008-r014.test.ts`, and
`tests/backend-command-service.test.ts`.

## R-009 dependency matrix

| Entity dependency | Positive projection/read path | Negative path | Scope rule |
|---|---|---|---|
| customer | sales/receivables/customer actor sees linked customer rows | unrelated customer is absent for linked customer actor | `customerId` |
| supplier | procurement/payables/supplier actor sees linked supplier rows | unrelated supplier is absent for linked supplier actor | `supplierId` |
| product | product id is reused by sales, purchase, inventory, delivery projections | inactive product is absent from shared selectors | `status=active` |
| warehouse | warehouse actor sees assigned warehouse movements/counts/orders only | unassigned warehouse and no-assignment actor return no warehouse data | `warehouseIds`, fail closed |
| employee/worker | driver/worker projection keeps linked employee rows only | unlinked driver/worker sees no assigned rows; selector restricts worker self | employee link/role |
| vehicle | delivery projection keeps vehicles linked to visible jobs; selector excludes busy active jobs | active vehicle already in assigned/loading/in-transit job is not selectable | delivery status |

R-008 selectors are the read-model dependency consumed by P0 forms. They do
not create a second master-data source: every option value is the authoritative
entity id from the projected state.

Known future gaps: broad JSON state, UI direct mappings, and portal/dropdown
read-model normalization are not changed under R-001 to R-007.
