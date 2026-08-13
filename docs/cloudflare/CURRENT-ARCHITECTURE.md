# Current Cloudflare Architecture

## Runtime graph

```text
Browser / Expo mobile
  -> Cloudflare DNS, TLS and Worker route
  -> Next.js 16 application compiled by OpenNext
  -> Worker static assets (ASSETS)
  -> server actions and /api/* routes
       -> Cloudflare D1: runtime documents, CAS revisions, idempotency, jobs, tracking
       -> Cloudflare R2: private evidence, attachments and incremental cache
       -> Cloudflare Queue: deferred notification/background requests
```

## Current components

| Component | Current implementation | Cloudflare dependency | Status |
| --- | --- | --- | --- |
| Web/PWA | Next.js 16 + React 19 | OpenNext Worker and ASSETS | Active |
| Mobile | Expo native client using bearer APIs | Worker APIs only | Active |
| Operations state | Runtime document CAS with server application services | D1 `erp_runtime_documents` | Active |
| Idempotency/audit state | Server command boundary and append-only domain state | D1 idempotency store | Active |
| Private files | Attachment metadata and authorization route | R2 `PRIVATE_FILES` | Active |
| Next cache | OpenNext incremental cache | R2 `NEXT_INC_CACHE_R2_BUCKET` | Active |
| Deferred work | Background job records and producer binding | D1 + `BACKGROUND_QUEUE` | Partial: consumer/runbook required |
| GPS tracking | Consent, session, points and retention route | D1; optional Queue follow-up | Active web-first |
| Auth/RBAC | Signed cookie sessions, bearer mobile tokens, server actor resolution | Worker runtime secrets | Active |
| Legacy Supabase | Historical stores, migrations and optional adapters | None in Cloudflare target | Legacy migration input |
| Odoo addon | `odoo_addons/vlxd_operations` Python/XML reference | None | Reference only, not runtime |

## Filesystem and report inventory

- Persistent business attachments, payment proofs, delivery evidence and inventory evidence use private R2 metadata/access paths.
- Node local files are limited to development/build artifacts, fixtures, logs and generated output; they are not a Worker persistence dependency.
- Excel import is request/server processing with private attachments; it must not depend on Worker-local durable files.
- PDF/report output must remain generated per request or stored through the private storage abstraction; `wkhtmltopdf` is not a Cloudflare runtime dependency.

## Environments

- Staging Worker: `hien-xa-erp-staging`, isolated D1/R2/Queue, custom domain `uat.hienxavlxd.com`.
- Production Worker: `hien-xa-erp-production`, isolated D1/R2/Queue, custom domain `app.hienxavlxd.com`.
- No production state is changed by this migration documentation program.
