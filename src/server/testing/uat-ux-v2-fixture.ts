import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { visibleModulesForRole } from "@/modules/operations/identity";
import { assertOperationsInvariants } from "@/modules/operations/invariants";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsAttachment, OperationsState, UserRole } from "@/modules/operations/types";
import type { CommunicationAuditEvent, CommunicationMessage, CommunicationThread } from "@/server/communications/types";
import { hashPassword, verifyPassword } from "@/server/identity/crypto";
import type { IdentityUser, PersistedIdentityData } from "@/server/identity/types";
import { SupabaseRuntimeDocumentStore } from "@/server/infrastructure/supabase-runtime-document-store";
import type { PushNotificationEvent, PushSubscriptionRecord } from "@/server/notifications/types";
import {
  requireIntegrationTestEnvironment,
  type IntegrationTestEnvironment
} from "./integration-test-environment";

export const UAT_UXV2_PREFIX = "UAT-UXV2";
export const UAT_UXV2_ATTACHMENT_IDS = {
  customer: "d98741e8-4d11-4bdf-9ce2-0318c0a11001",
  customerB: "d98741e8-4d11-4bdf-9ce2-0318c0a11002",
  supplier: "d98741e8-4d11-4bdf-9ce2-0318c0a11003",
  supplierB: "d98741e8-4d11-4bdf-9ce2-0318c0a11004"
} as const;
export const UAT_UXV2_ROLES = [
  "OWNER",
  "ACCOUNTANT",
  "WAREHOUSE",
  "DISPATCHER",
  "DRIVER",
  "WORKER",
  "CUSTOMER",
  "SUPPLIER"
] as const;
export const UAT_UXV2_ISOLATION_IDENTITIES = ["CUSTOMER_B", "SUPPLIER_B", "WORKER_B", "DRIVER_B"] as const;
export const UAT_UXV2_IDENTITIES = [...UAT_UXV2_ROLES, ...UAT_UXV2_ISOLATION_IDENTITIES] as const;

export type UatUxV2Role = (typeof UAT_UXV2_ROLES)[number];
export type UatUxV2Identity = (typeof UAT_UXV2_IDENTITIES)[number];

export type UatUxV2FixtureEnvironment = IntegrationTestEnvironment & {
  credentials: Record<UatUxV2Identity, { username: string; password: string }>;
};

type PersistedOperationsData = {
  schemaVersion: 1;
  state: OperationsState;
  idempotencyRecords: unknown[];
};

type PersistedCommunicationData = {
  schemaVersion: 1;
  revision: number;
  threads: CommunicationThread[];
  messages: CommunicationMessage[];
  auditEvents: CommunicationAuditEvent[];
};

type PersistedPushData = {
  schemaVersion: 1;
  revision: number;
  subscriptions: PushSubscriptionRecord[];
  events: PushNotificationEvent[];
  deliveries: [];
};

const roleDefinitions: Record<UatUxV2Identity, {
  userRole: UserRole;
  username: string;
  displayName: string;
  employeeId?: string;
  warehouseIds?: string[];
  customerId?: string;
  supplierId?: string;
}> = {
  OWNER: { userRole: "owner", username: "uat.uxv2.owner", displayName: "Chủ cửa hàng UAT UXV2" },
  ACCOUNTANT: {
    userRole: "accountant",
    username: "uat.uxv2.accountant",
    displayName: "Kế toán UAT UXV2",
    employeeId: "uat-uxv2-employee-accountant"
  },
  WAREHOUSE: {
    userRole: "warehouse",
    username: "uat.uxv2.warehouse",
    displayName: "Nhân viên kho UAT UXV2",
    employeeId: "uat-uxv2-employee-warehouse",
    warehouseIds: ["uat-uxv2-warehouse"]
  },
  DISPATCHER: {
    userRole: "dispatcher",
    username: "uat.uxv2.dispatcher",
    displayName: "Điều phối UAT UXV2",
    employeeId: "uat-uxv2-employee-dispatcher"
  },
  DRIVER: {
    userRole: "driver",
    username: "uat.uxv2.driver",
    displayName: "Tài xế UAT UXV2",
    employeeId: "uat-uxv2-employee-driver"
  },
  WORKER: {
    userRole: "worker",
    username: "uat.uxv2.worker",
    displayName: "Thợ UAT UXV2",
    employeeId: "uat-uxv2-employee-worker"
  },
  CUSTOMER: {
    userRole: "customer",
    username: "uat.uxv2.customer",
    displayName: "Khách hàng UAT UXV2",
    customerId: "uat-uxv2-customer"
  },
  SUPPLIER: {
    userRole: "supplier",
    username: "uat.uxv2.supplier",
    displayName: "Nhà cung cấp UAT UXV2",
    supplierId: "uat-uxv2-supplier"
  },
  CUSTOMER_B: {
    userRole: "customer",
    username: "uat.uxv2.customer.b",
    displayName: "Khách hàng đối chứng UAT UXV2",
    customerId: "uat-uxv2-customer-b"
  },
  SUPPLIER_B: {
    userRole: "supplier",
    username: "uat.uxv2.supplier.b",
    displayName: "Nhà cung cấp đối chứng UAT UXV2",
    supplierId: "uat-uxv2-supplier-b"
  },
  WORKER_B: {
    userRole: "worker",
    username: "uat.uxv2.worker.b",
    displayName: "Thợ đối chứng UAT UXV2",
    employeeId: "uat-uxv2-employee-worker-b"
  },
  DRIVER_B: {
    userRole: "driver",
    username: "uat.uxv2.driver.b",
    displayName: "Tài xế đối chứng UAT UXV2",
    employeeId: "uat-uxv2-employee-driver-b"
  }
};

export function requireUatUxV2FixtureEnvironment(
  environment: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): UatUxV2FixtureEnvironment {
  const integration = requireIntegrationTestEnvironment(environment);
  if (environment.ERP_UAT_FIXTURE_CONFIRMATION !== UAT_UXV2_PREFIX) {
    throw new Error(`UAT fixture requires ERP_UAT_FIXTURE_CONFIRMATION=${UAT_UXV2_PREFIX}.`);
  }

  const credentials = {} as UatUxV2FixtureEnvironment["credentials"];
  const seenPasswords = new Set<string>();
  for (const role of UAT_UXV2_IDENTITIES) {
    const username = roleDefinitions[role].username;
    const configuredUsername = environment[`E2E_${role}_USERNAME`]?.trim();
    const password = environment[`E2E_${role}_PASSWORD`] ?? "";
    if (configuredUsername !== username) {
      throw new Error(`E2E_${role}_USERNAME must be ${username} for the isolated UAT fixture.`);
    }
    if (password.length < 20 || password.length > 128 || !/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
      throw new Error(`E2E_${role}_PASSWORD must contain letters and numbers and be 20-128 characters long.`);
    }
    if (seenPasswords.has(password)) {
      throw new Error("Each UAT role must use a different password.");
    }
    seenPasswords.add(password);
    credentials[role] = { username, password };
  }

  return { ...integration, credentials };
}

export function createUatUxV2OperationsState(existing: OperationsState = createInitialOperationsState()) {
  const state = structuredClone(existing) as OperationsState;
  ensureById(state.customers, {
    id: "uat-uxv2-customer",
    code: "UAT-UXV2-KH",
    displayName: "Khách hàng UAT UXV2",
    phone: "0000000000",
    creditLimit: 50_000_000,
    paymentTermDays: 15,
    paymentTermsNote: "Fixture UAT, không dùng dữ liệu cá nhân.",
    status: "active"
  });
  ensureById(state.customers, {
    id: "uat-uxv2-customer-b",
    code: "UAT-UXV2-KH-B",
    displayName: "Khách hàng đối chứng UAT UXV2",
    phone: "0000000001",
    creditLimit: 25_000_000,
    paymentTermDays: 7,
    paymentTermsNote: "Dữ liệu đối chứng kiểm tra truy cập chéo.",
    status: "active"
  });
  ensureById(state.suppliers, {
    id: "uat-uxv2-supplier",
    code: "UAT-UXV2-NCC",
    displayName: "Nhà cung cấp UAT UXV2",
    phone: "0000000000",
    paymentTermDays: 15,
    paymentTermsNote: "Fixture UAT, không dùng dữ liệu cá nhân.",
    status: "active"
  });
  ensureById(state.suppliers, {
    id: "uat-uxv2-supplier-b",
    code: "UAT-UXV2-NCC-B",
    displayName: "Nhà cung cấp đối chứng UAT UXV2",
    phone: "0000000002",
    paymentTermDays: 7,
    paymentTermsNote: "Dữ liệu đối chứng kiểm tra truy cập chéo.",
    status: "active"
  });

  const employees: OperationsState["employees"] = [
    { id: "uat-uxv2-employee-accountant", code: "UAT-KT", displayName: "Kế toán UAT UXV2", roleType: "accountant", status: "active" },
    { id: "uat-uxv2-employee-warehouse", code: "UAT-KHO", displayName: "Nhân viên kho UAT UXV2", roleType: "warehouse", status: "active" },
    { id: "uat-uxv2-employee-dispatcher", code: "UAT-DP", displayName: "Điều phối UAT UXV2", roleType: "supervisor", status: "active" },
    { id: "uat-uxv2-employee-driver", code: "UAT-TX", displayName: "Tài xế UAT UXV2", roleType: "driver", status: "active" },
    { id: "uat-uxv2-employee-driver-b", code: "UAT-TX-B", displayName: "Tài xế đối chứng UAT UXV2", roleType: "driver", status: "active" },
    { id: "uat-uxv2-employee-worker", code: "UAT-THO", displayName: "Thợ UAT UXV2", roleType: "worker", status: "active" },
    { id: "uat-uxv2-employee-worker-b", code: "UAT-THO-B", displayName: "Thợ đối chứng UAT UXV2", roleType: "worker", status: "active" }
  ];
  for (const employee of employees) ensureById(state.employees, employee);

  ensureById(state.productUnits, {
    id: "uat-uxv2-product-unit",
    productCode: "UAT-UXV2-VT",
    productName: "Vật tư UAT UXV2",
    unitName: "bao",
    salePrice: 100_000,
    saleTaxRate: 0.08,
    targetMarginRate: 0.1,
    standardLeadTimeDays: 2,
    reorderPolicies: [{ warehouseId: "uat-uxv2-warehouse", minimumQuantity: 20, updatedAt: "2026-08-02T00:00:00.000Z", updatedBy: "uat-uxv2-system" }],
    status: "active"
  });
  ensureById(state.productUnits, {
    id: "uat-uxv2-product-quote",
    productCode: "UAT-UXV2-BAO-GIA",
    productName: "Vật tư cần báo giá UAT UXV2",
    unitName: "bao",
    reorderPolicies: [{ warehouseId: "uat-uxv2-warehouse", minimumQuantity: 0, updatedAt: "2026-08-02T00:00:00.000Z", updatedBy: "uat-uxv2-system" }],
    status: "active"
  });
  ensureById(state.productUnits, {
    id: "uat-uxv2-product-out",
    productCode: "UAT-UXV2-HET-HANG",
    productName: "Vật tư tạm hết hàng UAT UXV2",
    unitName: "bao",
    salePrice: 50_000,
    saleTaxRate: 0.08,
    reorderPolicies: [{ warehouseId: "uat-uxv2-warehouse", minimumQuantity: 5, updatedAt: "2026-08-02T00:00:00.000Z", updatedBy: "uat-uxv2-system" }],
    status: "active"
  });
  ensureById(state.productUnits, {
    id: "uat-uxv2-product-inactive",
    productCode: "UAT-UXV2-NGUNG",
    productName: "Vật tư đã ngừng UAT UXV2",
    unitName: "bao",
    salePrice: 25_000,
    saleTaxRate: 0.08,
    status: "inactive"
  });
  ensureById(state.warehouses, {
    id: "uat-uxv2-warehouse",
    code: "UAT-UXV2-KHO",
    name: "Kho UAT UXV2",
    status: "active"
  });
  ensureById(state.vehicles, {
    id: "uat-uxv2-vehicle",
    code: "UAT-UXV2-XE",
    plateNumber: "UAT-00.00",
    capacityTons: 5,
    status: "active"
  });
  ensureById(state.warehouses, {
    id: "uat-uxv2-warehouse-b",
    code: "UAT-UXV2-KHO-B",
    name: "Kho đối chứng UAT UXV2",
    status: "active"
  });
  ensureById(state.vehicles, {
    id: "uat-uxv2-vehicle-b",
    code: "UAT-UXV2-XE-B",
    plateNumber: "UAT-00.01",
    capacityTons: 5,
    status: "active"
  });
  ensureById(state.salesOrders, {
    id: "uat-uxv2-sales-order-open",
    documentNo: "UAT-UXV2-SO-OPEN-001",
    customerId: "uat-uxv2-customer",
    orderDate: "2026-08-02",
    status: "confirmed",
    version: 1,
    currency: "VND",
    deliveryAddress: "Điểm giao công việc mở UAT",
    paymentMethod: "transfer",
    lines: [{
      id: "uat-uxv2-sales-line-open",
      productUnitId: "uat-uxv2-product-unit",
      quantity: 1,
      deliveredQuantity: 0,
      unitPrice: 100_000,
      taxRate: 0.08
    }]
  });
  ensureById(state.salesOrders, {
    id: "uat-uxv2-sales-order",
    documentNo: "UAT-UXV2-SO-001",
    customerId: "uat-uxv2-customer",
    orderDate: "2026-08-02",
    status: "allocated",
    version: 1,
    currency: "VND",
    deliveryAddress: "Điểm giao thử nghiệm UAT",
    paymentMethod: "transfer",
    attachments: [uatAttachment(UAT_UXV2_ATTACHMENT_IDS.customer, "uat-uxv2-user-customer")],
    lines: [{
      id: "uat-uxv2-sales-line",
      productUnitId: "uat-uxv2-product-unit",
      quantity: 10,
      deliveredQuantity: 0,
      unitPrice: 100_000,
      taxRate: 0.08,
      sourceType: "warehouse",
      warehouseId: "uat-uxv2-warehouse",
      allocations: [{
        id: "uat-uxv2-sales-allocation",
        sourceType: "warehouse",
        warehouseId: "uat-uxv2-warehouse",
        allocatedQuantity: 10,
        deliveredQuantity: 0,
        version: 1,
        status: "allocated"
      }]
    }]
  });
  ensureById(state.salesOrders, {
    id: "uat-uxv2-sales-order-b",
    documentNo: "UAT-UXV2-SO-B-001",
    customerId: "uat-uxv2-customer-b",
    orderDate: "2026-08-02",
    status: "allocated",
    version: 1,
    currency: "VND",
    deliveryAddress: "Điểm giao đối chứng UAT",
    paymentMethod: "transfer",
    attachments: [uatAttachment(UAT_UXV2_ATTACHMENT_IDS.customerB, "uat-uxv2-user-customer-b")],
    lines: [{
      id: "uat-uxv2-sales-line-b",
      productUnitId: "uat-uxv2-product-unit",
      quantity: 4,
      deliveredQuantity: 0,
      unitPrice: 100_000,
      taxRate: 0.08,
      sourceType: "warehouse",
      warehouseId: "uat-uxv2-warehouse-b",
      allocations: [{
        id: "uat-uxv2-sales-allocation-b",
        sourceType: "warehouse",
        warehouseId: "uat-uxv2-warehouse-b",
        allocatedQuantity: 4,
        deliveredQuantity: 0,
        version: 1,
        status: "allocated"
      }]
    }]
  });
  ensureById(state.purchaseOrders, {
    id: "uat-uxv2-purchase-order",
    documentNo: "UAT-UXV2-PO-001",
    supplierId: "uat-uxv2-supplier",
    orderDate: "2026-08-02",
    status: "ordered",
    version: 1,
    expectedDeliveryDate: "2026-08-04",
    attachments: [uatAttachment(UAT_UXV2_ATTACHMENT_IDS.supplier, "uat-uxv2-user-supplier")],
    lines: [{
      id: "uat-uxv2-purchase-line",
      productUnitId: "uat-uxv2-product-unit",
      orderedQuantity: 100,
      receivedQuantity: 0,
      unitCost: 80_000,
      taxRate: 0.08,
      destinationType: "warehouse",
      warehouseId: "uat-uxv2-warehouse"
    }]
  });
  ensureById(state.purchaseOrders, {
    id: "uat-uxv2-purchase-order-b",
    documentNo: "UAT-UXV2-PO-B-001",
    supplierId: "uat-uxv2-supplier-b",
    orderDate: "2026-08-02",
    status: "partially_received",
    version: 2,
    expectedDeliveryDate: "2026-08-05",
    attachments: [uatAttachment(UAT_UXV2_ATTACHMENT_IDS.supplierB, "uat-uxv2-user-supplier-b")],
    lines: [{
      id: "uat-uxv2-purchase-line-b",
      productUnitId: "uat-uxv2-product-unit",
      orderedQuantity: 50,
      receivedQuantity: 20,
      unitCost: 79_000,
      taxRate: 0.08,
      destinationType: "warehouse",
      warehouseId: "uat-uxv2-warehouse"
    }]
  });
  ensureById(state.inventoryMovements, {
    id: "uat-uxv2-inventory-opening",
    movementType: "opening",
    sourceDocument: "UAT-UXV2-OPENING",
    postingKey: "uat-uxv2-opening",
    warehouseId: "uat-uxv2-warehouse",
    productUnitId: "uat-uxv2-product-unit",
    quantity: 100,
    unitCost: 80_000,
    postedAt: "2026-08-02T00:00:00.000Z"
  });
  ensureById(state.inventoryMovements, {
    id: "uat-uxv2-inventory-opening-b",
    movementType: "opening",
    sourceDocument: "UAT-UXV2-OPENING-B",
    postingKey: "uat-uxv2-opening-b",
    warehouseId: "uat-uxv2-warehouse-b",
    productUnitId: "uat-uxv2-product-unit",
    quantity: 50,
    unitCost: 80_000,
    postedAt: "2026-08-02T00:00:00.000Z"
  });
  ensureById(state.deliveryJobs, {
    id: "uat-uxv2-delivery-job",
    documentNo: "UAT-UXV2-GH-001",
    salesOrderId: "uat-uxv2-sales-order",
    driverId: "uat-uxv2-employee-driver",
    vehicleId: "uat-uxv2-vehicle",
    helperIds: ["uat-uxv2-employee-worker"],
    plannedDate: "2026-08-02",
    status: "in_transit",
    allocationIds: ["uat-uxv2-sales-allocation"]
  });
  ensureById(state.deliveryJobs, {
    id: "uat-uxv2-delivery-job-b",
    documentNo: "UAT-UXV2-GH-B-001",
    salesOrderId: "uat-uxv2-sales-order-b",
    driverId: "uat-uxv2-employee-driver-b",
    vehicleId: "uat-uxv2-vehicle-b",
    helperIds: ["uat-uxv2-employee-worker-b"],
    plannedDate: "2026-08-02",
    status: "assigned",
    allocationIds: ["uat-uxv2-sales-allocation-b"]
  });
  ensureById(state.workOrders, {
    id: "uat-uxv2-work-order",
    documentNo: "UAT-UXV2-CV-001",
    sourceDocument: "UAT-UXV2-GH-001",
    salesOrderId: "uat-uxv2-sales-order",
    workType: "Bốc hàng thử nghiệm UAT",
    workDate: "2026-08-02",
    status: "assigned",
    version: 2,
    claimedByEmployeeId: "uat-uxv2-employee-worker",
    claimedAt: "2026-08-02T00:05:00.000Z",
    outputs: [],
    participants: [{ employeeId: "uat-uxv2-employee-worker", shareFactor: 1 }]
  });
  ensureById(state.workOrders, {
    id: "uat-uxv2-work-order-open",
    documentNo: "UAT-UXV2-CV-OPEN-001",
    sourceDocument: "UAT-UXV2-GH-OPEN-001",
    salesOrderId: "uat-uxv2-sales-order-open",
    workType: "Công việc mở kiểm tra nhận đồng thời",
    workDate: "2026-08-02",
    status: "open",
    version: 1,
    outputs: [],
    participants: []
  });
  ensureById(state.workOrders, {
    id: "uat-uxv2-work-order-b",
    documentNo: "UAT-UXV2-CV-B-001",
    sourceDocument: "UAT-UXV2-GH-B-001",
    salesOrderId: "uat-uxv2-sales-order-b",
    workType: "Công việc đối chứng UAT",
    workDate: "2026-08-02",
    status: "assigned",
    version: 2,
    claimedByEmployeeId: "uat-uxv2-employee-worker-b",
    claimedAt: "2026-08-02T00:06:00.000Z",
    outputs: [],
    participants: [{ employeeId: "uat-uxv2-employee-worker-b", shareFactor: 1 }]
  });
  ensureById(state.customerPayments, {
    id: "uat-uxv2-customer-payment",
    documentNo: "UAT-UXV2-PT-001",
    customerId: "uat-uxv2-customer",
    amount: 250_000,
    status: "draft",
    allocations: []
  });
  ensureById(state.customerPayments, {
    id: "uat-uxv2-customer-payment-b",
    documentNo: "UAT-UXV2-PT-B-001",
    customerId: "uat-uxv2-customer-b",
    amount: 150_000,
    status: "draft",
    allocations: []
  });
  ensureById(state.supplierPayments, {
    id: "uat-uxv2-supplier-payment",
    documentNo: "UAT-UXV2-PC-001",
    supplierId: "uat-uxv2-supplier",
    amount: 500_000,
    status: "draft",
    allocations: []
  });
  ensureById(state.customerLedgerEntries, {
    id: "uat-uxv2-customer-ledger-sale",
    customerId: "uat-uxv2-customer",
    sourceDocument: "UAT-UXV2-SO-DEBT-001",
    direction: "debit",
    amount: 400_000,
    netAmount: 370_370,
    taxAmount: 29_630,
    postingGroupId: "uat-uxv2-customer-debt",
    entryType: "sale_delivery",
    postingDate: "2026-08-02T00:00:00.000Z",
    dueDate: "2026-08-17"
  });
  ensureById(state.supplierLedgerEntries, {
    id: "uat-uxv2-supplier-ledger-receipt",
    supplierId: "uat-uxv2-supplier",
    sourceDocument: "UAT-UXV2-PO-DEBT-001",
    direction: "credit",
    amount: 600_000,
    netAmount: 555_556,
    taxAmount: 44_444,
    postingGroupId: "uat-uxv2-supplier-debt",
    entryType: "inventory_receipt",
    postingDate: "2026-08-02T00:00:00.000Z"
  });
  ensureById(state.supplierPayments, {
    id: "uat-uxv2-supplier-payment-b",
    documentNo: "UAT-UXV2-PC-B-001",
    supplierId: "uat-uxv2-supplier-b",
    amount: 300_000,
    status: "draft",
    allocations: []
  });
  ensureById(state.auditLogs, {
    id: "uat-uxv2-fixture-audit",
    actorId: "uat-uxv2-system",
    actorName: "Hệ thống UAT",
    action: "UatUxV2FixturePrepared",
    entityType: "workspace",
    entityId: UAT_UXV2_PREFIX,
    occurredAt: "2026-08-02T00:00:00.000Z",
    summary: "Chuẩn bị dữ liệu UAT UXV2 cô lập, không chứa PII."
  });

  assertOperationsInvariants(state);
  return state;
}

export function createUatUxV2IdentityData(
  existing: PersistedIdentityData,
  credentials: UatUxV2FixtureEnvironment["credentials"],
  nextRevision = existing.revision
): PersistedIdentityData {
  const data = structuredClone(existing) as PersistedIdentityData;
  const before = comparablePayload(data);
  const occurredAt = "2026-08-02T00:00:00.000Z";

  for (const role of UAT_UXV2_IDENTITIES) {
    const definition = roleDefinitions[role];
    const credential = credentials[role];
    const normalizedUsername = definition.username.toLocaleLowerCase("vi-VN");
    const existingUser = data.users.find((user) => user.normalizedUsername === normalizedUsername);
    const userId = existingUser?.id ?? `uat-uxv2-user-${role.toLocaleLowerCase("en-US")}`;
    const passwordMatches = Boolean(
      existingUser?.passwordHash && verifyPassword(credential.password, existingUser.passwordHash)
    );
    const accessChanged = Boolean(existingUser) && (
      !passwordMatches
      || existingUser?.role !== definition.userRole
      || existingUser?.employeeId !== definition.employeeId
      || JSON.stringify(existingUser?.warehouseIds ?? []) !== JSON.stringify(definition.warehouseIds ?? [])
      || existingUser?.customerId !== definition.customerId
      || existingUser?.supplierId !== definition.supplierId
    );
    const passwordHash = passwordMatches && existingUser?.passwordHash
      ? existingUser.passwordHash
      : hashPassword(credential.password);
    const nextUser: IdentityUser = {
      ...existingUser,
      id: userId,
      email: `${normalizedUsername}@example.invalid`,
      normalizedEmail: `${normalizedUsername}@example.invalid`,
      username: definition.username,
      normalizedUsername,
      displayName: definition.displayName,
      role: definition.userRole,
      employeeId: definition.employeeId,
      warehouseIds: definition.warehouseIds,
      customerId: definition.customerId,
      supplierId: definition.supplierId,
      moduleIds: [...visibleModulesForRole(definition.userRole)],
      status: "active",
      passwordHash,
      acceptedAt: existingUser?.acceptedAt ?? occurredAt,
      createdAt: existingUser?.createdAt ?? occurredAt,
      updatedAt: existingUser?.updatedAt ?? occurredAt,
      failedLoginAttempts: 0,
      lockedUntil: undefined,
      sessionVersion: existingUser ? existingUser.sessionVersion + (accessChanged ? 1 : 0) : 1
    };
    replaceOrAppend(data.users, nextUser, (user) => user.normalizedUsername === normalizedUsername);
    ensureById(data.auditEvents, {
      id: `uat-uxv2-identity-audit-${role.toLocaleLowerCase("en-US")}`,
      action: "user_access_updated",
      targetUserId: userId,
      targetEmail: definition.username,
      occurredAt,
      summary: `Chuẩn bị tài khoản ${definition.displayName} cho fixture UAT UXV2.`
    });
  }

  data.revision = comparablePayload(data) === before ? existing.revision : nextRevision;
  return data;
}

export function createUatUxV2CommunicationData(existing: PersistedCommunicationData, nextRevision: number) {
  const data = structuredClone(existing) as PersistedCommunicationData;
  const before = comparablePayload(data);
  for (const party of [
    { type: "customer" as const, id: "uat-uxv2-customer", userId: "uat-uxv2-user-customer", role: "customer" as const, suffix: "customer" },
    { type: "customer" as const, id: "uat-uxv2-customer-b", userId: "uat-uxv2-user-customer-b", role: "customer" as const, suffix: "customer-b" },
    { type: "supplier" as const, id: "uat-uxv2-supplier", userId: "uat-uxv2-user-supplier", role: "supplier" as const, suffix: "supplier" },
    { type: "supplier" as const, id: "uat-uxv2-supplier-b", userId: "uat-uxv2-user-supplier-b", role: "supplier" as const, suffix: "supplier-b" }
  ]) {
    const threadId = `partner:${party.type}:${party.id}`;
    ensureById(data.threads, { id: threadId, partyType: party.type, partyId: party.id, createdAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-02T00:10:00.000Z" });
    ensureById(data.messages, { id: `uat-uxv2-message-${party.suffix}`, threadId, senderUserId: party.userId, senderName: roleDefinitions[party.suffix.toUpperCase().replace("-", "_") as UatUxV2Identity]?.displayName ?? "Đối tác UAT", senderRole: party.role, body: `Tin nhắn cô lập ${party.suffix}.`, idempotencyKey: `uat-uxv2-message-${party.suffix}`, sentAt: "2026-08-02T00:10:00.000Z" });
    ensureById(data.auditEvents, { id: `uat-uxv2-message-audit-${party.suffix}`, action: "message_sent", actorUserId: party.userId, partyType: party.type, partyId: party.id, occurredAt: "2026-08-02T00:10:00.000Z", summary: "Tạo tin nhắn đối chứng UAT." });
  }
  data.revision = comparablePayload(data) === before ? existing.revision : nextRevision;
  return data;
}

export function createUatUxV2PushData(existing: PersistedPushData, nextRevision: number) {
  const data = structuredClone(existing) as PersistedPushData;
  const before = comparablePayload(data);
  for (const identity of ["CUSTOMER", "CUSTOMER_B", "SUPPLIER", "SUPPLIER_B"] as const) {
    const definition = roleDefinitions[identity];
    const suffix = identity.toLocaleLowerCase("en-US").replace("_", "-");
    ensureById(data.subscriptions, {
      id: `uat-uxv2-push-subscription-${suffix}`,
      userId: `uat-uxv2-user-${suffix}`,
      role: definition.userRole,
      customerId: definition.customerId,
      supplierId: definition.supplierId,
      channel: "web",
      endpoint: `https://push.example.invalid/${suffix}`,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
      lastSeenAt: "2026-08-02T00:00:00.000Z"
    });
    ensureById(data.events, {
      id: `uat-uxv2-push-event-${suffix}`,
      eventKey: `uat-uxv2:event:${suffix}`,
      audience: { customerId: definition.customerId, supplierId: definition.supplierId },
      payload: { title: "Cập nhật UAT", body: "Có thông tin mới cần xem.", url: definition.customerId ? "/khach-hang" : "/nha-cung-cap", tag: `uat-uxv2-${suffix}` },
      status: "pending",
      attempts: 0,
      deliveredSubscriptionIds: [],
      createdAt: "2026-08-02T00:00:00.000Z"
    });
  }
  data.revision = comparablePayload(data) === before ? existing.revision : nextRevision;
  return data;
}

export async function applyUatUxV2Fixture(environment: UatUxV2FixtureEnvironment) {
  const client = createClient(environment.supabaseUrl, environment.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const documents = new SupabaseRuntimeDocumentStore(client);
  const operationsRevision = await updateDocument<PersistedOperationsData>(
    documents,
    "operations",
    { schemaVersion: 1, state: createInitialOperationsState(), idempotencyRecords: [] },
    (current) => ({ ...current, state: createUatUxV2OperationsState(current.state) })
  );
  const identityRevision = await updateDocument<PersistedIdentityData>(
    documents,
    "identity",
    { schemaVersion: 1, revision: 0, users: [], auditEvents: [] },
    (current, nextRevision) => createUatUxV2IdentityData(current, environment.credentials, nextRevision)
  );
  const communicationRevision = await updateDocument<PersistedCommunicationData>(
    documents,
    "communications",
    { schemaVersion: 1, revision: 0, threads: [], messages: [], auditEvents: [] },
    (current, nextRevision) => createUatUxV2CommunicationData(current, nextRevision)
  );
  const pushRevision = await updateDocument<PersistedPushData>(
    documents,
    "push_notifications",
    { schemaVersion: 1, revision: 0, subscriptions: [], events: [], deliveries: [] },
    (current, nextRevision) => createUatUxV2PushData(current, nextRevision)
  );
  await ensureUatAttachmentObjects(client);
  return {
    operationsRevision,
    identityRevision,
    communicationRevision,
    pushRevision,
    usernames: Object.fromEntries(UAT_UXV2_IDENTITIES.map((role) => [role, environment.credentials[role].username]))
  };
}

async function updateDocument<T>(
  documents: SupabaseRuntimeDocumentStore,
  namespace: string,
  initial: T,
  update: (current: T, nextRevision: number) => T
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await documents.read(namespace, initial);
    const next = update(structuredClone(current.payload), current.revision + 1);
    if (JSON.stringify(next) === JSON.stringify(current.payload)) return current.revision;
    const committed = await documents.compareAndSwap(namespace, current.revision, next);
    if (committed.committed) return committed.revision;
  }
  throw new Error(`Không thể áp dụng fixture ${UAT_UXV2_PREFIX} vì runtime document ${namespace} thay đổi liên tục.`);
}

function ensureById<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) items.push(item);
  else items[index] = item;
}

function replaceOrAppend<T>(items: T[], item: T, matches: (candidate: T) => boolean) {
  const index = items.findIndex(matches);
  if (index < 0) items.push(item);
  else items[index] = item;
}

const uatPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function uatAttachment(id: string, uploadedBy: string): OperationsAttachment {
  return {
    id,
    fileName: `${id}.png`,
    contentType: "image/png",
    size: uatPng.length,
    sha256: createHash("sha256").update(uatPng).digest("hex"),
    uploadedBy,
    uploadedAt: "2026-08-02T00:00:00.000Z"
  };
}

async function ensureUatAttachmentObjects(client: SupabaseClient<any, "public", any, any, any>) {
  for (const id of Object.values(UAT_UXV2_ATTACHMENT_IDS)) {
    const { error } = await client.storage.from("erp-attachments").upload(`${id}.png`, uatPng, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`Không thể tạo tệp UAT riêng tư ${id}: ${error.message}`);
  }
}

function comparablePayload(value: { revision: number }) {
  return JSON.stringify({ ...value, revision: 0 });
}
