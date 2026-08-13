# Web-only release scope

## Checkpoint

- Source RC: `9bf5d5eff5bff5e7ca401dc1c7ca2ac6bc5df228`
- Source branch: `codex/release-remediation-0.1.1`
- Target base: `origin/main` at `4bab982764f31e5160f889083c11c6bc57391052`
- Replacement branch: `codex/web-production-release-20260814`
- Reconstruction date: 2026-08-14

## Classification policy

| Classification | Included paths and reason |
| --- | --- |
| `WEB_RUNTIME_REQUIRED` | `src/**`, `cloudflare/**`, `public/**`; application, API, D1/R2/Queue, auth, RBAC, audit, idempotency, tracking and security wrapper used by the Web Worker. |
| `WEB_BUILD_REQUIRED` | `package.json`, `package-lock.json`, `next.config.mjs`, `open-next.config.ts`, `wrangler.jsonc`, `tsconfig.json`, Playwright/Vitest configuration, `.nvmrc`, environment examples and ignore rules required to build/test the Worker. |
| `WEB_TEST_REQUIRED` | `tests/**` and Cloudflare/UAT/security scripts; these exercise the Web server boundary, 401/403/409/412 contracts, Cloudflare bindings, fixtures, IDOR, business flows and UTF-8 behavior. Root tests with `mobile` in an API path remain Web tests because they test server routes, not `apps/mobile`. |
| `WEB_RELEASE_DOCUMENTATION` | `adr/ADR-008-CLOUDFLARE-PLATFORM.md`, `docs/cloudflare/**`, the three updated invariant/test-strategy documents, and the existing Web production report. |
| `SHARED_FILE_REQUIRES_HUNK_REVIEW` | Root manifests and `src/server/**` were reviewed as shared Web/backend files. Their selected content is required by the Cloudflare Worker; no Expo package or Android source is included. |
| `ANDROID_OUT_OF_SCOPE` | Every path under `apps/mobile/**`, every `.maestro/**` flow, `ANDROID_BUILD.md`, and root `app.json`. These paths were restored from `origin/main` or removed from the replacement branch and remain preserved on the source branch. |
| `UNRELATED_DOCUMENTATION` | Root `README.md`, mobile release/cutover guides `docs/13_*` through `docs/26_*`, UX audit, user-guide diagrams and other Android evidence. These were restored from `origin/main` or omitted. |
| `GENERATED_ARTIFACT` | None included. Build output, `.next`, `.open-next`, `node_modules`, APK/AAB files and QA evidence are excluded. |
| `UNKNOWN_REQUIRES_REVIEW` | None. Every source-RC path was classified by the rules above before reconstruction. |

## Inventory result

- Source-RC changed paths inspected: 522.
- Included in replacement Web branch after classification: 414 staged paths including this manifest.
- Excluded from replacement scope: 108 paths (Android, Maestro, Android documentation, diagrams, UX audit, README and root Expo/Vercel-only files).
- `apps/mobile/**` changed paths in replacement PR: **0**.
- Android-only changed paths in replacement PR: **0**.
- Secrets, credentials, cookies, local UAT passwords and generated artifacts: **0**.

## Included path groups

- Web runtime and API: `src/**`, `cloudflare/**`, `public/**`.
- Cloudflare build and release: `wrangler.jsonc`, `open-next.config.ts`, `next.config.mjs`, package manifests, `scripts/security/**`, `scripts/uat/**`.
- Web test and UAT: `tests/**`, `playwright*.config.ts`, `vitest*.config.ts`.
- Legacy migration input retained only where required by the existing shared test/runtime contracts: `supabase/**` and related server adapters. No Supabase production migration is executed by this release.
- Release documentation: `docs/cloudflare/**`, updated Web invariants/test strategy, and `docs/qa/WEB-PRODUCTION-GO-LIVE-20260813.md`.

## Verification commands

```text
git diff --exit-code origin/main...HEAD -- apps/mobile
git diff --check
git diff --name-status origin/main...HEAD
```

The first command must exit `0`; any later change that adds an Android or
unclassified path invalidates this manifest and requires a new scope review.
