import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  applyCloudflareUatUxV2Fixture,
  CloudflareUatFixtureInputError,
  assertCloudflareUatCredentials
} from "@/server/testing/cloudflare-uat-ux-v2-fixture";
import { getRuntimeEnvironmentVariable } from "@/server/infrastructure/cloudflare-bindings";

const requestSchema = z.object({
  action: z.literal("apply"),
  credentials: z.record(z.string(), z.object({ username: z.string(), password: z.string() }))
});

const stagingPreviewHostSuffix = ".hien-xa-erp-staging.m-thuanwork.workers.dev";

export async function POST(request: Request) {
  if (!isStagingRequest(request)) return new Response(null, { status: 404 });
  if (!hasValidSecret(request)) return Response.json({ error: "Không có quyền chuẩn bị fixture staging." }, { status: 401 });

  try {
    const input = requestSchema.parse(await request.json());
    assertCloudflareUatCredentials(input.credentials);
    const result = await applyCloudflareUatUxV2Fixture(input.credentials);
    return Response.json({ ok: true, fixture: "UAT-UXV2", ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof CloudflareUatFixtureInputError) {
      return Response.json({ error: "Dữ liệu fixture staging không hợp lệ." }, { status: 400 });
    }
    console.error("Cloudflare UAT fixture failed", error);
    return Response.json({ error: "Chưa thể chuẩn bị fixture staging." }, { status: 500 });
  }
}

function isStagingRequest(request: Request) {
  if (getRuntimeEnvironmentVariable("ERP_DEPLOYMENT_STAGE")?.toLocaleLowerCase("en-US") !== "staging") return false;
  const configuredUrl = getRuntimeEnvironmentVariable("NEXT_PUBLIC_APP_URL");
  if (!configuredUrl) return false;
  try {
    const requestUrl = new URL(request.url);
    if (new URL(configuredUrl).origin === requestUrl.origin) return true;
    return requestUrl.protocol === "https:" && requestUrl.hostname.toLocaleLowerCase("en-US").endsWith(stagingPreviewHostSuffix);
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
