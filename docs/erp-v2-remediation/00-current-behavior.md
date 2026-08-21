# R-004 Current Behavior and Invariants

Status: `CURRENT_BEHAVIOR=PASS (source characterized; Gate A rerun)`

- Payment confirmation and payment allocation are separate operations and
  separate permissions.
- Inventory balances derive from append-only inventory movements; correction
  uses reversal/compensating movements.
- Ledgers and audit logs are append-oriented and commands are idempotency
  guarded.
- Sales and purchase lines persist document-unit snapshots; invariants verify
  quantity reconciliation and historical behavior.
- Worker claim uses actor/employee checks and backend CAS.
- Warehouse scope and expected versions are checked server-side.
- Role and linked-party projections redact fields outside effective scope.

This is a characterization of the canonical baseline. It does not claim
completion of explicit portal policy, shared dropdown selectors, full
cross-module propagation, or other R-008+ remediation work.
