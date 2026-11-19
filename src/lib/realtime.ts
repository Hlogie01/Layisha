"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Live "pings" over Supabase Realtime Broadcast. The database sends a
 * content-free ping to a secret topic whenever a chat changes; the app then
 * fetches new messages through its normal, permission-checked routes.
 */
let client: SupabaseClient | null = null;

function realtimeClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
}

export type LiveStatus = "connecting" | "live" | "offline";

/** Listens for pings on `topic`. Returns a function that stops listening. */
export function listenForPings(
  topic: string,
  onPing: (payload: Record<string, unknown>) => void,
  onStatus?: (status: LiveStatus) => void,
): () => void {
  const sb = realtimeClient();
  if (!sb) {
    onStatus?.("offline");
    return () => {};
  }
  onStatus?.("connecting");
  const channel = sb
    .channel(topic, { config: { private: false } })
    .on("broadcast", { event: "chat" }, (msg) => onPing((msg.payload ?? {}) as Record<string, unknown>))
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onStatus?.("live");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") onStatus?.("offline");
    });
  return () => {
    void sb.removeChannel(channel);
  };
}
