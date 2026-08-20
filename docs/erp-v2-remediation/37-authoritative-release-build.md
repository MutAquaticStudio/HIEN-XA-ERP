# R-047 — Authoritative Linux / Cloudflare release build

Date: 2026-08-20
Base revision: `b979d91b9ca7209a171a14207ce33824a98baf4f`

## Environment and isolation

- Authority: Ubuntu 24.04.4 LTS through WSL, not Docker.
- Runtime: Node `v22.23.2`, matching the repository's `.nvmrc` major and the declared `>=22 <25` engine range.
- Input: an isolated temporary copy of the current worktree, including the remediation patch and excluding generated directories and `node_modules`.
- Dependency installation: `npm ci --no-audit --no-fund` in that temporary Linux copy.

No deployment command, preview command, upload command, remote D1 command, remote binding, staging endpoint, or production endpoint was used.

## Build receipt

```text
npm run cf:build
PASS
Next.js 16.3.0 compiled successfully
TypeScript completed successfully
Static pages generated: 58 / 58
OpenNext worker saved: .open-next/worker.js
OpenNext build complete

node scripts/security/check-worker-bundle.mjs
PASS — worker bundle contains no prohibited Undici/Wrangler/Miniflare/OpenNext runtime dependency
```

The complete build log and npm installation log were retained in the isolated WSL build directory during validation. The actual repository worktree was not used as the build output location.

## Decision

```text
OPENNEXT_BUILD=PASS
CLOUDFLARE_BUILD_VALIDATION=PASS
R-047=PASS
NO_DEPLOY_OR_REMOTE_RESOURCE_MUTATION=YES
```

This proves the current application packages into a Cloudflare-compatible Worker in Linux. It does not prove deployment, live bindings, staging configuration, production behavior, or Cloudflare account state.
