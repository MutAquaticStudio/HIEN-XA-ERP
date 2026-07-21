export class IdentityPublicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityPublicError";
  }
}

export function isIdentityPublicError(error: unknown): error is IdentityPublicError {
  return error instanceof IdentityPublicError;
}
