# Remote-only migration evidence

This document records the final local-state preservation before remote-only
development. It contains no secret values, credentials, cookies, or private
business data.

```text
REPOSITORY=MutAquaticStudio/HIEN-XA-ERP
LOCAL_REPO_PATH=D:\Project Hien Xa
LOCAL_HEAD_BEFORE_MIGRATION=010350e2e660808d3f2ad2fc10454d7dbf3be92f
LOCAL_BRANCH_BEFORE_MIGRATION=codex/release-remediation-0.1.1
REMOTE_MAIN_BEFORE_MIGRATION=16f609c2d55556f193a9040603ba7b4d9a4e4a38

FINAL_ARCHIVE_BRANCH=archive/local-final-20260820-105408
FINAL_ARCHIVE_COMMIT_SHA=7b8d874ccb2ffc7f272efe751d1ca4bcced2d384
FINAL_ARCHIVE_TREE_SHA=162dd0d7ca8778068c80bf79ee009b18d25be9ae
REMOTE_CANONICAL_REF=archive/local-final-20260820-105408

TRACKED_FILE_COUNT=622
UNTRACKED_REQUIRED_FILES_PRESERVED=7
SECRET_FILES_NOT_UPLOADED=.env.integration.local,.env.local,.env.uat-20260811.local,apps/mobile/.env
DISPOSABLE_FILES_NOT_UPLOADED=.data,.next,.open-next,.vercel,.wrangler,.wrangler-dryrun-wrapper,node_modules,output,qa-artifacts,test-results,tmp,apps/mobile/node_modules,generated Android build directories
UNKNOWN_FILES=NONE

REMOTE_SHA_VERIFIED=PASS
REMOTE_TREE_VERIFIED=PASS
REMOTE_FILE_LIST_VERIFIED=PASS
SECRET_SCAN=PASS
LOCAL_ONLY_REQUIRED_DATA=NONE
LOCAL_ONLY_REQUIRED_SOURCE=NONE
LOCAL_ONLY_REQUIRED_DOCUMENTATION=NONE
LOCAL_ONLY_REQUIRED_MIGRATION=NONE
LOCAL_ONLY_REQUIRED_TEST=NONE
REQUIRED_REMOTE_SECRETS=VERIFIED_BY_NAME
LOCAL_DELETION_APPROVED=YES
```

Cloudflare production runtime secret names were checked without reading or
printing values: `ERP_SESSION_SECRET`, `ERP_BOOTSTRAP_ADMIN_EMAIL`,
`ERP_BOOTSTRAP_ADMIN_NAME`, and `ERP_BOOTSTRAP_ADMIN_PASSWORD` are present.
Local integration and UAT credentials remain local-only and were not uploaded.

The final archive branch is the canonical remote reference until its
preservation pull request is merged into `main`.
