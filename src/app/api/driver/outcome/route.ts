import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { driverDb, driverTokenFromCookie, whoami } from "@/lib/driver-session";
import { allow } from "@/lib/rate-limit";
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

/** Checks the file really is a JPEG, PNG, WebP or HEIC image, not just labelled as one. */
function looksLikeImage(bytes: Uint8Array): boolean {
  const b = bytes;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  const webp = ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  const heic = ascii(4, 8) === "ftyp" && ["heic", "heix", "mif1", "msf1", "heif"].includes(ascii(8, 12));
  return jpeg || png || webp || heic;
}

/**
 * Records a delivery outcome from the driver app. The app may send the same
 * outcome more than once (offline retries); the database ignores repeats.
 */
export async function POST(request: Request) {
  const token = await driverTokenFromCookie();
  if (!token) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const tokenKey = createHash("sha256").update(token).digest("hex").slice(0, 24);
  if (!(await allow(`driver-outcome:${tokenKey}`, 60, 600))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const me = await whoami(token);
  if (!me) return NextResponse.json({ error: "link_revoked" }, { status: 401 });

  const form = await request.formData();
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string" && v !== "") raw[k] = v;
  }
  const parsed = fields.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Some details are missing or invalid" }, { status: 400 });
  }
  const f = parsed.data;
  const db = driverDb();

  // Check the stop BEFORE storing anything.
  const { data: check, error: checkError } = await db.rpc("driver_stop_check", {
    p_token: token,
    p_order_id: f.order_id,
    p_pod_id: f.pod_id,
  });
  if (checkError) {
    console.error("[driver-outcome] check", checkError.message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (check === "already_recorded") return NextResponse.json({ ok: true, duplicate: true });
  if (check !== "ok") {
    return NextResponse.json(
      { error: "This stop is closed or no longer assigned to you" },
      { status: 422 },
    );
  }

  let photoPath: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "Photo is too large" }, { status: 413 });
    }
    const bytes = new Uint8Array(await photo.arrayBuffer());
    if (!looksLikeImage(bytes.slice(0, 16))) {
      return NextResponse.json({ error: "Photo must be a picture from the camera" }, { status: 400 });
    }
    photoPath = `${me.company_id}/${f.order_id}/${f.pod_id}.jpg`;
    const { error: uploadError } = await createAdminClient()
      .storage.from(POD_BUCKET)
      .upload(photoPath, bytes, { contentType: photo.type || "image/jpeg", upsert: true });
    if (uploadError) {
      console.error("[driver-outcome] upload", uploadError.message);
      return NextResponse.json({ error: "Photo upload failed, try again" }, { status: 502 });
    }
  }

  const { data, error } = await db.rpc("driver_record_outcome", {
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
    // Messages we raise ourselves (P0001) are written for drivers; hide anything else.
    const message = error.code === "P0001" ? error.message : "Could not save, try again";
    if (error.code !== "P0001") console.error("[driver-outcome] record", error.message);
    return NextResponse.json({ error: message }, { status: error.code === "P0001" ? 422 : 500 });
  }

  const result = data as { ok: boolean; error?: string; attempts_left?: number; duplicate?: boolean };
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, attempts_left: result.attempts_left },
      { status: 422 },
    );
  }
  return NextResponse.json(result);
}
