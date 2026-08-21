import type { CreateCommand, OperationName, OperationOptions, OperationsActor, OperationsSnapshot } from "./types";
import { OperationsCommandService } from "@/server/application/operations-command-service";
import { FileOperationsBackend } from "@/server/infrastructure/file-operations-backend";
import { SupabaseOperationsBackend } from "@/server/infrastructure/supabase-operations-backend";
import { hasSupabaseServerConfig } from "@/server/infrastructure/supabase-server-client";
import { CloudflareOperationsBackend } from "@/server/infrastructure/cloudflare-operations-backend";
import { hasCloudflareRuntimeConfig } from "@/server/infrastructure/cloudflare-bindings";

let backend: CloudflareOperationsBackend | SupabaseOperationsBackend | FileOperationsBackend | undefined;
let commandService: OperationsCommandService | undefined;

export function assertProductionPersistenceConfigured(environment: NodeJS.ProcessEnv = process.env) {
  const isProductionBuild = environment.NEXT_PHASE === "phase-production-build";
  const isProductionDeployment = !isProductionBuild && (environment.NODE_ENV === "production" || environment.VERCEL === "1");
  if (isProductionDeployment && !hasCloudflareRuntimeConfig(environment) && !hasSupabaseServerConfig(environment)) {
    throw new Error("Production requires Cloudflare D1 or the legacy Supabase configuration. File persistence is disabled in production.");
  }
}

function getBackend() {
  assertProductionPersistenceConfigured();
  if (!backend) {
    backend = hasCloudflareRuntimeConfig()
      ? new CloudflareOperationsBackend()
      : hasSupabaseServerConfig()
        ? new SupabaseOperationsBackend()
        : new FileOperationsBackend(process.env.VLXD_DATA_FILE);
  }
  return backend;
}

function getCommandService() {
  if (!commandService) {
    commandService = new OperationsCommandService(getBackend());
  }
  return commandService;
}

function snapshotSource() {
  return hasCloudflareRuntimeConfig() ? "d1" : hasSupabaseServerConfig() ? "postgres" : "file";
}

export async function getDemoOperationsSnapshot(): Promise<OperationsSnapshot> {
  const snapshot = await getBackend().getSnapshot();

  return {
    ...snapshot,
    syncedAt: new Date().toISOString(),
    source: snapshotSource()
  };
}

export async function resetDemoOperationsState() {
  await getBackend().reset();
  return getDemoOperationsSnapshot();
}

export async function runDemoOperation(
  operation: OperationName,
  idempotencyKey: string,
  targetId?: string,
  actor?: OperationsActor,
  options?: OperationOptions
) {
  if (!actor) {
    throw new Error("Thiếu danh tính người thao tác đã được xác thực.");
  }
  const result = await getCommandService().execute({
    command: operation,
    actor,
    now: new Date().toISOString(),
    idempotencyKey,
    targetId,
    options
  });
  const persisted = await getBackend().getSnapshot();

  return {
    ...result,
    // Pair the state and revision from one backend read. A concurrent command
    // may commit between execute() and a separate revision read; returning
    // that mismatched pair would make the client believe it has a newer state
    // than it actually received.
    state: persisted.state,
    revision: persisted.revision,
    syncedAt: new Date().toISOString(),
    source: snapshotSource()
  };
}

export async function runDemoCreateCommand(command: CreateCommand, idempotencyKey: string, actor?: OperationsActor) {
  if (!actor) {
    throw new Error("Thiếu danh tính người thao tác đã được xác thực.");
  }
  const result = await getCommandService().execute({
    command,
    actor,
    now: new Date().toISOString(),
    idempotencyKey
  });
  const persisted = await getBackend().getSnapshot();

  return {
    ...result,
    state: persisted.state,
    revision: persisted.revision,
    syncedAt: new Date().toISOString(),
    source: snapshotSource()
  };
}
