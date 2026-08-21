import type { ProductUnit } from "./types";

export type CustomerOrderCatalogProduct = {
  id: string;
  code: string;
  name: string;
  unitName: string;
  salePrice?: number;
  taxRate?: number;
  /** Stable public contract: `in_stock` means eligible for order intake, not an exact warehouse assertion. */
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
    return [{
      id,
      code,
      name,
      unitName,
      ...(salePrice !== undefined ? { salePrice } : {}),
      ...(taxRate !== undefined ? { taxRate } : {}),
      orderableOnline,
      availability: commerciallyReady && orderableOnline ? "in_stock" : "quote_required"
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

function finitePositive(value: unknown) {
  const number = finiteNumber(value);
  return number > 0 ? number : undefined;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
