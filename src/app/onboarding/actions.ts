"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { userMessage } from "@/lib/errors";
import { getMembership, homeFor, requireUser } from "@/lib/dal";
import { normaliseSaPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { VEHICLE_TYPES } from "@/lib/types";

export interface OnboardingState {
  error?: string;
}

const schema = z.object({
  account: z.enum(["logistics", "vendor", "both"], {
    message: "Choose what you'll use Layisha for",
  }),
  name: z.string().trim().min(2, "Enter your name or business name").max(120),
  phone: z.string().trim().optional(),
  city: z.string().trim().max(80).optional(),
  service_area: z.string().trim().max(120).optional(),
  fleet_size: z.coerce.number().int().min(1, "Enter how many vehicles").max(10000).optional(),
  vehicle_types: z.array(z.enum(VEHICLE_TYPES)).optional(),
});

export async function createCompany(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireUser();
  const existing = await getMembership();
  if (existing) redirect(homeFor(existing.company));

  const parsed = schema.safeParse({
    account: formData.get("account") ?? undefined,
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    city: formData.get("city") || undefined,
    service_area: formData.get("service_area") || undefined,
    fleet_size: formData.get("fleet_size") || undefined,
    vehicle_types: formData.getAll("vehicle_types").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const isLogistics = d.account === "logistics" || d.account === "both";
  const isVendor = d.account === "vendor" || d.account === "both";

  let phone: string | null = null;
  if (d.phone) {
    phone = normaliseSaPhone(d.phone);
    if (!phone) return { error: "Enter a valid South African phone number, e.g. 082 123 4567" };
  }
  if (isVendor && !phone) {
    return { error: "Add a phone number so companies can reach you about your vehicles" };
  }
  if (isVendor && !d.vehicle_types?.length) {
    return { error: "Choose at least one type of vehicle you rent out" };
  }

  const supabase = await createClient();
  const { data: companyId, error } = await supabase.rpc("create_company", {
    p_name: d.name,
    p_phone: phone,
    p_city: d.city ?? null,
    p_is_logistics: isLogistics,
    p_is_vendor: isVendor,
  });
  if (error) return { error: userMessage(error, "Could not create your account. Please try again.") };

  if (isVendor) {
    const { error: profileError } = await supabase.from("vendor_profiles").insert({
      company_id: companyId,
      service_area: d.service_area ?? d.city ?? null,
      vehicle_types: d.vehicle_types ?? [],
      fleet_size: d.fleet_size ?? null,
    });
    if (profileError) return { error: userMessage(profileError, "Could not save your vehicle details. Please try again.") };
  }

  redirect(isLogistics ? "/dashboard" : "/vendor");
}
