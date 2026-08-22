import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routes = [
  "dashboard",
  "catalog/customers",
  "catalog/suppliers",
  "catalog/products",
  "catalog/warehouses",
  "catalog/vehicles",
  "catalog/employees",
  "sales/orders",
  "sales/orders/[id]",
  "procurement/orders",
  "procurement/orders/[id]",
  "inventory/stock",
  "inventory/movements",
  "inventory/counts",
  "delivery/jobs",
  "delivery/jobs/[id]",
  "receivables",
  "payables",
  "cash",
  "workforce/orders",
  "compensation",
  "import",
  "audit",
  "reporting",
  "khach-hang",
  "khach-hang/don-hang",
  "khach-hang/don-hang/[id]",
  "khach-hang/thanh-toan",
  "khach-hang/theo-doi",
  "khach-hang/xac-nhan-giao",
  "dat-hang",
  "nha-cung-cap",
  "nha-cung-cap/don-mua",
  "nha-cung-cap/don-mua/[id]",
  "nha-cung-cap/giao-hang",
  "nha-cung-cap/thanh-toan"
] as const;

function routeFile(route: string) {
  const segment = route.startsWith("khach-hang") ? "(portal)"
    : route.startsWith("nha-cung-cap") ? "(portal)"
      : route === "dat-hang" ? ""
        : "(erp)";
  return segment ? join(process.cwd(), "src", "app", segment, ...route.split("/"), "page.tsx") : join(process.cwd(), "src", "app", ...route.split("/"), "page.tsx");
}

describe("ERP V2 canonical route map", () => {
  it.each(routes)("ships /%s", (route) => {
    expect(existsSync(routeFile(route))).toBe(true);
  });

  it("uses role redirects and has no V1 root application entrypoint", () => {
    const rootPage = readFileSync(join(process.cwd(), "src", "app", "page.tsx"), "utf8");
    expect(rootPage).toContain('"/dashboard"');
    expect(rootPage).toContain('"/khach-hang"');
    expect(rootPage).toContain('"/nha-cung-cap"');
    expect(rootPage).not.toContain("?module=");
    expect(existsSync(join(process.cwd(), "src", "components", "operations-app.tsx"))).toBe(false);
  });

  it("keeps partner portals on the ERP V2 component surface", () => {
    const legacyComponentPaths = [
      ["src", "components", "customer-account-portal.tsx"],
      ["src", "components", "supplier-account-portal.tsx"],
      ["src", "components", "customer-payment-proof-form.tsx"],
      ["src", "components", "customer-delivery-receipt-portal.tsx"],
      ["src", "components", "customer-order-preview.tsx"],
      ["src", "components", "partner-portal-nav.tsx"]
    ];
    expect(legacyComponentPaths.every((path) => !existsSync(join(process.cwd(), ...path)))).toBe(true);
    expect(readFileSync(join(process.cwd(), "src", "app", "(portal)", "khach-hang", "page.tsx"), "utf8")).toContain("CustomerPortalOverview");
    expect(readFileSync(join(process.cwd(), "src", "app", "(portal)", "nha-cung-cap", "page.tsx"), "utf8")).toContain("SupplierPortalWorkspace");
  });

  it("keeps the internal sidebar on the ERP V2 navigation surface", () => {
    const shell = readFileSync(join(process.cwd(), "src", "components", "erp-v2", "erp-shell.tsx"), "utf8");
    expect(shell).toContain('"BÁN HÀNG & MUA HÀNG"');
    expect(shell).toContain('"KHO & GIAO NHẬN"');
    expect(shell).toContain('"KIỂM SOÁT & BÁO CÁO"');
    expect(shell).toContain("ERP V2 · Nội bộ");
    expect(shell).not.toContain('"Tổng quan V2"');
  });
});
