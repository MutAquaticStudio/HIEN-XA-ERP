import { describe, expect, it } from "vitest";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import {
  createDeterministicLegacyUuid,
  createLegacyIdMap,
  inspectOperationsStateForCutover,
  reconcileOperationsCutover
} from "../src/server/infrastructure/operations-cutover";

describe("operations cutover rehearsal", () => {
  it("produces a deterministic, reconcilable manifest for a valid runtime snapshot", () => {
    const state = createInitialOperationsState();
    const first = inspectOperationsStateForCutover(state, {
      namespace: "operations",
      revision: 42,
      stateSchemaVersion: 1,
      now: "2026-07-28T00:00:00.000Z"
    });
    const second = inspectOperationsStateForCutover(structuredClone(state), {
      namespace: "operations",
      revision: 42,
      stateSchemaVersion: 1,
      now: "2026-07-28T00:00:00.000Z"
    });

    expect(first.ready).toBe(true);
    expect(first.sourceChecksum).toBe(second.sourceChecksum);
    expect(first.totals.entityCounts.salesOrders).toBe(1);
    expect(first.totals.stockByWarehouseProduct["wh-main:pu-brick-vien"]).toEqual({ quantity: 10000, value: 9500000 });
    expect(reconcileOperationsCutover(first, second)).toEqual({ matches: true, differences: [] });
  });

  it("fails closed on duplicate legacy ids and unmapped foreign references", () => {
    const state = createInitialOperationsState();
    state.customers.push(structuredClone(state.customers[0]));
    state.salesOrders[0].customerId = "missing-customer";
    state.purchaseUnitConversions.push({
      id: "conversion-with-missing-unit",
      productUnitId: "pu-cement-bag",
      unitId: "missing-unit",
      conversionMode: "fixed",
      factorToBase: 1,
      version: 1,
      updatedAt: "2026-07-28T00:00:00.000Z"
    });

    const manifest = inspectOperationsStateForCutover(state, {
      namespace: "operations",
      revision: 43,
      stateSchemaVersion: 1,
      now: "2026-07-28T00:00:00.000Z"
    });

    expect(manifest.ready).toBe(false);
    expect(manifest.issues.map((issue) => issue.code)).toContain("DUPLICATE_LEGACY_ID");
    expect(manifest.issues.map((issue) => issue.code)).toContain("UNMAPPED_REFERENCE");
    expect(manifest.issues.some((issue) => issue.path === "purchaseUnitConversions.unitId")).toBe(true);
  });

  it("reports a changed target total as a failed reconciliation", () => {
    const state = createInitialOperationsState();
    const expected = inspectOperationsStateForCutover(state, {
      namespace: "operations",
      revision: 44,
      stateSchemaVersion: 1,
      now: "2026-07-28T00:00:00.000Z"
    });
    const actual = structuredClone(expected);
    actual.totals.entityCounts.customers += 1;

    const result = reconcileOperationsCutover(expected, actual);
    expect(result.matches).toBe(false);
    expect(result.differences).toContain("totals.entityCounts.customers differs (expected 2, actual 3).");
  });

  it("creates stable UUIDv5-compatible legacy mappings before child rows are loaded", () => {
    const map = createLegacyIdMap(createInitialOperationsState());
    const customer = map.find((entry) => entry.entityType === "customer" && entry.legacyId === "cus-minh-anh");
    const salesLine = map.find((entry) => entry.entityType === "sales_order_item" && entry.legacyId === "so-001-line-cement");

    expect(customer?.targetId).toBe(createDeterministicLegacyUuid("operations", "customer", "cus-minh-anh"));
    expect(customer?.targetId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(salesLine).toBeDefined();
  });

  it("fails closed when a runtime location point has no stable legacy id", () => {
    const state = createInitialOperationsState();
    state.workOrders[0].locationHistory = [{
      employeeId: "emp-worker-nam",
      recordedAt: "2026-07-28T00:00:00.000Z",
      latitude: 20.9,
      longitude: 106.7,
      source: "gps"
    }];

    expect(() => createLegacyIdMap(state)).toThrow("CUTOVER_LEGACY_ID_REQUIRED");
  });
});
