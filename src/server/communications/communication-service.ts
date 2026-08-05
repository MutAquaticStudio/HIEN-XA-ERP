import type { OperationsState } from "@/modules/operations/types";
import type { SafeIdentityUser } from "@/server/identity/types";
import { notificationService } from "@/server/notifications/runtime";
import { FileCommunicationStore } from "./file-communication-store";
import { SupabaseCommunicationStore } from "./supabase-communication-store";
import { hasSupabaseServerConfig } from "@/server/infrastructure/supabase-server-client";
import { CloudflareRuntimeDocumentStore } from "@/server/infrastructure/cloudflare-runtime-document-store";
import { hasCloudflareRuntimeConfig } from "@/server/infrastructure/cloudflare-bindings";
import { PublicApiError } from "@/server/shared/public-api-error";
import type { CommunicationPartyType, CommunicationPresence } from "./types";

const defaultStore = hasCloudflareRuntimeConfig()
  ? new SupabaseCommunicationStore(new CloudflareRuntimeDocumentStore())
  : hasSupabaseServerConfig()
    ? new SupabaseCommunicationStore()
    : new FileCommunicationStore();
const internalRoles = new Set(["owner", "administrator", "sales", "accountant", "warehouse", "dispatcher"]);

type CommunicationStore = Pick<FileCommunicationStore, "getMessages" | "sendMessage" | "touchPresence" | "getActivePresence">;

export class CommunicationService {
  constructor(private readonly store: CommunicationStore = defaultStore) {}

  async listMessages(user: SafeIdentityUser, state: OperationsState, partyType: CommunicationPartyType, requestedPartyId?: string) {
    const party = resolveParty(user, state, partyType, requestedPartyId);
    return { party, messages: await this.store.getMessages(partyType, party.id) };
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
    const message = await this.store.sendMessage({
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

  async touchPartnerPresence(user: SafeIdentityUser, state: OperationsState) {
    const party = resolveSignedInPartner(user, state);
    if (!party) {
      return { tracked: false };
    }
    await this.store.touchPresence({ partyType: party.partyType, partyId: party.id, userId: user.id });
    return { tracked: true };
  }

  async listOnlineParties(user: SafeIdentityUser, state: OperationsState) {
    if (!internalRoles.has(user.role)) {
      throw new PublicApiError(403, "Bạn không có quyền xem đối tác đang online.");
    }
    const activePartyKeys = new Set([
      ...state.customers.filter((customer) => customer.status === "active").map((customer) => presenceKey("customer", customer.id)),
      ...state.suppliers.filter((supplier) => supplier.status === "active").map((supplier) => presenceKey("supplier", supplier.id))
    ]);
    const onlinePartyKeys = Array.from(new Set(
      (await this.store.getActivePresence())
        .map((record) => presenceKey(record.partyType, record.partyId))
        .filter((key) => activePartyKeys.has(key))
    ));
    return { onlinePartyKeys };
  }
}

function resolveSignedInPartner(user: SafeIdentityUser, state: OperationsState) {
  if (user.role === "customer") {
    const party = resolveParty(user, state, "customer");
    return { ...party, partyType: "customer" as const };
  }
  if (user.role === "supplier") {
    const party = resolveParty(user, state, "supplier");
    return { ...party, partyType: "supplier" as const };
  }
  return undefined;
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

function presenceKey(partyType: CommunicationPartyType, partyId: string) {
  return `${partyType}:${partyId}`;
}
