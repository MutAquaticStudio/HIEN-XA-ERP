export type NativeModuleId =
  | "catalog"
  | "sales"
  | "procurement"
  | "inventory"
  | "delivery"
  | "receivables"
  | "payables"
  | "cash"
  | "workforce"
  | "import"
  | "audit"
  | "reporting"
  | "admin";

export type NativeModuleDefinition = Readonly<{
  id: NativeModuleId;
  label: string;
  description: string;
  path: string;
  roles: readonly string[];
}>;

export type RoleTabLabels = Readonly<{
  operations: string;
  tracking: string;
  messages: string;
  account: string;
}>;

export type RoleNavigationManifest = Readonly<{
  role: string;
  heading: string;
  tabs: RoleTabLabels;
  moduleIds: readonly NativeModuleId[];
  usesManagementWorkspace: boolean;
}>;

const managementRoles = ["owner", "administrator", "accountant", "sales", "warehouse", "dispatcher", "supervisor", "viewer"] as const;
const nativeManagementRoles = new Set<string>(managementRoles);

export const nativeModuleCatalog: readonly NativeModuleDefinition[] = [
  { id: "catalog", label: "Danh mục", description: "Khách hàng, nhà cung cấp, vật tư, kho, xe và nhân sự.", path: "/api/mobile/catalog", roles: managementRoles },
  { id: "sales", label: "Bán hàng", description: "Đơn nháp, giá đã chốt và cấp nguồn.", path: "/api/mobile/sales", roles: ["owner", "administrator", "sales", "accountant"] },
  { id: "procurement", label: "Mua hàng", description: "Phiếu mua, điều khoản và xác nhận.", path: "/api/mobile/procurement", roles: ["owner", "administrator", "sales", "warehouse", "accountant"] },
  { id: "inventory", label: "Kho", description: "Tồn kho, nhập, chuyển, kiểm kê và đảo chứng từ.", path: "/api/mobile/inventory/overview", roles: ["owner", "administrator", "warehouse", "accountant"] },
  { id: "delivery", label: "Giao hàng", description: "Chuyến giao, báo lệch và duyệt giao.", path: "/api/mobile/delivery/overview", roles: ["owner", "administrator", "dispatcher", "warehouse", "sales"] },
  { id: "receivables", label: "Công nợ khách hàng", description: "Phải thu, thu tiền và phân bổ.", path: "/api/mobile/receivables", roles: ["owner", "administrator", "accountant", "sales"] },
  { id: "payables", label: "Công nợ nhà cung cấp", description: "Phải trả, chi tiền và phân bổ.", path: "/api/mobile/payables", roles: ["owner", "administrator", "accountant"] },
  { id: "cash", label: "Quỹ và ngân hàng", description: "Thu, chi, đối soát và chứng từ.", path: "/api/mobile/cash", roles: ["owner", "administrator", "accountant"] },
  { id: "workforce", label: "Nhân công", description: "Sản lượng, tiền công, tạm ứng và thanh toán.", path: "/api/mobile/workforce", roles: ["owner", "administrator", "accountant", "supervisor"] },
  { id: "import", label: "Nhập dữ liệu Excel", description: "Chạy thử tệp Excel và xử lý lỗi dữ liệu.", path: "/api/mobile/import", roles: ["owner", "administrator", "accountant"] },
  { id: "audit", label: "Nhật ký hoạt động", description: "Theo dõi thay đổi và kiểm tra toàn vẹn.", path: "/api/mobile/audit", roles: ["owner", "administrator", "accountant", "supervisor", "viewer"] },
  { id: "reporting", label: "Báo cáo", description: "Số liệu từ sổ chi tiết và chứng từ nguồn.", path: "/api/mobile/reporting", roles: ["owner", "administrator", "accountant", "supervisor", "viewer"] },
  { id: "admin", label: "Quản trị", description: "Tài khoản, vai trò và phạm vi truy cập.", path: "/api/mobile/admin", roles: ["owner", "administrator"] }
] as const;

const roleTabLabels: Record<string, RoleTabLabels> = {
  owner: { operations: "Tổng quan", tracking: "Bản đồ", messages: "Báo cáo", account: "Tài khoản" },
  administrator: { operations: "Tổng quan", tracking: "Bản đồ", messages: "Quản trị", account: "Tài khoản" },
  accountant: { operations: "Việc cần làm", tracking: "Giao hàng", messages: "Tin nhắn", account: "Tài khoản" },
  sales: { operations: "Bán hàng", tracking: "Giao hàng", messages: "Tin nhắn", account: "Tài khoản" },
  warehouse: { operations: "Nhập xuất", tracking: "Giao hàng", messages: "Tin nhắn", account: "Tài khoản" },
  dispatcher: { operations: "Chuyến giao", tracking: "Bản đồ", messages: "Chờ duyệt", account: "Tài khoản" },
  supervisor: { operations: "Việc cần duyệt", tracking: "Giao hàng", messages: "Báo cáo", account: "Tài khoản" },
  viewer: { operations: "Tổng quan", tracking: "Giao hàng", messages: "Báo cáo", account: "Tài khoản" },
  driver: { operations: "Chuyến hôm nay", tracking: "Bản đồ", messages: "Ảnh và báo lệch", account: "Tài khoản" },
  worker: { operations: "Công việc", tracking: "Chuyến giao", messages: "Ảnh", account: "Tài khoản" },
  customer: { operations: "Đặt hàng", tracking: "Theo dõi", messages: "Tin nhắn", account: "Tài khoản" },
  supplier: { operations: "Phiếu mua", tracking: "Giao hàng", messages: "Tin nhắn", account: "Tài khoản" }
};

const roleHeadings: Record<string, string> = {
  owner: "Điều hành cửa hàng",
  administrator: "Quản trị hệ thống",
  accountant: "Kế toán và công nợ",
  sales: "Bán hàng",
  warehouse: "Kho hàng",
  dispatcher: "Điều phối giao hàng",
  supervisor: "Duyệt công việc",
  viewer: "Theo dõi hoạt động",
  driver: "Giao hàng hôm nay",
  worker: "Công việc của tôi",
  customer: "Đặt hàng của tôi",
  supplier: "Phiếu mua của tôi"
};

const fallbackTabs: RoleTabLabels = { operations: "Nghiệp vụ", tracking: "Giao hàng", messages: "Tin nhắn", account: "Tài khoản" };

export function usesNativeManagementHome(role: string) {
  return nativeManagementRoles.has(role);
}

export function getRoleTabLabels(role?: string): RoleTabLabels {
  return roleTabLabels[role ?? ""] ?? fallbackTabs;
}

export function getNativeModulesForSession(role: string, grantedModuleIds: readonly string[]): NativeModuleDefinition[] {
  if (!usesNativeManagementHome(role)) return [];
  const grants = new Set(grantedModuleIds);
  return nativeModuleCatalog.filter((module) => module.roles.includes(role) && (module.id === "catalog" || grants.has(module.id)));
}

export function getRoleNavigationManifest(role: string, grantedModuleIds: readonly string[] = []): RoleNavigationManifest {
  const modules = getNativeModulesForSession(role, grantedModuleIds);
  return {
    role,
    heading: roleHeadings[role] ?? "Nghiệp vụ được phân công",
    tabs: getRoleTabLabels(role),
    moduleIds: modules.map((module) => module.id),
    usesManagementWorkspace: usesNativeManagementHome(role)
  };
}
