import {
  cashBalance,
  customerBalance,
  employeeBalance,
  salesOrderTotals,
  stockBalance,
  supplierBalance
} from "./selectors";
import type { OperationsState } from "./types";

export type DashboardRoleId = "owner" | "accountant" | "sales" | "warehouse" | "driver" | "worker";

export type RoleMetricValueType = "money" | "quantity" | "count" | "text";

export type RoleDashboardMetric = {
  id: string;
  label: string;
  value: number | string;
  valueType: RoleMetricValueType;
  note: string;
};

export type RoleDashboardTask = {
  id: string;
  label: string;
  detail: string;
  count: number;
  severity: "success" | "warning" | "danger" | "info";
};

export type RoleDashboard = {
  role: DashboardRoleId;
  label: string;
  headline: string;
  privacyNote: string;
  metrics: RoleDashboardMetric[];
  tasks: RoleDashboardTask[];
};

export const dashboardRoleOptions: Array<{ id: DashboardRoleId; label: string }> = [
  { id: "owner", label: "Chủ cửa hàng" },
  { id: "accountant", label: "Kế toán" },
  { id: "sales", label: "Bán hàng" },
  { id: "warehouse", label: "Kho" },
  { id: "driver", label: "Tài xế" },
  { id: "worker", label: "Thợ" }
];

export function createRoleDashboard(state: OperationsState, role: DashboardRoleId): RoleDashboard {
  switch (role) {
    case "owner":
      return createOwnerDashboard(state);
    case "accountant":
      return createAccountantDashboard(state);
    case "sales":
      return createSalesDashboard(state);
    case "warehouse":
      return createWarehouseDashboard(state);
    case "driver":
      return createDriverDashboard(state);
    case "worker":
      return createWorkerDashboard(state);
  }
}

function createOwnerDashboard(state: OperationsState): RoleDashboard {
  const fullSales = sumSalesGross(state);
  const receivable = totalCustomerReceivable(state);
  const payable = totalSupplierPayable(state);
  const workToApprove = state.workOrders.filter((order) => order.status === "submitted").length;
  const openImportIssues = state.importIssues.filter((issue) => issue.status === "open").length;

  return {
    role: "owner",
    label: "Chủ cửa hàng",
    headline: "Nhìn toàn bộ tiền, hàng, công nợ và việc cần duyệt.",
    privacyNote: "Có quyền xem đủ số tiền vận hành, nhưng báo cáo vẫn đọc từ ledger và phát sinh kho.",
    metrics: [
      metric("sales_gross", "Doanh thu đơn bán", fullSales, "money", "Tổng giá trị đơn bán theo ảnh chụp giá."),
      metric("cash_balance", "Quỹ hiện tại", cashBalance(state), "money", "Thu chi đã xác nhận trong sổ quỹ."),
      metric("customer_receivable", "Phải thu khách", receivable, "money", "Số dư nợ khách tính từ sổ công nợ."),
      metric("supplier_payable", "Phải trả NCC", payable, "money", "Số dư phải trả nhà cung cấp từ sub-ledger.")
    ],
    tasks: [
      task("approve_work", "Duyệt sản lượng", "Phiếu công chờ duyệt trước khi tính tiền công.", workToApprove, workToApprove > 0 ? "warning" : "success"),
      task("resolve_import", "Xử lý import", "Dòng Excel nghi ngờ cần quyết định trước migration.", openImportIssues, openImportIssues > 0 ? "danger" : "success")
    ]
  };
}

function createAccountantDashboard(state: OperationsState): RoleDashboard {
  const unallocatedReceipts = state.customerPayments.filter((payment) => payment.status === "confirmed").length;
  const payableReady = state.supplierPayments.filter(
    (payment) => payment.status === "draft" && supplierBalance(state.supplierLedgerEntries, payment.supplierId) >= payment.amount
  ).length;
  const employeePaymentsReady = state.employeePayments.filter(
    (payment) => payment.status === "draft" && employeeBalance(state, payment.employeeId) >= payment.amount && cashBalance(state) >= payment.amount
  ).length;

  return {
    role: "accountant",
    label: "Kế toán",
    headline: "Tập trung thu chi, phân bổ thanh toán và chứng từ còn treo.",
    privacyNote: "Được xem công nợ và dòng tiền, không sửa trực tiếp số dư ledger.",
    metrics: [
      metric("cash_balance", "Quỹ hiện tại", cashBalance(state), "money", "Sổ quỹ sau các phiếu đã xác nhận."),
      metric("customer_receivable", "Phải thu khách", totalCustomerReceivable(state), "money", "Debit trừ credit theo khách hàng."),
      metric("supplier_payable", "Phải trả NCC", totalSupplierPayable(state), "money", "Credit trừ debit theo nhà cung cấp."),
      metric("employee_payable", "Công còn phải trả", totalEmployeePayable(state), "money", "Tiền công đã post trừ phần đã thanh toán.")
    ],
    tasks: [
      task("allocate_receipts", "Phân bổ phiếu thu", "Phiếu thu đã xác nhận nhưng chưa phân bổ vào nghĩa vụ.", unallocatedReceipts, unallocatedReceipts > 0 ? "warning" : "success"),
      task("supplier_payments", "Chi nhà cung cấp", "Phiếu chi đủ điều kiện theo số dư phải trả.", payableReady, payableReady > 0 ? "info" : "success"),
      task("employee_payments", "Thanh toán nhân viên", "Phiếu thanh toán có đủ công và đủ quỹ.", employeePaymentsReady, employeePaymentsReady > 0 ? "info" : "success")
    ]
  };
}

function createSalesDashboard(state: OperationsState): RoleDashboard {
  const drafts = state.salesOrders.filter((order) => order.status === "draft").length;
  const confirmed = state.salesOrders.filter((order) => order.status === "confirmed").length;
  const notDelivered = state.salesOrders.filter((order) => order.status !== "delivered").length;

  return {
    role: "sales",
    label: "Bán hàng",
    headline: "Theo dõi đơn, khách, hạn mức nợ và tình trạng giao.",
    privacyNote: "Không hiển thị giá vốn hoặc lợi nhuận; chỉ thấy thông tin cần để phục vụ bán hàng.",
    metrics: [
      metric("sales_orders", "Đơn đang theo dõi", state.salesOrders.length, "count", "Tất cả đơn bán đang có trong hệ thống."),
      metric("draft_orders", "Đơn nháp", drafts, "count", "Cần kiểm tra giá, VAT và khách hàng trước khi xác nhận."),
      metric("confirmed_orders", "Chờ phân bổ nguồn", confirmed, "count", "Đơn đã xác nhận nhưng chưa có nguồn hàng."),
      metric("not_delivered", "Chưa giao xong", notDelivered, "count", "Đơn chưa hoàn tất giao hàng.")
    ],
    tasks: [
      task("confirm_sales", "Xác nhận đơn", "Đơn nháp cần khóa giá trước khi cấp nguồn.", drafts, drafts > 0 ? "warning" : "success"),
      task("allocate_sales", "Phân bổ nguồn", "Đơn đã xác nhận cần chỉ rõ qua kho hay giao thẳng.", confirmed, confirmed > 0 ? "warning" : "success")
    ]
  };
}

function createWarehouseDashboard(state: OperationsState): RoleDashboard {
  const receiptLines = state.purchaseOrders.flatMap((order) =>
    order.lines.filter((line) => line.destinationType === "warehouse" && line.receivedQuantity < line.orderedQuantity)
  );
  const warehouseDeliveryJobs = state.deliveryJobs.filter((job) => {
    const order = state.salesOrders.find((item) => item.id === job.salesOrderId);
    return Boolean(
      order &&
        job.status !== "delivered" &&
        order.lines.some((line) => line.sourceType === "warehouse" && line.deliveredQuantity < line.quantity)
    );
  });
  const lowStock = state.productUnits.filter((product) => stockBalance(state, "wh-main", product.id) <= 0).length;

  return {
    role: "warehouse",
    label: "Kho",
    headline: "Tập trung nhập, xuất và tồn khả dụng, không chỉnh tay số dư kho.",
    privacyNote: "Chỉ hiển thị lượng và chứng từ kho; không hiển thị công nợ hay lợi nhuận.",
    metrics: [
      metric("receipt_lines", "Dòng chờ nhập", receiptLines.length, "count", "Dòng mua nhập kho chưa nhận đủ."),
      metric("delivery_jobs", "Chuyến cần xuất", warehouseDeliveryJobs.length, "count", "Chuyến có hàng qua kho chưa giao."),
      metric("low_stock", "Vật tư hết tồn", lowStock, "count", "Tồn kho tính từ inventory movements."),
      metric("movements", "Phát sinh kho", state.inventoryMovements.length, "count", "Movement append-only có chứng từ nguồn.")
    ],
    tasks: [
      task("post_receipts", "Ghi nhận nhập kho", "Dòng mua qua kho cần post inventory movement.", receiptLines.length, receiptLines.length > 0 ? "warning" : "success"),
      task("complete_delivery", "Xuất kho giao hàng", "Chuyến giao đủ điều kiện cần xác nhận giao.", warehouseDeliveryJobs.length, warehouseDeliveryJobs.length > 0 ? "info" : "success")
    ]
  };
}

function createDriverDashboard(state: OperationsState): RoleDashboard {
  const driver = state.employees.find((employee) => employee.roleType === "driver");
  const jobs = driver ? state.deliveryJobs.filter((job) => job.driverId === driver.id) : [];
  const openJobs = jobs.filter((job) => job.status !== "delivered" && job.status !== "failed").length;
  const completedJobs = jobs.filter((job) => job.status === "delivered").length;

  return {
    role: "driver",
    label: "Tài xế",
    headline: "Chỉ thấy chuyến được phân và thông tin cần để giao hàng.",
    privacyNote: "Ẩn công nợ, quỹ tiền mặt, giá vốn và lợi nhuận khỏi màn hình tài xế.",
    metrics: [
      metric("assigned_jobs", "Chuyến được phân", jobs.length, "count", "Chuyến gắn với tài xế hiện tại."),
      metric("open_jobs", "Chưa hoàn tất", openJobs, "count", "Cần giao hoặc cập nhật kết quả."),
      metric("completed_jobs", "Đã giao", completedJobs, "count", "Chuyến đã có xác nhận giao."),
      metric("driver_name", "Tài xế", driver?.displayName ?? "Chưa phân công", "text", "Người đang xem màn hình vận hành.")
    ],
    tasks: [
      task("today_jobs", "Chuyến hôm nay", "Mở chuyến, gọi khách và xác nhận giao.", openJobs, openJobs > 0 ? "warning" : "success")
    ]
  };
}

function createWorkerDashboard(state: OperationsState): RoleDashboard {
  const worker = state.employees.find((employee) => employee.roleType === "worker");
  const workOrders = worker ? state.workOrders.filter((order) => order.participants.some((participant) => participant.employeeId === worker.id)) : [];
  const openOrders = state.workOrders.filter((order) => order.status === "open" && Boolean(order.salesOrderId)).length;
  const submitted = workOrders.filter((order) => order.status === "submitted").length;
  const approved = workOrders.filter((order) => order.status === "approved").length;

  return {
    role: "worker",
    label: "Thợ",
    headline: "Theo dõi việc của mình, sản lượng và tiền công đã chốt.",
    privacyNote: "Chỉ hiện phần việc và công của người đang xem; không hiện công nợ khách/NCC hoặc quỹ.",
    metrics: [
      metric("open_order_claims", "Đơn mới chờ nhận", openOrders, "count", "Đơn đã xác nhận đang mở để thợ nhận trước."),
      metric("assigned_work", "Việc có tham gia", workOrders.length, "count", "Phiếu công có người này trong danh sách chia công."),
      metric("submitted_work", "Chờ duyệt", submitted, "count", "Sản lượng đã nhập, chờ quản lý duyệt."),
      metric("approved_work", "Đã duyệt chờ ghi công", approved, "count", "Sản lượng đã khóa, chờ post bảng công."),
      metric("worker_balance", "Công còn lại", worker ? employeeBalance(state, worker.id) : 0, "money", "Số dư tiền công của chính người này.")
    ],
    tasks: [
      task("claim_open_order", "Nhận đơn mới", "Đơn nào được nhận trước sẽ khóa cho thợ đó.", openOrders, openOrders > 0 ? "warning" : "success"),
      task("work_outputs", "Sản lượng của tôi", "Theo dõi sản lượng đã nộp và trạng thái duyệt.", submitted + approved, submitted + approved > 0 ? "warning" : "success")
    ]
  };
}

function metric(
  id: string,
  label: string,
  value: number | string,
  valueType: RoleMetricValueType,
  note: string
): RoleDashboardMetric {
  return { id, label, value, valueType, note };
}

function task(
  id: string,
  label: string,
  detail: string,
  count: number,
  severity: RoleDashboardTask["severity"]
): RoleDashboardTask {
  return { id, label, detail, count, severity };
}

function sumSalesGross(state: OperationsState) {
  return state.salesOrders.reduce((sum, order) => sum + salesOrderTotals(order.lines).gross, 0);
}

function totalCustomerReceivable(state: OperationsState) {
  return state.customers.reduce((sum, customer) => sum + Math.max(customerBalance(state.customerLedgerEntries, customer.id), 0), 0);
}

function totalSupplierPayable(state: OperationsState) {
  return state.suppliers.reduce((sum, supplier) => sum + Math.max(supplierBalance(state.supplierLedgerEntries, supplier.id), 0), 0);
}

function totalEmployeePayable(state: OperationsState) {
  return state.employees.reduce((sum, employee) => sum + Math.max(employeeBalance(state, employee.id), 0), 0);
}
