import { getErpV2Snapshot } from "@/server/erp-v2/runtime";
import type { OperationsState, UserRole } from "@/modules/operations/types";
import { visibleModulesForIdentity } from "@/server/identity/auth-context";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";
import type { SafeIdentityUser } from "@/server/identity/types";
import { PublicApiError } from "@/server/shared/public-api-error";

export type MobileManagementActionOperation = "confirmSalesOrder" | "confirmPurchaseOrder";

export type MobileManagementRecordAction = {
  operation: MobileManagementActionOperation;
  targetId: string;
  label: string;
  confirmationTitle: string;
  confirmationMessage: string;
};

export type MobileManagementRecord = {
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  action?: MobileManagementRecordAction;
};

export type MobileManagementModule = {
  id: string;
  label: string;
  description: string;
  count: number;
  records: MobileManagementRecord[];
};

const nativeManagementRoles = new Set<UserRole>([
  "owner",
  "administrator",
  "accountant",
  "sales",
  "warehouse",
  "dispatcher",
  "supervisor",
  "viewer"
]);

const moduleMetadata: Record<string, Omit<MobileManagementModule, "id" | "count" | "records">> = {
  masterData: { label: "Danh mục", description: "Khách hàng, nhà cung cấp, vật tư, kho, xe và nhân sự." },
  sales: { label: "Bán hàng", description: "Đơn bán, báo giá, giá và xác nhận đơn." },
  procurement: { label: "Mua hàng", description: "Phiếu mua, nhận hàng, cước và điều khoản." },
  delivery: { label: "Giao hàng", description: "Phân công, giao nhận, xác nhận và theo dõi chuyến." },
  inventory: { label: "Kho", description: "Nhập xuất, kiểm kho và cảnh báo hàng." },
  receivables: { label: "Công nợ khách", description: "Phải thu, hạn thanh toán và theo dõi thu hồi." },
  payables: { label: "Công nợ NCC", description: "Phải trả, đối soát và lịch sử thanh toán." },
  cash: { label: "Quỹ và ngân hàng", description: "Phiếu thu, phiếu chi, chứng từ và phân bổ." },
  workforce: { label: "Nhân công", description: "Công việc, sản lượng, tiền công và tạm ứng." },
  import: { label: "Import Excel", description: "Kiểm tra dữ liệu, duyệt batch và xử lý lỗi." },
  audit: { label: "Nhật ký hoạt động", description: "Lịch sử thay đổi do người dùng thực hiện." },
  reporting: { label: "Báo cáo", description: "Kho, công nợ, tiền và hiệu quả vận hành." }
};

const maximumMobileRecords = 40;

export async function getMobileManagementOverview(user: SafeIdentityUser) {
  if (!nativeManagementRoles.has(user.role)) {
    throw new PublicApiError(403, "Tài khoản này chỉ sử dụng màn nghiệp vụ hiện trường trên điện thoại.");
  }

  const snapshot = projectOperationsSnapshot(await getErpV2Snapshot(), user);
  const visibleModuleIds = visibleModulesForIdentity(user).filter((id) => id !== "overview");

  return {
    role: user.role,
    displayName: user.displayName,
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    metrics: [
      { id: "sales", label: "Đơn bán", value: snapshot.state.salesOrders.length },
      { id: "purchase", label: "Phiếu mua", value: snapshot.state.purchaseOrders.length },
      { id: "delivery", label: "Chuyến giao", value: snapshot.state.deliveryJobs.length },
      { id: "approval", label: "Việc chờ duyệt", value: snapshot.state.approvalRequests.length }
    ],
    salesOrders: snapshot.state.salesOrders.map((order) => ({
      id: order.id,
      documentNo: order.documentNo,
      status: order.status
    })),
    purchaseOrders: snapshot.state.purchaseOrders.map((order) => ({
      id: order.id,
      documentNo: order.documentNo,
      status: order.status
    })),
    modules: buildMobileManagementModules(snapshot.state, visibleModuleIds, user.role)
  };
}

export function buildMobileManagementModules(
  state: OperationsState,
  visibleModuleIds: readonly string[],
  role: UserRole
): MobileManagementModule[] {
  return visibleModuleIds.map((id) => ({
    id,
    ...(moduleMetadata[id] ?? { label: id, description: "Nghiệp vụ được cấp quyền cho tài khoản này." }),
    count: countForModule(id, state),
    records: recordsForModule(id, state, role).slice(0, maximumMobileRecords)
  }));
}

function recordsForModule(id: string, state: OperationsState, role: UserRole): MobileManagementRecord[] {
  switch (id) {
    case "masterData":
      return [
        ...state.customers.map((item) => record(`customer:${item.id}`, `Khách: ${item.displayName}`, item.code, item.status)),
        ...state.suppliers.map((item) => record(`supplier:${item.id}`, `NCC: ${item.displayName}`, item.code, item.status)),
        ...state.productUnits.map((item) => record(`product:${item.id}`, item.productName, `${item.productCode} · Đơn vị: ${item.unitName}`, item.status)),
        ...state.warehouses.map((item) => record(`warehouse:${item.id}`, `Kho: ${item.name}`, item.code, item.status)),
        ...state.vehicles.map((item) => record(`vehicle:${item.id}`, `Xe: ${item.plateNumber}`, item.code, item.status)),
        ...state.employees.map((item) => record(`employee:${item.id}`, item.displayName, `${item.code} · ${roleLabel(item.roleType)}`, item.status))
      ];
    case "sales":
      return state.salesOrders.map((item) => {
        const action = item.status === "draft" && canConfirmSalesOrder(role)
          ? {
              operation: "confirmSalesOrder" as const,
              targetId: item.id,
              label: "Rà soát và xác nhận",
              confirmationTitle: "Xác nhận đơn bán",
              confirmationMessage: `Đơn ${item.documentNo} sẽ được xác nhận theo giá, VAT và điều khoản đã lưu. Chỉ tiếp tục khi đã rà soát thông tin.`
            }
          : undefined;
        return record(`sales:${item.id}`, item.documentNo, item.deliveryAddress ? `Giao đến: ${item.deliveryAddress}` : "Chưa có địa chỉ giao", item.status, action);
      });
    case "procurement":
      return state.purchaseOrders.map((item) => {
        const action = item.status === "draft" && canConfirmPurchaseOrder(role)
          ? {
              operation: "confirmPurchaseOrder" as const,
              targetId: item.id,
              label: "Rà soát và xác nhận",
              confirmationTitle: "Xác nhận phiếu mua",
              confirmationMessage: `Phiếu ${item.documentNo} sẽ được xác nhận theo dòng hàng, giá và điều khoản đã lưu. Chỉ tiếp tục khi đã rà soát thông tin.`
            }
          : undefined;
        return record(`purchase:${item.id}`, item.documentNo, `Dự kiến giao: ${dateLabel(item.expectedDeliveryDate)}`, item.status, action);
      });
    case "delivery":
      return state.deliveryJobs.map((item) => record(
        `delivery:${item.id}`,
        item.documentNo,
        `Ngày giao: ${dateLabel(item.plannedDate)}`,
        item.status
      ));
    case "inventory":
      return state.inventoryMovements.map((item) => record(
        `inventory:${item.id}`,
        item.sourceDocument,
        `${movementLabel(item.movementType)} · Kho ${item.warehouseId} · ${signedQuantity(item.quantity)}`,
        item.reversedById ? "reversed" : "posted"
      ));
    case "receivables":
      return state.customerLedgerEntries.map((item) => record(
        `receivable:${item.id}`,
        item.sourceDocument,
        `${ledgerLabel(item.direction)} ${formatCurrency(item.amount)} · Hạn: ${dateLabel(item.dueDate)}`,
        item.reversedById ? "reversed" : "posted"
      ));
    case "payables":
      return state.supplierLedgerEntries.map((item) => record(
        `payable:${item.id}`,
        item.sourceDocument,
        `${ledgerLabel(item.direction)} ${formatCurrency(item.amount)} · Ghi sổ: ${dateLabel(item.postingDate)}`,
        item.reversedById ? "reversed" : "posted"
      ));
    case "cash":
      return [
        ...state.cashVouchers.map((item) => record(
          `cash-voucher:${item.id}`,
          item.documentNo,
          `${cashDirectionLabel(item.direction)} ${formatCurrency(item.amount)} · ${item.accountName}`,
          item.status
        )),
        ...state.cashTransactions.map((item) => record(
          `cash-transaction:${item.id}`,
          item.sourceDocument,
          `${cashDirectionLabel(item.direction)} ${formatCurrency(item.amount)} · ${item.accountName}`,
          "posted"
        ))
      ];
    case "workforce":
      return [
        ...state.workOrders.map((item) => record(
          `work-order:${item.id}`,
          item.documentNo,
          `${item.workType} · Ngày làm: ${dateLabel(item.workDate)}`,
          item.status
        )),
        ...state.compensationBatches.map((item) => record(
          `compensation:${item.id}`,
          item.documentNo,
          `Phiếu công: ${item.workOrderId} · ${formatCurrency(item.totalAmount)}`,
          item.status
        ))
      ];
    case "import":
      return [
        ...state.importJobs.map((item) => record(
          `import-job:${item.id}`,
          item.fileName,
          `${item.rowCount} dòng · ${item.issueCount} vấn đề`,
          item.status
        )),
        ...state.importIssues.map((item) => record(
          `import-issue:${item.id}`,
          `${item.sourceSheet} · dòng ${item.rowNumber}`,
          item.message,
          item.status
        ))
      ];
    case "audit":
      return state.auditLogs.map((item) => record(
        `audit:${item.id}`,
        item.summary,
        `${item.actorName} · ${dateLabel(item.occurredAt)}`,
        item.action
      ));
    case "reporting":
      return [
        record("report:sales", "Đơn bán", `${state.salesOrders.length} đơn đang có dữ liệu`),
        record("report:purchase", "Phiếu mua", `${state.purchaseOrders.length} phiếu đang có dữ liệu`),
        record("report:delivery", "Chuyến giao", `${state.deliveryJobs.length} chuyến đang có dữ liệu`),
        record("report:inventory", "Biến động kho", `${state.inventoryMovements.length} dòng đã ghi sổ`),
        record("report:receivables", "Phải thu khách", `${state.customerLedgerEntries.length} dòng sổ chi tiết`),
        record("report:payables", "Phải trả NCC", `${state.supplierLedgerEntries.length} dòng sổ chi tiết`),
        record("report:workforce", "Nhân công", `${state.workOrders.length} công việc đang theo dõi`)
      ];
    default:
      return [];
  }
}

function record(
  id: string,
  title: string,
  subtitle: string,
  status?: string,
  action?: MobileManagementRecordAction
): MobileManagementRecord {
  return { id, title, subtitle, status: status ? statusLabel(status) : undefined, action };
}

function countForModule(id: string, state: OperationsState) {
  switch (id) {
    case "masterData": return state.customers.length + state.suppliers.length + state.productUnits.length + state.warehouses.length + state.vehicles.length + state.employees.length;
    case "sales": return state.salesOrders.length;
    case "procurement": return state.purchaseOrders.length;
    case "delivery": return state.deliveryJobs.length;
    case "inventory": return state.inventoryMovements.length;
    case "receivables": return state.customerLedgerEntries.length;
    case "payables": return state.supplierLedgerEntries.length;
    case "cash": return state.cashTransactions.length + state.cashVouchers.length;
    case "workforce": return state.workOrders.length + state.compensationBatches.length;
    case "import": return state.importJobs.length + state.importIssues.length;
    case "audit": return state.auditLogs.length;
    case "reporting": return 7;
    default: return 0;
  }
}

function canConfirmSalesOrder(role: UserRole) {
  return role === "owner" || role === "administrator" || role === "sales";
}

function canConfirmPurchaseOrder(role: UserRole) {
  return role === "owner" || role === "administrator";
}

function dateLabel(value?: string) {
  return value ? value.slice(0, 10) : "Chưa cập nhật";
}

function formatCurrency(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
}

function signedQuantity(value: number) {
  return `${value > 0 ? "+" : ""}${new Intl.NumberFormat("vi-VN").format(value)}`;
}

function ledgerLabel(direction: "debit" | "credit") {
  return direction === "debit" ? "Phát sinh phải thu" : "Đã thanh toán";
}

function cashDirectionLabel(direction: "in" | "out") {
  return direction === "in" ? "Thu" : "Chi";
}

function movementLabel(value: string) {
  return {
    opening: "Tồn đầu kỳ",
    receipt: "Nhập kho",
    issue: "Xuất kho",
    transfer_out: "Xuất chuyển kho",
    transfer_in: "Nhập chuyển kho",
    adjustment: "Điều chỉnh",
    reverse: "Đảo bút toán"
  }[value] ?? value;
}

function roleLabel(value: string) {
  return {
    driver: "Tài xế",
    worker: "Thợ",
    warehouse: "Kho",
    sales: "Bán hàng",
    accountant: "Kế toán",
    supervisor: "Giám sát"
  }[value] ?? value;
}

function statusLabel(value: string) {
  return {
    active: "Đang hoạt động",
    inactive: "Ngừng hoạt động",
    draft: "Nháp",
    confirmed: "Đã xác nhận",
    allocated: "Đã cấp nguồn",
    partially_delivered: "Giao một phần",
    delivered: "Đã giao",
    ordered: "Đã đặt mua",
    partially_received: "Nhận một phần",
    fully_received: "Đã nhận đủ",
    assigned: "Đã phân công",
    loading: "Đang bốc hàng",
    in_transit: "Đang giao",
    failed: "Không giao được",
    posted: "Đã ghi sổ",
    reversed: "Đã đảo",
    open: "Đang mở",
    submitted: "Chờ duyệt",
    approved: "Đã duyệt",
    compensated: "Đã tính công",
    paid: "Đã thanh toán",
    dry_run: "Đã kiểm tra thử",
    reviewed: "Đã rà soát",
    resolved: "Đã xử lý",
    ignored: "Đã bỏ qua",
    warning: "Cần chú ý",
    error: "Có lỗi",
    pending: "Chờ duyệt",
    rejected: "Từ chối",
    partially_allocated: "Đã phân bổ một phần",
    allocated_payment: "Đã phân bổ"
  }[value] ?? value;
}
