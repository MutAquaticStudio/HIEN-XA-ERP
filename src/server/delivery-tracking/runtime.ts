import type { DeliveryTrackingRetentionResult, DeliveryTrackingState, DeliveryTrackingStore } from "./types";
import { getErpV2Snapshot } from "@/server/erp-v2/runtime";
import { DeliveryTrackingService } from "./service";
import { FileDeliveryTrackingStore } from "@/server/infrastructure/file-delivery-tracking-store";
import { hasSupabaseServerConfig } from "@/server/infrastructure/supabase-server-client";
import { SupabaseDeliveryTrackingStore } from "@/server/infrastructure/supabase-delivery-tracking-store";
import { CloudflareDeliveryTrackingStore } from "@/server/infrastructure/cloudflare-delivery-tracking-store";
import { hasCloudflareRuntimeConfig } from "@/server/infrastructure/cloudflare-bindings";

const trackingGlobal = globalThis as typeof globalThis & { vlxdDeliveryTrackingService?: DeliveryTrackingService };

class MissingProductionTrackingStore implements DeliveryTrackingStore {
  private failure(): never {
    throw new Error("Theo dõi GPS production cần SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY. Hệ thống không dùng file tạm trong production.");
  }
  getSnapshot(): Promise<DeliveryTrackingState> { return Promise.reject(this.failure()); }
  grantConsent(): Promise<{ consentId: string; created: boolean; idempotencyConflict: boolean }> { return Promise.reject(this.failure()); }
  revokeConsent(): Promise<{ updated: boolean; replayed: boolean; conflict: boolean; forbidden: boolean; missing: boolean }> { return Promise.reject(this.failure()); }
  startSession(): Promise<{ sessionId: string; created: boolean }> { return Promise.reject(this.failure()); }
  appendPoint(): Promise<{ duplicate: boolean }> { return Promise.reject(this.failure()); }
  stopSession(): Promise<void> { return Promise.reject(this.failure()); }
  createShare(): Promise<void> { return Promise.reject(this.failure()); }
  revokeShare(): Promise<void> { return Promise.reject(this.failure()); }
  purge(): Promise<DeliveryTrackingRetentionResult> { return Promise.reject(this.failure()); }
}

export const deliveryTrackingService = trackingGlobal.vlxdDeliveryTrackingService ?? new DeliveryTrackingService(
  createTrackingStore(),
  async () => (await getErpV2Snapshot()).state
);

if (process.env.NODE_ENV !== "production") trackingGlobal.vlxdDeliveryTrackingService = deliveryTrackingService;

function createTrackingStore(): DeliveryTrackingStore {
  if (hasCloudflareRuntimeConfig()) return new CloudflareDeliveryTrackingStore();
  if (hasSupabaseServerConfig()) return new SupabaseDeliveryTrackingStore();
  if (process.env.NODE_ENV === "production") return new MissingProductionTrackingStore();
  return new FileDeliveryTrackingStore();
}
