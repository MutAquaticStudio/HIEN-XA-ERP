import type { MobileSession } from "./session";
import { resolveMobileApiPath } from "./api-url";
import { handleMobileUnauthorizedResponse } from "./mobile-auth-boundary";
import { requireMobileNetworkForMutation } from "./mobile-network";

export class MobileApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MobileApiError";
  }
}

function responseErrorMessage(status: number) {
  if (status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (status === 403) return "Tài khoản không có quyền thực hiện thao tác này.";
  if (status === 404) return "Máy chủ chưa được cập nhật đầy đủ cho ứng dụng. Vui lòng thử lại sau ít phút.";
  if (status >= 500) return "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.";
  return "Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.";
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  if ((init.method ?? "GET").toUpperCase() !== "GET") await requireMobileNetworkForMutation();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(resolveMobileApiPath(path), {
      ...init,
      headers
    });
  } catch {
    throw new MobileApiError("Không thể kết nối máy chủ. Kiểm tra mạng rồi thử lại.", 0);
  }
  const rawPayload = await response.text();
  let payload: ({ ok?: boolean; error?: string } & T) | undefined;
  try {
    payload = rawPayload.trim() ? JSON.parse(rawPayload) as { ok?: boolean; error?: string } & T : undefined;
  } catch {
    payload = undefined;
  }
  if (!response.ok || !payload || payload.ok === false) {
    if (response.status === 401) await handleMobileUnauthorizedResponse();
    throw new MobileApiError(payload?.error ?? responseErrorMessage(response.status), response.status);
  }
  return payload;
}

export async function login(identifier: string, password: string): Promise<MobileSession> {
  const payload = await request<MobileSession>("/api/mobile/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) });
  return { accessToken: payload.accessToken, user: payload.user };
}

export type MobileReleaseManifest = {
  enabled: boolean;
  latestVersion?: string;
  minimumSupportedVersion?: string;
  downloadUrl?: string;
  notes?: string;
};

export async function getMobileReleaseManifest() {
  return request<MobileReleaseManifest>("/api/mobile/release");
}

export type MobileTrackingPoint = {
  latitude: number;
  longitude: number;
  recordedAt: string;
  accuracyMeters?: number;
  quality?: "accepted" | "suspect";
};

export type MobileTrackingJob = {
  id: string;
  documentNo: string;
  status: string;
  plannedDate: string;
  deliveryAddress?: string;
  trackingEligible: boolean;
};

export type MobileTrackingSession = {
  id: string;
  deliveryJobId: string;
  status: string;
  latestPoint?: MobileTrackingPoint;
  points: MobileTrackingPoint[];
};

export type MobileTrackingOverview = {
  canManage: boolean;
  jobs: MobileTrackingJob[];
  sessions: MobileTrackingSession[];
};

export async function getTrackingOverview(accessToken: string) {
  return request<MobileTrackingOverview>("/api/mobile/tracking", {}, accessToken);
}

export async function startTrackingSession(accessToken: string, deliveryJobId: string) {
  return request<{ session: { id: string }; created: boolean }>("/api/mobile/tracking", { method: "POST", body: JSON.stringify({ action: "start", deliveryJobId }) }, accessToken);
}

export async function recordMobileTrackingConsent(accessToken: string, input: { deliveryJobId: string; policyVersion: string; idempotencyKey: string; acceptedAt: string }) {
  return request<{ consent: { id: string } }>("/api/mobile/tracking/consent", { method: "POST", body: JSON.stringify({ action: "grant", ...input }) }, accessToken);
}

export async function stopTrackingSession(accessToken: string, sessionId: string) {
  return request<{ session: { id: string } }>("/api/mobile/tracking", { method: "POST", body: JSON.stringify({ action: "stop", sessionId }) }, accessToken);
}

export async function sendTrackingPoint(accessToken: string, body: Record<string, unknown>) {
  return request("/api/mobile/tracking/points", { method: "POST", body: JSON.stringify(body) }, accessToken);
}

export async function registerPushSubscription(accessToken: string, endpoint: string) {
  return request("/api/notifications/subscription", {
    method: "POST",
    body: JSON.stringify({ channel: "expo", endpoint })
  }, accessToken);
}

export async function removePushSubscription(accessToken: string, endpoint: string) {
  return request("/api/notifications/subscription", {
    method: "DELETE",
    body: JSON.stringify({ channel: "expo", endpoint })
  }, accessToken);
}

export type MobilePortalOverview = {
  role: string;
  displayName: string;
  revision: number;
  syncedAt: string;
  state: {
    salesOrders: Array<{ id: string; documentNo: string; status: string; deliveryAddress?: string; paymentMethod?: string; lines: Array<{ productUnitId: string; productName: string; unitName: string; quantity: number; deliveredQuantity: number; unitPrice: number; taxRate: number }> }>;
    purchaseOrders: Array<{ id: string; documentNo: string; status: string; expectedDeliveryDate?: string; lines: Array<{ productUnitId: string; productName: string; unitName: string; orderedQuantity: number; receivedQuantity: number; unitCost: number; taxRate: number }> }>;
    deliveryJobs: Array<{ id: string; documentNo: string; salesOrderId: string; status: string; plannedDate: string }>;
    workOrders: Array<{ id: string; documentNo: string; sourceDocument: string; salesOrderId?: string; workType: string; workDate: string; status: string; version?: number }>;
    customerLedgerEntries: Array<{ direction: "debit" | "credit"; amount: number; sourceDocument: string; dueDate?: string; reversedById?: string }>;
    supplierLedgerEntries: Array<{ direction: "debit" | "credit"; amount: number; sourceDocument: string; dueDate?: string; reversedById?: string }>;
  };
};

export type MobileCatalogItem = { id: string; productCode: string; productName: string; unitName: string; salePrice: number; saleTaxRate: number };

export type MobileManagementOverview = {
  role: string;
  displayName: string;
  revision: number;
  syncedAt: string;
  metrics: Array<{ id: string; label: string; value: number }>;
  salesOrders: Array<{ id: string; documentNo: string; status: string }>;
  purchaseOrders: Array<{ id: string; documentNo: string; status: string }>;
  modules: Array<{
    id: string;
    label: string;
    description: string;
    count: number;
    records: MobileManagementRecord[];
  }>;
};

export type MobileManagementActionOperation = "confirmSalesOrder" | "confirmPurchaseOrder";

export type MobileManagementRecord = {
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  action?: {
    operation: MobileManagementActionOperation;
    targetId: string;
    label: string;
    confirmationTitle: string;
    confirmationMessage: string;
  };
};

export async function getMobilePortalOverview(accessToken: string) {
  return request<MobilePortalOverview>("/api/mobile/portal/overview", {}, accessToken);
}

export async function getMobileManagementOverview(accessToken: string) {
  return request<MobileManagementOverview>("/api/mobile/management/overview", {}, accessToken);
}

export async function runMobileManagementAction(accessToken: string, input: {
  operation: MobileManagementActionOperation;
  targetId: string;
  idempotencyKey: string;
}) {
  return request<{ summary: string }>("/api/mobile/management/operations", {
    method: "POST",
    body: JSON.stringify(input)
  }, accessToken);
}

export async function confirmMobileSalesOrder(accessToken: string, input: { targetId: string; idempotencyKey: string }) {
  return runMobileManagementAction(accessToken, { operation: "confirmSalesOrder", ...input });
}

export async function confirmMobilePurchaseOrder(accessToken: string, input: { targetId: string; idempotencyKey: string }) {
  return runMobileManagementAction(accessToken, { operation: "confirmPurchaseOrder", ...input });
}

export async function getMobileCustomerCatalog(accessToken: string) {
  return (await request<{ catalog: MobileCatalogItem[] }>("/api/mobile/customer/catalog", {}, accessToken)).catalog;
}

export async function createMobileCustomerOrder(accessToken: string, input: Record<string, unknown>) {
  return request<{ summary: string }>("/api/mobile/customer/orders", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export async function confirmMobileDeliveryReceipt(accessToken: string, formData: FormData) {
  return request<{ summary: string }>("/api/mobile/customer/delivery-receipts", { method: "POST", body: formData }, accessToken);
}

export async function submitMobileCustomerPaymentProof(accessToken: string, formData: FormData) {
  return request<{ summary: string }>("/api/mobile/customer/payment-proofs", { method: "POST", body: formData }, accessToken);
}

export async function submitMobileSupplierResponse(accessToken: string, input: Record<string, unknown>) {
  return request<{ summary: string }>("/api/mobile/supplier/responses", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export async function submitMobileSupplierDeliveryNotice(accessToken: string, formData: FormData) {
  return request<{ summary: string }>("/api/mobile/supplier/delivery-notices", { method: "POST", body: formData }, accessToken);
}

export async function submitMobileDeliveryCompletion(accessToken: string, formData: FormData) {
  return request<{ summary: string }>("/api/mobile/delivery/completions", { method: "POST", body: formData }, accessToken);
}

export async function claimMobileWorkOrder(accessToken: string, input: Record<string, unknown>) {
  return request<{ summary: string }>("/api/mobile/workforce/work-orders/claim", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export type MobileMessage = { id: string; body: string; sentAt: string; senderName?: string; senderRole?: string };

export async function getMobileMessages(accessToken: string, partyType: "customer" | "supplier") {
  return request<{ messages: MobileMessage[] }>(`/api/mobile/communications/messages?partyType=${partyType}`, {}, accessToken);
}

export async function sendMobileMessage(accessToken: string, input: { partyType: "customer" | "supplier"; body: string; idempotencyKey: string }) {
  return request<{ message: MobileMessage }>("/api/mobile/communications/messages", { method: "POST", body: JSON.stringify(input) }, accessToken);
}
