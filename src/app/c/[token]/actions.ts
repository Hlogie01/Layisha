"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface ConfirmState {
  status: "idle" | "saved" | "error";
  message?: string;
}

const schema = z.object({
  token: z.string().min(32).max(100),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  note: z.string().trim().max(500).optional(),
});

/**
 * Called from the public confirmation page. No login: the database function
 * checks the token and only touches that one customer's location.
 */
export async function confirmLocation(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: "Please share your location first." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_location", {
    p_token: parsed.data.token,
    p_lat: parsed.data.lat,
    p_lng: parsed.data.lng,
    p_note: parsed.data.note ?? null,
  });

  if (error) {
    if (error.message.includes("outside the delivery area")) {
      return {
        status: "error",
        message: "That location looks wrong. Please try again, or describe where you are below.",
      };
    }
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  if (!data) {
    return { status: "error", message: "This link has expired. Ask the business for a new one." };
  }
  return { status: "saved" };
}
