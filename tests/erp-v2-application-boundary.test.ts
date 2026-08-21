import { describe, expect, it } from "vitest";
import { MemoryOperationsBackend } from "@/server/infrastructure/memory-operations-backend";
import { ErpV2CommandService } from "@/server/application/erp-v2-command-service";
import { createOwnerActor } from "@/modules/operations/commands";

describe("ERP V2 application boundary", () => {
  it("preserves the canonical authorization, transaction and idempotency service", async () => {
    const backend = new MemoryOperationsBackend();
    const service = new ErpV2CommandService(backend);
    const actor = createOwnerActor();

    const first = await service.execute({
      operation: "confirmSalesOrder",
      actor,
      now: "2026-08-21T00:00:00.000Z",
      idempotencyKey: "erp-v2-boundary-confirm",
      targetId: "so-001"
    });
    const replay = await service.execute({
      operation: "confirmSalesOrder",
      actor,
      now: "2026-08-21T00:00:01.000Z",
      idempotencyKey: "erp-v2-boundary-confirm",
      targetId: "so-001"
    });

    expect(first.state.salesOrders.find((order) => order.id === "so-001")?.status).toBe("confirmed");
    expect(replay.severity).toBe("warning");
    expect(replay.state.auditLogs.filter((log) => log.action === "confirmSalesOrder")).toHaveLength(1);
  });
});
