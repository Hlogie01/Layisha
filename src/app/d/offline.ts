"use client";

import { createStore, del, get, set } from "idb-keyval";

/**
 * Everything the driver app keeps on the phone, in IndexedDB:
 * - the last downloaded run (so stops show with no signal)
 * - an outbox of delivery outcomes waiting to be uploaded
 */

export interface Stop {
  id: string;
  reference: string;
  items: string;
  amount_due: number;
  payment_type: "prepaid" | "cash" | "eft" | "card";
  status: "new" | "confirmed" | "out_for_delivery" | "delivered" | "failed" | "cancelled";
  notes: string | null;
  customer_name: string;
  customer_whatsapp: string;
  address_text: string | null;
  lat: number | null;
  lng: number | null;
  landmark_note: string | null;
  location_confirmed: boolean;
}

export interface Run {
  driver: { name: string; company: string };
  date: string;
  stops: Stop[];
  fetchedAt: string;
}

export interface OutboxItem {
  podId: string;
  orderId: string;
  reference: string;
  outcome: "delivered" | "failed";
  fields: Record<string, string>;
  photo: Blob | null;
  state: "pending" | "rejected";
  error?: string;
  queuedAt: string;
}

const store = typeof indexedDB !== "undefined" ? createStore("layisha-driver", "kv") : undefined;

export async function loadRun(): Promise<Run | null> {
  if (!store) return null;
  return (await get<Run>("run", store)) ?? null;
}

export async function saveRun(run: Run) {
  if (store) await set("run", run, store);
}

export async function loadOutbox(): Promise<OutboxItem[]> {
  if (!store) return [];
  return (await get<OutboxItem[]>("outbox", store)) ?? [];
}

async function saveOutbox(items: OutboxItem[]) {
  if (store) await set("outbox", items, store);
}

export async function enqueue(item: OutboxItem) {
  const items = await loadOutbox();
  await saveOutbox([...items.filter((i) => i.podId !== item.podId), item]);
}

export async function removeFromOutbox(podId: string) {
  const items = await loadOutbox();
  await saveOutbox(items.filter((i) => i.podId !== podId));
}

export async function clearAll() {
  if (!store) return;
  await del("run", store);
  await del("outbox", store);
}

export type SendResult = "sent" | "rejected" | "offline" | "signed_out";

/** Upload one outcome. Never throws. */
export async function sendOne(item: OutboxItem): Promise<{ result: SendResult; error?: string }> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(item.fields)) fd.set(k, v);
  if (item.photo) fd.set("photo", item.photo, `${item.podId}.jpg`);

  let res: Response;
  try {
    res = await fetch("/api/driver/outcome", { method: "POST", body: fd });
  } catch {
    return { result: "offline" };
  }
  if (res.ok) return { result: "sent" };
  if (res.status === 401) return { result: "signed_out" };
  if (res.status === 422 || res.status === 400 || res.status === 413) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; attempts_left?: number };
    let error = body.error ?? "Not accepted";
    if (body.error === "wrong_pin") {
      error =
        typeof body.attempts_left === "number"
          ? `Wrong PIN. ${body.attempts_left} ${body.attempts_left === 1 ? "try" : "tries"} left.`
          : "Wrong PIN.";
    } else if (body.error === "pin_locked") {
      error =
        "PIN locked after 5 wrong tries. Ask your dispatcher to send the customer a new PIN, or choose \"Customer can't give a PIN\".";
    }
    return { result: "rejected", error };
  }
  // 429 (slow down), 5xx and anything else: keep it and try again later.
  return { result: "offline" };
}

/** Try to upload everything waiting in the outbox. Returns what is still waiting. */
export async function syncOutbox(): Promise<OutboxItem[]> {
  const items = await loadOutbox();
  for (const item of items) {
    if (item.state !== "pending") continue;
    const { result, error } = await sendOne(item);
    if (result === "sent") {
      await removeFromOutbox(item.podId);
    } else if (result === "rejected") {
      await enqueue({ ...item, state: "rejected", error });
    } else {
      break; // offline or signed out: stop and retry later
    }
  }
  return loadOutbox();
}

// ---------------------------------------------------------------------------
// Phone helpers
// ---------------------------------------------------------------------------

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
}

export function getPosition(timeoutMs = 15_000): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: Math.round(p.coords.accuracy),
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

/** Shrinks a camera photo to at most 1280px and JPEG ~70% to save data. */
export async function compressPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.7));
    return blob ?? file;
  } catch {
    return file;
  }
}
