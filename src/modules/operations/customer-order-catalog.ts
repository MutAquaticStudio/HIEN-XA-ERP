export type CustomerOrderCatalogProduct = {
  id: string;
  code: string;
  name: string;
  unitName: string;
  salePrice?: number;
  taxRate?: number;
  /** A public item may be visible before its commercial policy is complete. */
  availability: "in_stock" | "out_of_stock" | "quote_required";
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
    const hasPublicPrice = salePrice > 0;
    const hasPublicTaxRate = isFiniteNonNegative(product.saleTaxRate);

    if (!id || !code || !name || !unitName || product.status !== "active") {
      return [];
    }

    const availableQuantity = availableCustomerOrderQuantity({ warehouses, inventoryMovements: movements }, id);
    const orderableNow = hasPublicPrice && hasPublicTaxRate;
    return [{
      id,
      code,
      name,
      unitName,
      ...(hasPublicPrice ? { salePrice } : {}),
      ...(hasPublicTaxRate ? { taxRate: finiteNonNegative(product.saleTaxRate) } : {}),
      availability: orderableNow ? (availableQuantity > 0 ? "in_stock" : "out_of_stock") : "quote_required"
    }];
  });
}

/**
 * Availability remains server-side. Customer projections only receive a safe
 * status, while commands reuse this calculation before they create a draft.
 */
export function availableCustomerOrderQuantity(
  state: { warehouses?: unknown; inventoryMovements?: unknown },
  productUnitId: string
) {
  const warehouses = Array.isArray(state.warehouses) ? state.warehouses : [];
  const movements = Array.isArray(state.inventoryMovements) ? state.inventoryMovements : [];
  return Math.max(0, warehouses.reduce((total, warehouseValue) => {
    const warehouseId = text(asRecord(warehouseValue).id);
    if (!warehouseId) return total;
    return total + movements.reduce((quantity, movementValue) => {
      const movement = asRecord(movementValue);
      return movement.warehouseId === warehouseId && movement.productUnitId === productUnitId
        ? quantity + finiteNumber(movement.quantity)
        : quantity;
    }, 0);
  }, 0));
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteNonNegative(value: unknown) {
  return isFiniteNumber(value) && value >= 0;
}
