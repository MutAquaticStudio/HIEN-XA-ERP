# Phase 3 chart QA (R-025)

The dashboard uses `src/server/erp-v2/dashboard-read-model.ts`. The read model
is built from the projected operations state, `reconcileOperationsState`,
customer `sale_delivery` entries, and cash transactions. The UI exposes the
selected date range and an accessible table alongside the visual bars.

| CHART | QUESTION | SOURCE | FILTER | EXPECTED TOTAL | CHART TOTAL | RECONCILE RESULT | MOBILE RESULT |
|---|---|---|---|---:|---:|---|---|
| Doanh thu theo ngày | Doanh thu đã ghi nhận trong kỳ là bao nhiêu? | `customerLedgerEntries` where `entryType=sale_delivery`, debit | `2026-08-20` → `2026-08-20` | 120,000 VND | 120,000 VND | PASS | PASS: table summary and empty-safe layout at 390/375/360px |
| Thu vào / chi ra | Dòng tiền vào, ra và ròng trong kỳ là bao nhiêu? | `cashTransactions` grouped by direction | `2026-08-20` → `2026-08-20` | 80,000 / 20,000 / 60,000 VND | 80,000 / 20,000 / 60,000 VND | PASS | PASS: summary remains readable; daily table scrolls inside its panel only |
| Top vật tư trong kỳ | Vật tư nào phát sinh nhiều nhất theo dòng đơn bán? | `salesOrders.lines` joined to projected `productUnits` | selected order-date range | source line quantities | same source quantities | PASS: read-model unit and ordering are preserved | PASS: card list on mobile |

## State and interaction checks

- Reversed or invalid date ranges normalize to a safe ordered range; no value
  is invented (`tests/dashboard-read-model.test.ts`).
- A supported empty period returns one zero row per day and an explicit empty
  state instead of a fake chart (`tests/dashboard-read-model.test.ts`).
- Tooltip text includes the full date and VND amount; the HTML table is the
  accessible value summary.
- Loading and error states are provided by `src/app/dashboard/loading.tsx` and
  `src/app/dashboard/error.tsx`.
- The date form round-trips `from` and `to` through the URL. No independent
  accounting formula is calculated in the chart component.
