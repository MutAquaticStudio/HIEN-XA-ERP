# R-046 — Final rendered visual QA

Date: 2026-08-20

## Isolated local environment

- Surface: Codex in-app browser.
- Target: `http://127.0.0.1:3103` using a fresh file-backed Phase 6 fixture and a fixture-only owner account.
- Production and staging data, deployments, uploads and migrations: not used.

## Rendered results

| Viewport | Surfaces | Result |
| --- | --- | --- |
| 1024 x 768 | Sales, Purchase, Inventory, Workforce, Accounting Export | All headings and primary operational sections rendered. Each observed document width was `1009px`, matching the effective client width with no horizontal overflow. |
| 390 x 844 | Inventory | Derived stock, immutable movement history/reversal, opening stock, transfer and stocktake controls rendered. `scrollWidth=375`, `clientWidth=375`; Vietnamese labels were visible. |
| 375 x 812 | Workforce | Work output, compensation/payment, active-worker assignment and work form rendered. `scrollWidth=360`, `clientWidth=360`. |
| 360 x 800 | Accounting Export | Date range, selected-sheet controls and enabled XLSX action rendered. `scrollWidth=345`, `clientWidth=345`. |

Browser console error logs were empty for each checked surface. Two real screenshots were captured during the 390px Inventory and 360px Accounting Export checks. The temporary viewport override was reset and the local browser tab finalized.

The public Playwright runner remains separately blocked because its Chromium executable is absent; this does not invalidate the in-app rendered observation, but it remains release-blocking.

```text
LOCAL_RENDERED_QA=PASS
PUBLIC_PLAYWRIGHT=BLOCKED (missing chromium_headless_shell)
R-046=PASS (isolated local rendered gate)
```
