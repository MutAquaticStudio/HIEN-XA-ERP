import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

export default async function teardownLocalAuthenticatedQa() {
  if (process.env.PLAYWRIGHT_BASE_URL?.trim()) return;
  const configured = process.env.ERP_V2_LOCAL_QA_ROOT?.trim();
  if (!configured) return;
  const root = resolve(configured);
  const temporaryRoot = resolve(tmpdir());
  if (!root.startsWith(`${temporaryRoot}\\`) && !root.startsWith(`${temporaryRoot}/`)) {
    throw new Error("Từ chối dọn dữ liệu QA bên ngoài thư mục tạm của hệ điều hành.");
  }
  await rm(root, { recursive: true, force: true });
}
