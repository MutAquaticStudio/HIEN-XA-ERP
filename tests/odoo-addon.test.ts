import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const addonRoot = join(process.cwd(), "odoo_addons", "vlxd_operations");

function readAddonFile(path: string) {
  return readFileSync(join(addonRoot, path), "utf8");
}

describe("Odoo addon scaffold", () => {
  it("declares a VLXD Odoo addon manifest", () => {
    const manifest = readAddonFile("__manifest__.py");

    expect(manifest).toContain('"name": "VLXD Operations"');
    expect(manifest).toContain('"depends": ["base", "mail"]');
    expect(manifest).toContain('"security/ir.model.access.csv"');
  });

  it("contains core Odoo models for master data and operational ledgers", () => {
    expect(readAddonFile("models/master_data.py")).toContain('_name = "vlxd.supplier"');
    expect(readAddonFile("models/sales_procurement.py")).toContain('_name = "vlxd.purchase.order"');
    expect(readAddonFile("models/ledgers.py")).toContain("Posted inventory movements are append-only");
    expect(readAddonFile("models/ledgers.py")).toContain('_name = "vlxd.customer.payment"');
    expect(readAddonFile("models/workforce.py")).toContain('_name = "vlxd.compensation.batch"');
    expect(readAddonFile("models/workforce.py")).toContain("Employee ledger entries are append-only");
    expect(readAddonFile("models/import_issue.py")).toContain('_name = "vlxd.import.issue"');
  });

  it("declares owner access and Odoo window actions", () => {
    const access = readAddonFile("security/ir.model.access.csv");
    const menu = readAddonFile("views/menu.xml");

    expect(access).toContain("model_vlxd_purchase_order,group_owner,1,1,1,0");
    expect(access).toContain("model_vlxd_inventory_movement,group_owner,1,0,1,0");
    expect(access).toContain("model_vlxd_customer_payment,group_owner,1,1,1,0");
    expect(menu).toContain('<field name="res_model">vlxd.purchase.order</field>');
    expect(menu).toContain('<menuitem id="menu_inventory_movements"');
  });
});
