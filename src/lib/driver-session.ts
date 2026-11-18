import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Drivers sign in by opening a personal link. The link's secret is kept in an
 * httpOnly cookie on their phone and checked by the database on every request.
 */
export const DRIVER_COOKIE = "layisha_driver";
export const DRIVER_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

/** Anonymous Supabase client for calling the driver_* database functions. */
export function driverDb() {
  const { url, anonKey } = supabaseEnv();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface DriverIdentity {
  driver_id: string;
  driver_name: string;
  company_id: string;
  company_name: string;
}

export async function whoami(token: string): Promise<DriverIdentity | null> {
  const { data, error } = await driverDb().rpc("driver_whoami", { p_token: token });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as DriverIdentity | undefined;
  return row ?? null;
}

export async function driverTokenFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(DRIVER_COOKIE)?.value ?? null;
}

export function todayInSa() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
}
