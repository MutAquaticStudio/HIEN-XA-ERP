# Phase 3 baseline and Gate A (R-005/R-006 evidence)

Run date: 2026-08-20

```text
FEATURE_BRANCH=codex/erp-v2-ui-phase3-20260820
BASE_SHA=effc435770f6f7ff5c1a27ae1f0551762e1384de
NODE_VERSION=v24.17.0
NPM_VERSION=11.13.0
PACKAGE_MANAGER=npm.cmd (lockfile present)
```

## Safe baseline commands

| Command | Result |
|---|---|
| `npx.cmd vitest run tests/backend-command-service.test.ts tests/operations-invariants.test.ts tests/worker-order-claim.test.ts tests/inventory-delivery-version-lock.test.ts tests/operations-projection.test.ts tests/debt-audit-workflow.test.ts tests/operations-workflow.test.ts tests/purchase-unit-settings.test.ts tests/customer-order-catalog.test.ts tests/selectors.test.ts tests/idempotency-hash.test.ts tests/role-projection-hardening.test.ts` | **PASS** — 12 files, 98 tests |
| `npm.cmd test` | **PASS** — 129 files, 530 tests |
| `npm.cmd run typecheck` | **PASS** — `tsc --noEmit` |
| `npm.cmd run build` | **PASS** — Next.js generated 58 routes |
| `npm.cmd run test:integration` | **BLOCKED** — explicit staging guard requires `ERP_RUN_INTEGRATION_TESTS=1` and dedicated confirmation |
| `npm.cmd run test:cloudflare-integration` | **BLOCKED** — explicit UAT guard requires `ERP_RUN_CLOUDFLARE_INTEGRATION_TESTS=1` and UAT confirmation |
| `npm.cmd run test:e2e:public` | **BLOCKED** — 32 attempts, Playwright Chromium executable missing at the local ms-playwright path |
| lint discovery | **NOT CONFIGURED** — `package.json` has no lint script; no invented lint command |
```

Build produced only ignored/generated output; the tracked worktree remained
clean after the baseline.

## Characterization scope

The characterization set covers payment confirmation/allocation separation,
append-only inventory and reversal, worker claim atomicity, warehouse scope and
versioning, RBAC/projection positive and negative paths, document-unit snapshot
history, financial/workflow invariants, portal catalog behavior, selectors and
idempotency. No test was weakened or skipped.

## Gate A decision

```text
BASELINE_CHARACTERIZATION=PASS
GATE_A=PASS
KNOWN_ENVIRONMENT_BLOCKERS=staging integration, Cloudflare UAT integration, local Chromium
```
