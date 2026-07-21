import { describe, expect, it } from "vitest";
import { createRoleDashboard } from "../src/modules/operations/role-dashboard";
import { dashboardRoleForActor, visibleModulesForRole } from "../src/modules/operations/identity";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { createOwnerActor, runOperation } from "../src/modules/operations/service";
import type { OperationName, OperationsState } from "../src/modules/operations/types";

const now = "2026-07-16T10:00:00.000+07:00";

function run(state: OperationsState, operation: OperationName, key: string = operation) {
  return runOperation({
    state,
    operation,
    actor: createOwnerActor(),
    now,
    idempotencyKey: `role-dashboard-${key}-12345`,
    options: operation === "completeDelivery"
      ? { recipientName: "Nguyễn Văn Nhận", evidence: "Biên bản giao nhận TEST-DASHBOARD" }
      : undefined
  }).state;
}

describe("role-based operations dashboard", () => {
  it("keeps restricted roles on their own dashboard and module scope", () => {
    const roles = [
      "owner",
      "administrator",
      "accountant",
      "sales",
      "warehouse",
      "dispatcher",
      "driver",
      "supervisor",
      "worker",
      "viewer"
    ] as const;

    expect(Object.fromEntries(roles.map((role) => [role, visibleModulesForRole(role)]))).toEqual({
      owner: ["overview", "masterData", "sales", "procurement", "delivery", "inventory", "receivables", "payables", "cash", "workforce", "import", "audit", "reporting"],
      administrator: ["overview", "masterData", "sales", "procurement", "delivery", "inventory", "receivables", "payables", "cash", "workforce", "import", "audit", "reporting"],
      accountant: ["overview", "sales", "procurement", "delivery", "inventory", "receivables", "payables", "cash", "workforce", "import", "audit", "reporting"],
      sales: ["overview", "masterData", "sales", "delivery", "receivables"],
      warehouse: ["overview", "masterData", "procurement", "delivery", "inventory"],
      dispatcher: ["overview", "masterData", "sales", "procurement", "delivery"],
      driver: ["overview", "delivery"],
      supervisor: ["overview", "masterData", "delivery", "workforce"],
      worker: ["overview", "procurement", "delivery", "workforce"],
      viewer: ["overview", "sales"]
    });
    expect(dashboardRoleForActor("driver")).toBe("driver");
  });

  it("shows owner financial control metrics from ledgers and cash movements", () => {
    let state = createInitialOperationsState();
    state = run(state, "confirmSalesOrder");
    state = run(state, "allocateSalesSources");
    state = run(state, "postGoodsReceipt");
    state = run(state, "confirmDirectDelivery");
    state = run(state, "startDeliveryLoading");
    state = run(state, "dispatchDelivery");
    state = run(state, "completeDelivery");
    state = run(state, "confirmCustomerPayment");

    const dashboard = createRoleDashboard(state, "owner");
    const metricIds = dashboard.metrics.map((metric) => metric.id);

    expect(metricIds).toContain("cash_balance");
    expect(metricIds).toContain("customer_receivable");
    expect(metricIds).toContain("supplier_payable");
    expect(dashboard.tasks.some((task) => task.id === "resolve_import" && task.count > 0)).toBe(true);
  });

  it("keeps driver and warehouse dashboards away from cash, COGS, and profit metrics", () => {
    const state = createInitialOperationsState();
    const restrictedDashboards = [createRoleDashboard(state, "driver"), createRoleDashboard(state, "warehouse")];

    for (const dashboard of restrictedDashboards) {
      const metricText = dashboard.metrics.map((metric) => `${metric.id} ${metric.label} ${metric.note}`).join(" ");

      expect(dashboard.metrics.some((metric) => metric.id === "cash_balance")).toBe(false);
      expect(metricText).not.toMatch(/profit|COGS|lợi nhuận|quỹ|cash/i);
      expect(dashboard.privacyNote).toMatch(/ẩn|không hiển thị/i);
    }
  });

  it("gives workers only their work and own compensation balance", () => {
    let state = createInitialOperationsState();
    state = run(state, "approveWorkOutput");
    state = run(state, "postCompensation");

    const dashboard = createRoleDashboard(state, "worker");

    expect(dashboard.metrics.map((metric) => metric.id)).toEqual([
      "assigned_work",
      "submitted_work",
      "approved_work",
      "worker_balance"
    ]);
    expect(dashboard.metrics.find((metric) => metric.id === "worker_balance")?.value).toBe(180000);
    expect(dashboard.privacyNote).toContain("không hiện công nợ");
  });
});
