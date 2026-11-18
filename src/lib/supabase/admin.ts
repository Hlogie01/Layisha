import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * Service-role client. Bypasses row-level security, so ONLY use it on the
 * server, ONLY for storage (delivery photos), and ONLY after the caller has
 * been checked (driver link verified, or company membership confirmed).
 */
export function createAdminClient() {
  const { url } = supabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local (Supabase > Project Settings > API > service_role). Never expose it to the browser.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const POD_BUCKET = "pod-photos";
