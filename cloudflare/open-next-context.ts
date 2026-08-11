type OpenNextCloudflareContext = {
  env: Record<string, unknown>;
  cf: unknown;
  ctx: unknown;
};

const OPEN_NEXT_CONTEXT_SYMBOL = Symbol.for("__cloudflare-context__");

export function initializeOpenNextCloudflareContext(
  request: Request,
  environment: unknown,
  executionContext: unknown
) {
  if (!environment || typeof environment !== "object") return;

  const scope = globalThis as Record<symbol, unknown>;
  const current = scope[OPEN_NEXT_CONTEXT_SYMBOL] as OpenNextCloudflareContext | undefined;
  if (!current || current.env !== environment || current.ctx !== executionContext) {
    scope[OPEN_NEXT_CONTEXT_SYMBOL] = {
      env: environment as Record<string, unknown>,
      cf: (request as Request & { cf?: unknown }).cf,
      ctx: executionContext
    };
  }
}
