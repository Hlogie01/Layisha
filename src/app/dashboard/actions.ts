"use server";

import { createHash, randomBytes, randomInt } from "node:crypto";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { userMessage } from "@/lib/errors";
import { requireLogistics } from "@/lib/dal";
import { allow, TOO_MANY } from "@/lib/rate-limit";
import { createAdminClient, POD_BUCKET } from "@/lib/supabase/admin";
import { normaliseSaPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUSES, PAYMENT_TYPES } from "@/lib/types";
import {
  locationRequestMessage,
  sendLocationRequestTemplate,
  waMeLink,
  whatsappApiConfigured,
} from "@/lib/whatsapp";

export interface FormState {
  error?: string;
  ok?: string;
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

const driverSchema = z.object({
  name: z.string().trim().min(2, "Enter the driver's name").max(80),
  phone: z.string().trim().min(1, "Enter the driver's phone number"),
  vehicle: z.string().trim().max(80).optional(),
});

export async function addDriver(_prev: FormState, formData: FormData): Promise<FormState> {
  const { company } = await requireLogistics();
  const parsed = driverSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    vehicle: formData.get("vehicle") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const phone = normaliseSaPhone(parsed.data.phone);
  if (!phone) return { error: "Enter a valid South African phone number, e.g. 082 123 4567" };

  const supabase = await createClient();
  const { error } = await supabase.from("drivers").insert({
    company_id: company.id,
    name: parsed.data.name,
    phone,
    vehicle: parsed.data.vehicle ?? null,
  });
  if (error) return { error: userMessage(error, "Could not add driver. Please try again.") };

  refresh();
  return { ok: `${parsed.data.name} added.` };
}

export async function setDriverActive(formData: FormData) {
  const { company } = await requireLogistics();
  const id = z.string().uuid().parse(formData.get("driver_id"));
  const active = formData.get("active") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("drivers")
    .update({ active })
    .eq("id", id)
    .eq("company_id", company.id);
  if (error) throw new Error(`Could not update driver: ${error.message}`);
  refresh();
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const orderSchema = z.object({
  customer_name: z.string().trim().min(2, "Enter the customer's name").max(120),
  customer_whatsapp: z.string().trim().min(1, "Enter the customer's WhatsApp number"),
  address_text: z.string().trim().max(300).optional(),
  items: z.string().trim().min(1, "Enter what is being delivered").max(500),
  amount_due: z.coerce.number().min(0, "Amount can't be negative").max(10_000_000),
  payment_type: z.enum(PAYMENT_TYPES.map((p) => p.value) as [string, ...string[]]),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a delivery date"),
  driver_id: z.string().uuid().optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function createOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const { company } = await requireLogistics();
  if (!(await allow(`create-order:${company.id}`, 600, 3600))) return { error: TOO_MANY };
  const parsed = orderSchema.safeParse({
    customer_name: formData.get("customer_name"),
    customer_whatsapp: formData.get("customer_whatsapp"),
    address_text: formData.get("address_text") || undefined,
    items: formData.get("items"),
    amount_due: formData.get("amount_due") || 0,
    payment_type: formData.get("payment_type"),
    delivery_date: formData.get("delivery_date"),
    driver_id: formData.get("driver_id") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const whatsapp = normaliseSaPhone(d.customer_whatsapp);
  if (!whatsapp) {
    return { error: "Enter a valid South African WhatsApp number, e.g. 082 123 4567" };
  }

  const supabase = await createClient();

  // Reuse the customer if this number is already known to the business,
  // keeping their saved location.
  const { data: existing, error: findError } = await supabase
    .from("customers")
    .select("id")
    .eq("company_id", company.id)
    .eq("whatsapp", whatsapp)
    .maybeSingle();
  if (findError) return { error: userMessage(findError, "Could not look up customer. Please try again.") };

  let customerId = existing?.id as string | undefined;
  if (customerId) {
    const update: Record<string, string> = { name: d.customer_name };
    if (d.address_text) update.address_text = d.address_text;
    await supabase.from("customers").update(update).eq("id", customerId);
  } else {
    const { data: created, error } = await supabase
      .from("customers")
      .insert({
        company_id: company.id,
        name: d.customer_name,
        whatsapp,
        address_text: d.address_text ?? null,
      })
      .select("id")
      .single();
    if (error) return { error: userMessage(error, "Could not save customer. Please try again.") };
    customerId = created.id;
  }

  const { data: reference, error: refError } = await supabase.rpc("next_order_reference", {
    cid: company.id,
  });
  if (refError) return { error: userMessage(refError, "Could not create order number. Please try again.") };

  const { error: orderError } = await supabase.from("orders").insert({
    company_id: company.id,
    reference,
    customer_id: customerId,
    driver_id: d.driver_id ?? null,
    items: d.items,
    amount_due: d.amount_due,
    payment_type: d.payment_type,
    delivery_date: d.delivery_date,
    notes: d.notes ?? null,
    otp_code: String(randomInt(0, 10_000)).padStart(4, "0"),
  });
  if (orderError) return { error: userMessage(orderError, "Could not save order. Please try again.") };

  if (formData.get("next") === "another") {
    refresh();
    return { ok: `Order ${reference} created. Add the next one.` };
  }
  redirect(`/dashboard?date=${d.delivery_date}`);
}

export async function assignDriver(formData: FormData) {
  const { company } = await requireLogistics();
  const orderId = z.string().uuid().parse(formData.get("order_id"));
  const raw = formData.get("driver_id");
  const driverId = raw ? z.string().uuid().parse(raw) : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ driver_id: driverId })
    .eq("id", orderId)
    .eq("company_id", company.id);
  if (error) throw new Error(`Could not assign driver: ${error.message}`);
  refresh();
}

const statusValues = ORDER_STATUSES.map((s) => s.value) as [string, ...string[]];

export async function updateOrderStatus(formData: FormData) {
  const { company } = await requireLogistics();
  const orderId = z.string().uuid().parse(formData.get("order_id"));
  const status = z.enum(statusValues).parse(formData.get("status"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({
      status,
      delivered_at: status === "delivered" ? new Date().toISOString() : null,
    })
    .eq("id", orderId)
    .eq("company_id", company.id);
  if (error) throw new Error(`Could not update order: ${error.message}`);
  refresh();
}

// ---------------------------------------------------------------------------
// Customer location confirmation
// ---------------------------------------------------------------------------

export type LocationRequestResult =
  | { kind: "sent" }
  | { kind: "link"; waUrl: string; note?: string }
  | { kind: "error"; error: string };

async function appOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Creates a private link for the customer to confirm their location, then
 * sends it by WhatsApp (automatically if the WhatsApp API is set up, otherwise
 * returns a wa.me link for the dispatcher to tap and send).
 */
export async function requestCustomerLocation(orderId: string): Promise<LocationRequestResult> {
  const { company } = await requireLogistics();
  if (!(await allow(`location-link:${company.id}`, 300, 3600))) return { kind: "error", error: TOO_MANY };
  const parsedId = z.string().uuid().safeParse(orderId);
  if (!parsedId.success) return { kind: "error", error: "Unknown order" };

  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, reference, customer:customers(id, name, whatsapp)")
    .eq("id", parsedId.data)
    .eq("company_id", company.id)
    .maybeSingle();
  if (error || !order) return { kind: "error", error: "Order not found" };

  const customer = (Array.isArray(order.customer) ? order.customer[0] : order.customer) as
    | { id: string; name: string; whatsapp: string }
    | null;
  if (!customer) return { kind: "error", error: "This order has no customer" };

  const token = randomBytes(24).toString("base64url"); // 32 characters
  const { data: userData } = await supabase.auth.getUser();
  const { error: insertError } = await supabase.from("location_requests").insert({
    token_hash: createHash("sha256").update(token).digest("hex"),
    company_id: company.id,
    customer_id: customer.id,
    order_id: order.id,
    created_by: userData.user?.id ?? null,
  });
  if (insertError) return { kind: "error", error: userMessage(insertError, "Could not create link. Please try again.") };

  const link = `${await appOrigin()}/c/${token}`;
  const firstName = customer.name.split(" ")[0];

  if (whatsappApiConfigured()) {
    const sent = await sendLocationRequestTemplate({
      toE164: customer.whatsapp,
      customerFirstName: firstName,
      businessName: company.name,
      link,
    });
    if (sent.ok) return { kind: "sent" };
    // Fall back to manual sending so the dispatcher is never stuck.
    return {
      kind: "link",
      waUrl: waMeLink(
        customer.whatsapp,
        locationRequestMessage({
          customerFirstName: firstName,
          businessName: company.name,
          orderReference: order.reference,
          link,
        }),
      ),
      note: "Automatic sending failed, so send it yourself.",
    };
  }

  return {
    kind: "link",
    waUrl: waMeLink(
      customer.whatsapp,
      locationRequestMessage({
        customerFirstName: firstName,
        businessName: company.name,
        orderReference: order.reference,
        link,
      }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Driver app links
// ---------------------------------------------------------------------------

export type DriverLinkResult = { kind: "link"; waUrl: string } | { kind: "error"; error: string };

/**
 * Creates a new personal app link for a driver and returns a WhatsApp link to
 * send it to them. Any older link for this driver stops working.
 */
export async function createDriverLink(driverId: string): Promise<DriverLinkResult> {
  const { company } = await requireLogistics();
  if (!(await allow(`driver-link:${company.id}`, 30, 3600))) return { kind: "error", error: TOO_MANY };
  const id = z.string().uuid().safeParse(driverId);
  if (!id.success) return { kind: "error", error: "Unknown driver" };

  const supabase = await createClient();
  const { data: driver, error } = await supabase
    .from("drivers")
    .select("id, name, phone, active")
    .eq("id", id.data)
    .eq("company_id", company.id)
    .maybeSingle();
  if (error || !driver) return { kind: "error", error: "Driver not found" };
  if (!driver.active) return { kind: "error", error: "Reactivate this driver first" };

  const now = new Date().toISOString();
  const { error: revokeError } = await supabase
    .from("driver_access_tokens")
    .update({ revoked_at: now })
    .eq("driver_id", driver.id)
    .is("revoked_at", null);
  if (revokeError) return { kind: "error", error: userMessage(revokeError, "Something went wrong. Please try again.") };

  const secret = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(secret).digest("hex");
  const { data: userData } = await supabase.auth.getUser();
  const { error: insertError } = await supabase.from("driver_access_tokens").insert({
    token_hash: tokenHash,
    driver_id: driver.id,
    company_id: company.id,
    created_by: userData.user?.id ?? null,
  });
  if (insertError) return { kind: "error", error: userMessage(insertError, "Something went wrong. Please try again.") };

  const link = `${await appOrigin()}/driver/start/${secret}`;
  const firstName = driver.name.split(" ")[0];
  const message =
    `Hi ${firstName}, here is your Layisha driver app for ${company.name}. ` +
    `Open this link on your phone to see your stops and record deliveries:\n${link}\n\n` +
    `Tip: after it opens, choose "Add to Home screen". Please don't share this link.`;
  refresh();
  return { kind: "link", waUrl: waMeLink(driver.phone, message) };
}

export async function revokeDriverLinks(formData: FormData) {
  const { company } = await requireLogistics();
  const driverId = z.string().uuid().parse(formData.get("driver_id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("driver_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("driver_id", driverId)
    .eq("company_id", company.id)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
  refresh();
}

// ---------------------------------------------------------------------------
// Delivery PIN reset (after 5 wrong tries the PIN locks)
// ---------------------------------------------------------------------------

export type PinResetResult = { kind: "link"; waUrl: string } | { kind: "error"; error: string };

export async function resetOrderPin(orderId: string): Promise<PinResetResult> {
  const { company } = await requireLogistics();
  const id = z.string().uuid().safeParse(orderId);
  if (!id.success) return { kind: "error", error: "Unknown order" };

  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, reference, status, customer:customers(name, whatsapp)")
    .eq("id", id.data)
    .eq("company_id", company.id)
    .maybeSingle();
  if (error || !order) return { kind: "error", error: "Order not found" };
  if (order.status === "delivered" || order.status === "cancelled") {
    return { kind: "error", error: "This order is already closed" };
  }
  const customer = (Array.isArray(order.customer) ? order.customer[0] : order.customer) as
    | { name: string; whatsapp: string }
    | null;
  if (!customer) return { kind: "error", error: "This order has no customer" };

  const pin = String(randomInt(0, 10_000)).padStart(4, "0");
  const { error: updateError } = await supabase
    .from("orders")
    .update({ otp_code: pin, otp_attempts: 0, otp_locked_at: null })
    .eq("id", order.id)
    .eq("company_id", company.id);
  if (updateError) return { kind: "error", error: userMessage(updateError, "Could not reset the PIN") };

  refresh();
  return {
    kind: "link",
    waUrl: waMeLink(
      customer.whatsapp,
      `Hi ${customer.name.split(" ")[0]}, your new delivery PIN for order ${order.reference} is ${pin}. ` +
        "Give it to the driver only when you have received your order.",
    ),
  };
}

// ---------------------------------------------------------------------------
// POPIA: remove a customer's personal details on request (owner only)
// ---------------------------------------------------------------------------

export async function forgetCustomer(formData: FormData) {
  const { role } = await requireLogistics();
  if (role !== "owner") throw new Error("Only the account owner can remove customer details.");
  const customerId = z.string().uuid().parse(formData.get("customer_id"));

  const supabase = await createClient();
  const { data: paths, error } = await supabase.rpc("forget_customer", { p_customer_id: customerId });
  if (error) throw new Error(userMessage(error, "Could not remove the customer's details"));

  const photoPaths = (paths ?? []) as string[];
  if (photoPaths.length) {
    try {
      await createAdminClient().storage.from(POD_BUCKET).remove(photoPaths);
    } catch (e) {
      console.error("[forget-customer] photo removal failed", e);
    }
  }
  refresh();
}
