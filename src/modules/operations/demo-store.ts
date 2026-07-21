import { createInitialOperationsState } from "./sample-data";
import type { CreateCommand, OperationName, OperationOptions, OperationsActor, OperationsSnapshot } from "./types";
import { OperationsCommandService } from "@/server/application/operations-command-service";
import { FileOperationsBackend } from "@/server/infrastructure/file-operations-backend";

const backend = new FileOperationsBackend(process.env.VLXD_DATA_FILE);
const commandService = new OperationsCommandService(backend);

export async function getDemoOperationsSnapshot(): Promise<OperationsSnapshot> {
  const snapshot = await backend.getSnapshot();

  return {
    ...snapshot,
    syncedAt: new Date().toISOString(),
    source: "file"
  };
}

export async function resetDemoOperationsState() {
  await backend.reset(createInitialOperationsState());
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
  const result = await commandService.execute({
    command: operation,
    actor,
    now: new Date().toISOString(),
    idempotencyKey,
    targetId,
    options
  });

  return {
    ...result,
    revision: (await backend.getSnapshot()).revision,
    syncedAt: new Date().toISOString(),
    source: "file" as const
  };
}

export async function runDemoCreateCommand(command: CreateCommand, idempotencyKey: string, actor?: OperationsActor) {
  if (!actor) {
    throw new Error("Thiếu danh tính người thao tác đã được xác thực.");
  }
  const result = await commandService.execute({
    command,
    actor,
    now: new Date().toISOString(),
    idempotencyKey
  });

  return {
    ...result,
    revision: (await backend.getSnapshot()).revision,
    syncedAt: new Date().toISOString(),
    source: "file" as const
  };
}
