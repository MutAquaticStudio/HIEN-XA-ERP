# HIEN-XA ERP V2 remediation evidence — 2026-08-20

## Scope and baseline

- Governing specification: `HIEN-XA-ERP-V2-REMEDIATION-DOD-CODEX-PROMPT.md`.
- Canonical remote repository: `MutAquaticStudio/HIEN-XA-ERP`.
- Gate 0 baseline: `main` at `16f609c2d55556f193a9040603ba7b4d9a4e4a38` (`fix(web): enable catalog detail disclosure`).
- Working branch: `codex/remediation-dod-20260820`.
- No production database, deployment, secret, or external business data was changed.

## Gate 0 inventory evidence

The remote tree was fetched recursively with `truncated: false`:

- 688 entries total, 523 blobs, 165 directories.
- Application routes were inventoried from `src/app`; no `/catalog/*` detail route exists on the baseline.
- Governing project files, docs 00–14, ADRs, package/config, source, tests, Supabase migrations, and the Cloudflare migration were read from the remote `main` ref.
- Current production persistence path is a D1 runtime JSON document (`erp_runtime_documents`) behind `CloudflareOperationsBackend`; normalized D1 business tables are not yet the mutation repository.

## Implemented on branch

1. Added shared selectors for active/scoped customers, suppliers, products, product units, warehouses, assignable workers, available vehicles, and the customer portal catalog.
2. Routed `/dat-hang` through the shared customer catalog selector.
3. Added explicit product policy fields `visibleOnCustomerPortal` and `orderableOnline`; seed products opt in, newly created products opt out.
4. Enforced portal visibility/orderability server-side before customer portal order creation.
5. Limited document-unit choices and sales conversion to product-specific configured fixed conversions; removed arbitrary unit defaults.
6. Restricted portal stock projection to active warehouses.
7. Removed the file-backend fallback that fabricated sale prices/VAT when persisted commercial data was missing.
8. Added regression tests for selectors, portal policy, and conversion control.

## Current status

- **PASS:** branch starts exactly from the latest remote `main` SHA; no archive branch or local checkout was used.
- **PASS:** shared selector and public catalog policy changes are present in the remote branch diff.
- **PASS:** server-side portal policy and configured-unit enforcement are implemented.
- **PARTIAL:** remote-only execution cannot run the repository's Node/Vitest/TypeScript gates in this environment; GitHub Actions workflows are not present on the baseline repository. Static source review was performed, but test/build results remain unverified.
- **BLOCKED:** full DoD release. The specification still requires normalized D1 repositories/migrations, complete cross-module read models and detail routes, production/staging migration evidence, live route checks, and an end-to-end gate. No production mutation or deployment is authorized or performed.

## Release boundary

Do not merge, deploy, or switch production persistence based on this checkpoint. The branch is a reviewable remediation increment only; the remaining PARTIAL/BLOCKED evidence must be closed in a subsequent authorized release step.
