import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Logo } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = {
  title: "Confirm your delivery location",
  robots: { index: false, follow: false },
};

interface LocationRequest {
  company_name: string;
  customer_first_name: string;
  order_reference: string | null;
  delivery_date: string | null;
  already_confirmed: boolean;
  saved_note: string | null;
}

async function Confirm({ params }: { params: PageProps<"/c/[token]">["params"] }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_location_request", { p_token: token });
  const req = (Array.isArray(data) ? data[0] : data) as LocationRequest | undefined;

  if (error || !req) {
    return (
      <div className="space-y-2 text-center">
        <h1 className="text-lg font-semibold">This link has expired</h1>
        <p className="text-sm text-kerb">
          Ask the business that sent it for a new link.
        </p>
      </div>
    );
  }

  const date = req.delivery_date
    ? new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long" }).format(
        new Date(`${req.delivery_date}T12:00:00`),
      )
    : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">
          Hi {req.customer_first_name}, where should we deliver?
        </h1>
        <p className="mt-1 text-sm text-kerb">
          <strong>{req.company_name}</strong> is delivering to you
          {req.order_reference ? ` (order ${req.order_reference})` : ""}
          {date ? ` on ${date}` : ""}. Share your location so the driver finds you first time.
        </p>
        {req.already_confirmed ? (
          <p className="mt-2 text-sm text-depot-dark">
            You already confirmed a location. You can update it below if it has changed.
          </p>
        ) : null}
      </div>
      <ConfirmForm token={token} businessName={req.company_name} savedNote={req.saved_note} />
    </div>
  );
}

export default function ConfirmLocationPage({ params }: PageProps<"/c/[token]">) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <Logo />
        </div>
        <Card>
          <Suspense fallback={<p className="text-sm text-kerb">Loading…</p>}>
            <Confirm params={params} />
          </Suspense>
        </Card>
        <p className="text-center text-xs text-kerb">
          Your location is only shared with the business delivering to you.{" "}
          <a href="/privacy" className="underline">
            Privacy notice
          </a>
        </p>
      </div>
    </main>
  );
}
