export type OperationInputErrorCode = "operation_input_error" | string;
export type OperationInputErrorStatus = 400 | 401 | 403 | 409 | 412 | 500;

export class OperationInputError extends Error {
  readonly code: OperationInputErrorCode;
  readonly status?: OperationInputErrorStatus;

  constructor(message: string, code: OperationInputErrorCode = "operation_input_error", status?: OperationInputErrorStatus) {
    super(message);
    this.name = "OperationInputError";
    this.code = code;
    this.status = status;
  }
}

function inferStatusFromCode(code: OperationInputErrorCode): OperationInputErrorStatus {
  if (code === "ERP_MAINTENANCE_READ_ONLY" || code === "STATE_CONFLICT" || code === "CREDIT_LIMIT_EXCEEDED") {
    return 412;
  }
  if (code === "ORDER_ALREADY_CLAIMED" || code === "VERSION_CONFLICT" || code === "IDEMPOTENCY_KEY") {
    return 409;
  }
  if (code === "AUTHORIZATION_DENIED" || code.startsWith("AUTH_")) {
    return 403;
  }
  return 400;
}

export function asOperationInputError(error: unknown) {
  if (error instanceof OperationInputError) {
    return error;
  }
  const rawMessage = error instanceof Error ? error.message : "Dữ liệu nghiệp vụ không hợp lệ.";
  const match = /^([A-Z0-9_]+):\s*(.+)$/.exec(rawMessage);
  if (!match) {
    return new OperationInputError(rawMessage);
  }
  const [, code, message] = match;
  return new OperationInputError(message, code, inferStatusFromCode(code));
}
