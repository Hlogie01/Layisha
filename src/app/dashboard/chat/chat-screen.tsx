"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatBubble, UnreadBadge } from "@/components/chat-bits";
import { Button, cx, FormMessage, Select, Textarea } from "@/components/ui";
import { formatChatTime, MAX_MESSAGE_LENGTH, mergeMessages, type ChatMessage } from "@/lib/chat";
import { listenForPings, type LiveStatus } from "@/lib/realtime";
import type { ChatSummary } from "../../api/dispatch/chat/summary/route";
import { broadcastChat, markThreadRead, sendChatMessage } from "./actions";

export interface OrderOption {
  id: string;
  reference: string;
  driver_id: string | null;
  customer: string;
}

export function ChatScreen({
  initialDriverId,
  initialOrderId,
  orders,
}: {
  initialDriverId: string | null;
  initialOrderId: string | null;
  orders: OrderOption[];
}) {
  const [summary, setSummary] = useState<ChatSummary | null>(null);
  const [driverId, setDriverId] = useState<string | null>(initialDriverId);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [live, setLive] = useState<LiveStatus>("connecting");
  const [text, setText] = useState("");
  const [orderTag, setOrderTag] = useState<string>(initialOrderId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const lastSync = useRef<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const driverIdRef = useRef(driverId);
  useEffect(() => {
    driverIdRef.current = driverId;
  }, [driverId]);

  const loadSummary = useCallback(async () => {
    const res = await fetch("/api/dispatch/chat/summary", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setSummary((await res.json()) as ChatSummary);
  }, []);

  const loadThread = useCallback(async (id: string, full = false) => {
    const since = full ? null : lastSync.current[id];
    const started = new Date().toISOString();
    const res = await fetch(
      `/api/dispatch/chat?driver=${id}${since ? `&since=${encodeURIComponent(since)}` : ""}`,
      { cache: "no-store" },
    ).catch(() => null);
    if (!res?.ok) return;
    const { messages } = (await res.json()) as { messages: ChatMessage[] };
    lastSync.current[id] = started;
    setThreads((t) => ({ ...t, [id]: mergeMessages(full ? [] : (t[id] ?? []), messages) }));
    if (messages.some((m) => m.sender_type === "driver" && !m.read_by_dispatch_at) && id === driverIdRef.current) {
      if (document.visibilityState === "visible") {
        await markThreadRead(id);
        void loadSummary();
      }
    }
  }, [loadSummary]);

  // Summary, live pings and a fallback poll.
  useEffect(() => {
    const first = window.setTimeout(() => void loadSummary(), 0);
    const timer = window.setInterval(() => {
      void loadSummary();
      if (driverIdRef.current) void loadThread(driverIdRef.current);
    }, 20_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [loadSummary, loadThread]);

  const topic = summary?.topic ?? null;
  useEffect(() => {
    if (!topic) return;
    return listenForPings(
      topic,
      (payload) => {
        void loadSummary();
        const id = typeof payload.driver_id === "string" ? payload.driver_id : null;
        if (id && id === driverIdRef.current) void loadThread(id);
      },
      setLive,
    );
  }, [topic, loadSummary, loadThread]);

  // Open a conversation.
  useEffect(() => {
    if (!driverId) return;
    void loadThread(driverId, true).then(async () => {
      await markThreadRead(driverId);
      void loadSummary();
    });
    const url = new URL(window.location.href);
    url.searchParams.set("driver", driverId);
    window.history.replaceState(null, "", url);
  }, [driverId, loadThread, loadSummary]);

  const messages = driverId ? (threads[driverId] ?? []) : [];
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, driverId]);

  const driverOrders = orders.filter((o) => o.driver_id === driverId);
  const selected = summary?.drivers.find((d) => d.id === driverId);

  async function send(retry?: ChatMessage) {
    if (!driverId) return;
    const body = retry ? retry.body : text.trim();
    if (!body) return;
    const order = retry ? retry.order_id : orderTag || null;
    const msg: ChatMessage = retry
      ? { ...retry, pending: true, failed: undefined }
      : {
          id: crypto.randomUUID(),
          order_id: order,
          order_reference: orders.find((o) => o.id === order)?.reference ?? null,
          sender_type: "dispatcher",
          body,
          quick_reply: null,
          is_broadcast: false,
          created_at: new Date().toISOString(),
          read_by_driver_at: null,
          read_by_dispatch_at: null,
          pending: true,
        };
    const id = driverId;
    setThreads((t) => ({ ...t, [id]: mergeMessages(t[id] ?? [], [msg]).map((m) => (m.id === msg.id ? msg : m)) }));
    if (!retry) setText("");
    setError(null);

    const result = await sendChatMessage({ id: msg.id, driverId: id, body, orderId: order }).catch(() => ({
      ok: false as const,
      error: "No connection. Tap retry.",
    }));
    if (!result.ok) {
      setThreads((t) => ({
        ...t,
        [id]: (t[id] ?? []).map((m) => (m.id === msg.id ? { ...m, pending: false, failed: result.error } : m)),
      }));
      setError(result.error);
      return;
    }
    void loadThread(id);
    void loadSummary();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Chat</h1>
          <p className="flex items-center gap-2 text-sm text-kerb">
            <span
              className={cx(
                "inline-block h-2 w-2 rounded-full",
                live === "live" ? "bg-depot" : live === "connecting" ? "bg-hivis" : "bg-kerb",
              )}
              aria-hidden="true"
            />
            {live === "live" ? "Live" : live === "connecting" ? "Connecting…" : "Checking every 20 seconds"}
          </p>
        </div>
        <Button variant="dark" onClick={() => setBroadcastOpen((o) => !o)}>
          {broadcastOpen ? "Close broadcast" : "Message all drivers"}
        </Button>
      </div>

      {broadcastOpen ? <BroadcastBox onSent={() => { setBroadcastOpen(false); void loadSummary(); if (driverId) void loadThread(driverId); }} /> : null}

      <div className="grid min-h-[60vh] gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
        {/* Driver list */}
        <aside className={cx("rounded-[20px] border border-line bg-white", driverId && "hidden md:block")}>
          {!summary ? (
            <p className="p-4 text-sm text-kerb">Loading…</p>
          ) : summary.drivers.length === 0 ? (
            <p className="p-4 text-sm text-kerb">Add drivers to start chatting.</p>
          ) : (
            <ul className="divide-y divide-line">
              {summary.drivers.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setDriverId(d.id)}
                    className={cx(
                      "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-chalk",
                      d.id === driverId && "bg-hivis-soft",
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink font-display text-sm font-bold text-chalk">
                      {d.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cx("truncate font-semibold", !d.active && "text-kerb")}>{d.name}</span>
                        {d.last ? (
                          <span className="shrink-0 text-xs text-kerb">{formatChatTime(d.last.created_at)}</span>
                        ) : null}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-kerb">
                          {d.last ? `${d.last.sender_type === "dispatcher" ? "You: " : ""}${d.last.body}` : "No messages yet"}
                        </span>
                        <UnreadBadge count={d.unread} />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Conversation */}
        <section
          className={cx(
            "flex min-h-[60vh] flex-col rounded-[20px] border border-line bg-white",
            !driverId && "hidden md:flex",
          )}
        >
          {!driverId ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-kerb">
              Choose a driver to start chatting.
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-line px-4 py-3">
                <button
                  type="button"
                  onClick={() => setDriverId(null)}
                  className="text-sm font-semibold md:hidden"
                  aria-label="Back to all drivers"
                >
                  ←
                </button>
                <h2 className="font-display text-lg font-bold">{selected?.name ?? "Driver"}</h2>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto bg-chalk/60 p-4" style={{ maxHeight: "60vh" }}>
                {messages.length === 0 ? (
                  <p className="pt-8 text-center text-sm text-kerb">No messages yet. Say hello.</p>
                ) : (
                  messages.map((m) => (
                    <ChatBubble key={m.id} message={m} mine={m.sender_type === "dispatcher"} onRetry={() => void send(m)} />
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              <form
                className="space-y-2 border-t border-line p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                {driverOrders.length ? (
                  <label className="flex items-center gap-2 text-sm text-kerb">
                    <span className="shrink-0">About</span>
                    <Select value={orderTag} onChange={(e) => setOrderTag(e.target.value)} className="py-1.5 text-sm">
                      <option value="">No specific order</option>
                      {driverOrders.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.reference} · {o.customer}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : null}
                <div className="flex items-end gap-2">
                  <label htmlFor="chat-input" className="sr-only">
                    Message
                  </label>
                  <Textarea
                    id="chat-input"
                    value={text}
                    maxLength={MAX_MESSAGE_LENGTH}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder="Type a message"
                    className="min-h-11 resize-none"
                    rows={1}
                  />
                  <Button type="submit" disabled={!text.trim()}>
                    Send
                  </Button>
                </div>
                <FormMessage message={error} />
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function BroadcastBox({ onSent }: { onSent: () => void }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<{ error?: string; ok?: string }>({});
  const [pending, setPending] = useState(false);
  return (
    <form
      className="space-y-3 rounded-[20px] border border-hivis bg-hivis-soft p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const result = await broadcastChat(text);
        setPending(false);
        if (!result.ok) return setState({ error: result.error });
        setState({ ok: `Sent to ${result.count} driver${result.count === 1 ? "" : "s"}.` });
        setText("");
        window.setTimeout(onSent, 1200);
      }}
    >
      <label htmlFor="broadcast" className="block text-sm font-semibold">
        Message all active drivers
      </label>
      <Textarea
        id="broadcast"
        value={text}
        maxLength={MAX_MESSAGE_LENGTH}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Depot closes at 4pm today. Avoid the N1 near Midrand, there's an accident."
      />
      <FormMessage message={state.error} />
      {state.ok ? <p className="text-sm font-semibold text-depot-dark">{state.ok}</p> : null}
      <Button type="submit" disabled={pending || !text.trim()}>
        {pending ? "Sending…" : "Send to all drivers"}
      </Button>
    </form>
  );
}
