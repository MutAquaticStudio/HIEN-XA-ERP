import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("ERP V2 loading architecture", () => {
  it("keeps the ERP and partner shells in persistent route layouts", () => {
    const erpLayout = read("src/app/(erp)/layout.tsx");
    const customerLayout = read("src/app/(portal)/khach-hang/layout.tsx");
    const supplierLayout = read("src/app/(portal)/nha-cung-cap/layout.tsx");
    expect(erpLayout).toContain("<ErpShell");
    expect(customerLayout).toContain("<PartnerPortalFrame");
    expect(supplierLayout).toContain("<PartnerPortalFrame");
    expect(read("src/app/loading.tsx")).not.toContain("Đang tải dữ liệu");
    expect(read("src/app/loading.tsx")).not.toContain("Vui lòng chờ trong giây lát");
  });

  it("uses scoped loading and error boundaries instead of nested full-screen mains", () => {
    const scopedFiles = [
      "src/app/(erp)/loading.tsx",
      "src/app/(erp)/error.tsx",
      "src/app/(erp)/dashboard/loading.tsx",
      "src/app/(erp)/catalog/loading.tsx",
      "src/app/(portal)/khach-hang/loading.tsx",
      "src/app/(portal)/nha-cung-cap/loading.tsx",
      "src/app/dat-hang/loading.tsx"
    ];
    for (const file of scopedFiles) {
      expect(existsSync(join(root, file))).toBe(true);
      const source = read(file);
      expect(source).not.toContain('className="system-state-page"');
      expect(source).not.toMatch(/<main\b/);
    }
  });

  it("keeps the shell out of leaf page ownership and exposes bounded retry helpers", () => {
    expect(read("src/components/erp-v2/module-workspace.tsx")).not.toContain("<ErpShell");
    expect(read("src/components/erp-v2/catalog-ui.tsx")).not.toContain("<ErpShell");
    expect(read("src/components/erp-v2/modules/use-operations-runtime.ts")).toContain("hasSyncRetryBudget");
    expect(read("src/components/erp-v2/module-workspace.tsx")).toContain("Thử lại đồng bộ");
    const loadingState = read("src/components/erp-v2/route-loading-state.tsx");
    expect(loadingState).toContain("loadingTimeoutMs");
    expect(loadingState).toContain("router.refresh()");
    expect(loadingState).toContain("route-loading-timeout");
  });
});
