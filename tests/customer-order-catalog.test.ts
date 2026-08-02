import { describe, expect, it } from "vitest";
import { buildCustomerOrderCatalog } from "@/modules/operations/customer-order-catalog";

describe("customer order catalog projection", () => {
  it("projects public price and stock from a valid runtime state", () => {
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
      availableQuantity: 12
    }]);
  });

  it("fails closed to zero stock instead of crashing on a legacy state without movements", () => {
    const products = buildCustomerOrderCatalog({
      productUnits: [{ id: "product-1", productCode: "CAT-01", productName: "Gach mau", unitName: "Vien", status: "active", salePrice: 100_000 }],
      warehouses: [{ id: "warehouse-1" }]
    });

    expect(products[0]).toMatchObject({ id: "product-1", availableQuantity: 0 });
  });
});
