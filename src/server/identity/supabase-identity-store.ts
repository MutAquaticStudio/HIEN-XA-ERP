import { randomUUID } from "node:crypto";
import { visibleModulesForRole } from "@/modules/operations/identity";
import { SupabaseRuntimeDocumentStore } from "@/server/infrastructure/supabase-runtime-document-store";
import type { RuntimeDocumentStore } from "@/server/infrastructure/runtime-document-store";
import { hashPassword } from "./crypto";
import type { PersistedIdentityData } from "./types";

type BootstrapEnvironment = NodeJS.ProcessEnv | Partial<Record<
  "ERP_BOOTSTRAP_ADMIN_EMAIL" | "ERP_BOOTSTRAP_ADMIN_PASSWORD" | "ERP_BOOTSTRAP_ADMIN_NAME",
  string | undefined
>>;
type BootstrapEnvironmentSource = BootstrapEnvironment | (() => BootstrapEnvironment);

const namespace = "identity";
const maximumWriteAttempts = 6;

export class SupabaseIdentityStore {
  constructor(
    private readonly environment: BootstrapEnvironmentSource = process.env,
    private readonly documents: RuntimeDocumentStore = new SupabaseRuntimeDocumentStore()
  ) {}

  async getSnapshot(): Promise<PersistedIdentityData> {
    return structuredClone((await this.ensureDocument()).payload);
  }

  async transaction<T>(handler: (data: PersistedIdentityData) => Promise<T> | T): Promise<T> {
    for (let attempt = 0; attempt < maximumWriteAttempts; attempt += 1) {
      const document = await this.ensureDocument();
      const data = structuredClone(document.payload);
      const result = await handler(data);
      data.revision = document.revision + 1;
      const commit = await this.documents.compareAndSwap(namespace, document.revision, data);
      if (commit.committed) return result;
    }
    throw new Error("Không thể cập nhật tài khoản vì dữ liệu vừa thay đổi. Vui lòng thử lại.");
  }

  private async ensureDocument() {
    for (let attempt = 0; attempt < maximumWriteAttempts; attempt += 1) {
      const empty: PersistedIdentityData = { schemaVersion: 1, revision: 0, users: [], auditEvents: [] };
      const document = await this.documents.read(namespace, empty);
      if (document.revision > 0) return document;
      const initial = createInitialIdentityData(this.bootstrapEnvironment());
      const commit = await this.documents.compareAndSwap(namespace, 0, initial);
      if (commit.committed) return { revision: commit.revision, payload: { ...initial, revision: commit.revision } };
    }
    throw new Error("Không thể khởi tạo tài khoản chủ cửa hàng. Vui lòng thử lại.");
  }

  private bootstrapEnvironment() {
    return typeof this.environment === "function" ? this.environment() : this.environment;
  }
}

function createInitialIdentityData(environment: BootstrapEnvironment): PersistedIdentityData {
  const email = environment.ERP_BOOTSTRAP_ADMIN_EMAIL?.trim().toLocaleLowerCase("vi-VN") || "";
  const password = environment.ERP_BOOTSTRAP_ADMIN_PASSWORD || "";
  const displayName = environment.ERP_BOOTSTRAP_ADMIN_NAME?.trim() || "Chủ cửa hàng";
  if (!email || !password) {
    throw new Error("Chưa cấu hình tài khoản chủ cửa hàng lần đầu.");
  }
  if (password.length < 12 || password.length > 128 || !/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
    throw new Error("Mật khẩu tài khoản chủ cửa hàng không hợp lệ.");
  }
  const now = new Date().toISOString();
  const userId = randomUUID();
  return {
    schemaVersion: 1,
    revision: 1,
    users: [{
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
    }],
    auditEvents: [{
      id: randomUUID(),
      action: "bootstrap_owner_created",
      targetUserId: userId,
      targetEmail: email,
      occurredAt: now,
      summary: "Khởi tạo tài khoản Chủ cửa hàng đầu tiên."
    }]
  };
}
