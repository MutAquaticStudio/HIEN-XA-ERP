# Phase 3 visual fidelity evidence (R-027)

Visual QA was run against the local owner fixture using the Codex In-app
Browser and a release-like `next start` process with `NODE_ENV=development`.
That mode is required only for the local file backend; no production or UAT
data was touched. Screenshots are actual rendered Browser captures, not build
or source substitutes.

The first pass found two real issues: the legacy global `table { min-width:
640px; }` rule caused mobile viewport overflow, and the legacy green table
header diverged from the locked slate token. A second pass found mobile record
cards breaking Vietnamese names one character at a time and detail-tab
selection showing the wrong active underline. The Phase 3 CSS now resets
mobile table sizing, gives card labels/value columns stable flex sizing,
restores the slate header, and makes URL-fragment tabs visually follow the
selected panel.

| SCREEN | VIEWPORT | SCREENSHOT PATH | RESULT | ISSUES | FIX COMMIT |
|---|---|---|---|---|---|
| Dashboard | 1440x900, 1366x768, 1024x768, 390x844, 375x812, 360x800 | `screenshots/dashboard-{1440x900,1366x768,1024x768,390x844,375x812,360x800}.png` | PASS | none; no viewport overflow | `263b589`, `679d35b` |
| Customer list/detail | all six required viewports | `screenshots/catalog-customers-*` and `screenshots/catalog-customers-cus-minh-anh-*` | PASS | mobile cards readable; no viewport overflow | `263b589`, `679d35b` |
| Supplier list/detail | 1440x900, 390x844 | `screenshots/catalog-suppliers-1440x900.png`, `catalog-suppliers-390x844.png`, `catalog-suppliers-sup-hoang-thach-1440x900.png`, `catalog-suppliers-sup-hoang-thach-390x844.png` | PASS | no clipping; mobile cards readable | `263b589`, `679d35b` |
| Product list/detail | 1440x900, 390x844 | `screenshots/catalog-products-1440x900.png`, `catalog-products-390x844.png`, `catalog-products-pu-cement-bag-1440x900.png`, `catalog-products-pu-cement-bag-390x844.png` | PASS | no clipping; unit labels readable | `263b589`, `679d35b` |
| Product unit conversion tab | 1440x900, 390x844 | `screenshots/catalog-products-pu-cement-bag-conversions-1440x900.png`, `catalog-products-pu-cement-bag-conversions-390x844.png` | PASS | URL-fragment tab active state and empty state verified | `263b589`, `679d35b` |
| Warehouse list/detail | 1440x900, 390x844 | `screenshots/catalog-warehouses-1440x900.png`, `catalog-warehouses-390x844.png`, `catalog-warehouses-wh-main-1440x900.png`, `catalog-warehouses-wh-main-390x844.png` | PASS | no clipping; derived stock remains read-only | `263b589`, `679d35b` |
| Vehicle list/detail | 1440x900, 390x844 | `screenshots/catalog-vehicles-1440x900.png`, `catalog-vehicles-390x844.png`, `catalog-vehicles-vehicle-truck-01-1440x900.png`, `catalog-vehicles-vehicle-truck-01-390x844.png` | PASS | no clipping; no fabricated telemetry | `263b589`, `679d35b` |
| Employee list/detail | 1440x900, 390x844 | `screenshots/catalog-employees-1440x900.png`, `catalog-employees-390x844.png`, `catalog-employees-emp-driver-dung-1440x900.png`, `catalog-employees-emp-driver-dung-390x844.png` | PASS | no clipping; payable remains read-only | `263b589`, `679d35b` |
| Desktop shell/navigation | covered by every desktop catalog/dashboard capture | deep-navy sidebar, grouped navigation, active module, white/slate workspace | PASS | none | `263b589`, `679d35b` |

## Responsive measurements

The Browser viewport checks measured `overflow=false` for every Phase 3 catalog
list/detail route at 1440x900 and 390x844. The dashboard and customer list/detail
also passed the remaining required viewports (1366x768, 1024x768, 375x812,
360x800). Mobile navigation opens the grouped `Danh mục & menu` disclosure;
detail tabs use URL fragments and scroll horizontally rather than compressing
into the viewport.

## Interaction/state evidence

- List search and status controls retain their values through URL query
  parameters.
- Product detail tab navigation was exercised in Browser: clicking `Quy đổi
  đơn vị` changed the URL to `#conversions`, showed only the conversion panel,
  and browser back restored the overview URL/panel.
- Missing catalog IDs render the repository not-found state.
- The dashboard captures the current empty revenue/cash period honestly; it
  does not add demo values to improve the screenshot.

`VISUAL_SCREENSHOTS=40`
`R-027=PASS`
