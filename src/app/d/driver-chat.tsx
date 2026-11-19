"use client";

import { createStore, get, set } from "idb-keyval";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatBubble } from "@/components/chat-bits";
import { Button, cx, Select, Textarea } from "@/components/ui";
import { MAX_MESSAGE_LENGTH, mergeMessages, QUICK_REPLIES, type ChatMessage } from "@/lib/chat";
import { listenForPings, type LiveStatus } from "@/lib/realtime";
import type { Stop } from "./offline";

// ---------------------------------------------------------------------------
// Storage on the phone: last messages, the live topic, and unsent messages.
// ---------------------------------------------------------------------------

interface ChatOutboxItem {
  id: string;
  body: string;
  order_id: string | null;
  order_reference: string | null;
  quick_reply: string | null;
  client_sent_at: string;
  failed?: string;
}

const store = typeof indexedDB !== "undefined" ? createStore("layisha-driver-chat", "kv") : undefined;

async function load<T>(key: string, fallback: T): Promise<T> {
  if (!store) return fallback;
  return ((await get<T>(key, store)) ?? fallback) as T;
}
async function save<T>(key: string, value: T) {
  if (store) await set(key, value, store);
}

function outboxToMessage(o: ChatOutboxItem): ChatMessage {
  return {
    id: o.id,
    order_id: o.order_id,
    order_reference: o.order_reference,
    sender_type: "driver",
    body: o.body,
    quick_reply: o.quick_reply,
    is_broadcast: false,
    created_at: o.client_sent_at,
    read_by_driver_at: null,
    read_by_dispatch_at: null,
    pending: !o.failed,
    failed: o.failed,
  };
}

// ---------------------------------------------------------------------------
// Hook: keeps the driver's chat live and works offline.
// ---------------------------------------------------------------------------

export function useDriverChat(enabled: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [outbox, setOutbox] = useState<ChatOutboxItem[]>([]);
  const [topic, setTopic] = useState<string | null>(null);
  const [live, setLive] = useState<LiveStatus>("connecting");
  const lastSync = useRef<string | null>(null);
  const known = useRef<Set<string>>(new Set());
  const flushing = useRef(false);

  const fetchMessages = useCallback(async () => {
    const since = lastSync.current;
    const started = new Date().toISOString();
    const res = await fetch(`/api/driver/chat${since ? `?since=${encodeURIComponent(since)}` : ""}`, {
      cache: "no-store",
    }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { topic: string; messages: ChatMessage[] };
    lastSync.current = started;
    setTopic(data.topic);

    // Buzz for new messages from dispatch.
    const fresh = data.messages.filter((m) => m.sender_type === "dispatcher" && !known.current.has(m.id));
    if (known.current.size > 0 && fresh.length && "vibrate" in navigator) navigator.vibrate?.([120, 60, 120]);
    for (const m of data.messages) known.current.add(m.id);

    setMessages((current) => {
      const merged = mergeMessages(since ? current : [], data.messages);
      void save("messages", merged.slice(-200));
      void save("topic", data.topic);
      return merged;
    });
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let items = await load<ChatOutboxItem[]>("outbox", []);
      for (const item of items) {
        if (item.failed) continue;
        let res: Response | null = null;
        try {
          res = await fetch("/api/driver/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          });
        } catch {
          break; // offline: try again later
        }
        if (res.ok) {
          items = items.filter((i) => i.id !== item.id);
        } else if (res.status === 400 || res.status === 422) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          items = items.map((i) => (i.id === item.id ? { ...i, failed: body.error ?? "Not sent" } : i));
        } else {
          break; // 401/429/5xx: keep and retry later
        }
      }
      await save("outbox", items);
      setOutbox(items);
    } finally {
      flushing.current = false;
    }
    await fetchMessages();
  }, [fetchMessages]);

  // Start: show saved messages straight away, then sync.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const [saved, savedTopic, savedOutbox] = await Promise.all([
        load<ChatMessage[]>("messages", []),
        load<string | null>("topic", null),
        load<ChatOutboxItem[]>("outbox", []),
      ]);
      if (cancelled) return;
      for (const m of saved) known.current.add(m.id);
      setMessages(saved);
      setTopic(savedTopic);
      setOutbox(savedOutbox);
      await flush();
    })();
    const timer = window.setInterval(() => void flush(), 30_000);
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, flush]);

  useEffect(() => {
    if (!enabled || !topic) return;
    return listenForPings(topic, () => void fetchMessages(), setLive);
  }, [enabled, topic, fetchMessages]);

  const send = useCallback(
    async (body: string, opts: { orderId?: string | null; orderReference?: string | null; quickReply?: string | null } = {}) => {
      const item: ChatOutboxItem = {
        id: crypto.randomUUID(),
        body: body.trim().slice(0, MAX_MESSAGE_LENGTH),
        order_id: opts.orderId ?? null,
        order_reference: opts.orderReference ?? null,
        quick_reply: opts.quickReply ?? null,
        client_sent_at: new Date().toISOString(),
      };
      if (!item.body) return;
      const items = [...(await load<ChatOutboxItem[]>("outbox", [])), item];
      await save("outbox", items);
      setOutbox(items);
      await flush();
    },
    [flush],
  );

  const retry = useCallback(
    async (id: string) => {
      const items = (await load<ChatOutboxItem[]>("outbox", [])).map((i) =>
        i.id === id ? { ...i, failed: undefined } : i,
      );
      await save("outbox", items);
      setOutbox(items);
      await flush();
    },
    [flush],
  );

  const markRead = useCallback(async () => {
    if (!messages.some((m) => m.sender_type === "dispatcher" && !m.read_by_driver_at)) return;
    const res = await fetch("/api/driver/chat/read", { method: "POST" }).catch(() => null);
    if (res?.ok) {
      const now = new Date().toISOString();
      setMessages((ms) =>
        ms.map((m) => (m.sender_type === "dispatcher" && !m.read_by_driver_at ? { ...m, read_by_driver_at: now } : m)),
      );
    }
  }, [messages]);

  const all = useMemo(
    () =>
      mergeMessages(
        messages,
        outbox.filter((o) => !messages.some((m) => m.id === o.id)).map(outboxToMessage),
      ).map((m) => {
        const o = outbox.find((x) => x.id === m.id);
        return o ? { ...m, pending: !o.failed, failed: o.failed } : m;
      }),
    [messages, outbox],
  );
  const unread = messages.filter((m) => m.sender_type === "dispatcher" && !m.read_by_driver_at).length;
  const waiting = outbox.filter((o) => !o.failed).length;

  return { messages: all, unread, waiting, live, send, retry, markRead };
}

// ---------------------------------------------------------------------------
// Chat screen in the driver app
// ---------------------------------------------------------------------------

export function DriverChat({
  chat,
  stops,
  initialOrderId,
  onBack,
}: {
  chat: ReturnType<typeof useDriverChat>;
  stops: Stop[];
  initialOrderId: string | null;
  onBack: () => void;
}) {
  const [text, setText] = useState("");
  const [orderId, setOrderId] = useState<string>(initialOrderId ?? "");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { markRead, messages } = chat;

  useEffect(() => {
    void markRead();
  }, [markRead]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const openStops = stops.filter((s) => s.status !== "delivered" && s.status !== "failed");
  const ref = stops.find((s) => s.id === orderId)?.reference ?? null;

  async function send(body: string, quickReply?: string) {
    await chat.send(body, { orderId: orderId || null, orderReference: ref, quickReply: quickReply ?? null });
    setText("");
  }

  return (
    <div className="flex min-h-[calc(100dvh-5.5rem)] flex-col gap-3">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm font-semibold underline decoration-hivis decoration-2 underline-offset-4">
          ← Stops
        </button>
        <span className="flex items-center gap-1.5 text-xs text-kerb">
          <span
            className={cx(
              "inline-block h-2 w-2 rounded-full",
              chat.live === "live" ? "bg-depot" : chat.live === "connecting" ? "bg-hivis" : "bg-kerb",
            )}
            aria-hidden="true"
          />
          {chat.live === "live" ? "Live" : chat.live === "connecting" ? "Connecting…" : "Checking every 30 seconds"}
          {chat.waiting ? ` · ${chat.waiting} waiting to send` : ""}
        </span>
      </div>
      <h1 className="text-2xl font-bold">Chat with dispatch</h1>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="pt-6 text-center text-sm text-kerb">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <ChatBubble key={m.id} message={m} mine={m.sender_type === "driver"} onRetry={() => void chat.retry(m.id)} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 space-y-2 border-t border-line bg-chalk pb-2 pt-3">
        {openStops.length ? (
          <label className="flex items-center gap-2 text-sm text-kerb">
            <span className="shrink-0">About</span>
            <Select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="py-2 text-sm">
              <option value="">No specific stop</option>
              {openStops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.reference} · {s.customer_name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Quick replies">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q.key}
              type="button"
              onClick={() => void send(q.text, q.key)}
              className="shrink-0 rounded-full border border-line bg-white px-3.5 py-2.5 text-sm font-semibold active:bg-hivis-soft"
            >
              {q.text}
            </button>
          ))}
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <label htmlFor="driver-chat-input" className="sr-only">
            Message
          </label>
          <Textarea
            id="driver-chat-input"
            value={text}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message"
            rows={1}
            className="min-h-12 resize-none"
          />
          <Button type="submit" disabled={!text.trim()} className="py-3.5 text-base">
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
