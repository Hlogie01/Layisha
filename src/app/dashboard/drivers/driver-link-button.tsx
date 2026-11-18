"use client";

import { useState, useTransition } from "react";
import { createDriverLink, type DriverLinkResult } from "../actions";

export function DriverLinkButton({ driverId, hasLink }: { driverId: string; hasLink: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<DriverLinkResult | null>(null);

  if (result?.kind === "link") {
    return (
      <a
        href={result.waUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-ink hover:opacity-90"
      >
        Open WhatsApp to send
      </a>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (hasLink && !confirm("Send a new link? The driver's old link will stop working.")) return;
          startTransition(async () => setResult(await createDriverLink(driverId)));
        }}
        className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:bg-chalk disabled:opacity-60"
      >
        {pending ? "Creating…" : hasLink ? "Send new app link" : "Send app link"}
      </button>
      {result?.kind === "error" ? <p className="text-xs text-signal">{result.error}</p> : null}
    </div>
  );
}
