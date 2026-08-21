import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  revalidatePath: vi.fn(),
  requireIdentityUser: vi.fn(),
  operationsActorForIdentity: vi.fn(),
  getSnapshot: vi.fn(),
  runCreateCommand: vi.fn(),
  saveTransferProof: vi.fn(),
  removeTransferProof: vi.fn()
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/identity/auth-context", () => ({
  requireIdentityUser: mocks.requireIdentityUser,
  operationsActorForIdentity: mocks.operationsActorForIdentity
}));
vi.mock("@/server/erp-v2/runtime", () => ({
  getErpV2Snapshot: mocks.getSnapshot,
  runErpV2CreateCommand: mocks.runCreateCommand
}));
vi.mock("@/server/infrastructure/operations-attachment-store", () => ({
  saveOperationsTransferProofDocument: mocks.saveTransferProof,
  removeOperationsTransferProofDocument: mocks.removeTransferProof
}));

import {
  createCustomerPortalOrderAction,
  submitCustomerPaymentProofAction,
  submitSupplierDeliveryNoticeAction,
  submitSupplierPurchaseOrderResponseAction
} from "@/app/portal-actions";

const customer = { id: "customer-1", role: "customer", customerId: "customer-1", displayName: "Khach hang" };
const supplier = { id: "supplier-1", role: "supplier", supplierId: "supplier-1", displayName: "Nha cung cap" };
const actor = { id: "actor-1", role: "customer" };
const idempotencyKey = "customer-order-20260727-0001";

describe("partner portal server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://erp.example.test", host: "erp.example.test" }));
    mocks.operationsActorForIdentity.mockReturnValue(actor);
    mocks.runCreateCommand.mockResolvedValue({ summary: "Da ghi nhan yeu cau." });
    mocks.getSnapshot.mockResolvedValue({ state: { salesOrders: [{ id: "SO-1", customerId: "customer-1" }] } });
  });

  it("rejects a cross-origin customer order before resolving identity or command data", async () => {
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://attacker.example", host: "erp.example.test" }));

    const result = await createCustomerPortalOrderAction({
      idempotencyKey,
      deliveryAddress: "12 Duong Mau, Quan 1, TP HCM",
      paymentMethod: "transfer",
      lines: [{ productUnitId: "PU-1", quantity: 2 }]
    });

    expect(result.ok).toBe(false);
    expect(mocks.requireIdentityUser).not.toHaveBeenCalled();
    expect(mocks.runCreateCommand).not.toHaveBeenCalled();
  });

  it("creates a customer draft order with server-owned pricing and idempotency", async () => {
    mocks.requireIdentityUser.mockResolvedValue(customer);

    const result = await createCustomerPortalOrderAction({
      idempotencyKey,
      deliveryAddress: "12 Duong Mau, Quan 1, TP HCM",
      customerNote: "Giao buoi sang",
      paymentMethod: "credit_requested",
      lines: [{ productUnitId: "PU-1", quantity: 2, unitPrice: 1, vatRate: 0 }]
    });

    expect(result).toEqual({ ok: true, message: "Da ghi nhan yeu cau." });
    expect(mocks.runCreateCommand).toHaveBeenCalledWith({
      type: "createCustomerPortalSalesOrder",
      customerId: "customer-1",
      deliveryAddress: "12 Duong Mau, Quan 1, TP HCM",
      customerNote: "Giao buoi sang",
      paymentMethod: "credit_requested",
      lines: [{ productUnitId: "PU-1", quantity: 2 }]
    }, idempotencyKey, actor);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/khach-hang");
  });

  it("does not allow a non-customer identity to create a customer order", async () => {
    mocks.requireIdentityUser.mockResolvedValue({ id: "staff-1", role: "sales", displayName: "Nhan vien" });

    const result = await createCustomerPortalOrderAction({
      idempotencyKey,
      deliveryAddress: "12 Duong Mau, Quan 1, TP HCM",
      paymentMethod: "transfer",
      lines: [{ productUnitId: "PU-1", quantity: 2 }]
    });

    expect(result.ok).toBe(false);
    expect(mocks.runCreateCommand).not.toHaveBeenCalled();
  });

  it("requires proof files before a customer payment request can be recorded", async () => {
    mocks.requireIdentityUser.mockResolvedValue(customer);
    const formData = new FormData();
    formData.set("orderId", "SO-1");
    formData.set("amount", "120000");
    formData.set("idempotencyKey", "customer-proof-20260727-0001");

    const result = await submitCustomerPaymentProofAction(formData);

    expect(result.ok).toBe(false);
    expect(mocks.getSnapshot).not.toHaveBeenCalled();
    expect(mocks.saveTransferProof).not.toHaveBeenCalled();
    expect(mocks.runCreateCommand).not.toHaveBeenCalled();
  });

  it("records a supplier availability response only for the linked supplier", async () => {
    mocks.requireIdentityUser.mockResolvedValue(supplier);
    mocks.operationsActorForIdentity.mockReturnValue({ id: "supplier-1", role: "supplier" });

    const result = await submitSupplierPurchaseOrderResponseAction({
      idempotencyKey: "supplier-response-20260727-0001",
      purchaseOrderId: "PO-1",
      status: "available",
      proposedDeliveryDate: "2026-07-30",
      note: "Co the giao dung hen"
    });

    expect(result).toEqual({ ok: true, message: "Da ghi nhan yeu cau." });
    expect(mocks.runCreateCommand).toHaveBeenCalledWith({
      type: "submitSupplierPurchaseOrderResponse",
      supplierId: "supplier-1",
      purchaseOrderId: "PO-1",
      status: "available",
      proposedDeliveryDate: "2026-07-30",
      note: "Co the giao dung hen"
    }, "supplier-response-20260727-0001", { id: "supplier-1", role: "supplier" });
  });

  it("submits a supplier delivery notice as a request, without posting warehouse or payable entries", async () => {
    mocks.requireIdentityUser.mockResolvedValue(supplier);
    mocks.operationsActorForIdentity.mockReturnValue({ id: "supplier-1", role: "supplier" });
    const formData = new FormData();
    formData.set("purchaseOrderId", "PO-1");
    formData.set("idempotencyKey", "supplier-delivery-20260727-0001");
    formData.set("line:POL-1", "12");
    formData.set("line:POL-2", "3.5");
    formData.set("note", "Da giao tai kho cong trinh");

    const result = await submitSupplierDeliveryNoticeAction(formData);

    expect(result).toEqual({ ok: true, message: "Da ghi nhan yeu cau." });
    expect(mocks.runCreateCommand).toHaveBeenCalledWith({
      type: "submitSupplierDeliveryNotice",
      supplierId: "supplier-1",
      purchaseOrderId: "PO-1",
      lineQuantities: { "POL-1": 12, "POL-2": 3.5 },
      note: "Da giao tai kho cong trinh",
      attachments: []
    }, "supplier-delivery-20260727-0001", { id: "supplier-1", role: "supplier" });
  });
});
