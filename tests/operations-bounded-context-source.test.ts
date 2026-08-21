import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentsRoot = join(process.cwd(), "src", "components");
const moduleWorkspace = readFileSync(join(componentsRoot, "erp-v2", "module-workspace.tsx"), "utf8");

describe("ERP V2 bounded-context composition", () => {
  it("keeps the ERP V2 workspace as a thin route composition entry", () => {
    expect(moduleWorkspace).toContain("export function ErpV2ModuleWorkspace");
    expect(moduleWorkspace).toContain("<OperationsModuleRouter");
    expect(moduleWorkspace.split(/\r?\n/).length).toBeLessThan(180);
    expect(moduleWorkspace).not.toContain("function SalesView");
    expect(moduleWorkspace).not.toContain("function InventoryView");
    expect(moduleWorkspace).not.toContain("function CashView");
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
    expect(existsSync(join(componentsRoot, "erp-v2", "modules", fileName))).toBe(true);
  });

  it("keeps server mutations in the dedicated runtime boundary", () => {
    const runtime = readFileSync(join(componentsRoot, "erp-v2", "modules", "use-operations-runtime.ts"), "utf8");
    expect(runtime).toContain("runErpV2OperationAction");
    expect(runtime).toContain("runErpV2CreateCommandAction");
    expect(runtime).toContain("idempotencyKey: crypto.randomUUID()");
    expect(moduleWorkspace).not.toContain("runErpV2OperationAction");
  });
});
