import { requireErpCommand } from "@/erp/framework/registry";
import { getNewAuditIntegrityErrors } from "@/modules/operations/audit-integrity";
import { runCreateCommand } from "@/modules/operations/create-commands";
import { operationsErpRegistry } from "@/modules/operations/erp-registry";
import { assertAndMigrateOperationsStateToErpV2 } from "@/modules/operations/erp-v2-migration";
import { assertOperationsInvariants } from "@/modules/operations/invariants";
import {
  ORDER_ALREADY_CLAIMED,
  createAuditLog,
  createAuditSnapshot,
  runOperation
} from "@/modules/operations/commands";
import {
  OperationInputError,
  asOperationInputError
} from "@/modules/operations/errors";
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
import { notificationService } from "@/server/notifications/runtime";

export type ErpV2CommandPayload = OperationName | CreateCommand;

export type ExecuteErpV2Command = {
  command?: ErpV2CommandPayload;
  operation?: OperationName;
  actor: OperationsActor;
  idempotencyKey: string;
  now: string;
  targetId?: string;
  options?: OperationOptions;
};

export class ErpV2CommandService {
  constructor(private readonly transactionRunner: TransactionRunner) {}

  async execute(command: ExecuteErpV2Command): Promise<OperationResult> {
    assertErpV2MutationAllowed();
    let completedOperation: DomainCommandName | undefined;
    const result = await this.transactionRunner.transaction(async (tx): Promise<OperationResult> => {
      const payload = command.command ?? command.operation;
      if (!payload) {
        throw new Error("Thiếu thao tác nghiệp vụ.");
      }

      assertValidIdempotencyKey(command.idempotencyKey);

      const operationName = getCommandName(payload);
      completedOperation = operationName;
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
          throw new OperationInputError("Idempotency key đã được dùng cho một yêu cầu khác.", "IDEMPOTENCY_KEY", 409);
        }
        const currentState = assertAndMigrateOperationsStateToErpV2(await tx.loadOperationsStateForUpdate());
        return {
          state: currentState,
          summary: replay.response.summary,
          severity: "warning",
          createdEntityId: replay.response.createdEntityId
        };
      }

      const state = assertAndMigrateOperationsStateToErpV2(await tx.loadOperationsStateForUpdate());
      let result: OperationResult;
      try {
        result = typeof payload === "string"
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
      } catch (error) {
        const claimError = parseOrderClaimError(operationName, error);
        if (!claimError || operationName !== "claimOpenSalesWorkOrder") {
          throw asOperationInputError(error);
        }
        const summary = `${claimError.code}: ${claimError.message}`;
        const before = createAuditSnapshot(state, command.targetId);
        state.auditLogs.unshift(createAuditLog(
          state,
          command.actor,
          operationName,
          command.now,
          summary,
          commandDefinition.permission,
          command.targetId,
          command.idempotencyKey,
          undefined,
          before,
          createAuditSnapshot(state, command.targetId)
        ));
        await tx.saveOperationsState(state);
        await tx.recordIdempotency({
          key: command.idempotencyKey,
          operation: operationName,
          requestHash,
          response: {
            summary,
            severity: "warning"
          },
          createdAt: command.now
        });
        return { state, summary, severity: "warning" };
      }

      try {
        assertOperationsInvariants(result.state);
      } catch (error) {
        throw asOperationInputError(error);
      }
      const newAuditErrors = getNewAuditIntegrityErrors(state, result.state);
      if (newAuditErrors.length > 0) {
        throw asOperationInputError(`Business rule audit validation failed: ${newAuditErrors.map((issue) => issue.message).join("; ")}`);
      }

      await tx.saveOperationsState(result.state);
      await tx.recordIdempotency({
        key: command.idempotencyKey,
        operation: operationName,
        requestHash,
        response: {
          summary: result.summary,
          severity: result.severity,
          createdEntityId: result.createdEntityId
        },
        createdAt: command.now
      });

      return result;
    });
    if (result.severity === "success" && completedOperation) {
      await notificationService.publishOperation({
        operation: completedOperation,
        targetId: command.targetId,
        idempotencyKey: command.idempotencyKey,
        state: result.state
      });
    }
    return result;
  }
}

export function assertErpV2MutationAllowed(
  environment: { ERP_MAINTENANCE_MODE?: string } = process.env as { ERP_MAINTENANCE_MODE?: string }
) {
  if (environment.ERP_MAINTENANCE_MODE === "read_only") {
    throw new OperationInputError("He thong dang bao tri va tam dung ghi du lieu.", "ERP_MAINTENANCE_READ_ONLY", 412);
  }
}

function getCommandName(command: ErpV2CommandPayload): DomainCommandName {
  return typeof command === "string" ? command : command.type;
}

function assertValidIdempotencyKey(idempotencyKey: string) {
  if (idempotencyKey.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(idempotencyKey)) {
    throw new OperationInputError("Idempotency key phải có tối đa 128 ký tự an toàn.", "IDEMPOTENCY_KEY", 400);
  }
  if (idempotencyKey.trim().length < 12) {
    throw new OperationInputError("Idempotency key phải có ít nhất 12 ký tự.", "IDEMPOTENCY_KEY", 400);
  }
}

function assertCommandPermission(actor: OperationsActor, permission: string) {
  if (!actor.permissions.includes(permission)) {
    throw new OperationInputError("Người dùng không có quyền thực hiện thao tác này.", "AUTHORIZATION_DENIED", 403);
  }
}

function parseOrderClaimError(operationName: DomainCommandName, error: unknown) {
  if (operationName !== "claimOpenSalesWorkOrder") {
    return undefined;
  }
  if (error instanceof OperationInputError && error.code === ORDER_ALREADY_CLAIMED) {
    return { code: ORDER_ALREADY_CLAIMED, message: error.message };
  }
  if (!(error instanceof Error)) {
    return undefined;
  }
  const match = /^([A-Z_]+):\s*(.+)$/.exec(error.message);
  if (!match) {
    return undefined;
  }
  const [, code, message] = match;
  if (code !== ORDER_ALREADY_CLAIMED) {
    return undefined;
  }
  return { code, message };
}
