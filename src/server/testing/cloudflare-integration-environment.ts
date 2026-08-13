export type CloudflareIntegrationEnvironment = {
  baseUrl: string;
  secret: string;
};

export function requireCloudflareIntegrationEnvironment(
  environment: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): CloudflareIntegrationEnvironment {
  if (environment.ERP_RUN_CLOUDFLARE_INTEGRATION_TESTS !== "1") {
    throw new Error("Cloudflare integration gate is disabled. Set ERP_RUN_CLOUDFLARE_INTEGRATION_TESTS=1 explicitly.");
  }
  if (environment.ERP_TEST_CLOUDFLARE_CONFIRMATION !== "UAT-REM") {
    throw new Error("Cloudflare integration gate requires ERP_TEST_CLOUDFLARE_CONFIRMATION=UAT-REM.");
  }

  const baseUrl = required(environment, "CLOUDFLARE_STAGING_BASE_URL");
  const productionUrl = required(environment, "CLOUDFLARE_PRODUCTION_BASE_URL");
  const parsed = new URL(baseUrl);
  const productionParsed = new URL(productionUrl);

  if (parsed.protocol !== "https:" || parsed.hostname === productionParsed.hostname) {
    throw new Error("Cloudflare integration tests require an HTTPS staging host that is different from production host.");
  }
  if (productionParsed.protocol !== "https:") {
    throw new Error("Cloudflare production URL must also be HTTPS.");
  }
  const secret = required(environment, "CLOUDFLARE_INTEGRATION_SECRET");
  if (secret.length < 32) {
    throw new Error("CLOUDFLARE_INTEGRATION_SECRET must contain at least 32 characters.");
  }

  assertDistinct(environment, "CLOUDFLARE_STAGING_D1_ID", "CLOUDFLARE_PRODUCTION_D1_ID");
  assertDistinct(environment, "CLOUDFLARE_STAGING_R2_BUCKET", "CLOUDFLARE_PRODUCTION_R2_BUCKET");
  assertDistinct(environment, "CLOUDFLARE_STAGING_QUEUE", "CLOUDFLARE_PRODUCTION_QUEUE");
  return { baseUrl: parsed.origin, secret };
}

function required(environment: Record<string, string | undefined>, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required Cloudflare variable ${name}.`);
  return value;
}

function assertDistinct(
  environment: Record<string, string | undefined>,
  stagingName: string,
  productionName: string
) {
  const staging = required(environment, stagingName);
  const production = required(environment, productionName);
  if (staging === production) {
    throw new Error(`${stagingName} must be different from ${productionName}.`);
  }
}
