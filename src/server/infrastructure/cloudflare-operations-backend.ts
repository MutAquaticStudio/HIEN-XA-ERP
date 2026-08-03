import { CloudflareRuntimeDocumentStore } from "./cloudflare-runtime-document-store";
import { getRuntimeEnvironmentVariable } from "./cloudflare-bindings";
import { SupabaseOperationsBackend } from "./supabase-operations-backend";
import { createEmptyOperationsState } from "@/modules/operations/empty-state";
import { createInitialOperationsState } from "@/modules/operations/sample-data";

export class CloudflareOperationsBackend extends SupabaseOperationsBackend {
  constructor(documents = new CloudflareRuntimeDocumentStore()) {
    super(documents, () => (
      getRuntimeEnvironmentVariable("ERP_DEPLOYMENT_STAGE")?.trim().toLocaleLowerCase("en-US") === "production"
        ? createEmptyOperationsState()
        : createInitialOperationsState()
    ));
  }
}
