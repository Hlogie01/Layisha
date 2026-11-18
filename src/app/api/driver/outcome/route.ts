import { NextResponse } from "next/server";
import { z } from "zod";
import { driverDb, driverTokenFromCookie, whoami } from "@/lib/driver-session";
import { createAdminClient, POD_BUCKET } from "@/lib/supabase/admin";

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

const fields = z.object({
  pod_id: z.string().uuid(),
  order_id: z.string().uuid(),
  outcome: z.enum(["delivered", "failed"]),
  captured_at: z.string().datetime(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  gps_accuracy_m: z.coerce.number().int().min(0).max(100_000).optional(),
  otp: z.string().regex(/^\d{4}$/).optional(),
  no_otp_reason: z.string().trim().max(200).optional(),
  recipient_name: z.string().trim().max(120).optional(),
  failure_reason: z.string().trim().max(200).optional(),
  payment_method: z.enum(["cash", "eft", "card", "none"]).optional(),
  amount_collected: z.coerce.number().min(0).max(10_000_000).optional(),
});

/**
 * Records a delivery outcome from the driver app. The app may send the same
 * outcome more than once (offline retries); the database ignores repeats.
 */
export async function POST(request: Request) {
  const token = await driverTokenFromCookie();
  if (!token) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  const me = await whoami(token);
  if (!me) return NextResponse.json({ error: "link_revoked" }, { status: 401 });

  const form = await request.formData();
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string" && v !== "") raw[k] = v;
  }
  const parsed = fields.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const f = parsed.data;

  // Upload the photo first, into this driver's company folder.
  let photoPath: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "Photo is too large" }, { status: 413 });
    }
    if (!photo.type.startsWith("image/")) {
      return NextResponse.json({ error: "Photo must be an image" }, { status: 400 });
    }
    photoPath = `${me.company_id}/${f.order_id}/${f.pod_id}.jpg`;
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from(POD_BUCKET)
      .upload(photoPath, photo, { contentType: photo.type, upsert: true });
    if (uploadError) {
      return NextResponse.json({ error: `Photo upload failed: ${uploadError.message}` }, { status: 502 });
    }
  }

  const { data, error } = await driverDb().rpc("driver_record_outcome", {
    p_token: token,
    p_pod_id: f.pod_id,
    p_order_id: f.order_id,
    p_outcome: f.outcome,
    p_captured_at: f.captured_at,
    p_lat: f.lat ?? null,
    p_lng: f.lng ?? null,
    p_gps_accuracy_m: f.gps_accuracy_m ?? null,
    p_photo_path: photoPath,
    p_otp: f.otp ?? null,
    p_no_otp_reason: f.no_otp_reason ?? null,
    p_recipient_name: f.recipient_name ?? null,
    p_failure_reason: f.failure_reason ?? null,
    p_payment_method: f.payment_method ?? null,
    p_amount_collected: f.amount_collected ?? null,
  });

  if (error) {
    // 422: the app should stop retrying this one and show the message.
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  const result = data as { ok: boolean; error?: string; duplicate?: boolean };
  if (!result.ok && result.error === "wrong_pin") {
    return NextResponse.json({ error: "wrong_pin" }, { status: 422 });
  }
  return NextResponse.json(result);
}
