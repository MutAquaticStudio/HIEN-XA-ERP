import { requireErpCommand } from "@/erp/framework/registry";
import { getNewAuditIntegrityErrors } from "@/modules/operations/audit-integrity";
import { runCreateCommand } from "@/modules/operations/create-commands";
import { operationsErpRegistry } from "@/modules/operations/erp-registry";
import { assertOperationsInvariants } from "@/modules/operations/invariants";
import { runOperation } from "@/modules/operations/service";
import type {
  CreateCommand,
  DomainCommandName,
  OperationName,
  OperationResult,
  OperationOptions,
  OperationsActor
} from "@/modules/operations/types";
import { hashCommandRequest } from "./idempotency";
import type { TransactionRunner } from "./ports";

export type OperationsCommandPayload = OperationName | CreateCommand;

export type ExecuteOperationCommand = {
  command?: OperationsCommandPayload;
  operation?: OperationName;
  actor: OperationsActor;
  idempotencyKey: string;
  now: string;
  targetId?: string;
  options?: OperationOptions;
};

export class OperationsCommandService {
  constructor(private readonly transactionRunner: TransactionRunner) {}

  async execute(command: ExecuteOperationCommand): Promise<OperationResult> {
    return this.transactionRunner.transaction(async (tx) => {
      const payload = command.command ?? command.operation;
      if (!payload) {
        throw new Error("Thiếu command nghiệp vụ.");
      }

      assertValidIdempotencyKey(command.idempotencyKey);

      const operationName = getCommandName(payload);
      const commandDefinition = requireErpCommand(operationsErpRegistry, operationName);
      assertCommandPermission(command.actor, commandDefinition.permission);

      const requestHash = hashCommandRequest(typeof payload === "string" ? {
        operation: payload,
        targetId: command.targetId ?? null,
        options: command.options ?? null
      } : payload);
      const replay = await tx.findIdempotencyRecord(command.idempotencyKey);
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new Error("Idempotency key đã được dùng cho một yêu cầu khác.");
        }
        const currentState = await tx.loadOperationsStateForUpdate();
        return {
          state: currentState,
          summary: "Yêu cầu đã xử lý trước đó; backend trả lại kết quả cũ và không post trùng.",
          severity: "warning"
        };
      }

      const state = await tx.loadOperationsStateForUpdate();
      const result =
        typeof payload === "string"
          ? runOperation({
              state,
              operation: payload,
              actor: command.actor,
              now: command.now,
              idempotencyKey: command.idempotencyKey,
              targetId: command.targetId,
              options: command.options
            })
          : runCreateCommand({
              state,
              command: payload,
              actor: command.actor,
              now: command.now,
              idempotencyKey: command.idempotencyKey
            });

      assertOperationsInvariants(result.state);
      const newAuditErrors = getNewAuditIntegrityErrors(state, result.state);
      if (newAuditErrors.length > 0) {
        throw new Error(`Giao dịch tạo lỗi audit mới: ${newAuditErrors.map((issue) => issue.message).join("; ")}`);
      }

      await tx.saveOperationsState(result.state);
      await tx.recordIdempotency({
        key: command.idempotencyKey,
        operation: operationName,
        requestHash,
        response: {
          summary: result.summary,
          severity: result.severity
        },
        createdAt: command.now
      });

      return result;
    });
  }
}

function getCommandName(command: OperationsCommandPayload): DomainCommandName {
  return typeof command === "string" ? command : command.type;
}

function assertValidIdempotencyKey(idempotencyKey: string) {
  if (idempotencyKey.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(idempotencyKey)) {
    throw new Error("Idempotency key phải có tối đa 128 ký tự an toàn.");
  }
  if (idempotencyKey.trim().length < 12) {
    throw new Error("Idempotency key phải có ít nhất 12 ký tự.");
  }
}

function assertCommandPermission(actor: OperationsActor, permission: string) {
  if (!actor.permissions.includes(permission)) {
    throw new Error("Người dùng không có quyền thực hiện thao tác này.");
  }
}
