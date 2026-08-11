import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { runCloudflareIntegrationProbe } from "@/server/infrastructure/cloudflare-integration-probe";
import { getRuntimeEnvironmentVariable } from "@/server/infrastructure/cloudflare-bindings";

const requestSchema = z.object({
  runId: z.string().regex(/^[a-z0-9-]{12,80}$/)
});

export async function POST(request: Request) {
  const deploymentStage = getRuntimeEnvironmentVariable("ERP_DEPLOYMENT_STAGE")?.toLocaleLowerCase("en-US");
  if (deploymentStage === "production") {
    return new Response(null, { status: 404 });
  }

  const requestHost = (() => {
    try {
      return new URL(request.url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  const productionHost = getRuntimeEnvironmentVariable("CLOUDFLARE_PRODUCTION_BASE_URL");
  if (productionHost) {
    try {
      const expectedProductionHost = new URL(productionHost).hostname.toLowerCase();
      if (expectedProductionHost && requestHost === expectedProductionHost) {
        return new Response(null, { status: 404 });
      }
    } catch {
      return Response.json(
        { error: "Cấu hình Cloudflare production URL không hợp lệ." },
        { status: 500 }
      );
    }
  }

  if (deploymentStage && deploymentStage !== "staging" && deploymentStage !== "development") {
    return new Response(null, { status: 404 });
  }

  const expectedSecret = getRuntimeEnvironmentVariable("CLOUDFLARE_INTEGRATION_SECRET") ?? "";
  const suppliedSecret = request.headers.get("x-erp-integration-secret") ?? "";
  if (!safeEqual(suppliedSecret, expectedSecret)) {
    return Response.json({ error: "Không có quyền chạy kiểm tra staging." }, { status: 401 });
  }

  try {
    const input = requestSchema.parse(await request.json());
    const result = await runCloudflareIntegrationProbe(input.runId);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Yêu cầu kiểm tra staging không hợp lệ." }, { status: 400 });
    }
    console.error("Cloudflare staging integration probe failed", error);
    return Response.json({ error: "Kiểm tra Cloudflare staging chưa hoàn tất." }, { status: 500 });
  }
}

function safeEqual(candidate: string, expected: string) {
  if (!candidate || !expected) return false;
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}
