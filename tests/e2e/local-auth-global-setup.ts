import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createInitialOperationsState } from "../../src/modules/operations/sample-data";
import {
  createUatUxV2CommunicationData,
  createUatUxV2IdentityData,
  createUatUxV2OperationsState,
  createUatUxV2PushData,
  UAT_UXV2_ATTACHMENT_IDS,
  UAT_UXV2_IDENTITIES,
  type UatUxV2Identity
} from "../../src/server/testing/uat-ux-v2-fixture";

export default async function setupLocalAuthenticatedQa() {
  if (process.env.PLAYWRIGHT_BASE_URL?.trim()) return;
  const root = assertLocalQaRoot();
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  const credentials = {} as Record<UatUxV2Identity, { username: string; password: string }>;
  for (const identity of UAT_UXV2_IDENTITIES) {
    const username = `uat.uxv2.${identity.toLocaleLowerCase("en-US").replaceAll("_", ".")}`;
    const password = `${randomBytes(24).toString("base64url")}A1`;
    credentials[identity] = { username, password };
    process.env[`E2E_${identity}_USERNAME`] = username;
    process.env[`E2E_${identity}_PASSWORD`] = password;
  }

  const state = createUatUxV2OperationsState(createInitialOperationsState());
  const identity = createUatUxV2IdentityData(
    { schemaVersion: 1, revision: 0, users: [], auditEvents: [] },
    credentials,
    1
  );
  const communications = createUatUxV2CommunicationData(
    { schemaVersion: 1, revision: 0, threads: [], messages: [], auditEvents: [] },
    1
  );
  const push = createUatUxV2PushData(
    { schemaVersion: 1, revision: 0, subscriptions: [], events: [], deliveries: [] },
    1
  );

  await writeJson(requiredPath("VLXD_DATA_FILE"), {
    schemaVersion: 1,
    revision: 1,
    state,
    idempotencyRecords: []
  });
  await writeJson(requiredPath("VLXD_IDENTITY_FILE"), identity);
  await writeJson(requiredPath("VLXD_COMMUNICATION_DATA_FILE"), communications);
  await writeJson(requiredPath("VLXD_PUSH_DATA_FILE"), push);
  const attachmentRoot = requiredPath("VLXD_ATTACHMENT_DIR");
  await mkdir(attachmentRoot, { recursive: true });
  const fixturePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  await Promise.all(Object.values(UAT_UXV2_ATTACHMENT_IDS).map((id) =>
    writeFile(join(attachmentRoot, `${id}.png`), fixturePng, { mode: 0o600 })
  ));
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
}

function requiredPath(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu đường dẫn ${name} cho local authenticated QA.`);
  const resolved = resolve(value);
  const root = assertLocalQaRoot();
  if (resolved !== root && !resolved.startsWith(`${root}\\`) && !resolved.startsWith(`${root}/`)) {
    throw new Error(`${name} nằm ngoài thư mục local authenticated QA.`);
  }
  return resolved;
}

function assertLocalQaRoot() {
  const configured = process.env.ERP_V2_LOCAL_QA_ROOT?.trim();
  if (!configured) throw new Error("Thiếu ERP_V2_LOCAL_QA_ROOT cho local authenticated QA.");
  const root = resolve(configured);
  const temporaryRoot = resolve(tmpdir());
  if (!root.startsWith(`${temporaryRoot}\\`) && !root.startsWith(`${temporaryRoot}/`)) {
    throw new Error("Local authenticated QA chỉ được dùng thư mục tạm của hệ điều hành.");
  }
  return root;
}
