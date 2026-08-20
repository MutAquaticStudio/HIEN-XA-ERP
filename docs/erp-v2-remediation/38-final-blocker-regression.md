# Final blocker regression matrix

Date: 2026-08-20
Base revision: `b979d91b9ca7209a171a14207ce33824a98baf4f`

## Passed local and Linux evidence

| Gate | Command or proof | Result |
| --- | --- | --- |
| Static typing | `npm.cmd run typecheck` | PASS |
| Full unit regression | `npm.cmd test` | PASS — 134 files / 555 tests |
| R-044 authorization/security matrix | targeted 16-suite Vitest command | PASS — 16 files / 73 tests |
| Workbook authorization ordering | `tests/import-workbook-action.test.ts` | PASS — 1 file / 3 tests |
| Reconciliation/dashboard local support | `reconciliation`, `dashboard-read-model`, `role-dashboard` | PASS — 3 files / 10 tests |
| Security remediation scan | `5d62914f-d93c-4b03-9c8f-94542f8bfa97` | PASS — complete coverage, 0 findings, 0 warnings |
| Linux OpenNext package | isolated Ubuntu `npm run cf:build` | PASS |
| Worker runtime dependency policy | `scripts/security/check-worker-bundle.mjs` | PASS |

## Rendered and E2E evidence

- Current in-app-browser QA passed against `http://127.0.0.1:3104`: the desktop login surface rendered meaningful content with no framework overlay or console errors; at `390 x 844`, the public ordering flow incremented a quantity and advanced to the delivery/payment step with `scrollWidth=390` and `clientWidth=390`.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3104 npm.cmd run test:e2e:public` is blocked before page assertions. The runner cannot launch `chromium_headless_shell-1234`; all 32 cases stop at `browserType.launch`.
- No browser binaries were installed as part of this remediation.

## Remaining release blockers

```text
PUBLIC_PLAYWRIGHT=BLOCKED (required chromium_headless_shell executable absent)
STAGING_INTEGRATION=BLOCKED (dedicated staging configuration absent)
AUTHENTICATED_STAGING_E2E=BLOCKED (requires the dedicated staging environment and fixture credentials)
```

The local browser observation is supporting rendered evidence only; it does not waive the declared public Playwright or authenticated staging gate.
