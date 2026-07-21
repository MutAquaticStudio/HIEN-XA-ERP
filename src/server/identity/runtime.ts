import { FileIdentityStore } from "./file-identity-store";
import { IdentityService } from "./identity-service";

const identityGlobal = globalThis as typeof globalThis & {
  vlxdIdentityStore?: FileIdentityStore;
};

const identityStore = identityGlobal.vlxdIdentityStore ?? new FileIdentityStore();
export const identityService = new IdentityService(identityStore);

if (process.env.NODE_ENV !== "production") {
  identityGlobal.vlxdIdentityStore = identityStore;
}
