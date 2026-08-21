import { createHash } from "node:crypto";
import readXlsxFile, { readSheetNames } from "read-excel-file/node";
import { z } from "zod";
import { getErpV2Snapshot, runErpV2CreateCommand, runErpV2Operation } from "@/server/erp-v2/runtime";
import type { OperationsActor } from "@/modules/operations/types";
import { visibleModulesForIdentity } from "@/server/identity/auth-context";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";
import type { SafeIdentityUser } from "@/server/identity/types";
import { PublicApiError } from "@/server/shared/public-api-error";
import { mobileIdempotencySchema } from "./mobile-portal-service";

const maximumImportRows = 100_000;
const maximumImportSheets = 24;
const issueIdSchema = z.string().trim().min(1).max(128);
const importActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resolveIssue"),
    idempotencyKey: mobileIdempotencySchema,
    expectedRevision: z.number().int().positive()
  }).strict(),
  z.object({
    action: z.literal("ignoreIssue"),
    idempotencyKey: mobileIdempotencySchema,
    expectedRevision: z.number().int().positive()
  }).strict()
]);

export async function getMobileImportOverview(user: SafeIdentityUser) {
  requireImportView(user);
  const snapshot = projectOperationsSnapshot(await getErpV2Snapshot(), user);
  return {
    revision: snapshot.revision,
    syncedAt: snapshot.syncedAt,
    jobs: snapshot.state.importJobs.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    issues: snapshot.state.importIssues.slice().sort((left, right) => left.sourceSheet.localeCompare(right.sourceSheet) || left.rowNumber - right.rowNumber)
  };
}

type UploadedWorkbook = { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };

export async function createMobileImportDryRun(user: SafeIdentityUser, actor: OperationsActor, file: UploadedWorkbook) {
  requireImportWrite(user, actor, "import.create_dry_run");
  validateWorkbookFile(file);

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const idempotencyKey = `import-${fileHash}`;
  const before = await getErpV2Snapshot();
  const replay = idempotentReplay(before, idempotencyKey);
  if (replay) return replay;

  const sheetNames = await readSheetNames(buffer);
  const transactionSheets = sheetNames.filter((sheetName) => /^\d{1,2}\.\d{2}$/.test(sheetName));
  if (transactionSheets.length > maximumImportSheets) {
    throw new PublicApiError(400, "Workbook có quá nhiều trang giao dịch để xử lý an toàn.");
  }
  if (transactionSheets.length === 0) {
    throw new PublicApiError(400, "Workbook không có trang giao dịch tháng dạng 5.26, 6.26, ...");
  }

  let rowCount = 0;
  const issues: Array<{ sourceSheet: string; rowNumber: number; severity: "warning" | "error"; message: string }> = [];
  for (const sheetName of transactionSheets) {
    const rows = await readXlsxFile(buffer, { sheet: sheetName });
    if (rows.length > maximumImportRows) {
      throw new PublicApiError(400, "Trang giao dịch có quá nhiều dòng để xử lý an toàn.");
    }
    const inspection = inspectImportSheet(sheetName, rows);
    rowCount += inspection.rowCount;
    if (rowCount > maximumImportRows) {
      throw new PublicApiError(400, "Workbook có quá nhiều dòng để xử lý an toàn.");
    }
    issues.push(...inspection.issues);
  }

  const result = await runImportCommand(
    () => runErpV2CreateCommand({
      type: "createImportDryRun",
      fileName: file.name,
      fileHash,
      sheetNames: transactionSheets,
      rowCount,
      issues
    }, idempotencyKey, actor),
    "Không thể chạy thử import workbook."
  );
  return {
    summary: result.summary,
    revision: result.revision,
    syncedAt: result.syncedAt,
    review: {
      fileName: file.name,
      rowCount,
      issueCount: issues.length,
      effects: [
        "Chỉ tạo kết quả chạy thử và các lỗi cần rà soát.",
        "Không tạo đơn hàng, bút toán, công nợ hoặc biến động kho."
      ]
    }
  };
}

export async function runMobileImportAction(user: SafeIdentityUser, actor: OperationsActor, issueId: string, input: unknown) {
  requireImportView(user);
  const value = importActionSchema.parse(input);
  const targetId = issueIdSchema.parse(issueId);
  const snapshot = await getErpV2Snapshot();
  const replay = idempotentReplay(snapshot, value.idempotencyKey);
  if (replay) return replay;
  if (snapshot.revision !== value.expectedRevision) {
    throw new PublicApiError(409, "Dữ liệu import đã thay đổi. Vui lòng tải lại trước khi xử lý lỗi.");
  }
  const issue = snapshot.state.importIssues.find((candidate) => candidate.id === targetId);
  if (!issue) {
    throw new PublicApiError(403, "Không tìm thấy lỗi import trong phạm vi được cấp quyền.");
  }
  const permission = value.action === "resolveIssue" ? "import.resolve_issue" : "import.ignore_issue";
  requireImportWrite(user, actor, permission);
  const operation = value.action === "resolveIssue" ? "resolveImportIssue" : "ignoreImportIssue";
  const result = await runImportCommand(
    () => runErpV2Operation(operation, value.idempotencyKey, targetId, actor),
    "Không thể cập nhật lỗi import ở trạng thái hiện tại."
  );
  return { summary: result.summary, revision: result.revision, syncedAt: result.syncedAt };
}

function requireImportView(user: SafeIdentityUser) {
  if (!visibleModulesForIdentity(user).includes("import")) {
    throw new PublicApiError(403, "Tài khoản này không có quyền xem import trên điện thoại.");
  }
}

function requireImportWrite(user: SafeIdentityUser, actor: OperationsActor, permission: string) {
  requireImportView(user);
  if (!actor.permissions.includes(permission)) {
    throw new PublicApiError(403, "Tài khoản này không có quyền xử lý import trên điện thoại.");
  }
}

function validateWorkbookFile(file: UploadedWorkbook) {
  if (file.name.length > 200 || /[\u0000-\u001f\u007f]/u.test(file.name)) {
    throw new PublicApiError(400, "Tên file import không hợp lệ.");
  }
  if (!file.name.toLocaleLowerCase("vi-VN").endsWith(".xlsx")) {
    throw new PublicApiError(400, "Hệ thống chỉ nhận workbook .xlsx.");
  }
  if (file.size <= 0 || file.size > 40 * 1024 * 1024) {
    throw new PublicApiError(400, "File import phải có dung lượng từ 1 byte đến 40 MB.");
  }
}

function inspectImportSheet(sheetName: string, rows: readonly (readonly unknown[])[]) {
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell) === "ngay mua") && row.some((cell) => normalizeHeader(cell) === "ten kh"));
  if (headerIndex < 0) {
    const hasData = rows.some((row) => row.some((cell) => cell !== null));
    return { rowCount: 0, issues: hasData ? [{ sourceSheet: sheetName, rowNumber: 1, severity: "error" as const, message: "Không tìm thấy dòng tiêu đề NGÀY MUA/TÊN KH." }] : [] };
  }
  const headers = rows[headerIndex].map(normalizeHeader);
  const column = (name: string) => headers.indexOf(name);
  const indexes = { date: column("ngay mua"), customer: column("ten kh"), product: column("ten vat tu"), unit: column("dvt"), quantity: column("sl"), net: column("thanh tien (truoc vat)"), tax: column("thue gtgt"), gross: column("thanh tien (sau vat)") };
  const issues: Array<{ sourceSheet: string; rowNumber: number; severity: "warning" | "error"; message: string }> = [];
  let rowCount = 0;
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    if (!row.some((cell) => cell !== null && cell !== "")) return;
    const rowNumber = headerIndex + offset + 2;
    rowCount += 1;
    const customer = cellText(row[indexes.customer]);
    const product = cellText(row[indexes.product]);
    const unit = cellText(row[indexes.unit]);
    const quantity = row[indexes.quantity];
    if (!customer || !product || !unit) issues.push({ sourceSheet: sheetName, rowNumber, severity: "error", message: "Thiếu khách hàng, vật tư hoặc đơn vị giao dịch." });
    const date = row[indexes.date];
    if (!(date instanceof Date) && !(typeof date === "string" && !Number.isNaN(Date.parse(date)))) issues.push({ sourceSheet: sheetName, rowNumber, severity: "error", message: "Thiếu ngày mua hợp lệ." });
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) issues.push({ sourceSheet: sheetName, rowNumber, severity: "error", message: "Số lượng thiếu hoặc không lớn hơn 0." });
    const net = numericCell(row[indexes.net]); const tax = numericCell(row[indexes.tax]); const gross = numericCell(row[indexes.gross]);
    if (net !== undefined && tax !== undefined && gross !== undefined && Math.abs(net + tax - gross) > 1) issues.push({ sourceSheet: sheetName, rowNumber, severity: "warning", message: "Tiền trước VAT + thuế không khớp tiền sau VAT." });
  });
  return { rowCount, issues };
}

function normalizeHeader(value: unknown) { return cellText(value).toLocaleLowerCase("vi-VN").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim(); }
function cellText(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function numericCell(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function idempotentReplay(snapshot: Awaited<ReturnType<typeof getErpV2Snapshot>>, idempotencyKey: string) { return snapshot.state.processedOperations.some((entry) => entry.idempotencyKey === idempotencyKey) ? { summary: "Yêu cầu này đã được xử lý trước đó, hệ thống không ghi trùng.", revision: snapshot.revision, syncedAt: snapshot.syncedAt } : undefined; }
async function runImportCommand<T>(run: () => Promise<T>, fallback: string) { try { return await run(); } catch (error) { if (error instanceof PublicApiError || error instanceof z.ZodError) throw error; const message = error instanceof Error ? error.message : ""; if (/quyền|quyen/i.test(message)) throw new PublicApiError(403, "Bạn không có quyền thực hiện thao tác import này."); throw new PublicApiError(400, fallback); } }
