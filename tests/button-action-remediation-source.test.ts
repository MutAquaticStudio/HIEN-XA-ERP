import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...segments: string[]) => readFileSync(join(process.cwd(), ...segments), "utf8");

describe("button/action remediation source wiring", () => {
  it("wires the exact delivery discrepancy, review and waiver operations", () => {
    const actions = read("src", "app", "actions.ts");
    const delivery = read("src", "components", "erp-v2", "modules", "delivery-view.tsx");
    expect(actions).toContain('"requestDeliveryQuantityChange"');
    expect(actions).toContain('"approveDeliveryQuantityChange"');
    expect(actions).toContain('"rejectDeliveryQuantityChange"');
    expect(actions).toContain('"waiveCustomerDeliveryReceipt"');
    expect(delivery).toContain('operation="approveDeliveryQuantityChange"');
    expect(delivery).toContain('operation="rejectDeliveryQuantityChange"');
    expect(delivery).toContain('operation="waiveCustomerDeliveryReceipt"');
    expect(delivery).toContain('actor.permissions.includes("delivery.approve_quantity_change")');
    expect(delivery).toContain('actor.permissions.includes("delivery.reject_quantity_change")');
  });

  it("exposes collection controls and requires user-entered audit reasons", () => {
    const receivables = read("src", "components", "erp-v2", "modules", "receivables-view.tsx");
    const inventoryCount = read("src", "components", "erp-v2", "modules", "inventory-count-session-panel.tsx");
    const negativeStock = read("src", "components", "erp-v2", "modules", "negative-stock-override-panel.tsx");
    expect(receivables).toContain('runOperation("assignCustomerCollectionOwner"');
    expect(receivables).toContain('runOperation("recordCustomerCollectionFollowUp"');
    expect(inventoryCount).toContain("InventoryReasonAction");
    expect(inventoryCount).not.toContain("Phiếu chưa đủ bằng chứng để duyệt.");
    expect(negativeStock).not.toContain("window.prompt");
    expect(negativeStock).toContain("rejectionReason.trim()");
  });

  it("keeps retry keys in the mounted runtime and sends upload quantities", () => {
    const runtime = read("src", "components", "erp-v2", "modules", "use-operations-runtime.ts");
    const registry = read("src", "components", "erp-v2", "mutation-intent-registry.ts");
    expect(runtime).toContain("new MutationIntentRegistry()");
    expect(runtime).toContain('formData.set("lineQuantities", JSON.stringify(options?.lineQuantities ?? {}))');
    expect(runtime).toContain("retainForRetry(intentScope, intent.idempotencyKey)");
    expect(registry).not.toMatch(/localStorage|sessionStorage/);
  });

  it("uses direct role landing and complete Vietnamese GPS labels", () => {
    const auth = read("src", "app", "auth-actions.ts");
    const controls = read("src", "components", "erp-v2", "modules", "operations-shared.tsx");
    expect(auth).toContain("landingPathForRole(user.role)");
    expect(auth).not.toContain('redirect(partnerPortal?.path ?? "/")');
    for (const label of ["Đang lấy vị trí…", "Lấy vị trí hiện tại", "Nguồn vị trí", "Vĩ độ", "Kinh độ"]) {
      expect(controls).toContain(label);
    }
  });
});
