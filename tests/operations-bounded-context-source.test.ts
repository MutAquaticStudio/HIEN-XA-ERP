import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentsRoot = join(process.cwd(), "src", "components");
const operationsApp = readFileSync(join(componentsRoot, "operations-app.tsx"), "utf8");

describe("operations bounded-context composition", () => {
  it("keeps OperationsApp as a thin compatible composition entry", () => {
    expect(operationsApp).toContain("export function OperationsApp");
    expect(operationsApp).toContain("<OperationsModuleRouter");
    expect(operationsApp.split(/\r?\n/).length).toBeLessThan(400);
    expect(operationsApp).not.toContain("function SalesView");
    expect(operationsApp).not.toContain("function InventoryView");
    expect(operationsApp).not.toContain("function CashView");
  });

  it.each([
    "overview-view.tsx",
    "catalog-view.tsx",
    "sales-view.tsx",
    "procurement-view.tsx",
    "inventory-view.tsx",
    "delivery-view.tsx",
    "receivables-view.tsx",
    "payables-view.tsx",
    "cash-view.tsx",
    "workforce-view.tsx",
    "import-view.tsx",
    "reporting-view.tsx",
    "audit-view.tsx"
  ])("extracts %s into the bounded-context directory", (fileName) => {
    expect(existsSync(join(componentsRoot, "operations", fileName))).toBe(true);
  });

  it("keeps server mutations in the dedicated runtime boundary", () => {
    const runtime = readFileSync(join(componentsRoot, "operations", "use-operations-runtime.ts"), "utf8");
    expect(runtime).toContain("runDemoOperationAction");
    expect(runtime).toContain("runDemoCreateCommandAction");
    expect(runtime).toContain("idempotencyKey: crypto.randomUUID()");
    expect(operationsApp).not.toContain("runDemoOperationAction");
  });
});
