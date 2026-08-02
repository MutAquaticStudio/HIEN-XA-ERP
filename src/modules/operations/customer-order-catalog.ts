export type CustomerOrderCatalogProduct = {
  id: string;
  code: string;
  name: string;
  unitName: string;
  salePrice: number;
  taxRate: number;
  availableQuantity: number;
};

/**
 * Public customer ordering must remain readable while a legacy runtime
 * document is being reconciled. Invalid or missing inventory data is shown as
 * zero available stock rather than causing a server-render failure.
 */
export function buildCustomerOrderCatalog(state: unknown): CustomerOrderCatalogProduct[] {
  const record = asRecord(state);
  const products = Array.isArray(record.productUnits) ? record.productUnits : [];
  const warehouses = Array.isArray(record.warehouses) ? record.warehouses : [];
  const movements = Array.isArray(record.inventoryMovements) ? record.inventoryMovements : [];

  return products.flatMap((value) => {
    const product = asRecord(value);
    const id = text(product.id);
    const code = text(product.productCode);
    const name = text(product.productName);
    const unitName = text(product.unitName);
    const salePrice = finiteNonNegative(product.salePrice);

    if (!id || !code || !name || !unitName || product.status !== "active" || salePrice <= 0) {
      return [];
    }

    const availableQuantity = warehouses.reduce((total, warehouseValue) => {
      const warehouseId = text(asRecord(warehouseValue).id);
      if (!warehouseId) return total;
      return total + movements.reduce((quantity, movementValue) => {
        const movement = asRecord(movementValue);
        return movement.warehouseId === warehouseId && movement.productUnitId === id
          ? quantity + finiteNumber(movement.quantity)
          : quantity;
      }, 0);
    }, 0);

    return [{
      id,
      code,
      name,
      unitName,
      salePrice,
      taxRate: finiteNonNegative(product.saleTaxRate),
      availableQuantity: Math.max(0, availableQuantity)
    }];
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function finiteNonNegative(value: unknown) {
  return Math.max(0, finiteNumber(value));
}
