import { notFound, redirect } from "next/navigation";
import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";
import { getSelectableProducts } from "@/modules/operations/selectors";
import { reconcileOperationsState } from "@/modules/operations/reconciliation";
import type { OperationsSnapshot, OperationsState } from "@/modules/operations/types";
import { requirePageIdentityUser, visibleModulesForIdentity } from "@/server/identity/auth-context";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";
import type { SafeIdentityUser } from "@/server/identity/types";

export const catalogKinds = ["customers", "suppliers", "products", "warehouses", "vehicles", "employees"] as const;
export type CatalogKind = (typeof catalogKinds)[number];

export type CatalogAccess = {
  user: SafeIdentityUser;
  snapshot: OperationsSnapshot;
};

/**
 * Route-level authorization. The projected snapshot remains the data boundary;
 * this helper only prevents portal identities from entering internal catalog UI.
 */
export async function requireCatalogAccess(): Promise<CatalogAccess> {
  const user = await requirePageIdentityUser();
  if (user.role === "customer") redirect("/khach-hang");
  if (user.role === "supplier") redirect("/nha-cung-cap");
  if (!visibleModulesForIdentity(user).includes("masterData")) redirect("/");
  const snapshot = projectOperationsSnapshot(await getDemoOperationsSnapshot(), user);
  return { user, snapshot };
}

export function getCatalogRows(state: OperationsState, kind: CatalogKind) {
  switch (kind) {
    case "customers": return state.customers;
    case "suppliers": return state.suppliers;
    case "products": return state.productUnits;
    case "warehouses": return state.warehouses;
    case "vehicles": return state.vehicles;
    case "employees": return state.employees;
  }
}

export function findCatalogRecord(state: OperationsState, kind: CatalogKind, id: string) {
  const record = getCatalogRows(state, kind).find((item) => item.id === id);
  if (!record) notFound();
  return record;
}

export function catalogDisplayName(kind: CatalogKind) {
  return {
    customers: "Khách hàng",
    suppliers: "Nhà cung cấp",
    products: "Vật tư",
    warehouses: "Kho / bãi",
    vehicles: "Phương tiện",
    employees: "Nhân sự"
  }[kind];
}

export function catalogPath(kind: CatalogKind, id?: string) {
  return id ? `/catalog/${kind}/${encodeURIComponent(id)}` : `/catalog/${kind}`;
}

export function getCatalogSummary(state: OperationsState, kind: CatalogKind, id: string) {
  const reconciliation = reconcileOperationsState(state);
  if (kind === "customers") {
    const orders = state.salesOrders.filter((order) => order.customerId === id);
    const payments = state.customerPayments.filter((payment) => payment.customerId === id);
    const entries = state.customerLedgerEntries.filter((entry) => entry.customerId === id);
    return {
      items: [
        ["Tổng mua", entries.filter((entry) => entry.entryType === "sale_delivery" && entry.direction === "debit").reduce((sum, entry) => sum + entry.amount, 0), "money"],
        ["Đã thu", entries.filter((entry) => entry.direction === "credit").reduce((sum, entry) => sum + entry.amount, 0), "money"],
        ["Đang nợ", reconciliation.customerAr[id] ?? 0, "money"],
        ["Chưa khớp chứng từ", payments.filter((payment) => payment.status === "confirmed" || payment.status === "partially_allocated").length, "count"]
      ] as Array<[string, number, "money" | "count"]>,
      orders,
      payments,
      entries
    };
  }
  if (kind === "suppliers") {
    const orders = state.purchaseOrders.filter((order) => order.supplierId === id);
    const payments = state.supplierPayments.filter((payment) => payment.supplierId === id);
    const entries = state.supplierLedgerEntries.filter((entry) => entry.supplierId === id);
    return {
      items: [
        ["Tổng mua", entries.filter((entry) => entry.direction === "credit").reduce((sum, entry) => sum + entry.amount, 0), "money"],
        ["Đã chi", entries.filter((entry) => entry.direction === "debit").reduce((sum, entry) => sum + entry.amount, 0), "money"],
        ["Còn phải trả", reconciliation.supplierAp[id] ?? 0, "money"],
        ["Chưa khớp chứng từ", payments.filter((payment) => payment.status === "confirmed" || payment.status === "partially_allocated").length, "count"]
      ] as Array<[string, number, "money" | "count"]>,
      orders,
      payments,
      entries
    };
  }
  if (kind === "products") {
    const product = state.productUnits.find((item) => item.id === id);
    const conversions = state.purchaseUnitConversions.filter((item) => item.productUnitId === id);
    const inventory = Object.entries(reconciliation.inventoryQuantities)
      .filter(([key]) => key.endsWith(`::${id}`))
      .map(([key, quantity]) => ({ warehouseId: key.split("::")[0] ?? "", quantity }));
    return {
      items: [
        ["Đang hoạt động", product?.status === "active" ? 1 : 0, "count"],
        ["Đơn vị đã cấu hình", conversions.length, "count"],
        ["Tồn kho", inventory.reduce((sum, item) => sum + item.quantity, 0), "quantity"],
        ["Đơn bán", state.salesOrders.filter((order) => order.lines.some((line) => line.productUnitId === id)).length, "count"]
      ] as Array<[string, number, "count" | "quantity"]>,
      conversions,
      inventory,
      priceHistory: product?.priceHistory ?? []
    };
  }
  if (kind === "warehouses") {
    const movements = state.inventoryMovements.filter((movement) => movement.warehouseId === id);
    return {
      items: [
        ["Phát sinh kho", movements.length, "count"],
        ["Số mặt hàng", new Set(movements.map((movement) => movement.productUnitId)).size, "count"],
        ["Nhập kho", movements.filter((movement) => movement.movementType === "receipt" || movement.movementType === "opening").reduce((sum, movement) => sum + movement.quantity, 0), "quantity"],
        ["Xuất kho", Math.abs(movements.filter((movement) => movement.movementType === "issue").reduce((sum, movement) => sum + movement.quantity, 0)), "quantity"]
      ] as Array<[string, number, "count" | "quantity"]>,
      movements
    };
  }
  if (kind === "employees") {
    const work = state.workOrders.filter((order) => order.participants.some((participant) => participant.employeeId === id) || order.claimedByEmployeeId === id);
    const entries = state.employeeLedgerEntries.filter((entry) => entry.employeeId === id);
    return {
      items: [
        ["Công việc", work.length, "count"],
        ["Chờ xử lý", work.filter((order) => ["open", "assigned", "submitted"].includes(order.status)).length, "count"],
        ["Tiền công", entries.filter((entry) => entry.direction === "credit").reduce((sum, entry) => sum + entry.amount, 0), "money"],
        ["Còn phải trả", reconciliation.employeePayables[id] ?? 0, "money"]
      ] as Array<[string, number, "count" | "money"]>,
      work,
      entries
    };
  }
  const jobs = state.deliveryJobs.filter((job) => job.vehicleId === id);
  return {
    items: [
      ["Chuyến giao", jobs.length, "count"],
      ["Đang thực hiện", jobs.filter((job) => !["delivered", "failed"].includes(job.status)).length, "count"],
      ["Đã giao", jobs.filter((job) => job.status === "delivered").length, "count"]
    ] as Array<[string, number, "count"]>,
    jobs
  };
}

export function getCatalogOptions(state: OperationsState, kind: CatalogKind) {
  if (kind === "products") return getSelectableProducts(state);
  return getCatalogRows(state, kind);
}
