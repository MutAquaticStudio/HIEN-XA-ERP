import { describe, expect, it } from "vitest";
import { createAuditIntegrityReport } from "../src/modules/operations/audit-integrity";
import { customerBalance } from "../src/modules/operations/selectors";
import { createInitialOperationsState } from "../src/modules/operations/sample-data";
import { createOwnerActor } from "../src/modules/operations/service";
import { OperationInputError } from "../src/modules/operations/errors";
import { OperationsCommandService } from "../src/server/application/operations-command-service";
import { MemoryOperationsBackend } from "../src/server/infrastructure/memory-operations-backend";

const actor = createOwnerActor();
const now = "2026-07-16T11:00:00.000+07:00";

describe("OperationsCommandService", () => {
  it("wraps commands in backend idempotency and replays without a second mutation", async () => {
    const backend = new MemoryOperationsBackend();
    const service = new OperationsCommandService(backend);
    const initialRevision = backend.getRevision();

    const first = await service.execute({
      operation: "confirmSalesOrder",
      actor,
      now,
      idempotencyKey: "confirm-same-key-12345"
    });
    const second = await service.execute({
      operation: "confirmSalesOrder",
      actor,
      now,
      idempotencyKey: "confirm-same-key-12345"
    });

    const state = backend.getState();

    expect(first.state.salesOrders[0]?.version).toBe(2);
    expect(second.severity).toBe("warning");
    expect(state.salesOrders[0]?.version).toBe(2);
    expect(backend.getRevision()).toBe(initialRevision + 1);
    expect(state.auditLogs.filter((log) => log.action === "confirmSalesOrder")).toHaveLength(1);
  });

  it("rolls back the in-memory transaction when a command fails", async () => {
    const backend = new MemoryOperationsBackend();
    const service = new OperationsCommandService(backend);

    await expect(
      service.execute({
        operation: "completeDelivery",
        actor,
        now,
        idempotencyKey: "complete-too-early-12345"
      })
    ).rejects.toThrow("xuất bến");

    const state = backend.getState();

    expect(state.salesOrders[0]?.status).toBe("draft");
    expect(state.inventoryMovements).toHaveLength(1);
    expect(customerBalance(state.customerLedgerEntries, "cus-minh-anh")).toBe(0);
  });

  it("rejects commands before mutation when the actor lacks the registry permission", async () => {
    const backend = new MemoryOperationsBackend();
    const service = new OperationsCommandService(backend);

    await expect(
      service.execute({
        operation: "confirmSalesOrder",
        actor: {
          ...actor,
          permissions: actor.permissions.filter((permission) => permission !== "sales.confirm")
        },
        now,
        idempotencyKey: "missing-sales-confirm-12345"
      })
    ).rejects.toThrow("quyền");

    const state = backend.getState();

    expect(state.salesOrders[0]?.status).toBe("draft");
    expect(state.auditLogs.some((log) => log.action === "confirmSalesOrder")).toBe(false);
  });

  it("maps version conflicts to operation input errors with 409", async () => {
    const backend = new MemoryOperationsBackend();
    const service = new OperationsCommandService(backend);

    await expect(
      service.execute({
        operation: "confirmSalesOrder",
        actor,
        now,
        idempotencyKey: "version-conflict-12345",
        options: { expectedVersion: 99 }
      })
    ).rejects.toMatchObject({
      name: "OperationInputError",
      code: "VERSION_CONFLICT",
      status: 409
    });
  });

  it("rejects command results that would leave ERP invariants broken", async () => {
    const invalidState = createInitialOperationsState();
    const payment = invalidState.customerPayments[0];

    if (!payment) {
      throw new Error("Missing seeded payment.");
    }

    invalidState.customerLedgerEntries.push({
      id: "cle-invalid-receivable",
      customerId: payment.customerId,
      sourceDocument: "SO-INVALID:GIAO-KHO",
      direction: "debit",
      amount: payment.amount * 2,
      postingDate: now
    });
    payment.allocations = [
      {
        ledgerEntryId: "cle-invalid-receivable",
        amount: payment.amount + 1
      }
    ];

    const backend = new MemoryOperationsBackend(invalidState);
    const service = new OperationsCommandService(backend);
    const initialRevision = backend.getRevision();

    await expect(
      service.execute({
        operation: "confirmSalesOrder",
        actor,
        now,
        idempotencyKey: "invalid-invariant-12345"
      })
    ).rejects.toThrow("payment_over_allocated");

    expect(backend.getRevision()).toBe(initialRevision);
    expect(backend.getState().salesOrders[0]?.status).toBe("draft");
    expect(backend.getState()).toBeDefined();
  });

  it("maps ERP maintenance to a structured operation error", async () => {
    const originalMaintenanceMode = process.env.ERP_MAINTENANCE_MODE;
    process.env.ERP_MAINTENANCE_MODE = "read_only";

    try {
      const backend = new MemoryOperationsBackend();
      const service = new OperationsCommandService(backend);

      await expect(
        service.execute({
          operation: "confirmSalesOrder",
          actor,
          now,
          idempotencyKey: "read-only-12345"
        })
      ).rejects.toBeInstanceOf(OperationInputError);
    } finally {
      process.env.ERP_MAINTENANCE_MODE = originalMaintenanceMode;
    }
  });

  it("allows new transactions with legacy audit gaps while preventing new audit regressions", async () => {
    const legacyState = createInitialOperationsState();
    legacyState.auditLogs.push({
      id: "audit-legacy-gap",
      actorId: "user-owner-old",
      actorName: "Chủ cửa hàng",
      actorRole: "owner",
      action: "confirmSalesOrder",
      entityType: "operations_workspace",
      entityId: "full_erp",
      occurredAt: now,
      summary: "Xác nhận đơn từ phiên bản cũ."
    });
    legacyState.processedOperations.push({
      idempotencyKey: "legacy-confirm-without-correlation",
      operation: "confirmSalesOrder",
      summary: "Xác nhận đơn từ phiên bản cũ."
    });
    const legacyErrorCount = createAuditIntegrityReport(legacyState).issues.filter((issue) => issue.severity === "error").length;
    expect(legacyErrorCount).toBeGreaterThan(0);

    const backend = new MemoryOperationsBackend(legacyState);
    const service = new OperationsCommandService(backend);
    const previousPaymentCount = legacyState.supplierPayments.length;

    await service.execute({
      command: {
        type: "createSupplierPaymentDraft",
        supplierId: "sup-cat-da-hai-an",
        amount: 500000
      },
      actor,
      now,
      idempotencyKey: "supplier-payment-with-legacy-audit"
    });

    const nextState = backend.getState();
    expect(nextState.supplierPayments).toHaveLength(previousPaymentCount + 1);
    expect(nextState.supplierPayments.at(-1)).toMatchObject({ supplierId: "sup-cat-da-hai-an", amount: 500000, status: "draft" });
    expect(nextState.auditLogs[0]).toMatchObject({
      action: "createSupplierPaymentDraft",
      correlationId: "supplier-payment-with-legacy-audit"
    });
    expect(createAuditIntegrityReport(nextState).issues.filter((issue) => issue.severity === "error")).toHaveLength(legacyErrorCount);
  });
});
