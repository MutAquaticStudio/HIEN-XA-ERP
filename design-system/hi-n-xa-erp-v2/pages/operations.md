# Operations workbench override

- Reuse the shared navy sidebar, 48px primary controls, visible focus ring, panel/table primitives, and Vietnamese labels across sales, procurement, inventory, delivery, workforce, finance, reporting, import, and audit views.
- Keep forms task-focused and show loading, empty, error, permission-denied, and success states in the same workbench region.
- Preserve server-side authorization, idempotency, audit trail, CAS/version checks, and source-document invariants. Presentation changes must not alter command payloads.
- Use horizontal table scroll only when the table is genuinely wide; on narrow screens prefer the existing card representation or stacked form grid.
- Keep animation subtle and disabled under `prefers-reduced-motion`.
