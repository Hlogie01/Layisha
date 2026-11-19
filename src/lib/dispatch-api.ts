import "server-only";
import { getMembership, getUser, type Membership } from "@/lib/dal";

/**
 * For dashboard API routes: returns the signed-in delivery company, or null
 * (so the route can answer 401 instead of redirecting to the login page).
 */
export async function logisticsForApi(): Promise<Membership | null> {
  const user = await getUser();
  if (!user) return null;
  const membership = await getMembership();
  if (!membership || !membership.company.is_logistics) return null;
  return membership;
}
