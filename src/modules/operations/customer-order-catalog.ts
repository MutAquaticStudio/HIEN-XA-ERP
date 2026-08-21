import type { ProductUnit } from "./types";

export type CustomerOrderCatalogProduct = {
  id: string;
  code: string;
  name: string;
  unitName: string;
  salePrice?: number;
  taxRate?: number;
  /** Safe public policy signal; internal pricing and warehouse data never cross this boundary. */
  orderableOnline: boolean;
  /** A public item may be visible before its commercial policy is complete. */
  availability: "in_stock" | "out_of_stock" | "quote_required";
};

/** Legacy JSON/JSONB runtime documents predate these fields and remain enabled by default. */
export function isCustomerPortalProductVisible(product: Pick<ProductUnit, "visibleOnCustomerPortal">) {
  return product.visibleOnCustomerPortal !== false;
}

export function isCustomerPortalProductOrderable(product: Pick<ProductUnit, "orderableOnline">) {
  return product.orderableOnline !== false;
}

export function publicProductPrice(product: Pick<ProductUnit, "salePrice" | "saleTaxRate">) {
  const salePrice = finitePositive(product.salePrice);
  const taxRate = isFiniteNonNegative(product.saleTaxRate) ? product.saleTaxRate : undefined;
  return salePrice !== undefined && taxRate !== undefined
    ? { salePrice, taxRate }
    : undefined;
}

export function hasPublicProductPrice(product: Pick<ProductUnit, "salePrice" | "saleTaxRate">) {
  return Boolean(publicProductPrice(product));
}

/**
 * Purpose-specific public customer contract. The source state may contain
 * costs, margins, suppliers, movement rows, audit logs, and RBAC metadata;
 * this function constructs a new allow-listed DTO and never forwards them.
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
    if (!id || !code || !name || !unitName || product.status !== "active" || product.visibleOnCustomerPortal === false) {
      return [];
    }

    const salePrice = finitePositive(product.salePrice);
    const taxRate = isFiniteNonNegative(product.saleTaxRate) ? product.saleTaxRate : undefined;
    const commerciallyReady = salePrice !== undefined && taxRate !== undefined;
    const orderableOnline = product.orderableOnline !== false;
    const availableQuantity = availableCustomerOrderQuantity({ warehouses, inventoryMovements: movements }, id);
    return [{
      id,
      code,
      name,
      unitName,
      ...(salePrice !== undefined ? { salePrice } : {}),
      ...(taxRate !== undefined ? { taxRate } : {}),
      orderableOnline,
      availability: commerciallyReady && orderableOnline
        ? (availableQuantity > 0 ? "in_stock" : "out_of_stock")
        : "quote_required"
    }];
  });
}

/** Availability remains server-side and is reused by the order command. */
export function availableCustomerOrderQuantity(
  state: { warehouses?: unknown; inventoryMovements?: unknown },
  productUnitId: string
) {
  const warehouses = Array.isArray(state.warehouses) ? state.warehouses : [];
  const movements = Array.isArray(state.inventoryMovements) ? state.inventoryMovements : [];
  return Math.max(0, warehouses.reduce((total, warehouseValue) => {
    const warehouse = asRecord(warehouseValue);
    const warehouseId = text(warehouse.id);
    if (!warehouseId || (warehouse.status !== undefined && warehouse.status !== "active")) return total;
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

function finitePositive(value: unknown) {
  const number = finiteNumber(value);
  return number > 0 ? number : undefined;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
