import { z } from "zod";
import { getDemoOperationsSnapshot, runDemoOperation } from "@/modules/operations/demo-store";
import type { OperationsActor } from "@/modules/operations/types";
import type { SafeIdentityUser } from "@/server/identity/types";
import { PublicApiError } from "@/server/shared/public-api-error";
import { mobileIdempotencySchema } from "./mobile-portal-service";

const mobileManagementOperationSchema = z.object({
  operation: z.enum(["confirmSalesOrder", "confirmPurchaseOrder"]),
  targetId: z.string().trim().min(1).max(128),
  idempotencyKey: mobileIdempotencySchema
});

export async function runMobileManagementOperation(user: SafeIdentityUser, actor: OperationsActor, input: unknown) {
  const value = mobileManagementOperationSchema.parse(input);
  const snapshot = await getDemoOperationsSnapshot();

  if (value.operation === "confirmSalesOrder") {
    if (!canConfirmSalesOrder(user.role) || !snapshot.state.salesOrders.some((item) => item.id === value.targetId)) {
      throw new PublicApiError(403, "Bạn không có quyền xác nhận đơn bán này.");
    }
  } else if (!canConfirmPurchaseOrder(user.role) || !snapshot.state.purchaseOrders.some((item) => item.id === value.targetId)) {
    throw new PublicApiError(403, "Bạn không có quyền xác nhận phiếu mua này.");
  }

  try {
    const result = await runDemoOperation(value.operation, value.idempotencyKey, value.targetId, actor);
    return { summary: result.summary, revision: result.revision, syncedAt: result.syncedAt };
  } catch (error) {
    if (error instanceof PublicApiError || error instanceof z.ZodError) throw error;
    const documentLabel = value.operation === "confirmSalesOrder" ? "đơn bán" : "phiếu mua";
    throw new PublicApiError(400, `Không thể xác nhận ${documentLabel} ở trạng thái hiện tại.`);
  }
}

function canConfirmSalesOrder(role: SafeIdentityUser["role"]) {
  return role === "owner" || role === "administrator" || role === "sales";
}

function canConfirmPurchaseOrder(role: SafeIdentityUser["role"]) {
  return role === "owner" || role === "administrator";
}
