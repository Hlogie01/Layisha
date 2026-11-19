/** Shared chat types and constants (used on both server and client). */

export interface ChatMessage {
  id: string;
  order_id: string | null;
  order_reference: string | null;
  sender_type: "dispatcher" | "driver";
  body: string;
  quick_reply: string | null;
  is_broadcast: boolean;
  created_at: string;
  read_by_driver_at: string | null;
  read_by_dispatch_at: string | null;
  /** Only on the sender's device while waiting to upload. */
  pending?: boolean;
  failed?: string;
}

/** One-tap replies for drivers: safer than typing while on the road. */
export const QUICK_REPLIES = [
  { key: "on_my_way", text: "On my way" },
  { key: "arrived", text: "I've arrived" },
  { key: "running_late", text: "Running about 20 minutes late" },
  { key: "no_answer", text: "Customer is not answering" },
  { key: "gate_locked", text: "Gate is locked, can't get in" },
  { key: "need_directions", text: "I need directions to this stop" },
  { key: "vehicle_problem", text: "I have a vehicle problem" },
] as const;

export const MAX_MESSAGE_LENGTH = 1000;

/** Merges fetched messages into a list, newest data wins, sorted by time. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m, pending: false, failed: undefined });
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function formatChatTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat("en-ZA", {
    ...(sameDay ? {} : { day: "numeric", month: "short" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
