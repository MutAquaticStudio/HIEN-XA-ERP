# R-039 — Read-only accounting XLSX export evidence

Date: 2026-08-20

## Main operational Excel surface

The reporting module is now labelled **Xuất dữ liệu kế toán**. It presents:

- a from/to date range;
- selected dataset/sheet controls for summary, sales, customer payable/receivable ledgers, cash, inventory movements and workforce ledger;
- a direct **Xuất XLSX dữ liệu kế toán** action;
- an explicit read-only explanation: the action does not create transactions or alter source records.

The former workbook import module remains intact but is labelled **Quản trị nhập liệu** and is restricted to the owner/administrator navigation scope as an admin/migration function.

## Authoritative source and workbook behavior

`createAccountingXlsxExport()` consumes `createReportForDateRange()` sections rather than reconstructing accounting totals in the UI. It packages a valid XLSX workbook with repository-owned stored-ZIP support already used by the monthly report package. No new third-party dependency was added.

The exported filename format is:

```text
du-lieu-ke-toan-YYYY-MM-DD-den-YYYY-MM-DD.xlsx
```

Every selected worksheet records the sheet title, selected date range, export time, section headers and source rows. It contains no mutation command and no production connection.

## Verification

The Phase 5 test constructs a selected-sheet workbook, validates XLSX ZIP magic, parses actual worksheet names through the repository's `read-excel-file/node` utility, and confirms the date filter excludes out-of-range cash data.

The isolated local in-app-browser QA also rendered the date range, dataset controls and direct XLSX action at 1024×768 and 360×800. The direct action was clicked locally and produced no browser console errors. Browser download event reporting timed out in the automation surface, so binary validity is established by the parser-backed focused test rather than an unverified download-event claim.
