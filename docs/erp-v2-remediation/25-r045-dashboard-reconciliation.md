# R-045 — Final dashboard reconciliation

Date: 2026-08-21

## Authority and scope

The shipped `/dashboard` page obtains its state through `projectOperationsSnapshot`, then calls the existing `createDashboardReadModel` with the GET `from`/`to` range and the authenticated user's dashboard role. No formula or reporting endpoint was added for this validation.

The repository's isolated `UAT-UXV2` staging fixture was reapplied, then the same fixture state was passed to the existing read-model implementation for the authoritative values. An authenticated Owner session rendered the same staging dashboard at `from=2026-08-02` and `to=2026-08-02`. The candidate source was `603dc6ff0023f14637c861ee33443309790f8fd7`.

## Metric reconciliation

| METRIC | SOURCE | FILTER | UNIT | AUTHORITATIVE VALUE | DASHBOARD VALUE | DIFF | RESULT |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| KPI: revenue | Customer ledger sale-delivery debit entries | 2026-08-02 to 2026-08-02; Owner scope | VND | 400,000 | 400,000 | 0 | PASS |
| KPI: cash | Reconciled cash transactions | 2026-08-02 to 2026-08-02; Owner scope | VND | 0 | 0 | 0 | PASS |
| KPI: receivable | Reconciled customer ledger | 2026-08-02 to 2026-08-02; Owner scope | VND | 400,000 | 400,000 | 0 | PASS |
| KPI: payable | Reconciled supplier ledger | 2026-08-02 to 2026-08-02; Owner scope | VND | 600,000 | 600,000 | 0 | PASS |
| KPI: open work | Owner role dashboard tasks | 2026-08-02 to 2026-08-02; Owner scope | count | 3 | 3 | 0 | PASS |
| Revenue chart / tooltip: 2026-08-02 | Customer ledger sale-delivery debit entries | 2026-08-02 to 2026-08-02; Owner scope | VND | 400,000 | 400,000 | 0 | PASS |
| Cash chart | Cash transactions | 2026-08-02 to 2026-08-02; Owner scope | VND | 0 (empty series) | Correct empty state | 0 | PASS |
| Top product | Sales-order lines, quantity-descending | 2026-08-02 to 2026-08-02; Owner scope | bao | 15 | 15 | 0 | PASS |
| Attention: approve work | Owner role dashboard | 2026-08-02 to 2026-08-02; Owner scope | count | 1 | 1 | 0 | PASS |
| Attention: resolve import | Owner role dashboard | 2026-08-02 to 2026-08-02; Owner scope | count | 2 | 2 | 0 | PASS |

The revenue column tooltip exactly matched the rendered authoritative date/value. KPI and chart source labels declared VND and the same selected range; the top-product list retained its source unit.

## Filter and empty-state integrity

- The normal GET range propagated to the two date inputs and every rendered source section.
- A reversed GET range (`2026-08-03` to `2026-08-02`) normalized to `2026-08-02` through `2026-08-03` in both controls and the read model.
- An empty selected period rendered the shipped revenue, cash, and top-product empty states.
- The current dashboard ships GET date filtering but no drill-down control; no unshipped drill-down behavior was inferred.

```text
DASHBOARD_KPI_RECONCILIATION=PASS
DASHBOARD_CHART_RECONCILIATION=PASS
DASHBOARD_FILTER_INTEGRITY=PASS
UNEXPLAINED_DASHBOARD_DIFF=NONE
R-045=PASS
```
