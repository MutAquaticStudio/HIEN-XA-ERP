import type { DeliveryTrackingState } from "@/server/delivery-tracking/types";
import { BaseDeliveryTrackingStore, emptyDeliveryTrackingState } from "./file-delivery-tracking-store";
import { CloudflareRuntimeDocumentStore } from "./cloudflare-runtime-document-store";
import type { RuntimeDocumentStore } from "./runtime-document-store";

const namespace = "delivery_tracking";
const maximumCommitAttempts = 6;

export class CloudflareDeliveryTrackingStore extends BaseDeliveryTrackingStore {
  constructor(private readonly documents: RuntimeDocumentStore = new CloudflareRuntimeDocumentStore()) {
    super();
  }

  async getSnapshot() {
    const document = await this.documents.read(namespace, emptyDeliveryTrackingState());
    return { ...structuredClone(document.payload), revision: document.revision };
  }

  protected async update<T>(callback: (state: DeliveryTrackingState) => T | Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < maximumCommitAttempts; attempt += 1) {
      const document = await this.documents.read(namespace, emptyDeliveryTrackingState());
      const state = { ...structuredClone(document.payload), revision: document.revision };
      const result = await callback(state);
      state.revision = document.revision + 1;
      const commit = await this.documents.compareAndSwap(namespace, document.revision, state);
      if (commit.committed) return structuredClone(result);
    }
    throw new Error("Không thể cập nhật GPS vì dữ liệu vừa thay đổi. Vui lòng thử lại.");
  }
}
