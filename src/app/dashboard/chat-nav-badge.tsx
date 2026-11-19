"use client";

import { useEffect, useRef, useState } from "react";
import { UnreadBadge } from "@/components/chat-bits";
import { listenForPings } from "@/lib/realtime";

/** Unread chat count in the dashboard menu, kept live. Also shows it in the browser tab title. */
export function ChatNavBadge() {
  const [unread, setUnread] = useState(0);
  const [topic, setTopic] = useState<string | null>(null);
  const previous = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/dispatch/chat/summary", { cache: "no-store" }).catch(() => null);
      if (!res?.ok || cancelled) return;
      const data = (await res.json()) as { totalUnread: number; topic: string | null };
      setUnread(data.totalUnread);
      setTopic(data.topic);
    }
    void load();
    const timer = window.setInterval(load, 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!topic) return;
    return listenForPings(topic, async () => {
      const res = await fetch("/api/dispatch/chat/summary", { cache: "no-store" }).catch(() => null);
      if (res?.ok) setUnread(((await res.json()) as { totalUnread: number }).totalUnread);
    });
  }, [topic]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
    document.title = unread ? `(${unread}) ${base}` : base;
    if (unread > previous.current) playBlip();
    previous.current = unread;
  }, [unread]);

  return <UnreadBadge count={unread} className="ml-1.5" />;
}

/** A short, quiet notification sound. Browsers may block it until the page has been clicked. */
function playBlip() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => void ctx.close();
  } catch {
    // No sound available: the badge and tab title still update.
  }
}
