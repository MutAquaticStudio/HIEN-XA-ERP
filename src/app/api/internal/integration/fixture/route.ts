import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  applyCloudflareUatUxV2Fixture,
  CloudflareUatFixtureInputError,
  assertCloudflareUatCredentials
} from "@/server/testing/cloudflare-uat-ux-v2-fixture";
import { getRuntimeEnvironmentVariable } from "@/server/infrastructure/cloudflare-bindings";
import { runDemoOperation } from "@/modules/operations/demo-store";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("apply"),
    credentials: z.record(z.string(), z.object({ username: z.string(), password: z.string() }))
  }),
  z.object({
    action: z.literal("set_public_price"),
    productUnitId: z.string().trim().min(1).max(128),
    salePrice: z.number().finite().positive(),
    saleTaxRate: z.number().finite().min(0).max(1),
    reason: z.string().trim().min(8).max(500),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{11,127}$/)
  })
]);

export async function POST(request: Request) {
  if (!isStagingRequest(request)) return new Response(null, { status: 404 });
  if (!hasValidSecret(request)) return Response.json({ error: "Không có quyền chuẩn bị fixture staging." }, { status: 401 });

  try {
    const input = requestSchema.parse(await request.json());
    if (input.action === "apply") {
      assertCloudflareUatCredentials(input.credentials);
      const result = await applyCloudflareUatUxV2Fixture(input.credentials);
      return Response.json({ ok: true, fixture: "UAT-UXV2", ...result }, { headers: { "Cache-Control": "no-store" } });
    }
    const result = await runDemoOperation(
      "updateProductCommercialPolicy",
      input.idempotencyKey,
      input.productUnitId,
      {
        id: "uat-uxv2-integration-owner",
        displayName: "Kiểm thử tích hợp UAT",
        role: "owner",
        permissions: ["catalog.update_commercial_policy"]
      },
      {
        salePrice: input.salePrice,
        saleTaxRate: input.saleTaxRate,
        targetMarginRate: 0.1,
        standardLeadTimeDays: 2,
        reason: input.reason
      }
    );
    return Response.json({ ok: true, fixture: "UAT-UXV2", summary: result.summary, revision: result.revision }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof CloudflareUatFixtureInputError) {
      return Response.json({ error: "Dữ liệu fixture staging không hợp lệ." }, { status: 400 });
    }
    console.error("Cloudflare UAT fixture failed", error);
    return Response.json({ error: "Chưa thể chuẩn bị fixture staging." }, { status: 500 });
  }
}

function isStagingRequest(_request: Request) {
  if (getRuntimeEnvironmentVariable("ERP_DEPLOYMENT_STAGE")?.toLocaleLowerCase("en-US") !== "staging") return false;
  const configuredUrl = getRuntimeEnvironmentVariable("NEXT_PUBLIC_APP_URL");
  try {
    return new URL(configuredUrl ?? "").protocol === "https:";
  } catch {
    return false;
  }
}

function hasValidSecret(request: Request) {
  const expected = getRuntimeEnvironmentVariable("CLOUDFLARE_INTEGRATION_SECRET") ?? "";
  const supplied = request.headers.get("x-erp-integration-secret") ?? "";
  if (!expected || !supplied) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const suppliedHash = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}
