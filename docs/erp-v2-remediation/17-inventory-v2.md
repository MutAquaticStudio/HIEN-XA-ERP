# R-035 / R-036 — Inventory V2 evidence

Date: 2026-08-20

## Implemented command path

`postOpeningInventory` is now a registered inventory posting command. It validates an active warehouse, active product, positive quantity, non-negative unit cost, and a mandatory reason before appending an `InventoryMovement` with:

- `movementType: opening`
- generated `TDK-xxxxxx` source document and `opening-TDK-xxxxxx` posting key
- server-side permission `inventory.post_opening`
- existing command-service transaction, idempotency record and audit entry
- existing warehouse actor scope guard

No balance field is mutated. `stockBalance()` remains the read model derived from all inventory movements.

## Correction and traceability

Opening movements now use the existing `reverseInventoryMovement` correction path. Reversal appends a `reverse-<movement-id>` movement, links the original through `reversedById`, carries the source unit cost, requires a reason, and refuses a reversal that would make stock negative. A reversal row cannot itself be reversed.

The Inventory V2 screen now:

- exposes **Ghi tồn đầu kỳ** beside the existing transfer and count-session tools;
- retains derived current stock, movement history, transfer and stocktake experiences;
- exposes the existing reversal workflow for posted opening movements instead of allowing an in-place correction;
- preserves the catalog warehouse-detail route as the existing read-only evidence surface.

## Focused verification

Command:

```text
npm.cmd exec vitest run tests/phase5-inventory-workforce-accounting.test.ts tests/monthly-report.test.ts tests/worker-order-claim.test.ts tests/inventory-count-session.test.ts
```

Result: `4 files passed`, `29 tests passed`.

The Phase 5 inventory test proves one append-only opening movement, replay suppression, one audit event, reverse linkage, restored derived balance, and no new audit-integrity errors. It also proves permission and warehouse-scope rejection server-side.

## Cost/date policy

- Cost policy: use the existing `InventoryMovement.unitCost` field; opening entry requires a non-negative value and reversal preserves that snapshot.
- Business date policy: the current movement model uses server posting time (`postedAt`) and does not expose an independent back-date field. Phase 5 therefore does not invent or fake a second business-date source.
