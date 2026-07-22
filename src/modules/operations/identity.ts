import { operationsErpRegistry, type OperationsModuleId } from "./erp-registry";
import type { DashboardRoleId } from "./role-dashboard";
import type { OperationsActor, UserRole } from "./types";

export const operationsActorRoleOptions: Array<{ id: UserRole; label: string }> = [
  { id: "owner", label: "Chủ cửa hàng" },
  { id: "administrator", label: "Quản trị hệ thống" },
  { id: "accountant", label: "Kế toán" },
  { id: "sales", label: "Bán hàng" },
  { id: "warehouse", label: "Kho" },
  { id: "dispatcher", label: "Điều phối" },
  { id: "driver", label: "Tài xế" },
  { id: "supervisor", label: "Giám sát" },
  { id: "worker", label: "Thợ" },
  { id: "viewer", label: "Chỉ xem" }
];

const rolePermissionMap: Record<UserRole, string[]> = {
  owner: Array.from(operationsErpRegistry.permissionSet),
  administrator: Array.from(operationsErpRegistry.permissionSet),
  accountant: [
    "cash.create_receipt",
    "cash.confirm_receipt",
    "cash.reverse_receipt",
    "receivables.allocate_payment",
    "cash.create_payment",
    "cash.confirm_payment",
    "payables.allocate_payment",
    "cash.reverse_payment",
    "cash.create_voucher",
    "cash.confirm_voucher",
    "cash.reverse_voucher",
    "cash.create_employee_payment",
    "cash.pay_employee",
    "cash.reverse_employee_payment",
    "cash.create_employee_advance",
    "cash.confirm_employee_advance",
    "cash.reverse_employee_advance",
    "inventory.approve_receipt",
    "inventory.reject_receipt",
    "delivery.approve_completion",
    "delivery.reject_completion",
    "import.create_issue",
    "import.create_dry_run",
    "import.resolve_issue",
    "import.ignore_issue"
  ],
  sales: [
    "parties.create_customer",
    "sales.create",
    "sales.confirm",
    "sales.allocate_source",
    "delivery.create",
    "cash.create_receipt"
  ],
  warehouse: [
    "catalog.create_product_unit",
    "catalog.manage_purchase_units",
    "catalog.create_warehouse",
    "inventory.post_receipt",
    "inventory.post_transfer",
    "inventory.post_count_adjustment",
    "inventory.reverse_movement",
    "delivery.start_loading",
    "delivery.dispatch"
  ],
  dispatcher: [
    "catalog.create_vehicle",
    "delivery.create",
    "delivery.confirm_direct",
    "delivery.reverse_direct",
    "delivery.start_loading",
    "delivery.dispatch",
    "delivery.complete",
    "delivery.fail"
  ],
  driver: [
    "delivery.start_loading",
    "delivery.dispatch",
    "delivery.complete",
    "delivery.fail"
  ],
  worker: ["workforce.create", "workforce.claim_open_order", "workforce.record_location", "inventory.submit_receipt", "delivery.submit_completion"],
  supervisor: [
    "parties.create_employee",
    "workforce.create",
    "workforce.approve_output",
    "compensation.post",
    "delivery.complete",
    "delivery.fail"
  ],
  viewer: []
};

const roleModuleMap: Record<UserRole, OperationsModuleId[]> = {
  owner: operationsErpRegistry.navigation.map((module) => module.id),
  administrator: operationsErpRegistry.navigation.map((module) => module.id),
  accountant: ["overview", "sales", "procurement", "delivery", "inventory", "receivables", "payables", "cash", "workforce", "import", "audit", "reporting"],
  sales: ["overview", "masterData", "sales", "delivery", "receivables"],
  warehouse: ["overview", "masterData", "procurement", "delivery", "inventory"],
  dispatcher: ["overview", "masterData", "sales", "procurement", "delivery"],
  driver: ["overview", "delivery"],
  worker: ["overview", "procurement", "delivery", "workforce"],
  supervisor: ["overview", "masterData", "delivery", "workforce"],
  viewer: ["overview", "sales"]
};

const actorDashboardRoleMap: Record<UserRole, DashboardRoleId> = {
  owner: "owner",
  administrator: "owner",
  accountant: "accountant",
  sales: "sales",
  warehouse: "warehouse",
  dispatcher: "driver",
  driver: "driver",
  worker: "worker",
  supervisor: "worker",
  viewer: "sales"
};

export function permissionsForRole(role: UserRole) {
  const knownPermissions = operationsErpRegistry.permissionSet;
  return rolePermissionMap[role].filter((permission) => knownPermissions.has(permission));
}

export function visibleModulesForRole(role: UserRole) {
  return roleModuleMap[role];
}

export function dashboardRoleForActor(role: UserRole) {
  return actorDashboardRoleMap[role];
}

export function createRoleActor(role: UserRole): OperationsActor {
  const roleLabel = operationsActorRoleOptions.find((option) => option.id === role)?.label ?? role;

  return {
    id: `user-${role}-local`,
    displayName: roleLabel,
    role,
    permissions: permissionsForRole(role),
    warehouseIds: role === "warehouse" ? ["wh-main"] : undefined
  };
}
