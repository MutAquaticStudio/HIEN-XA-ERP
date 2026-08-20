# R-037 / R-038 — Workforce and WorkOrder V2 evidence

Date: 2026-08-20

## Root cause corrected

`WorkOrderDraftForm` previously used the generic active-employee selector. It now uses the canonical `getAssignableWorkers()` selector, which is active-only and `roleType === worker`.

The server create-command was hardened to the same rule. A bypassed client request with a driver, accountant, warehouse employee, inactive employee, or other non-worker is rejected before it creates a WorkOrder or compensation draft.

The explicit no-worker UI state is: **Chưa có thợ đang hoạt động.**

## Existing WorkOrder model retained

No parallel assignment model was created. The existing WorkOrder lifecycle remains:

```text
open → assigned → submitted → approved → compensated → paid
```

The management Workforce screen now presents **Chỉ định việc mới** for owner, administrator, supervisor, and dispatcher. It uses the existing `assignSalesWorkOrder` command with selected active worker and current version. Server-side authorization, active-worker validation, version conflict behavior, idempotency, audit and first-claim conflict handling remain authoritative.

Workers retain the existing **Việc mới / Nhận việc** flow. `worker-order-claim.test.ts` remains the concurrency proof for concurrent claim attempts; no UI-only claim logic was added.

## Focused verification

`tests/phase5-inventory-workforce-accounting.test.ts` proves:

- selector output contains active workers and excludes active non-workers;
- direct non-worker create-command submission fails server-side;
- a permitted supervisor can assign an active worker with expected version;
- a non-worker assignment attempt fails server-side.

The shared focused command completed with `29 tests passed`.
