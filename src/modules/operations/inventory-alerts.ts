import { stockBalance } from "./selectors";
import type { OperationsState } from "./types";

export type InventoryStockAlert = {
  productUnitId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  minimumQuantity: number;
  status: "out_of_stock" | "low_stock";
};

export function getInventoryStockAlerts(state: OperationsState): InventoryStockAlert[] {
  return state.productUnits.flatMap((product) => (product.reorderPolicies ?? []).flatMap((policy) => {
    const warehouse = state.warehouses.find((item) => item.id === policy.warehouseId && item.status === "active");
    if (!warehouse) return [];
    const quantity = stockBalance(state, warehouse.id, product.id);
    if (quantity > policy.minimumQuantity) return [];
    const status: InventoryStockAlert["status"] = quantity <= 0 ? "out_of_stock" : "low_stock";
    return [{
      productUnitId: product.id,
      productName: product.productName,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      quantity,
      minimumQuantity: policy.minimumQuantity,
      status
    }];
  })).sort((left, right) => left.status.localeCompare(right.status) || left.productName.localeCompare(right.productName));
}
