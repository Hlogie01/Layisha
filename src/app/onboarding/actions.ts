"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getMembership, requireUser } from "@/lib/dal";
import { normaliseSaPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export interface OnboardingState {
  error?: string;
}

const schema = z.object({
  name: z.string().trim().min(2, "Enter your business name").max(120),
  phone: z.string().trim().optional(),
  city: z.string().trim().max(80).optional(),
});

export async function createCompany(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireUser();
  if (await getMembership()) redirect("/dashboard");

  const parsed = schema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    city: formData.get("city") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let phone: string | null = null;
  if (parsed.data.phone) {
    phone = normaliseSaPhone(parsed.data.phone);
    if (!phone) return { error: "Enter a valid South African phone number, e.g. 082 123 4567" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_company", {
    p_name: parsed.data.name,
    p_phone: phone,
    p_city: parsed.data.city ?? null,
  });
  if (error) return { error: `Could not create your business: ${error.message}` };

  redirect("/dashboard");
}
