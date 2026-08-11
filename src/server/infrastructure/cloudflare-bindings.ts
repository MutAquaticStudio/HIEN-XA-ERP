import { getCloudflareContext } from "@opennextjs/cloudflare";

export type D1RunResultLike = {
  success: boolean;
  meta?: { changes?: number };
};

export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T>(): Promise<T | null>;
  run(): Promise<D1RunResultLike>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
};

export type R2ObjectBodyLike = {
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type R2BucketLike = {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  delete(key: string): Promise<void>;
};

export type CloudflareQueueLike = {
  send(message: unknown, options?: { contentType?: string }): Promise<unknown>;
};

export type HienXaCloudflareEnv = {
  [key: string]: unknown;
  DB?: D1DatabaseLike;
  PRIVATE_FILES?: R2BucketLike;
  BACKGROUND_QUEUE?: CloudflareQueueLike;
  ERP_PERSISTENCE_PROVIDER?: string;
  ERP_DEPLOYMENT_STAGE?: string;
};

export type CloudflareRequestBindings = {
  environment: HienXaCloudflareEnv;
  database: D1DatabaseLike;
  bucket: R2BucketLike;
  queue: CloudflareQueueLike;
};

export function hasCloudflareRuntimeConfig(environment: NodeJS.ProcessEnv = process.env) {
  const provider = getRuntimeEnvironmentVariable("ERP_PERSISTENCE_PROVIDER") ?? environment.ERP_PERSISTENCE_PROVIDER;
  return (
    provider?.trim().toLocaleLowerCase("en-US") === "cloudflare"
  );
}

export function getRuntimeEnvironmentVariable(name: string) {
  try {
    const value = cloudflareEnvironment()[name];
    if (typeof value === "string") {
      return value;
    }
  } catch {
    // Local and Vercel execution do not have Cloudflare request bindings.
  }
  return process.env[name];
}

async function getNativeCloudflareEnvironment(): Promise<HienXaCloudflareEnv> {
  // @ts-ignore cloudflare:workers is a Worker runtime module provided by Cloudflare.
  const workers = await import("cloudflare:workers") as unknown as { env: HienXaCloudflareEnv };
  return workers.env;
}

export async function getCloudflareRequestBindings(): Promise<CloudflareRequestBindings> {
  const environment = await getNativeCloudflareEnvironment();
  const database = environment.DB;
  const bucket = environment.PRIVATE_FILES;
  const queue = environment.BACKGROUND_QUEUE;
  if (!database) throw new Error("Cloudflare D1 binding DB chua duoc cau hinh.");
  if (!bucket) throw new Error("Cloudflare R2 binding PRIVATE_FILES chua duoc cau hinh.");
  if (!queue) throw new Error("Cloudflare Queue binding BACKGROUND_QUEUE chua duoc cau hinh.");
  return { environment, database, bucket, queue };
}

export function getCloudflareEnvironmentVariable(environment: HienXaCloudflareEnv, name: string) {
  const value = environment[name];
  return typeof value === "string" ? value : process.env[name];
}

export function getCloudflareD1Database() {
  const database = cloudflareEnvironment().DB;
  if (!database) {
    throw new Error("Cloudflare D1 binding DB chưa được cấu hình.");
  }
  return database;
}

export function getCloudflarePrivateBucket() {
  const bucket = cloudflareEnvironment().PRIVATE_FILES;
  if (!bucket) {
    throw new Error("Cloudflare R2 binding PRIVATE_FILES chưa được cấu hình.");
  }
  return bucket;
}

export function getCloudflareBackgroundQueue() {
  const queue = cloudflareEnvironment().BACKGROUND_QUEUE;
  if (!queue) {
    throw new Error("Cloudflare Queue binding BACKGROUND_QUEUE chưa được cấu hình.");
  }
  return queue;
}

function cloudflareEnvironment() {
  try {
    return getCloudflareContext().env as unknown as HienXaCloudflareEnv;
  } catch {
    throw new Error("Không thể truy cập Cloudflare bindings trong môi trường hiện tại.");
  }
}
