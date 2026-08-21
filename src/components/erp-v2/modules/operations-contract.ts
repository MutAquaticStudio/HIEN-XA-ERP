"use client";

import { createContext } from "react";
import type {
  CreateCommand,
  OperationName,
  OperationOptions,
  OperationsActor,
  OperationResult,
  OperationsSnapshot
} from "@/modules/operations/types";

export type CreateCommandHandler = (command: CreateCommand, onSuccess?: () => void, attachment?: File) => void;
export type OperationHandler = (
  operation: OperationName,
  targetId?: string,
  options?: OperationOptions,
  onSuccess?: () => void,
  attachment?: File
) => void;
export type WorkbookImportHandler = (file: File) => void;
export type SyncStatus = "live" | "syncing" | "error";
export type SyncMeta = {
  revision: number;
  syncedAt: string;
  status: SyncStatus;
  error?: string;
};
export type MutatingServerResult = OperationResult & Pick<OperationsSnapshot, "revision" | "syncedAt">;

export const OperationsActorContext = createContext<OperationsActor>({
  id: "uninitialized",
  displayName: "Chưa đăng nhập",
  role: "viewer",
  permissions: []
});
