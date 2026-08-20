# R-040 — Phase 5 responsive rendered QA

Date: 2026-08-20

## Environment

- Surface: Codex in-app browser
- Target: isolated local fixture at `http://127.0.0.1:3102`
- Fixture storage: `continue-the-existing-hi-n-xa/outputs/phase5-local-qa`
- Account: fixture owner created only for this local QA run
- Production data, production environment and deployment: not used

## Required viewport results

| Viewport | Checked surfaces | Rendered result |
| --- | --- | --- |
| 1024×768 | Sales, Purchase, Inventory, Workforce, Accounting Export | All five module headings rendered; effective document width was 1009px, below 1024px. |
| 390×844 | Inventory | Derived stock cards, movement/reversal trace, opening-stock, transfer and count-session controls rendered; effective document width 375px. |
| 375×812 | Workforce | Work output, manager assignment, worker-only output entry and payment surfaces rendered; effective document width 360px. |
| 360×800 | Accounting Export | Date range, dataset/sheet controls and XLSX action rendered; effective document width 345px. |

No page-level horizontal overflow was detected in the checked viewports.

## Responsive correction made during QA

At narrow phone widths, legacy data-card rows were visually cramped because labels and values shared a two-column grid. The `max-width: 479px` rule now stacks each label above its value. This keeps Vietnamese material names, quantities and status values readable in inventory and workforce cards while preserving all data.

## Other rendered checks

- Navigation condenses to the existing **Mở menu** control at 1024px and below; module selection remained usable.
- The inventory history shows the opening movement and its reversal action as traceable operations, not an editable balance cell.
- Workforce manager assignment is present and safely disabled when no open sales WorkOrder exists.
- Accounting export action was clicked on the local fixture with no browser console errors.

The browser viewport override was reset and browser tabs were finalized after the QA run.
