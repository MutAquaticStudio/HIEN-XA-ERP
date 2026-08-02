import { FileIdentityStore } from "./file-identity-store";
import { IdentityService } from "./identity-service";
import { SupabaseIdentityStore } from "./supabase-identity-store";
import { hasSupabaseServerConfig } from "@/server/infrastructure/supabase-server-client";

const identityGlobal = globalThis as typeof globalThis & {
  vlxdIdentityStore?: FileIdentityStore | SupabaseIdentityStore;
};

const identityStore = identityGlobal.vlxdIdentityStore ?? (hasSupabaseServerConfig() ? new SupabaseIdentityStore() : new FileIdentityStore());
export const identityService = new IdentityService(identityStore);

if (process.env.NODE_ENV !== "production") {
  identityGlobal.vlxdIdentityStore = identityStore;
}
