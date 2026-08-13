import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { buildMobileManagementModules } from "../src/server/mobile/mobile-management-service";

const managementModules = [
  "masterData",
  "sales",
  "procurement",
  "delivery",
  "inventory",
  "receivables",
  "payables",
  "cash",
  "workforce",
  "import",
  "audit",
  "reporting"
];

describe("mobile management native records", () => {
  it("projects native records for every visible management module without a placeholder state", () => {
    const modules = buildMobileManagementModules(createInitialOperationsState(), managementModules, "owner");

    expect(modules).toHaveLength(managementModules.length);
    expect(modules.every((module) => Array.isArray(module.records))).toBe(true);
    expect(modules.find((module) => module.id === "masterData")?.records.length).toBeGreaterThan(0);
    expect(modules.find((module) => module.id === "reporting")?.records).toContainEqual(expect.objectContaining({ id: "report:sales" }));
  });

  it("only exposes native confirmation actions for authorized sales and procurement records", () => {
    const state = createInitialOperationsState();
    const ownerModules = buildMobileManagementModules(state, ["sales", "procurement"], "owner");
    const salesModule = ownerModules.find((module) => module.id === "sales");
    const procurementModule = ownerModules.find((module) => module.id === "procurement");

    expect(salesModule?.records.some((record) => record.action?.operation === "confirmSalesOrder"))
      .toBe(state.salesOrders.some((order) => order.status === "draft"));
    expect(procurementModule?.records.some((record) => record.action?.operation === "confirmPurchaseOrder"))
      .toBe(state.purchaseOrders.some((order) => order.status === "draft"));

    const warehouseModules = buildMobileManagementModules(state, ["sales", "procurement"], "warehouse");
    expect(warehouseModules.flatMap((module) => module.records).some((record) => record.action)).toBe(false);
  });
});
