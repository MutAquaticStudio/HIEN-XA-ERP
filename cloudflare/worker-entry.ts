// @ts-ignore The OpenNext bundle is generated after Next.js type checking.
import openNextWorker from "../.open-next/worker.js";
import { initializeOpenNextCloudflareContext } from "./open-next-context";
import { applySecurityHeaders } from "./security-headers";

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
};

type OpenNextWorker = {
  fetch(request: Request, environment: unknown, context: WorkerExecutionContext): Promise<Response>;
};

const worker = openNextWorker as unknown as OpenNextWorker;

export default {
  async fetch(request: Request, environment: unknown, context: WorkerExecutionContext) {
    initializeOpenNextCloudflareContext(environment);
    return applySecurityHeaders(request, await worker.fetch(request, environment, context));
  }
};
