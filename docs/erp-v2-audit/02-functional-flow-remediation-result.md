# HIỀN XA ERP V2 — FUNCTIONAL FLOW REMEDIATION RESULT

This report reruns the functional-flow checks after the H-01/H-02 and
local source-level finding remediation. It does not replace the original
read-only audit in `01-functional-flow-compliance-audit.md`.

## Scope and safety

| Item | Result |
|---|---|
| Base source | `46ee774e45a011fb56112a370453be0ca8563b60` (origin/main at audit start) |
| Candidate source | `cadcf71` (verified remediation commit; final branch SHA is recorded below) |
| Technical specification | Root file is readable, 4,035 lines, 88,486 bytes, SHA-256 `C2F7C8FE0DFA32FF8B0AE6589C33DB833B150D06AC101A999EA8B7C9CC58DC3E`; exact title, repository `MutAquaticStudio/HIEN-XA-ERP`, and Harness revision `1.2` verified |
| Scope | ERP V2 internal shell, customer portal, supplier portal, loading/error/retry behavior, selectors and file-runtime price fallback |
| Production safety | No production request was mutative; no deployment, migration, secret, fixture, order, payment or inventory change was made |

## Finding closure

| Finding | Result | Evidence |
|---|---|---|
| H-01 | PASS | `src/app/(erp)/layout.tsx` owns one persistent `ErpShell`; customer and supplier portal layouts own their persistent `PartnerPortalFrame`. Root normal loading now delegates to scoped `RouteLoadingState`; group/route loading files render section-level skeletons, not a full-screen `<main>`. `tests/erp-v2-loading-architecture.test.ts` and the shell navigation browser test cover the boundary. |
| H-02 | PASS (local candidate) | `tests/e2e/public-ux.spec.ts` now characterizes both the explicit empty-catalog state and the safe populated/quote-required state. Local public Playwright completed 24/24 cases across 1440x900, 1366x768, 1024x768, 390x844, 375x812 and 360x800. No production mutation was used. |
| M-03 | PASS | Leaf ERP pages/helpers no longer own `ErpShell`; `usePathname()` derives active navigation while the route layout remains mounted. The authenticated shell persistence test passed at all six required viewports. |
| M-04 | PASS | `use-operations-runtime.ts` keeps the current snapshot visible, uses bounded 1s/3s/7s retry delays, stops after three retries, and exposes an in-place `Thử lại đồng bộ` action. Helper tests cover the finite budget. |
| L-01 | PASS | Customer payment order and unit choices now use shared selectors. Selector inventory and data/empty-state tests pass. No projection scope was broadened. |
| L-02 | PASS | Removed legacy `demoPrices` hydration. Missing file-runtime prices remain unresolved instead of being replaced with sample commercial values; backend regression test passes. |

## Requirement checkpoint

The original 49-row requirement matrix was rerun against the candidate source.
All former FAIL/PARTIAL code findings are closed. The only remaining BLOCKED
rows require an approved staging environment and/or additional disk capacity;
no guard was bypassed and no value was invented.

| Rows | Result |
|---|---|
| F01–F35, F37–F41, F46, F48–F49 | PASS (43 rows) |
| F36 — R-045 authoritative staging dashboard reconciliation | BLOCKED: no approved staging fixture/credential channel was available in this checkout; the local dashboard read-model tests remain green, but the same-fixture rendered comparison cannot be claimed |
| F42 — Next production build | BLOCKED: webpack build reached source compilation but the Windows volume returned `ENOSPC` while writing `.next` output |
| F43 — OpenNext/Cloudflare build | BLOCKED: `npm.cmd run cf:build` compiled Next and generated all 55 pages, then failed while copying the OpenNext static bundle with `ENOSPC` |
| F44 — repository integration guard | BLOCKED: `ERP_RUN_INTEGRATION_TESTS=1` and the dedicated confirmation were not supplied; the explicit guard was not bypassed |
| F45 — Cloudflare staging contract | BLOCKED: the staging secret/configuration and Cloudflare confirmation were not available; the explicit guard was not bypassed |
| F47 — authenticated cross-scope staging E2E | BLOCKED: approved Customer A/B, Supplier A/B, Worker/Driver staging identities were not available; production identities were not used |

## Executable verification

- `npx.cmd vitest run --pool=threads --maxWorkers=1`: **PASS**, 141 files / 614 tests.
- `npm.cmd run typecheck`: **PASS**.
- Focused loading, selectors, route-map, runtime retry, file-backend and
  propagation suites: **PASS**, 55 tests in the focused rerun.
- Local public Playwright: **PASS**, 24/24 cases at all six required viewport
  sizes.
- Authenticated ERP shell persistence: **PASS**, 6/6 viewport projects. The
  broader role matrix remains the staging-gated F47 item.
- `npm.cmd run build -- --webpack`: **BLOCKED** after/while writing build
  output with `ENOSPC`; the source compilation path itself reported no code
  error.
- `npm.cmd run cf:build`: **BLOCKED** at OpenNext asset bundling with
  `ENOSPC` after successful Next compilation and page generation.

## Loading architecture re-audit

The previous full-screen string is no longer used by normal route loading.
The owning normal loading component is
`src/components/erp-v2/route-loading-state.tsx`, selected by the root, ERP,
portal and order route boundaries. It renders an accessible scoped section
with `aria-busy`/status text, keeps the ERP or partner shell in the nearest
layout, and starts a 15-second timeout. A timeout exposes `Thử lại` (refreshes
the current route in place) and `Quay lại`; it cannot spin indefinitely. Error
boundaries expose retry/reset actions and retain server-side authorization.
The global error boundary remains only for catastrophic app errors, not the
normal route transition path. Existing runtime data remains visible while a
background revision sync is retrying.

## Final checkpoint

```text
FUNCTIONAL_FLOW_REMEDIATION
BASE_SHA=46ee774e45a011fb56112a370453be0ca8563b60
CANDIDATE_SHA=cadcf71
H-01=PASS
H-02=PASS
M-01=BLOCKED (R-045 staging read-model comparison)
M-02=BLOCKED (staging integration/authenticated credentials)
M-03=PASS
M-04=PASS
L-01=PASS
L-02=PASS
LOADING_ARCHITECTURE=PASS
FULL_SCREEN_LOADING_FINDING=PASS
CROSS_MODULE_CONNECTIVITY=PASS (source/local regression; staging gates remain blocked)
PORTAL_FLOW=PASS (server-side scoped projection and local regression)
DASHBOARD_FLOW=PARTIAL (authoritative local read model PASS; R-045 staging comparison BLOCKED)
DROPDOWN_INTEGRITY=PASS
REVISION_SYNC_NO_F5=PASS
TOTAL_REQUIREMENTS=49
PASS_COUNT=43
FAIL_COUNT=0
PARTIAL_COUNT=0
BLOCKED_COUNT=6
FULL_UNIT_TESTS=PASS
TYPECHECK=PASS
BUILD=BLOCKED (ENOSPC)
BROWSER_QA=PASS (local public 24/24 plus shell 6/6)
CORE_REGRESSION=PASS
PRODUCTION_CHANGED=NO
PRODUCTION_MUTATED=NO
DEPLOYED=NO
```

`READY_FOR_STAGING_VALIDATION=NO` until the six explicit blocked rows are
rerun through the approved staging channel and the build is repeated on a
volume with sufficient free space.
