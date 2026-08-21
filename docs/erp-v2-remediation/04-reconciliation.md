# R-019 reconciliation evidence

Run date: 2026-08-20

The reconciliation read-model is `src/modules/operations/reconciliation.ts`.
It is read-only and derives all values from the existing append-only ledgers,
cash transactions, inventory movements, employee ledger, and payment
allocation rows.

## Coverage

```text
CUSTOMER_AR=PASS (customer ledger debit-credit, reversal-aware)
SUPPLIER_AP=PASS (supplier ledger credit-debit, reversal-aware)
CASH=PASS (cash transaction in-out)
INVENTORY=PASS (warehouse/product stockBalance from movement rows)
EMPLOYEE_PAYABLE=PASS (employee ledger credit-debit, reversal-aware)
PAYMENT_ALLOCATED_UNALLOCATED=PASS (per-payment and active totals)
```

The baseline fixture reconciles `wh-main::pu-brick-vien` to `10000` units and
all other warehouse/product combinations to zero. No mutable stock-balance
field is read.

## Before/after evidence

The reconciliation test uses a synthetic but fully explicit ledger/payment
fixture:

| Value | Before/confirmed | After allocation | After reversal |
|---|---:|---:|---:|
| customer AR balance | 1000 | 400 | 1000 |
| customer payment cash effect | 0 / +600 on confirm | +600 | 0 |
| payment allocated | 0 | 200 | 200 (history retained) |
| payment unallocated | 600 | 400 | 400 (inactive after reversal) |

The test proves payment confirmation changes cash and creates the payment
posting pair, while allocation changes only allocation metadata. Reversal
adds the opposite cash/ledger pair and leaves the original allocation rows as
history. The audit integrity report remains healthy after the workflow.

The portal visibility/orderability change is also reconciled before and after;
`reconciliationDiff(before, after) = []`, proving it does not alter AR, AP,
cash, employee payable, payment, or movement-derived inventory values.

## Test evidence

```text
npx.cmd vitest run tests/reconciliation.test.ts tests/operations-invariants.test.ts tests/debt-audit-workflow.test.ts tests/operations-workflow.test.ts
RESULT=PASS (included in the 15-file / 102-test Phase 2 targeted run)
```

No unexplained financial, inventory, payment, snapshot, or audit difference was
found. `UNEXPLAINED_DIFF=NONE`.
