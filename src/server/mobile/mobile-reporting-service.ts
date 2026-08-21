import { z } from "zod";
import { getErpV2Snapshot } from "@/server/erp-v2/runtime";
import { getAvailableReportMonths, getDefaultReportMonth, createMonthlyReport } from "@/modules/operations/monthly-report";
import { createMonthlyReportExportPackage } from "@/modules/operations/report-package";
import { visibleModulesForIdentity } from "@/server/identity/auth-context";
import { projectOperationsSnapshot } from "@/server/identity/operations-projection";
import type { SafeIdentityUser } from "@/server/identity/types";
import { PublicApiError } from "@/server/shared/public-api-error";

const reportQuerySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });

export async function getMobileReportingOverview(user: SafeIdentityUser, input: unknown) {
  requireReportingView(user);
  const query = reportQuerySchema.parse(input);
  const snapshot = projectOperationsSnapshot(await getErpV2Snapshot(), user);
  const availableMonths = getAvailableReportMonths(snapshot.state);
  const month = query.month ?? getDefaultReportMonth(snapshot.state);
  if (availableMonths.length > 0 && !availableMonths.includes(month)) throw new PublicApiError(400, "Tháng báo cáo không có trong dữ liệu hiện tại.");
  return { revision: snapshot.revision, syncedAt: snapshot.syncedAt, availableMonths, report: createMonthlyReport(snapshot.state, month) };
}

export async function getMobileReportingPackage(user: SafeIdentityUser, input: unknown) {
  const overview = await getMobileReportingOverview(user, input);
  return createMonthlyReportExportPackage(overview.report);
}

function requireReportingView(user: SafeIdentityUser) { if (!visibleModulesForIdentity(user).includes("reporting")) throw new PublicApiError(403, "Tài khoản này không có quyền xem báo cáo trên điện thoại."); }
