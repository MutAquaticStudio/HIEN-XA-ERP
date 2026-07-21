export class OperationInputError extends Error {
  readonly code = "operation_input_error";

  constructor(message: string) {
    super(message);
    this.name = "OperationInputError";
  }
}

export function asOperationInputError(error: unknown) {
  if (error instanceof OperationInputError) {
    return error;
  }
  return new OperationInputError(
    error instanceof Error ? error.message : "Dữ liệu nghiệp vụ không hợp lệ."
  );
}
