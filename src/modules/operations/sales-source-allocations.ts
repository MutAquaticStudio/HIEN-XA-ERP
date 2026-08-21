import type { SalesOrderLine, SalesSourceAllocation } from "./types";

export function salesSourceAllocations(line: SalesOrderLine): SalesSourceAllocation[] {
  if (line.allocations) return line.allocations;
  if (!line.sourceType) return [];
  return [{
    id: `legacy-${line.id}`,
    sourceType: line.sourceType,
    warehouseId: line.warehouseId,
    purchaseOrderLineId: line.purchaseOrderLineId,
    allocatedQuantity: line.quantity,
    deliveredQuantity: line.deliveredQuantity,
    version: 1,
    status: line.deliveredQuantity >= line.quantity ? "fulfilled" : "allocated"
  }];
}

export function setSalesSourceAllocations(line: SalesOrderLine, allocations: SalesSourceAllocation[]) {
  line.allocations = allocations;
  const single = allocations.length === 1 ? allocations[0] : undefined;
  line.sourceType = single?.sourceType;
  line.warehouseId = single?.warehouseId;
  line.purchaseOrderLineId = single?.purchaseOrderLineId;
}

export function hasOpenWarehouseAllocation(line: SalesOrderLine) {
  return salesSourceAllocations(line).some((allocation) =>
    allocation.sourceType === "warehouse" &&
    allocation.status !== "cancelled" &&
    allocation.deliveredQuantity < allocation.allocatedQuantity
  );
}

export function openAllocationQuantity(allocation: SalesSourceAllocation) {
  return Math.max(allocation.allocatedQuantity - allocation.deliveredQuantity, 0);
}

export function syncAllocationStatus(allocation: SalesSourceAllocation) {
  allocation.status = allocation.deliveredQuantity >= allocation.allocatedQuantity ? "fulfilled" : "allocated";
  allocation.version += 1;
}
