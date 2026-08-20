# Conditional production cutover plan

Date: 2026-08-20

This plan is conditional only. It must not be executed while `FINAL_GATE_E=NOT_READY`.

1. Obtain the existing staging-only integration secret through an authorized secure channel and provide the dedicated UAT credentials without placing them in source, logs, screenshots, or Git.
2. Run the repository-supported staging contract, fixture, reconciliation, dashboard, authenticated isolation, public Playwright, and visual gates against `https://uat.hienxavlxd.com`.
3. Re-run the complete safe regression and security gates. Proceed only when every Gate E requirement is PASS.
4. Capture the required read-only production Worker/version/health/header snapshot and record the rollback Worker version. Confirm no D1 schema change is required.
5. Create or update one PR from `codex/erp-v2-go-live-20260820` to `main`; respect repository protection and required approvals.
6. Deploy only the approved merged SHA through the repository-supported Cloudflare Linux build path.
7. Perform read-only production smoke. If a release-critical issue appears, immediately restore the recorded Worker version and verify the previous health without modifying D1 data.

No production snapshot, merge, deployment, or rollback action was started in this checkpoint.
