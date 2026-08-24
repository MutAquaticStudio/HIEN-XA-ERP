import { getSelectableProducts, getSelectableWarehouses, stockBalance } from "./selectors";
import type { OperationsActor, OperationsState } from "./types";

export type InventoryStockRow = {
  warehouseId?: string;
  warehouseName?: string;
  productUnitId: string;
  productCode: string;
  productName: string;
  unitName: string;
  quantity?: number;
  movementCount: number;
  minimumQuantity?: number;
};

/**
 * The stock read model is a product x permitted-warehouse projection. When no
 * warehouse exists in scope, products remain visible but quantity is unknown,
 * never silently coerced to zero.
 */
export function buildInventoryStockRows(state: OperationsState, actor: OperationsActor): InventoryStockRow[] {
  const products = getSelectableProducts(state);
  const warehouses = getSelectableWarehouses(state, actor);
  if (warehouses.length === 0) {
    return products.map((product) => ({
      productUnitId: product.id,
      productCode: product.productCode,
      productName: product.productName,
      unitName: product.unitName,
      quantity: undefined,
      movementCount: 0
    }));
  }

  return warehouses.flatMap((warehouse) => products.map((product) => ({
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    productUnitId: product.id,
    productCode: product.productCode,
    productName: product.productName,
    unitName: product.unitName,
    quantity: stockBalance(state, warehouse.id, product.id),
    movementCount: state.inventoryMovements.filter(
      (movement) => movement.warehouseId === warehouse.id && movement.productUnitId === product.id
    ).length,
    minimumQuantity: product.reorderPolicies?.find((policy) => policy.warehouseId === warehouse.id)?.minimumQuantity
  })));
}
