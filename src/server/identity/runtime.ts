import { FileIdentityStore } from "./file-identity-store";
import { IdentityService } from "./identity-service";
import { SupabaseIdentityStore } from "./supabase-identity-store";
import { hasSupabaseServerConfig } from "@/server/infrastructure/supabase-server-client";
import { CloudflareRuntimeDocumentStore } from "@/server/infrastructure/cloudflare-runtime-document-store";
import { getRuntimeEnvironmentVariable, hasCloudflareRuntimeConfig } from "@/server/infrastructure/cloudflare-bindings";

const identityGlobal = globalThis as typeof globalThis & {
  vlxdIdentityStore?: FileIdentityStore | SupabaseIdentityStore;
};

const identityStore = identityGlobal.vlxdIdentityStore ?? (
  hasCloudflareRuntimeConfig()
    ? new SupabaseIdentityStore(() => ({
      ERP_BOOTSTRAP_ADMIN_EMAIL: getRuntimeEnvironmentVariable("ERP_BOOTSTRAP_ADMIN_EMAIL"),
      ERP_BOOTSTRAP_ADMIN_PASSWORD: getRuntimeEnvironmentVariable("ERP_BOOTSTRAP_ADMIN_PASSWORD"),
      ERP_BOOTSTRAP_ADMIN_NAME: getRuntimeEnvironmentVariable("ERP_BOOTSTRAP_ADMIN_NAME")
    }), new CloudflareRuntimeDocumentStore())
    : hasSupabaseServerConfig()
      ? new SupabaseIdentityStore()
      : new FileIdentityStore()
);
export const identityService = new IdentityService(identityStore);

if (process.env.NODE_ENV !== "production") {
  identityGlobal.vlxdIdentityStore = identityStore;
}
