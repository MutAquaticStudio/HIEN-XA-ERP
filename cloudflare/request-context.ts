import { AsyncLocalStorage } from "node:async_hooks";

export type CloudflareRequestEnvironment = Record<string, unknown>;

const CONTEXT_SYMBOL = Symbol.for("hien-xa.cloudflare.request-environment");

type CloudflareContextGlobal = typeof globalThis & {
  [CONTEXT_SYMBOL]?: AsyncLocalStorage<CloudflareRequestEnvironment>;
};

function requestEnvironmentStorage() {
  const scope = globalThis as CloudflareContextGlobal;
  if (!scope[CONTEXT_SYMBOL]) {
    scope[CONTEXT_SYMBOL] = new AsyncLocalStorage<CloudflareRequestEnvironment>();
  }
  return scope[CONTEXT_SYMBOL];
}

export function runWithCloudflareRequestEnvironment<T>(
  environment: CloudflareRequestEnvironment,
  operation: () => T
) {
  return requestEnvironmentStorage().run(environment, operation);
}

export function getCloudflareRequestEnvironment() {
  return requestEnvironmentStorage().getStore();
}
