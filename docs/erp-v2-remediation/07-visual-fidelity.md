# Phase 3 visual fidelity evidence (R-027)

Visual QA was run against the local owner fixture using the Codex In-app
Browser and a release-like `next start` process with `NODE_ENV=development`.
That mode is required only for the local file backend; no production or UAT
data was touched. Screenshots are actual rendered Browser captures, not build
or source substitutes.

The first pass found a mobile horizontal overflow caused by the legacy global
`table { min-width: 640px; }` rule. The Phase 3 record-card override now sets
`min-width: 0` and all target screens measure `scrollWidth <= innerWidth`.
The catalog table header was also reset to the locked slate surface instead of
the legacy green header.

| SCREEN | VIEWPORT | SCREENSHOT PATH | RESULT | ISSUES | FIX COMMIT |
|---|---|---|---|---|---|
| Dashboard | 1440x900 | `screenshots/dashboard-1440x900.png` | PASS | none | Phase 3 UI commit |
| Catalog list | 1440x900 | `screenshots/catalog-customers-1440x900.png` | PASS | none | Phase 3 UI commit |
| Customer detail | 1440x900 | `screenshots/catalog-customers-cus-minh-anh-1440x900.png` | PASS | none | Phase 3 UI commit |
| Dashboard | 1366x768 | `screenshots/dashboard-1366x768.png` | PASS | none | Phase 3 UI commit |
| Catalog list | 1366x768 | `screenshots/catalog-customers-1366x768.png` | PASS | none | Phase 3 UI commit |
| Customer detail | 1366x768 | `screenshots/catalog-customers-cus-minh-anh-1366x768.png` | PASS | none | Phase 3 UI commit |
| Dashboard | 1024x768 | `screenshots/dashboard-1024x768.png` | PASS | none | Phase 3 UI commit |
| Catalog list | 1024x768 | `screenshots/catalog-customers-1024x768.png` | PASS | none | Phase 3 UI commit |
| Customer detail | 1024x768 | `screenshots/catalog-customers-cus-minh-anh-1024x768.png` | PASS | none | Phase 3 UI commit |
| Dashboard | 390x844 | `screenshots/dashboard-390x844.png` | PASS | no horizontal overflow | Phase 3 UI commit |
| Catalog list | 390x844 | `screenshots/catalog-customers-390x844.png` | PASS | no horizontal overflow; cards used | Phase 3 UI commit |
| Customer detail | 390x844 | `screenshots/catalog-customers-cus-minh-anh-390x844.png` | PASS | single-column profile/summary | Phase 3 UI commit |
| Dashboard | 375x812 | `screenshots/dashboard-375x812.png` | PASS | no horizontal overflow | Phase 3 UI commit |
| Catalog list | 375x812 | `screenshots/catalog-customers-375x812.png` | PASS | no horizontal overflow; cards used | Phase 3 UI commit |
| Customer detail | 375x812 | `screenshots/catalog-customers-cus-minh-anh-375x812.png` | PASS | single-column profile/summary | Phase 3 UI commit |
| Dashboard | 360x800 | `screenshots/dashboard-360x800.png` | PASS | no horizontal overflow | Phase 3 UI commit |
| Catalog list | 360x800 | `screenshots/catalog-customers-360x800.png` | PASS | no horizontal overflow; cards used | Phase 3 UI commit |
| Customer detail | 360x800 | `screenshots/catalog-customers-cus-minh-anh-360x800.png` | PASS | single-column profile/summary | Phase 3 UI commit |

## Interaction/state evidence

- The mobile `Danh mục & menu` disclosure opens the full grouped navigation;
  it is a real keyboard-accessible drawer surface, not a hidden desktop menu.
- List search and status controls retain their values through URL query
  parameters.
- Customer detail tabs use URL fragments, back/forward navigation, horizontal
  scrolling on mobile, and explicit empty states when a source has no rows.
- The dashboard captures the current empty revenue/cash period honestly; it
  does not add demo values to improve the screenshot.
