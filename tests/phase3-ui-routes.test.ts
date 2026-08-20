import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const kinds = ["customers", "suppliers", "products", "warehouses", "vehicles", "employees"];

describe("ERP V2 Phase 3 catalog route contract", () => {
  it("has addressable list and detail routes for every catalog family", () => {
    for (const kind of kinds) {
      expect(existsSync(resolve(root, `src/app/catalog/${kind}/page.tsx`))).toBe(true);
      expect(existsSync(resolve(root, `src/app/catalog/${kind}/[id]/page.tsx`))).toBe(true);
    }
  });

  it("keeps every detail route behind the shared server-side catalog guard", () => {
    for (const kind of kinds) {
      const source = readFileSync(resolve(root, `src/app/catalog/${kind}/[id]/page.tsx`), "utf8");
      expect(source).toContain("requireCatalogAccess");
      expect(source).toContain("findCatalogRecord");
    }
  });

  it("keeps the route map additive and dashboard chart data model authoritative", () => {
    const routeMap = readFileSync(resolve(root, "docs/erp-v2-remediation/07-route-map-v2.md"), "utf8");
    expect(routeMap).toContain("/catalog/customers");
    expect(routeMap).toContain("/catalog/employees/[id]");
    const chartSource = readFileSync(resolve(root, "src/server/erp-v2/dashboard-read-model.ts"), "utf8");
    expect(chartSource).toContain("reconcileOperationsState");
    expect(chartSource).not.toMatch(/demo|fallback|seed/i);
  });
});
