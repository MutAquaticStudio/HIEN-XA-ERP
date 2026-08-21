import { customerBalance, salesOrderTotals, supplierBalance } from "@/modules/operations/selectors";
import type { OperationsState, SalesOrderStatus } from "@/modules/operations/types";

export type CustomerPortalOrderLineReadModel = {
  id: string;
  productName: string;
  unitName: string;
  orderedQuantity: number;
  deliveredQuantity: number;
  remainingQuantity: number;
  unitPrice: number;
  taxRate: number;
};

export type CustomerPortalOrderReadModel = {
  id: string;
  documentNo: string;
  orderDate: string;
  status: SalesOrderStatus;
  total: number;
  paymentMethod?: "transfer" | "credit_requested";
  promisedDeliveryDate?: string;
  lines: CustomerPortalOrderLineReadModel[];
};

export type CustomerPortalReadModel = {
  customer: { id: string; displayName: string; phone: string };
  receivable: number;
  overpayment: number;
  paymentDueDate?: string;
  orders: CustomerPortalOrderReadModel[];
  deliveries: Array<{
    id: string;
    documentNo: string;
    salesOrderId: string;
    salesOrderNo: string;
    plannedDate: string;
    status: "assigned" | "loading" | "in_transit" | "delivered" | "failed";
    customerConfirmationStatus?: "confirmed" | "waived";
  }>;
  payments: Array<{ id: string; documentNo: string; date: string; amount: number }>;
  paymentProofs: Array<{ id: string; salesOrderId: string; amount: number; status: "submitted" | "reviewed" | "rejected"; submittedAt: string; rejectionReason?: string }>;
};

export type SupplierPortalReadModel = {
  supplier: { id: string; displayName: string; phone: string };
  payable: number;
  overpayment: number;
  orders: Array<{
    id: string;
    documentNo: string;
    orderDate: string;
    status: "draft" | "ordered" | "partially_received" | "fully_received";
    expectedDeliveryDate?: string;
    responseCount: number;
    noticeCount: number;
    latestResponse?: {
      status: "available" | "unavailable";
      proposedDeliveryDate?: string;
      note?: string;
      submittedAt: string;
    };
    deliveryNotices: Array<{
      id: string;
      submittedAt: string;
      lineQuantities: Record<string, number>;
      note?: string;
      attachmentCount: number;
    }>;
    lines: Array<{
      id: string;
      productName: string;
      unitName: string;
      orderedQuantity: number;
      receivedQuantity: number;
      remainingQuantity: number;
      unitCost: number;
      taxRate: number;
      destination: string;
    }>;
  }>;
  payments: Array<{ id: string; documentNo: string; date: string; amount: number }>;
};

export function buildCustomerPortalReadModel(state: OperationsState, customerId: string): CustomerPortalReadModel | undefined {
  const customer = state.customers.find((item) => item.id === customerId && item.status === "active");
  if (!customer) return undefined;
  const balance = customerBalance(state.customerLedgerEntries, customer.id);
  const activeEntries = state.customerLedgerEntries
    .filter((entry) => entry.customerId === customer.id && !entry.reversedById)
    .sort((left, right) => right.postingDate.localeCompare(left.postingDate));
  const paymentDueDate = balance > 0
    ? activeEntries
      .filter((entry) => entry.direction === "debit" && Boolean(entry.dueDate))
      .sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? ""))[0]?.dueDate
    : undefined;
  const orders = state.salesOrders
    .filter((order) => order.customerId === customer.id)
    .sort((left, right) => right.orderDate.localeCompare(left.orderDate))
    .map((order) => ({
      id: order.id,
      documentNo: order.documentNo,
      orderDate: order.orderDate,
      status: order.status,
      total: salesOrderTotals(order.lines, order.deliveryCharge).customerGross,
      paymentMethod: order.paymentMethod,
      promisedDeliveryDate: order.promisedDeliveryDate,
      lines: order.lines.map((line) => {
        const product = state.productUnits.find((item) => item.id === line.productUnitId);
        return {
          id: line.id,
          productName: product?.productName ?? line.productUnitId,
          unitName: line.documentUnit?.unitName ?? product?.unitName ?? "đơn vị",
          orderedQuantity: line.quantity,
          deliveredQuantity: line.deliveredQuantity,
          remainingQuantity: Math.max(line.quantity - line.deliveredQuantity, 0),
          unitPrice: line.unitPrice,
          taxRate: line.taxRate
        };
      })
    }));
  const orderById = new Map(orders.map((order) => [order.id, order]));
  return {
    customer: { id: customer.id, displayName: customer.displayName, phone: customer.phone },
    receivable: Math.max(balance, 0),
    overpayment: Math.max(-balance, 0),
    paymentDueDate,
    orders,
    deliveries: state.deliveryJobs
      .filter((job) => orderById.has(job.salesOrderId))
      .sort((left, right) => right.plannedDate.localeCompare(left.plannedDate))
      .map((job) => ({
        id: job.id,
        documentNo: job.documentNo,
        salesOrderId: job.salesOrderId,
        salesOrderNo: orderById.get(job.salesOrderId)?.documentNo ?? job.salesOrderId,
        plannedDate: job.plannedDate,
        status: job.status,
        customerConfirmationStatus: job.customerConfirmation?.status
      })),
    payments: activeEntries
      .filter((entry) => entry.direction === "credit")
      .map((entry) => ({ id: entry.id, documentNo: entry.sourceDocument, date: entry.postingDate, amount: entry.amount })),
    paymentProofs: (state.customerPaymentProofRequests ?? [])
      .filter((proof) => proof.customerId === customer.id)
      .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
      .map((proof) => ({ id: proof.id, salesOrderId: proof.salesOrderId, amount: proof.amount, status: proof.status, submittedAt: proof.submittedAt, rejectionReason: proof.rejectionReason }))
  };
}

export function buildSupplierPortalReadModel(state: OperationsState, supplierId: string): SupplierPortalReadModel | undefined {
  const supplier = state.suppliers.find((item) => item.id === supplierId && item.status === "active");
  if (!supplier) return undefined;
  const balance = supplierBalance(state.supplierLedgerEntries, supplier.id);
  const entries = state.supplierLedgerEntries
    .filter((entry) => entry.supplierId === supplier.id && !entry.reversedById)
    .sort((left, right) => right.postingDate.localeCompare(left.postingDate));
  return {
    supplier: { id: supplier.id, displayName: supplier.displayName, phone: supplier.phone },
    payable: Math.max(balance, 0),
    overpayment: Math.max(-balance, 0),
    orders: state.purchaseOrders
      .filter((order) => order.supplierId === supplier.id)
      .sort((left, right) => right.orderDate.localeCompare(left.orderDate))
      .map((order) => {
        const responses = order.supplierAcknowledgements ?? [];
        const latestResponse = [...responses].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0];
        return {
        id: order.id,
        documentNo: order.documentNo,
        orderDate: order.orderDate,
        status: order.status,
        expectedDeliveryDate: latestResponse?.proposedDeliveryDate ?? order.expectedDeliveryDate,
        responseCount: responses.length,
        noticeCount: order.supplierDeliveryNotices?.length ?? 0,
        latestResponse: latestResponse ? {
          status: latestResponse.status,
          proposedDeliveryDate: latestResponse.proposedDeliveryDate,
          note: latestResponse.note,
          submittedAt: latestResponse.submittedAt
        } : undefined,
        deliveryNotices: (order.supplierDeliveryNotices ?? [])
          .slice()
          .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
          .map((notice) => ({ id: notice.id, submittedAt: notice.submittedAt, lineQuantities: { ...notice.lineQuantities }, note: notice.note, attachmentCount: notice.attachments.length })),
        lines: order.lines.map((line) => {
          const product = state.productUnits.find((item) => item.id === line.productUnitId);
          return {
            id: line.id,
            productName: product?.productName ?? line.productUnitId,
            unitName: line.documentUnit?.unitName ?? product?.unitName ?? "đơn vị",
            orderedQuantity: line.orderedQuantity,
            receivedQuantity: line.receivedQuantity,
            remainingQuantity: Math.max(line.orderedQuantity - line.receivedQuantity, 0),
            unitCost: line.unitCost,
            taxRate: line.taxRate,
            destination: line.destinationType === "warehouse"
              ? `Nhận tại ${state.warehouses.find((warehouse) => warehouse.id === line.warehouseId)?.name ?? "kho cửa hàng"}`
              : `Giao thẳng cho ${state.customers.find((customer) => customer.id === line.customerId)?.displayName ?? "khách hàng"}`
          };
        })
      };
      }),
    payments: entries
      .filter((entry) => entry.direction === "debit")
      .map((entry) => ({ id: entry.id, documentNo: entry.sourceDocument, date: entry.postingDate, amount: entry.amount }))
  };
}
