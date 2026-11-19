"use server";

import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat";
import { requireLogistics } from "@/lib/dal";
import { userMessage } from "@/lib/errors";
import { allow, TOO_MANY } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type ChatActionResult = { ok: true; count?: number } | { ok: false; error: string };

const messageSchema = z.object({
  id: z.string().uuid(),
  driverId: z.string().uuid(),
  body: z.string().trim().min(1, "Write a message").max(MAX_MESSAGE_LENGTH, "Message is too long"),
  orderId: z.string().uuid().nullish(),
});

export async function sendChatMessage(input: {
  id: string;
  driverId: string;
  body: string;
  orderId?: string | null;
}): Promise<ChatActionResult> {
  const { company } = await requireLogistics();
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!(await allow(`chat-send:${company.id}`, 600, 600))) return { ok: false, error: TOO_MANY };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("chat_messages").insert({
    id: parsed.data.id,
    company_id: company.id,
    driver_id: parsed.data.driverId,
    order_id: parsed.data.orderId ?? null,
    sender_type: "dispatcher",
    sender_user_id: userData.user?.id,
    body: parsed.data.body,
  });
  // A repeat of the same id (double tap, retry) is fine.
  if (error && error.code !== "23505") {
    return { ok: false, error: userMessage(error, "Could not send the message") };
  }
  return { ok: true };
}

export async function broadcastChat(body: string): Promise<ChatActionResult> {
  const { company } = await requireLogistics();
  const text = z.string().trim().min(1, "Write a message").max(MAX_MESSAGE_LENGTH).safeParse(body);
  if (!text.success) return { ok: false, error: text.error.issues[0].message };
  if (!(await allow(`chat-broadcast:${company.id}`, 20, 3600))) return { ok: false, error: TOO_MANY };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dispatch_broadcast", {
    p_company_id: company.id,
    p_body: text.data,
  });
  if (error) return { ok: false, error: userMessage(error, "Could not send the broadcast") };
  return { ok: true, count: data as number };
}

export async function markThreadRead(driverId: string): Promise<void> {
  await requireLogistics();
  const id = z.string().uuid().safeParse(driverId);
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("dispatch_chat_mark_read", { p_driver_id: id.data });
  if (error) console.error("[chat] mark read", error.message);
}
