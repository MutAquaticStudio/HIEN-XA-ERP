import type { OperationsState, SalesSourceAllocation } from "./types";

export const ERP_V2_SOURCE_ALLOCATION_MIGRATION_VERSION = 1;

export type ErpV2MigrationIssue = {
  code: "ACTIVE_SALES_SOURCE_UNMAPPED" | "ACTIVE_DELIVERY_ALLOCATION_UNMAPPED";
  targetId: string;
  message: string;
};

export type ErpV2MigrationResult = {
  state: OperationsState;
  version: typeof ERP_V2_SOURCE_ALLOCATION_MIGRATION_VERSION;
  migratedSalesLines: number;
  migratedDeliveryJobs: number;
  issues: ErpV2MigrationIssue[];
};

export function migrateOperationsStateToErpV2(source: OperationsState): ErpV2MigrationResult {
  const state = structuredClone(source) as OperationsState;
  const issues: ErpV2MigrationIssue[] = [];
  let migratedSalesLines = 0;
  let migratedDeliveryJobs = 0;

  for (const order of state.salesOrders) {
    for (const line of order.lines) {
      if (line.allocations) continue;
      if (!line.sourceType) {
        if (["allocated", "partially_delivered", "delivered"].includes(order.status)) {
          issues.push({
            code: "ACTIVE_SALES_SOURCE_UNMAPPED",
            targetId: line.id,
            message: `${order.documentNo}/${line.id} đang hoạt động nhưng không có nguồn V1 đủ chắc chắn để chuyển sang allocation.`
          });
        }
        continue;
      }
      const sourceIsValid = line.sourceType === "warehouse"
        ? Boolean(line.warehouseId)
        : Boolean(line.purchaseOrderLineId);
      if (!sourceIsValid) {
        if (["allocated", "partially_delivered", "delivered"].includes(order.status)) {
          issues.push({
            code: "ACTIVE_SALES_SOURCE_UNMAPPED",
            targetId: line.id,
            message: `${order.documentNo}/${line.id} có nguồn V1 thiếu liên kết bắt buộc.`
          });
        }
        continue;
      }
      const allocation: SalesSourceAllocation = {
        id: `${line.id}-allocation-1`,
        sourceType: line.sourceType,
        warehouseId: line.warehouseId,
        purchaseOrderLineId: line.purchaseOrderLineId,
        allocatedQuantity: line.quantity,
        deliveredQuantity: line.deliveredQuantity,
        version: 1,
        status: line.deliveredQuantity >= line.quantity ? "fulfilled" : "allocated"
      };
      line.allocations = [allocation];
      migratedSalesLines += 1;
    }
  }

  for (const job of state.deliveryJobs) {
    if (job.allocationIds) continue;
    const order = state.salesOrders.find((item) => item.id === job.salesOrderId);
    if (!order || !["allocated", "partially_delivered", "delivered"].includes(order.status)) continue;
    const allocationIds = order.lines.flatMap((line) =>
      (line.allocations ?? [])
        .filter((allocation) => allocation.sourceType === "warehouse")
        .map((allocation) => allocation.id)
    );
    if (allocationIds.length === 0 && ["assigned", "loading", "in_transit"].includes(job.status)) {
      issues.push({
        code: "ACTIVE_DELIVERY_ALLOCATION_UNMAPPED",
        targetId: job.id,
        message: `${job.documentNo} đang hoạt động nhưng không thể ánh xạ allocation kho từ đơn bán.`
      });
      continue;
    }
    job.allocationIds = allocationIds;
    migratedDeliveryJobs += 1;
  }

  return { state, version: ERP_V2_SOURCE_ALLOCATION_MIGRATION_VERSION, migratedSalesLines, migratedDeliveryJobs, issues };
}

export function assertAndMigrateOperationsStateToErpV2(source: OperationsState) {
  const result = migrateOperationsStateToErpV2(source);
  if (result.issues.length > 0) {
    throw new Error(`ERP_V2_MIGRATION_BLOCKED: ${result.issues.map((issue) => issue.message).join("; ")}`);
  }
  return result.state;
}
