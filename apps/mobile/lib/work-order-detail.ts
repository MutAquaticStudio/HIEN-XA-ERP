export type WorkOrderDeliveryLink = { salesOrderId?: string };

export type DeliveryJobSummary = {
  id: string;
  documentNo: string;
  salesOrderId: string;
  status: string;
  plannedDate: string;
};

export function findDeliveryForWorkOrder(workOrder: WorkOrderDeliveryLink, deliveryJobs: DeliveryJobSummary[]) {
  if (!workOrder.salesOrderId) return undefined;
  return deliveryJobs.find((job) => job.salesOrderId === workOrder.salesOrderId);
}
