# Docker Removal Record

## Before

The repository contains a legacy Odoo addon directory and historical Supabase/PostgreSQL artifacts. They do not establish a Docker dependency for the current Next.js/OpenNext Cloudflare application.

## After

Normal paths are Node-only:

```text
npm ci
npm run typecheck
npm test
npm run build
npm run cf:preview
npm run cf:upload:staging
npm run cf:deploy:staging
```

## Evidence and safeguards

- Root inventory found no root `Dockerfile`, `docker-compose.yml` or Compose workflow.
- No Docker artifact is deleted in this phase.
- CI/Workers Builds must be scanned for Docker references before declaring removal complete.
- Rollback remains the previously deployed Worker version plus retained legacy reference artifacts.

## Scan classification (2026-08-11)

- Active Docker build dependency: `0`.
- Active Docker runtime dependency: `0`.
- Active Docker deployment dependency: `0`.
- Transitive dependency text: `is-docker` inside the Expo mobile lockfile; it is not a Docker command, image or deployment path.
- Legacy history/documentation: the Odoo compatibility note references Docker conceptually; it is not an executable build dependency.
