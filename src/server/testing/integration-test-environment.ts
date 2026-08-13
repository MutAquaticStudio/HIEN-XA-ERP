export type IntegrationTestEnvironment = {
  databaseUrl: string;
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  projectRef: string;
  productionProjectRef: string;
};

export function requireIntegrationTestEnvironment(
  environment: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): IntegrationTestEnvironment {
  if (environment.ERP_RUN_INTEGRATION_TESTS !== "1") {
    throw new Error("Integration tests are disabled. Set ERP_RUN_INTEGRATION_TESTS=1 only for a dedicated staging project.");
  }
  if (environment.ERP_TEST_DATABASE_CONFIRMATION !== "hien-xa-staging") {
    throw new Error("Integration tests require ERP_TEST_DATABASE_CONFIRMATION=hien-xa-staging.");
  }

  const required = {
    ERP_TEST_DATABASE_URL: environment.ERP_TEST_DATABASE_URL,
    SUPABASE_TEST_URL: environment.SUPABASE_TEST_URL,
    SUPABASE_TEST_ANON_KEY: environment.SUPABASE_TEST_ANON_KEY,
    SUPABASE_TEST_SERVICE_ROLE_KEY: environment.SUPABASE_TEST_SERVICE_ROLE_KEY,
    SUPABASE_TEST_PROJECT_REF: environment.SUPABASE_TEST_PROJECT_REF,
    SUPABASE_PRODUCTION_PROJECT_REF: environment.SUPABASE_PRODUCTION_PROJECT_REF
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Integration tests are missing required staging configuration: ${missing.join(", ")}.`);
  }

  const databaseUrl = new URL(required.ERP_TEST_DATABASE_URL!);
  const supabaseUrl = new URL(required.SUPABASE_TEST_URL!);
  const projectRef = required.SUPABASE_TEST_PROJECT_REF!.trim();
  const productionProjectRef = required.SUPABASE_PRODUCTION_PROJECT_REF!.trim();
  if (!/^postgres(ql)?:$/.test(databaseUrl.protocol)) {
    throw new Error("ERP_TEST_DATABASE_URL must use a PostgreSQL protocol.");
  }
  if (!/^[a-z0-9]{15,40}$/.test(projectRef)) {
    throw new Error("SUPABASE_TEST_PROJECT_REF is not a valid Supabase project ref.");
  }
  if (!/^[a-z0-9]{15,40}$/.test(productionProjectRef)) {
    throw new Error("SUPABASE_PRODUCTION_PROJECT_REF is required to prove staging is not production.");
  }
  if (projectRef === productionProjectRef) {
    throw new Error("Integration tests refuse to use the production Supabase project ref.");
  }
  if (databaseUrl.hostname.toLowerCase().includes("prod") || supabaseUrl.hostname.toLowerCase().includes("prod")) {
    throw new Error("Integration tests refuse a production-looking database or Supabase host.");
  }
  if (supabaseUrl.protocol !== "https:" || supabaseUrl.hostname.toLowerCase() !== `${projectRef}.supabase.co`) {
    throw new Error("SUPABASE_TEST_PROJECT_REF must match the configured staging Supabase URL.");
  }
  const databaseHost = databaseUrl.hostname.toLowerCase();
  const databaseUser = decodeURIComponent(databaseUrl.username).toLowerCase();
  const isDirectConnection = databaseHost === `db.${projectRef}.supabase.co`;
  const isPoolerConnection = databaseHost.endsWith(".pooler.supabase.com")
    && databaseUser.endsWith(`.${projectRef}`);
  if (!isDirectConnection && !isPoolerConnection) {
    throw new Error("ERP_TEST_DATABASE_URL must identify the same staging project ref as SUPABASE_TEST_URL.");
  }

  return {
    databaseUrl: required.ERP_TEST_DATABASE_URL!,
    supabaseUrl: required.SUPABASE_TEST_URL!,
    anonKey: required.SUPABASE_TEST_ANON_KEY!,
    serviceRoleKey: required.SUPABASE_TEST_SERVICE_ROLE_KEY!,
    projectRef,
    productionProjectRef
  };
}
