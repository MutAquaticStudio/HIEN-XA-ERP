# Cloudflare Migration Report

## Architecture

- Current: Next.js 16/OpenNext on Cloudflare Workers with Worker static assets, D1, R2 and Queue bindings.
- Target: retain the same Cloudflare-native topology; no Docker, Hyperdrive, PostgreSQL migration or Odoo runtime.

## Docker

- Build dependency: none in the normal Node/OpenNext command path.
- Runtime dependency: none for Worker runtime.
- Remaining usage: legacy Odoo reference must remain outside Worker bundle; no deletion performed.

## Cloudflare services

| Service | Status |
| --- | --- |
| Worker | Staging and production configurations exist |
| Static Assets | Configured through `ASSETS` |
| D1 | Staging/production bindings and foundation migration exist |
| R2 | Private file/cache bindings exist |
| Queue | Producer binding exists; consumer/runbook is partial |
| Workflows | Not provisioned; no concrete requirement approved |
| Cron | Protected retention route exists; Cloudflare cron trigger is partial |

## Validation required before staging-ready

- Docker/Compose/Odoo runtime scan is clean for normal build/deploy.
- Worker build and isolated D1/R2/Queue staging integration pass.
- Authenticated E2E, RBAC, A/B isolation, IDOR, `/dat-hang`, mobile API and security headers pass.
- Existing blockers are resolved: authorized product public price/VAT configuration for live order entry and Android production dependency remediation.

## Final status

**MIGRATION BLOCKED** until all release gates are green. No production deployment or mutation was performed by this documentation migration.

## Remote Workers Builds checkpoint

- Build runtime is pinned to Node 22 through `.nvmrc` and `package.json` engines.
- `npm ci && npm run cf:build` is the authoritative Docker-free bundle command for Cloudflare Workers Builds.
- The staging upload command remains `npm run cf:upload:staging`; it must only be executed by a reviewed staging build/version workflow.
- No Git remote or Cloudflare Workers Builds build ID was available from this repository checkpoint, so no remote build, version upload, preview URL or staging deployment is claimed as evidence.
- Local Windows OpenNext build is intentionally non-authoritative because the filesystem rejects traced dependency symlinks. The local WSL attempt is also non-authoritative until it has a native Linux Node installation rather than inherited Windows tools.

## Verification executed on 2026-08-11

| Gate | Result | Evidence |
| --- | --- | --- |
| Root typecheck | PASS | `npm run typecheck` |
| Root unit suite | PASS | 124 files, 500 tests |
| Next production build | PASS | 58 routes |
| Cloudflare staging integration | PASS | 1 file, 1 test against isolated staging contract |
| Docker runtime scan | PASS with documented exceptions | No Dockerfile/Compose workflow; only transitive mobile lockfile `is-docker` and legacy Odoo-reference documentation mention Docker |
| Native Windows OpenNext build | BLOCKED | `EPERM` while creating `read-excel-file` symlink |
| Ubuntu WSL OpenNext build | BLOCKED | Ubuntu distro inherited Windows `node/npm`; `workerd` postinstall cannot run from UNC path |

### Local Worker-build remediation

Install a native Linux Node LTS toolchain inside `Ubuntu-24.04` (not the Windows PATH), then run the Node-only OpenNext command from an ext4 workspace such as `/home/<user>/hien-xa-erp`. Do not use Docker Desktop or a container for this build. Until that evidence exists, Cloudflare Workers Builds should be the authoritative Linux Worker-build gate.

## Staging verification evidence (2026-08-11)

- Effective staging Worker: `hien-xa-erp-staging`.
- Version currently deployed to staging: `05e986c9-75b1-4acd-8428-a3915acd5a02` from Wrangler version upload.
- Staging route/static asset smoke and response-header checks passed.
- Isolated Cloudflare integration and remote D1 migration-state checks passed.
- No Git remote is configured for the current checkout. Therefore Cloudflare Workers Builds cannot yet be connected to a repository commit and no Cloudflare-side Linux build ID can be reported.

## Two verdicts

- **Cloudflare migration: BLOCKED.** The architecture and staging Worker work, but the required Cloudflare Workers Builds Linux build/version-upload evidence is absent because this checkout has no GitHub remote connection.
- **Application release: BLOCKED.** Independent existing blockers remain: production catalog commercial configuration and Android High dependency findings.
