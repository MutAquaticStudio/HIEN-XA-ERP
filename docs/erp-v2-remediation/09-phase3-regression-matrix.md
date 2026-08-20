# Phase 3 regression matrix (R-021 to R-027)

| Capability | Baseline evidence | Phase 3 impact | Targeted Phase 3 evidence | Result boundary |
|---|---|---|---|---|
| Login/RBAC | auth/projection tests; `requirePageIdentityUser` | New catalog pages and navigation visibility | route authorization tests | preserve server-side scope |
| Customer/Supplier master | create-command and selector tests | list/detail read-only presentation | route/detail tests | no editable derived balances |
| Product/unit master | unit snapshot and portal tests | product detail presents accepted conversion contract | detail/read-model tests | no invented factors |
| Warehouse/inventory | inventory invariant and scope tests | stock/movement read-only detail | route/detail tests | no editable stock balance |
| Employee/workforce | worker claim/projection tests | employee detail presentation | route/detail tests | no editable payable |
| Vehicle/delivery | delivery authorization/selector tests | vehicle detail without telemetry fabrication | route/detail tests | current data only |
| Dashboard/reporting | monthly-report, role-dashboard, reconciliation tests | authoritative KPIs/charts and reconciliation | chart read-model tests | omit unsupported metrics |
| Portal catalog | public-safe portal tests | no portal contract changes | existing regression rerun | preserve Phase 2 contract |
| Financial/inventory/audit/idempotency | characterization set in `00-phase3-baseline.md` | UI is read-only for these balances | full unit rerun | no domain regression |
| Responsive/visual | previous browser baseline blocked | new Phase 3 rendered QA, including the mobile card-wrap follow-up | 40 Codex In-app Browser screenshots and viewport measurements | PASS in the available local Browser runtime; CLI Playwright remains environment-blocked |

Phase 3 intentionally excludes Sales/Purchase workflow redesign, inventory
opening UX, workforce workflow changes, export redesign, and all R-028+ work.
