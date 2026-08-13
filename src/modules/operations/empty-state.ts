import { createInitialOperationsState } from "./sample-data";
import type { OperationsState } from "./types";

export function createEmptyOperationsState(): OperationsState {
  const sample = createInitialOperationsState();
  const emptyState = Object.fromEntries(
    Object.entries(sample).map(([key, value]) => [
      key,
      Array.isArray(value) ? [] : structuredClone(value)
    ])
  );
  return emptyState as unknown as OperationsState;
}
