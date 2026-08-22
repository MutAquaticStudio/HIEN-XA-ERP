import type { DomainCommandName, OperationResult, OperationsState } from "@/modules/operations/types";

export type IdempotencyRecord = {
  key: string;
  operation: DomainCommandName;
  requestHash: string;
  response: Pick<OperationResult, "summary" | "severity" | "createdEntityId">;
  createdAt: string;
};

export type OperationsUnitOfWork = {
  findIdempotencyRecord(key: string): Promise<IdempotencyRecord | undefined>;
  recordIdempotency(record: IdempotencyRecord): Promise<void>;
  loadOperationsStateForUpdate(): Promise<OperationsState>;
  saveOperationsState(state: OperationsState): Promise<void>;
};

export type TransactionRunner = {
  transaction<T>(handler: (tx: OperationsUnitOfWork) => Promise<T>): Promise<T>;
};
