# ERP V2 design-system foundation (R-021)

## Foundation

The final token layer in `src/app/design-system.css` centralizes the locked V2
palette (`#062448` sidebar, `#0D4D92` active item, `#3563EB` primary,
`#174EA6` primary-dark, semantic green/amber/red/cyan, slate 50–900), 8px
spacing baseline, 4/8/12px radii, light border shadows, Inter-first typography,
tabular numerals, and responsive breakpoints. Legacy portal CSS remains scoped
to its portal selectors; internal V2 routes use `erp-v2-*` classes.

## Primitives and grammar

| Primitive | Implementation |
|---|---|
| shell/sidebar | `src/components/erp-v2/erp-shell.tsx`, grouped permission-aware navigation |
| page header | `.erp-v2-page-header`, `.erp-v2-detail-header` |
| search/filter | `.erp-v2-toolbar`, URL-backed `q`/`status` form |
| record list | `.erp-v2-record-list`, table desktop and record cards mobile |
| detail tabs | `.erp-v2-tab-list`, underline active state, horizontal mobile scroll |
| status | `.erp-v2-status` semantic soft badge |
| empty state | `.erp-v2-empty` with reason and next action context |
| KPI/money summary | `.erp-v2-kpi`, `.erp-v2-summary-grid`, tabular numerals |
| dashboard chart | `.erp-v2-chart` plus accessible source table |

The existing operations workbench remains functional and receives the same
palette/control overrides. The new route shell is additive so old navigation
paths are not removed during the Phase 3 checkpoint.

## Responsive contract

At desktop/tablet widths the shell is a fixed 224–240px sidebar plus fluid main
workspace. At widths below 700px it becomes a compact drawer-style header,
reduces to a single-column content flow, converts catalog tables to labelled
record cards, keeps controls at 44px minimum touch height, and makes detail tabs
horizontally scrollable. No gradients, glass, neon, giant hero, nested-card
dashboard, browser-default primary controls, or forced viewport overflow are
introduced by the V2 route layer.

## Evidence

- `tests/phase3-ui-routes.test.ts` verifies all twelve list/detail route files,
  shared server-side guard usage, and route-map/chart-source contracts.
- `tests/dashboard-read-model.test.ts` verifies authoritative chart totals,
  date normalization, and explicit empty periods.
- `npm.cmd run typecheck` passes after the foundation slice.
