# R-005/R-006 Baseline and Gate A Evidence

Run date: 2026-08-20
Branch/base: `codex/erp-v2-core-data-20260820` at `798b2ea58ca8c0b0398c30528707fefc3bc058fa`

## Safe baseline commands

| Command | Exit | Result |
|---|---:|---|
| `npm.cmd ci` | 0 | 455 packages added; 456 audited; 0 vulnerabilities. |
| `npm.cmd run typecheck` | 0 | `tsc --noEmit` passed. |
| `npm.cmd test` | 0 | 125 files, 513 tests passed. |
| `npm.cmd run build` | 0 | Next.js 16.3 compiled/typechecked and generated 58 pages. |
| lint discovery | N/A | `package.json` has no lint script. |
| `npm.cmd run test:integration` | 1 | Explicit guard: integration disabled without dedicated staging env. |
| `npm.cmd run test:cloudflare-integration` | 1 | Explicit guard: Cloudflare integration disabled without UAT env. |
| `npm.cmd run test:e2e:public` | 1 | 32 tests attempted; Playwright Chromium executable missing. |

Known build/browser warning: Next.js sees parent
`C:\Users\TUYEN\package-lock.json` outside the clone. The clone lockfile was
used. No deployment, migration, or production mutation was run.

## R-006 characterization command

```text
npx.cmd vitest run tests/backend-command-service.test.ts tests/operations-invariants.test.ts tests/worker-order-claim.test.ts tests/inventory-delivery-version-lock.test.ts tests/operations-projection.test.ts tests/debt-audit-workflow.test.ts tests/operations-workflow.test.ts tests/purchase-unit-settings.test.ts tests/customer-order-catalog.test.ts tests/selectors.test.ts tests/idempotency-hash.test.ts tests/role-projection-hardening.test.ts
```

Exit `0`: 12 files and 91 tests passed. This covers payment separation,
append-only inventory/reversal, worker claim CAS, warehouse scope/version,
RBAC/projection, document-unit history, invariants, and idempotency.

## Gate A decision

`BASELINE_CHARACTERIZATION=PASS`

The safe local baseline and characterization tests pass. Integration,
Cloudflare, and browser suites are environment-blocked and are not silently
converted to PASS.
