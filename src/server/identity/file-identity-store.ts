import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { visibleModulesForRole } from "@/modules/operations/identity";
import { hashPassword } from "./crypto";
import type { PersistedIdentityData } from "./types";

type BootstrapEnvironment = Partial<
  Record<
    "NODE_ENV" | "ERP_BOOTSTRAP_ADMIN_EMAIL" | "ERP_BOOTSTRAP_ADMIN_PASSWORD" | "ERP_BOOTSTRAP_ADMIN_NAME",
    string | undefined
  >
>;

export class FileIdentityStore {
  private queue: Promise<void> = Promise.resolve();
  readonly filePath: string;

  constructor(
    filePath = process.env.VLXD_IDENTITY_FILE || resolve(/* turbopackIgnore: true */ process.cwd(), ".data", "identity.json"),
    private readonly environment: BootstrapEnvironment = process.env
  ) {
    this.filePath = filePath;
  }

  async getSnapshot() {
    await this.queue;
    return structuredClone(await this.load()) as PersistedIdentityData;
  }

  transaction<T>(handler: (data: PersistedIdentityData) => Promise<T> | T) {
    const task = this.queue.then(async () => {
      const data = await this.load();
      const result = await handler(data);
      data.revision += 1;
      await this.persist(data);
      return result;
    });
    this.queue = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  private async load(): Promise<PersistedIdentityData> {
    try {
      const raw = await readFile(/* turbopackIgnore: true */ this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedIdentityData;
      if (parsed.schemaVersion !== 1 || !Number.isInteger(parsed.revision) || !Array.isArray(parsed.users)) {
        throw new Error("Dữ liệu tài khoản không đúng phiên bản hoặc bị thiếu trường bắt buộc.");
      }
      parsed.auditEvents ??= [];
      for (const user of parsed.users) {
        user.failedLoginAttempts ??= 0;
        user.sessionVersion ??= 1;
        user.moduleIds ??= visibleModulesForRole(user.role);
        user.normalizedUsername ??= user.username?.trim().toLocaleLowerCase("vi-VN");
      }
      return parsed;
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
      const initial = createInitialIdentityData(this.environment);
      await this.persist(initial);
      return initial;
    }
  }

  private async persist(data: PersistedIdentityData) {
    await mkdir(/* turbopackIgnore: true */ dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(/* turbopackIgnore: true */ temporaryPath, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
    await rename(/* turbopackIgnore: true */ temporaryPath, /* turbopackIgnore: true */ this.filePath);
  }
}

function createInitialIdentityData(environment: BootstrapEnvironment): PersistedIdentityData {
  const email = environment.ERP_BOOTSTRAP_ADMIN_EMAIL?.trim().toLocaleLowerCase("vi-VN") || "";
  const password = environment.ERP_BOOTSTRAP_ADMIN_PASSWORD || "";
  const displayName = environment.ERP_BOOTSTRAP_ADMIN_NAME?.trim() || "Chủ cửa hàng";

  if (!email || !password) {
    throw new Error("Chưa cấu hình ERP_BOOTSTRAP_ADMIN_EMAIL và ERP_BOOTSTRAP_ADMIN_PASSWORD cho tài khoản đầu tiên.");
  }
  if (password.length < 12 || password.length > 128 || !/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
    throw new Error("ERP_BOOTSTRAP_ADMIN_PASSWORD phải có 12-128 ký tự, gồm cả chữ và số.");
  }

  const now = new Date().toISOString();
  const userId = randomUUID();
  return {
    schemaVersion: 1,
    revision: 1,
    users: [
      {
        id: userId,
        email,
        normalizedEmail: email,
        displayName,
        role: "owner",
        moduleIds: [...visibleModulesForRole("owner")],
        status: "active",
        passwordHash: hashPassword(password),
        createdAt: now,
        updatedAt: now,
        failedLoginAttempts: 0,
        sessionVersion: 1
      }
    ],
    auditEvents: [
      {
        id: randomUUID(),
        action: "bootstrap_owner_created",
        targetUserId: userId,
        targetEmail: email,
        occurredAt: now,
        summary: "Khởi tạo tài khoản Chủ cửa hàng đầu tiên."
      }
    ]
  };
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
