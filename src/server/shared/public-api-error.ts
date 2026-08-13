export type PublicApiErrorStatus = 400 | 401 | 403 | 409 | 412 | 500;

/**
 * An expected client-visible failure. Unknown failures must not be converted
 * into this type so route handlers can return a generic 500 response.
 */
export class PublicApiError extends Error {
  constructor(
    public readonly status: PublicApiErrorStatus,
    message: string
  ) {
    super(message);
    this.name = "PublicApiError";
  }
}

export function isPublicApiError(error: unknown): error is PublicApiError {
  return error instanceof PublicApiError;
}
