import { describe, expect, it } from "vitest";
import { buildCustomerOrderCatalog } from "@/modules/operations/customer-order-catalog";

describe("customer order catalog projection", () => {
  it("projects public price and safe order eligibility from a valid runtime state", () => {
    const products = buildCustomerOrderCatalog({
      productUnits: [{ id: "product-1", productCode: "CAT-01", productName: "Gach mau", unitName: "Vien", status: "active", salePrice: 100_000, saleTaxRate: 0.1 }],
      warehouses: [{ id: "warehouse-1" }],
      inventoryMovements: [{ warehouseId: "warehouse-1", productUnitId: "product-1", quantity: 12 }]
    });

    expect(products).toEqual([{
      id: "product-1",
      code: "CAT-01",
      name: "Gach mau",
      unitName: "Vien",
      salePrice: 100_000,
      taxRate: 0.1,
      orderableOnline: true,
      availability: "in_stock"
    }]);
  });

  it("does not derive portal order eligibility from exact warehouse stock", () => {
    const products = buildCustomerOrderCatalog({
      productUnits: [{ id: "product-1", productCode: "CAT-01", productName: "Gach mau", unitName: "Vien", status: "active", salePrice: 100_000, saleTaxRate: 0.1 }],
      warehouses: [{ id: "warehouse-1" }]
    });

    expect(products[0]).toMatchObject({ id: "product-1", availability: "in_stock" });
    expect(JSON.stringify(products)).not.toContain("availableQuantity");
  });

  it("keeps active products visible while requiring public price and VAT before direct ordering", () => {
    const products = buildCustomerOrderCatalog({
      productUnits: [
        { id: "priced", productCode: "VT-1", productName: "Hang co gia", unitName: "Bao", status: "active", salePrice: 100_000, saleTaxRate: 0.08 },
        { id: "no-price", productCode: "VT-2", productName: "Chua dat gia", unitName: "Bao", status: "active", saleTaxRate: 0.08 },
        { id: "no-tax", productCode: "VT-3", productName: "Chua dat VAT", unitName: "Bao", status: "active", salePrice: 100_000 },
        { id: "inactive", productCode: "VT-4", productName: "Ngung dung", unitName: "Bao", status: "inactive", salePrice: 100_000, saleTaxRate: 0.08 }
      ]
    });

    expect(products).toEqual([
      expect.objectContaining({ id: "priced", availability: "in_stock", salePrice: 100_000, taxRate: 0.08 }),
      expect.objectContaining({ id: "no-price", availability: "quote_required", taxRate: 0.08 }),
      expect.objectContaining({ id: "no-tax", availability: "quote_required", salePrice: 100_000 })
    ]);
    expect(products.map((product) => product.id)).not.toContain("inactive");
  });

  it("does not apply an implicit page-size limit to public catalog items", () => {
    const products = buildCustomerOrderCatalog({
      productUnits: Array.from({ length: 51 }, (_, index) => ({
        id: `product-${index + 1}`,
        productCode: `VT-${index + 1}`,
        productName: `Vật tư ${index + 1}`,
        unitName: "Bao",
        status: "active",
        salePrice: 100_000,
        saleTaxRate: 0.08
      }))
    });

    expect(products).toHaveLength(51);
  });

  it("honors explicit hidden and online-order policy without inventing public prices", () => {
    const products = buildCustomerOrderCatalog({
      productUnits: [
        { id: "hidden", productCode: "VT-H", productName: "An khoi portal", unitName: "Bao", status: "active", salePrice: 100_000, saleTaxRate: 0.08, visibleOnCustomerPortal: false },
        { id: "quote", productCode: "VT-Q", productName: "Chi bao gia", unitName: "Bao", status: "active", salePrice: 100_000, saleTaxRate: 0.08, orderableOnline: false },
        { id: "zero", productCode: "VT-Z", productName: "Chua co gia", unitName: "Bao", status: "active", salePrice: 0, saleTaxRate: 0.08 }
      ],
      warehouses: [{ id: "warehouse-1", status: "active" }],
      inventoryMovements: [{ warehouseId: "warehouse-1", productUnitId: "quote", quantity: 5 }]
    });

    expect(products.map((product) => product.id)).toEqual(["quote", "zero"]);
    expect(products[0]).toMatchObject({ orderableOnline: false, availability: "quote_required", salePrice: 100_000, taxRate: 0.08 });
    expect(products[1]).toMatchObject({ availability: "quote_required" });
    expect(products[1]).not.toHaveProperty("salePrice");
    expect(JSON.stringify(products)).not.toMatch(/preferredSupplier|targetMargin|priceHistory|inventoryMovements|warehouse/);
  });

  it("keeps order eligibility independent of active/inactive warehouse balances", () => {
    const products = buildCustomerOrderCatalog({
      productUnits: [{ id: "product-1", productCode: "CAT-01", productName: "Gach mau", unitName: "Vien", status: "active", salePrice: 100_000, saleTaxRate: 0.1 }],
      warehouses: [{ id: "warehouse-inactive", status: "inactive" }, { id: "warehouse-active", status: "active" }],
      inventoryMovements: [
        { warehouseId: "warehouse-inactive", productUnitId: "product-1", quantity: 12 },
        { warehouseId: "warehouse-active", productUnitId: "product-1", quantity: 0 }
      ]
    });

    expect(products[0]?.availability).toBe("in_stock");
  });
});
