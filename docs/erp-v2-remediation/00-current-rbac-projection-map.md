# R-004 Current RBAC and Projection Map

Status: `CURRENT_RBAC_PROJECTION_MAP=PASS`

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
and `tests/backend-command-service.test.ts`.

Known future gaps: broad JSON state, UI direct mappings, and portal/dropdown
read-model normalization are not changed under R-001 to R-007.
