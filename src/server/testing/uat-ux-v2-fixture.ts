import { createClient } from "@supabase/supabase-js";
import { visibleModulesForRole } from "@/modules/operations/identity";
import { assertOperationsInvariants } from "@/modules/operations/invariants";
import { createInitialOperationsState } from "@/modules/operations/sample-data";
import type { OperationsState, UserRole } from "@/modules/operations/types";
import { hashPassword, verifyPassword } from "@/server/identity/crypto";
import type { IdentityUser, PersistedIdentityData } from "@/server/identity/types";
import { SupabaseRuntimeDocumentStore } from "@/server/infrastructure/supabase-runtime-document-store";
import {
  requireIntegrationTestEnvironment,
  type IntegrationTestEnvironment
} from "./integration-test-environment";

export const UAT_UXV2_PREFIX = "UAT-UXV2";
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

export type UatUxV2Role = (typeof UAT_UXV2_ROLES)[number];

export type UatUxV2FixtureEnvironment = IntegrationTestEnvironment & {
  credentials: Record<UatUxV2Role, { username: string; password: string }>;
};

type PersistedOperationsData = {
  schemaVersion: 1;
  state: OperationsState;
  idempotencyRecords: unknown[];
};

const roleDefinitions: Record<UatUxV2Role, {
  userRole: UserRole;
  username: string;
  displayName: string;
  employeeId?: string;
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
    employeeId: "uat-uxv2-employee-warehouse"
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
  for (const role of UAT_UXV2_ROLES) {
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
  ensureById(state.suppliers, {
    id: "uat-uxv2-supplier",
    code: "UAT-UXV2-NCC",
    displayName: "Nhà cung cấp UAT UXV2",
    phone: "0000000000",
    paymentTermDays: 15,
    paymentTermsNote: "Fixture UAT, không dùng dữ liệu cá nhân.",
    status: "active"
  });

  const employees: OperationsState["employees"] = [
    { id: "uat-uxv2-employee-accountant", code: "UAT-KT", displayName: "Kế toán UAT UXV2", roleType: "accountant", status: "active" },
    { id: "uat-uxv2-employee-warehouse", code: "UAT-KHO", displayName: "Nhân viên kho UAT UXV2", roleType: "warehouse", status: "active" },
    { id: "uat-uxv2-employee-dispatcher", code: "UAT-DP", displayName: "Điều phối UAT UXV2", roleType: "supervisor", status: "active" },
    { id: "uat-uxv2-employee-driver", code: "UAT-TX", displayName: "Tài xế UAT UXV2", roleType: "driver", status: "active" },
    { id: "uat-uxv2-employee-worker", code: "UAT-THO", displayName: "Thợ UAT UXV2", roleType: "worker", status: "active" }
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
    status: "active"
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
  ensureById(state.salesOrders, {
    id: "uat-uxv2-sales-order",
    documentNo: "UAT-UXV2-SO-001",
    customerId: "uat-uxv2-customer",
    orderDate: "2026-08-02",
    status: "draft",
    version: 1,
    currency: "VND",
    deliveryAddress: "Điểm giao thử nghiệm UAT",
    paymentMethod: "transfer",
    lines: [{
      id: "uat-uxv2-sales-line",
      productUnitId: "uat-uxv2-product-unit",
      quantity: 10,
      deliveredQuantity: 0,
      unitPrice: 100_000,
      taxRate: 0.08
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
  ensureById(state.deliveryJobs, {
    id: "uat-uxv2-delivery-job",
    documentNo: "UAT-UXV2-GH-001",
    salesOrderId: "uat-uxv2-sales-order",
    driverId: "uat-uxv2-employee-driver",
    vehicleId: "uat-uxv2-vehicle",
    helperIds: ["uat-uxv2-employee-worker"],
    plannedDate: "2026-08-02",
    status: "in_transit"
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
  const occurredAt = "2026-08-02T00:00:00.000Z";

  for (const role of UAT_UXV2_ROLES) {
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

  data.revision = nextRevision;
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
  return {
    operationsRevision,
    identityRevision,
    usernames: Object.fromEntries(UAT_UXV2_ROLES.map((role) => [role, environment.credentials[role].username]))
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
  if (!items.some((candidate) => candidate.id === item.id)) items.push(item);
}

function replaceOrAppend<T>(items: T[], item: T, matches: (candidate: T) => boolean) {
  const index = items.findIndex(matches);
  if (index < 0) items.push(item);
  else items[index] = item;
}
