# Go-live final evidence

Date: 2026-08-20

## Immutable references

```text
RC_BASE_SHA=0fd5be8820a8906d0569aeaaeb93265619439ee8
RC_TREE=fe802ba4f0710e784bfd2df63b1863f313f4378d
GO_LIVE_BRANCH=codex/erp-v2-go-live-20260820
STAGING_WORKER=hien-xa-erp-staging
STAGING_SOURCE_SHA=1cc46dd0758fea0834810c336fdbe5e33a53d4c0
STAGING_VERSION_ID=0d990e22-095c-4d69-ae03-c7061b6ec4b7
STAGING_DEPLOYMENT_ID=0fbdb864-42c4-4149-bd64-303b673bb76a
```

## Final status

```text
STAGING_BINDING_ISOLATION=PASS
STAGING_SHA_ATTESTATION=PASS
STAGING_CONTRACT=BLOCKED
STAGING_INTEGRATION=BLOCKED
R-043=BLOCKED
R-044=PASS
R-045=BLOCKED
PLAYWRIGHT_BROWSER_RUNTIME=PASS
PUBLIC_PLAYWRIGHT_E2E=PASS (32/32 staging cases)
AUTHENTICATED_PLAYWRIGHT_E2E=BLOCKED
PLAYWRIGHT_E2E=PARTIAL
PUBLIC_EXACT_VIEWPORT_VISUAL_QA=PASS
AUTHENTICATED_VISUAL_QA=BLOCKED
FINAL_GATE_E=NOT_READY
FINAL_RELEASE_STATUS=NOT_READY
GO_LIVE_STATUS=NOT_LIVE
NO_PRODUCTION_MUTATION=YES
```

The remaining blocking condition is a missing authorized channel for the existing staging integration secret and UAT fixture credentials. The application, authorization rules, deployment architecture, and production environment were not altered to bypass that condition. The repository-supported Playwright Chromium runtime was installed outside the repository; the real public staging suite passed all 32 cases after two reviewed stale login screenshot baselines were refreshed.
