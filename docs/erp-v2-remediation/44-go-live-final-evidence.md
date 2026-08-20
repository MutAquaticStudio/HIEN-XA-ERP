# Go-live final evidence

Date: 2026-08-20

## Immutable references

```text
RC_BASE_SHA=0fd5be8820a8906d0569aeaaeb93265619439ee8
RC_TREE=fe802ba4f0710e784bfd2df63b1863f313f4378d
GO_LIVE_BRANCH=codex/erp-v2-go-live-20260820
STAGING_WORKER=hien-xa-erp-staging
STAGING_VERSION_ID=bc781ac2-c8e9-42a6-9c28-54e180f3b78a
STAGING_DEPLOYMENT_ID=26bf5a4c-8eb6-45cd-81f5-5fcc4b7fadfe
```

## Final status

```text
STAGING_BINDING_ISOLATION=PASS
STAGING_CONTRACT=BLOCKED
STAGING_INTEGRATION=BLOCKED
R-043=BLOCKED
R-044=PASS
R-045=BLOCKED
PLAYWRIGHT_BROWSER_RUNTIME=PASS
PUBLIC_PLAYWRIGHT_E2E=PASS (32/32 staging cases)
AUTHENTICATED_PLAYWRIGHT_E2E=BLOCKED
PLAYWRIGHT_E2E=PARTIAL
FINAL_GATE_E=NOT_READY
FINAL_RELEASE_STATUS=NOT_READY
GO_LIVE_STATUS=NOT_LIVE
NO_PRODUCTION_MUTATION=YES
```

The remaining blocking condition is a missing authorized channel for the existing staging integration secret and UAT fixture credentials. The application, authorization rules, deployment architecture, and production environment were not altered to bypass that condition. The repository-supported Playwright Chromium runtime was installed outside the repository; the real public staging suite passed all 32 cases after two reviewed stale login screenshot baselines were refreshed.
