import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Company, MemberRole } from "@/lib/types";

/**
 * Data access layer. Every page and Server Function that touches company data
 * calls one of these first. Row-level security in the database is the second
 * line of defence.
 */

export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const requireUser = cache(async () => {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
});

export interface Membership {
  company: Company;
  role: MemberRole;
}

/** The company the signed-in user works in (first one, for the MVP). */
export const getMembership = cache(async (): Promise<Membership | null> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_members")
    .select("role, company:companies(id, name, phone, city, is_logistics, is_vendor)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Could not load your company: ${error.message}`);
  if (!data || !data.company) return null;

  const company = (Array.isArray(data.company) ? data.company[0] : data.company) as Company;
  return { company, role: data.role as MemberRole };
});

/** Use on dashboard pages: sends users without a company to onboarding. */
export const requireMembership = cache(async (): Promise<Membership> => {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");
  return membership;
});

/** Where a signed-in user with a company should land. */
export function homeFor(company: Company) {
  return company.is_logistics ? "/dashboard" : "/vendor";
}

/** Delivery pages: logistics companies only. */
export const requireLogistics = cache(async (): Promise<Membership> => {
  const membership = await requireMembership();
  if (!membership.company.is_logistics) redirect("/vendor");
  return membership;
});

/** Vehicle-rental pages. */
export const requireVendorAccess = cache(async (): Promise<Membership> => {
  return requireMembership();
});
