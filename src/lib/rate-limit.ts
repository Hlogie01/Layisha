import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

let warned = false;

/**
 * Counts one hit against `key` and says whether it is still allowed.
 * Limits are stored in Postgres (rate_limits table), so they hold across
 * server instances. If the service key isn't configured (local dev), limits
 * are skipped with a warning rather than locking everyone out.
 */
export async function allow(key: string, max: number, windowSeconds: number): Promise<boolean> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    if (!warned) {
      console.warn("[rate-limit] SUPABASE_SERVICE_ROLE_KEY not set: rate limits are OFF");
      warned = true;
    }
    return true;
  }
  const { data, error } = await admin.rpc("rate_limit_hit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    // Fail open on infrastructure errors so a database hiccup doesn't block all logins,
    // but log it so it gets noticed.
    console.error("[rate-limit] check failed", error.message);
    return true;
  }
  return data === true;
}

/** Best-effort client IP. On Vercel, x-forwarded-for is set by the platform. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";
