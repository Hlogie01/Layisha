"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireVendorAccess } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { VEHICLE_TYPES } from "@/lib/types";

export interface VendorState {
  error?: string;
  ok?: string;
}

const profileSchema = z.object({
  vehicle_types: z.array(z.enum(VEHICLE_TYPES)).min(1, "Choose at least one type of vehicle"),
  fleet_size: z.coerce.number().int().min(1, "Enter how many vehicles").max(10000),
  service_area: z.string().trim().max(120).optional(),
});

function parseProfile(formData: FormData) {
  return profileSchema.safeParse({
    vehicle_types: formData.getAll("vehicle_types").map(String),
    fleet_size: formData.get("fleet_size"),
    service_area: formData.get("service_area") || undefined,
  });
}

/** A delivery company that also wants to rent out vehicles. */
export async function enableVendor(_prev: VendorState, formData: FormData): Promise<VendorState> {
  const { company, role } = await requireVendorAccess();
  if (company.is_vendor) redirect("/vendor");
  if (role !== "owner") return { error: "Only the account owner can switch this on." };

  const parsed = parseProfile(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("enable_company_role", { cid: company.id, p_role: "vendor" });
  if (error) return { error: error.message };

  const { error: profileError } = await supabase.from("vendor_profiles").upsert({
    company_id: company.id,
    vehicle_types: parsed.data.vehicle_types,
    fleet_size: parsed.data.fleet_size,
    service_area: parsed.data.service_area ?? company.city,
  });
  if (profileError) return { error: profileError.message };

  redirect("/vendor");
}

export async function updateVendorProfile(_prev: VendorState, formData: FormData): Promise<VendorState> {
  const { company } = await requireVendorAccess();
  if (!company.is_vendor) return { error: "Vehicle rental isn't switched on for this account." };

  const parsed = parseProfile(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("vendor_profiles").upsert({
    company_id: company.id,
    vehicle_types: parsed.data.vehicle_types,
    fleet_size: parsed.data.fleet_size,
    service_area: parsed.data.service_area ?? null,
  });
  if (error) return { error: error.message };
  return { ok: "Saved." };
}

/** A vendor-only account that also wants to run deliveries. */
export async function enableLogistics() {
  const { company, role } = await requireVendorAccess();
  if (company.is_logistics) redirect("/dashboard");
  if (role !== "owner") throw new Error("Only the account owner can switch this on.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("enable_company_role", { cid: company.id, p_role: "logistics" });
  if (error) throw new Error(error.message);
  redirect("/dashboard");
}
