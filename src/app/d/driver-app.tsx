"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, cx, Field, FormMessage, Input, Select, Textarea } from "@/components/ui";
import {
  compressPhoto,
  enqueue,
  getPosition,
  loadOutbox,
  loadRun,
  removeFromOutbox,
  saveRun,
  sendOne,
  syncOutbox,
  type OutboxItem,
  type Run,
  type Stop,
} from "./offline";

const FAILURE_REASONS = [
  "Customer not home",
  "Customer refused the order",
  "Wrong or unclear address",
  "Couldn't reach the customer",
  "Unsafe to deliver",
  "Vehicle problem",
  "Other",
];

const NO_PIN_REASONS = [
  "Customer doesn't have the PIN",
  "Customer's phone is off",
  "Left with someone else",
  "Other",
];

function rand(n: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);
}

function navUrl(s: Stop) {
  if (s.lat != null && s.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
  }
  if (s.address_text) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address_text)}`;
  }
  return null;
}

type View = { name: "list" } | { name: "stop"; id: string } | { name: "deliver"; id: string } | { name: "fail"; id: string };

export function DriverApp() {
  const [invalidLink, setInvalidLink] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ name: "list" });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/driver/run", { cache: "no-store" });
      if (res.status === 401) {
        setSignedOut(true);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const fresh = (await res.json()) as Run;
      setRun(fresh);
      setSignedOut(false);
      await saveRun(fresh);
    } catch {
      // Offline or server trouble: keep showing the saved run.
    } finally {
      setLoading(false);
    }
  }, []);

  const sync = useCallback(async () => {
    setOutbox(await syncOutbox());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [saved, box] = await Promise.all([loadRun(), loadOutbox()]);
      if (cancelled) return;
      if (saved) setRun(saved);
      setOutbox(box);
      setOnline(navigator.onLine);
      setInvalidLink(new URLSearchParams(window.location.search).has("invalid"));
      if (saved) setLoading(false);
      await sync();
      await refresh();
    })();

    const goOnline = () => {
      setOnline(true);
      void sync().then(refresh);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const timer = window.setInterval(() => {
      if (navigator.onLine) void sync();
    }, 30_000);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    return () => {
      cancelled = true;
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(timer);
    };
  }, [refresh, sync]);

  // Outcomes recorded on this phone override what the server last said.
  const localStatus = useMemo(() => {
    const m = new Map<string, OutboxItem>();
    for (const item of outbox) m.set(item.orderId, item);
    return m;
  }, [outbox]);

  const stops = run?.stops ?? [];
  const isDone = (s: Stop) =>
    s.status === "delivered" || s.status === "failed" || localStatus.has(s.id);
  const todo = stops.filter((s) => !isDone(s));
  const done = stops.filter((s) => isDone(s));
  const pending = outbox.filter((o) => o.state === "pending").length;
  const rejected = outbox.filter((o) => o.state === "rejected");

  if (invalidLink || (signedOut && !run)) {
    return (
      <Shell>
        <div className="rounded-xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">This driver link isn&apos;t working</h1>
          <p className="mt-2 text-sm text-stone-600">
            Ask your dispatcher to send you a new Layisha driver link on WhatsApp, then open it on
            this phone.
          </p>
        </div>
      </Shell>
    );
  }

  if (loading && !run) {
    return (
      <Shell>
        <p className="text-center text-sm text-stone-500">Loading your stops…</p>
      </Shell>
    );
  }

  const current = view.name !== "list" ? stops.find((s) => s.id === view.id) : undefined;

  return (
    <Shell
      header={
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{run?.driver.name ?? "Driver"}</p>
            <p className="truncate text-xs text-stone-500">{run?.driver.company}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {pending > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800">
                {pending} waiting to upload
              </span>
            ) : null}
            <span
              className={cx(
                "rounded-full px-2 py-1 font-semibold",
                online ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600",
              )}
            >
              {online ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      }
    >
      {signedOut ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Your driver link was switched off. Ask your dispatcher for a new one. Deliveries saved on
          this phone are kept.
        </p>
      ) : null}

      {view.name === "list" || !current ? (
        <StopList
          todo={todo}
          done={done}
          localStatus={localStatus}
          rejected={rejected}
          fetchedAt={run?.fetchedAt}
          onOpen={(id) => setView({ name: "stop", id })}
          onRefresh={() => void sync().then(refresh)}
          onDismissRejected={async (podId) => {
            await removeFromOutbox(podId);
            setOutbox(await loadOutbox());
          }}
        />
      ) : view.name === "stop" ? (
        <StopDetail
          stop={current}
          recorded={localStatus.get(current.id)}
          onBack={() => setView({ name: "list" })}
          onDeliver={() => setView({ name: "deliver", id: current.id })}
          onFail={() => setView({ name: "fail", id: current.id })}
        />
      ) : (
        <OutcomeForm
          key={`${view.name}-${current.id}`}
          stop={current}
          outcome={view.name === "deliver" ? "delivered" : "failed"}
          onCancel={() => setView({ name: "stop", id: current.id })}
          onSaved={async () => {
            setOutbox(await loadOutbox());
            setView({ name: "list" });
          }}
        />
      )}
    </Shell>
  );
}

function Shell({ header, children }: { header?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-stone-100">
      {header ? (
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-white px-4 py-3">
          {header}
        </header>
      ) : null}
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-4">{children}</main>
    </div>
  );
}

function StopList({
  todo,
  done,
  localStatus,
  rejected,
  fetchedAt,
  onOpen,
  onRefresh,
  onDismissRejected,
}: {
  todo: Stop[];
  done: Stop[];
  localStatus: Map<string, OutboxItem>;
  rejected: OutboxItem[];
  fetchedAt?: string;
  onOpen: (id: string) => void;
  onRefresh: () => void;
  onDismissRejected: (podId: string) => void;
}) {
  return (
    <>
      {rejected.map((r) => (
        <div key={r.podId} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          <p>
            <strong>{r.reference}</strong> was not accepted: {r.error}. Please phone your
            dispatcher.
          </p>
          <button className="mt-1 text-xs font-semibold underline" onClick={() => onDismissRejected(r.podId)}>
            Dismiss
          </button>
        </div>
      ))}

      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Today&apos;s stops ({todo.length} left)</h1>
        <button onClick={onRefresh} className="text-sm font-semibold text-brand-700">
          Refresh
        </button>
      </div>

      {todo.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-stone-600 shadow-sm">
          {done.length ? "All done for today. Well done!" : "No stops assigned to you yet."}
        </p>
      ) : (
        <ol className="space-y-3">
          {todo.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => onOpen(s.id)}
                className="w-full rounded-xl bg-white p-4 text-left shadow-sm active:bg-stone-50"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{s.customer_name}</p>
                    <p className="truncate text-sm text-stone-600">{s.items}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {s.reference}
                      {s.payment_type !== "prepaid" ? ` · Collect ${rand(Number(s.amount_due))}` : " · Paid"}
                      {s.location_confirmed ? " · 📍 Pin" : ""}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}

      {done.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Done</h2>
          <ul className="space-y-2">
            {done.map((s) => {
              const local = localStatus.get(s.id);
              const outcome = local?.outcome ?? s.status;
              return (
                <li key={s.id} className="flex items-center justify-between rounded-lg bg-white px-4 py-3 text-sm shadow-sm">
                  <span className="truncate">
                    {s.reference} · {s.customer_name}
                  </span>
                  <span
                    className={cx(
                      "shrink-0 text-xs font-semibold",
                      outcome === "delivered" ? "text-emerald-700" : "text-red-700",
                    )}
                  >
                    {outcome === "delivered" ? "Delivered" : "Failed"}
                    {local?.state === "pending" ? " · waiting to upload" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {fetchedAt ? (
        <p className="text-center text-xs text-stone-400">
          Last updated{" "}
          {new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit" }).format(new Date(fetchedAt))}
        </p>
      ) : null}
    </>
  );
}

function StopDetail({
  stop,
  recorded,
  onBack,
  onDeliver,
  onFail,
}: {
  stop: Stop;
  recorded?: OutboxItem;
  onBack: () => void;
  onDeliver: () => void;
  onFail: () => void;
}) {
  const nav = navUrl(stop);
  const finished = stop.status === "delivered" || stop.status === "failed" || recorded;
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm font-semibold text-brand-700">
        ← All stops
      </button>
      <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold text-stone-500">{stop.reference}</p>
          <h1 className="text-xl font-bold">{stop.customer_name}</h1>
        </div>
        <p>{stop.items}</p>
        <p className="font-semibold">
          {stop.payment_type === "prepaid" ? "Already paid" : `Collect ${rand(Number(stop.amount_due))} (${stop.payment_type.toUpperCase()})`}
        </p>
        {stop.address_text ? <p className="text-sm text-stone-600">{stop.address_text}</p> : null}
        {stop.landmark_note ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">📍 {stop.landmark_note}</p>
        ) : null}
        {stop.notes ? <p className="text-sm text-stone-600">Note: {stop.notes}</p> : null}
        {!stop.location_confirmed ? (
          <p className="text-xs font-medium text-amber-700">Customer hasn&apos;t confirmed a pin. Phone them if unsure.</p>
        ) : null}

        <div className="grid grid-cols-2 gap-2 pt-1">
          {nav ? (
            <a href={nav} target="_blank" rel="noreferrer" className="rounded-lg bg-stone-900 px-3 py-3 text-center text-sm font-semibold text-white">
              Navigate
            </a>
          ) : (
            <span className="rounded-lg bg-stone-200 px-3 py-3 text-center text-sm text-stone-500">No location</span>
          )}
          <a href={`tel:${stop.customer_whatsapp}`} className="rounded-lg border border-stone-300 px-3 py-3 text-center text-sm font-semibold">
            Call
          </a>
          <a
            href={`https://wa.me/${stop.customer_whatsapp.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="col-span-2 rounded-lg border border-stone-300 px-3 py-3 text-center text-sm font-semibold"
          >
            WhatsApp customer
          </a>
        </div>
      </div>

      {finished ? (
        <p className="rounded-lg bg-stone-200 px-3 py-2 text-center text-sm">This stop is already done.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={onFail} variant="secondary" className="py-4">
            Couldn&apos;t deliver
          </Button>
          <Button onClick={onDeliver} className="py-4">
            Delivered
          </Button>
        </div>
      )}
    </div>
  );
}

function OutcomeForm({
  stop,
  outcome,
  onCancel,
  onSaved,
}: {
  stop: Stop;
  outcome: "delivered" | "failed";
  onCancel: () => void;
  onSaved: () => void;
}) {
  const delivered = outcome === "delivered";
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [noPin, setNoPin] = useState(false);
  const [noPinReason, setNoPinReason] = useState(NO_PIN_REASONS[0]);
  const [recipient, setRecipient] = useState("");
  const [failReason, setFailReason] = useState(FAILURE_REASONS[0]);
  const [failDetail, setFailDetail] = useState("");
  const [method, setMethod] = useState<string>(stop.payment_type === "prepaid" ? "none" : stop.payment_type);
  const [amount, setAmount] = useState(stop.payment_type === "prepaid" ? "" : String(stop.amount_due));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const small = await compressPhoto(file);
    setPhoto(small);
    setPreview(URL.createObjectURL(small));
  }

  async function save() {
    setError(null);
    if (delivered && !photo) return setError("Take a photo of the delivered goods.");
    if (delivered && !noPin && !/^\d{4}$/.test(pin)) return setError("Enter the customer's 4-digit PIN.");

    setSaving(true);
    const fix = await getPosition();
    const podId = crypto.randomUUID();
    const fields: Record<string, string> = {
      pod_id: podId,
      order_id: stop.id,
      outcome,
      captured_at: new Date().toISOString(),
    };
    if (fix) {
      fields.lat = String(fix.lat);
      fields.lng = String(fix.lng);
      fields.gps_accuracy_m = String(fix.accuracy);
    }
    if (delivered) {
      if (noPin) fields.no_otp_reason = noPinReason;
      else fields.otp = pin;
      if (recipient.trim()) fields.recipient_name = recipient.trim();
      fields.payment_method = method;
      if (method !== "none" && amount) fields.amount_collected = amount;
    } else {
      fields.failure_reason = failReason === "Other" ? `Other: ${failDetail.trim() || "no detail"}` : failReason;
    }

    const item: OutboxItem = {
      podId,
      orderId: stop.id,
      reference: stop.reference,
      outcome,
      fields,
      photo,
      state: "pending",
      queuedAt: new Date().toISOString(),
    };

    // Try right away so a wrong PIN is caught while the driver is still there.
    const { result, error: sendError } = await sendOne(item);
    if (result === "sent") {
      setSaving(false);
      return onSaved();
    }
    if (result === "rejected") {
      setSaving(false);
      return setError(
        sendError === "Wrong PIN" ? "That PIN is wrong. Check it with the customer and try again." : (sendError ?? "Not accepted"),
      );
    }
    // Offline (or link problem): keep it on the phone and upload later.
    await enqueue(item);
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <button onClick={onCancel} className="text-sm font-semibold text-brand-700">
        ← Back
      </button>
      <div className="space-y-5 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold text-stone-500">{stop.reference}</p>
          <h1 className="text-xl font-bold">{delivered ? "Confirm delivery" : "Couldn't deliver"}</h1>
          <p className="text-sm text-stone-600">{stop.customer_name}</p>
        </div>

        {!delivered ? (
          <>
            <Field label="What happened?" htmlFor="fail_reason">
              <Select id="fail_reason" value={failReason} onChange={(e) => setFailReason(e.target.value)}>
                {FAILURE_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            </Field>
            {failReason === "Other" ? (
              <Field label="Tell us more" htmlFor="fail_detail">
                <Textarea id="fail_detail" value={failDetail} onChange={(e) => setFailDetail(e.target.value)} />
              </Field>
            ) : null}
          </>
        ) : null}

        <div className="space-y-2">
          <p className="text-sm font-medium text-stone-700">
            {delivered ? "Photo of the delivered goods" : "Photo (optional, e.g. the locked gate)"}
          </p>
          <label className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-stone-300 p-4 text-sm font-semibold text-stone-600">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Delivery photo" className="max-h-56 rounded-md object-contain" />
            ) : (
              "📷 Take photo"
            )}
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="sr-only" />
          </label>
          {preview ? <p className="text-center text-xs text-stone-500">Tap the photo to retake it</p> : null}
        </div>

        {delivered ? (
          <>
            {!noPin ? (
              <Field label="Customer's 4-digit PIN" htmlFor="pin" hint="The customer received it on WhatsApp.">
                <Input
                  id="pin"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-2xl tracking-[0.5em]"
                />
              </Field>
            ) : (
              <Field label="Why is there no PIN?" htmlFor="no_pin">
                <Select id="no_pin" value={noPinReason} onChange={(e) => setNoPinReason(e.target.value)}>
                  {NO_PIN_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </Field>
            )}
            <button type="button" onClick={() => setNoPin(!noPin)} className="text-sm font-semibold text-brand-700">
              {noPin ? "Enter PIN instead" : "Customer can't give a PIN"}
            </button>

            <Field label="Received by" htmlFor="recipient" hint="Optional">
              <Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Name of person" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Payment" htmlFor="method">
                <Select id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="none">Nothing collected</option>
                  <option value="cash">Cash</option>
                  <option value="eft">EFT</option>
                  <option value="card">Card</option>
                </Select>
              </Field>
              {method !== "none" ? (
                <Field label="Amount (R)" htmlFor="amount">
                  <Input id="amount" inputMode="decimal" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </Field>
              ) : null}
            </div>
          </>
        ) : null}

        <FormMessage message={error} />

        <Button onClick={save} disabled={saving} className="w-full py-4">
          {saving ? "Saving…" : delivered ? "Save delivery" : "Save"}
        </Button>
        <p className="text-center text-xs text-stone-500">
          No signal? It&apos;s saved on your phone and uploads automatically later.
        </p>
      </div>
    </div>
  );
}
