# Current RBAC and projection map — 2026-08-20

- Identity is resolved server-side from signed session cookies/Bearer tokens.
- operationsActorForIdentity intersects role permissions with visible ERP modules.
- projectOperationsState clears fields outside the user's effective module scope and always clears processedOperations.
- Customer/supplier/driver/worker projections redact financial or private fields and scope records by linked customer/supplier/employee.
- Sales read models now include employees so worker assignment selectors can be propagated without exposing unrelated financial ledgers.
- Full production cutover is not verified: projection tests are source-reviewed but not executed in this environment.
