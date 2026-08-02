import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseServerEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

const supabaseGlobal = globalThis as typeof globalThis & {
  vlxdSupabaseServerClient?: SupabaseClient;
};

export function hasSupabaseServerConfig(environment: SupabaseServerEnvironment | NodeJS.ProcessEnv = process.env) {
  return Boolean(environment.SUPABASE_URL?.trim() && environment.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function getSupabaseServerClient(environment: SupabaseServerEnvironment | NodeJS.ProcessEnv = process.env) {
  const url = environment.SUPABASE_URL?.trim();
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server persistence chua duoc cau hinh.");
  }

  if (!supabaseGlobal.vlxdSupabaseServerClient) {
    supabaseGlobal.vlxdSupabaseServerClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return supabaseGlobal.vlxdSupabaseServerClient;
}
