import type { OperationsState } from "@/modules/operations/types";
import type { SafeIdentityUser } from "@/server/identity/types";
import { notificationService } from "@/server/notifications/runtime";
import { FileCommunicationStore } from "./file-communication-store";
import { SupabaseCommunicationStore } from "./supabase-communication-store";
import { hasSupabaseServerConfig } from "@/server/infrastructure/supabase-server-client";
import { PublicApiError } from "@/server/shared/public-api-error";
import type { CommunicationPartyType } from "./types";

const store = hasSupabaseServerConfig() ? new SupabaseCommunicationStore() : new FileCommunicationStore();
const internalRoles = new Set(["owner", "administrator", "sales", "accountant", "warehouse", "dispatcher"]);

export class CommunicationService {
  async listMessages(user: SafeIdentityUser, state: OperationsState, partyType: CommunicationPartyType, requestedPartyId?: string) {
    const party = resolveParty(user, state, partyType, requestedPartyId);
    return { party, messages: await store.getMessages(partyType, party.id) };
  }

  async sendMessage(input: {
    user: SafeIdentityUser;
    state: OperationsState;
    partyType: CommunicationPartyType;
    requestedPartyId?: string;
    body: string;
    idempotencyKey: string;
  }) {
    const party = resolveParty(input.user, input.state, input.partyType, input.requestedPartyId);
    const message = await store.sendMessage({
      partyType: input.partyType,
      partyId: party.id,
      senderUserId: input.user.id,
      senderName: input.user.displayName,
      senderRole: input.user.role,
      body: input.body.trim(),
      idempotencyKey: input.idempotencyKey
    });
    void notificationService.publishPartnerMessage({
      partyType: input.partyType,
      partyId: party.id,
      senderRole: input.user.role,
      idempotencyKey: input.idempotencyKey
    }).catch(() => undefined);
    return { party, message };
  }
}

function resolveParty(user: SafeIdentityUser, state: OperationsState, partyType: CommunicationPartyType, requestedPartyId?: string) {
  if (partyType === "customer" && user.role === "customer") {
    if (!user.customerId) throw new PublicApiError(403, "Tài khoản khách chưa được liên kết với hồ sơ khách hàng.");
    const party = state.customers.find((customer) => customer.id === user.customerId && customer.status === "active");
    if (!party) throw new PublicApiError(403, "Không tìm thấy hồ sơ khách hàng đang hoạt động.");
    return { id: party.id, label: party.displayName };
  }
  if (partyType === "supplier" && user.role === "supplier") {
    if (!user.supplierId) throw new PublicApiError(403, "Tài khoản nhà cung cấp chưa được liên kết với hồ sơ đối tác.");
    const party = state.suppliers.find((supplier) => supplier.id === user.supplierId && supplier.status === "active");
    if (!party) throw new PublicApiError(403, "Không tìm thấy hồ sơ nhà cung cấp đang hoạt động.");
    return { id: party.id, label: party.displayName };
  }
  if (!internalRoles.has(user.role)) throw new PublicApiError(403, "Bạn không có quyền truy cập trao đổi đối tác này.");
  if (!requestedPartyId) throw new PublicApiError(400, "Chọn đối tác cần trao đổi.");
  const party = partyType === "customer"
    ? state.customers.find((customer) => customer.id === requestedPartyId && customer.status === "active")
    : state.suppliers.find((supplier) => supplier.id === requestedPartyId && supplier.status === "active");
  if (!party) throw new PublicApiError(400, "Không tìm thấy đối tác đang hoạt động.");
  return { id: party.id, label: party.displayName };
}
