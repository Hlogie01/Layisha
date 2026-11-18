"use client";

import { useActionState, useState } from "react";
import { Button, Field, FormMessage, Textarea } from "@/components/ui";
import { confirmLocation, type ConfirmState } from "./actions";

type Pin = { lat: number; lng: number; accuracy: number };

export function ConfirmForm({
  token,
  businessName,
  savedNote,
}: {
  token: string;
  businessName: string;
  savedNote: string | null;
}) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmLocation, {
    status: "idle",
  });
  const [pin, setPin] = useState<Pin | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  function locate() {
    if (!("geolocation" in navigator)) {
      setGeoError("Your phone can't share its location from this browser.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPin({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was blocked. Allow location for this page in your browser settings, then try again."
            : "We couldn't get your location. Move to an open spot or switch on GPS, then try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  if (state.status === "saved") {
    return (
      <div className="space-y-2 text-center">
        <p className="text-4xl" aria-hidden>
          ✓
        </p>
        <h2 className="text-lg font-semibold">Location saved</h2>
        <p className="text-sm text-stone-600">
          Thank you. {businessName} will use this pin for your deliveries. You can close this page.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="lat" value={pin?.lat ?? ""} />
      <input type="hidden" name="lng" value={pin?.lng ?? ""} />

      <div className="space-y-2">
        <p className="text-sm font-medium text-stone-700">
          1. Stand where the driver should deliver, then tap the button.
        </p>
        <Button type="button" onClick={locate} disabled={locating} className="w-full" variant={pin ? "secondary" : "primary"}>
          {locating ? "Finding you…" : pin ? "Update my location" : "Share my location"}
        </Button>
        {pin ? (
          <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
            Location found (accurate to about {pin.accuracy} m).{" "}
            <a
              href={`https://www.google.com/maps?q=${pin.lat},${pin.lng}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              Check it on the map
            </a>
            {pin.accuracy > 100 ? (
              <p className="mt-1 text-amber-700">
                This is not very accurate. Try again outside, away from buildings.
              </p>
            ) : null}
          </div>
        ) : null}
        <FormMessage message={geoError} />
      </div>

      <Field
        label="2. Help the driver find you"
        htmlFor="note"
        hint="Optional. Landmarks work best."
      >
        <Textarea
          id="note"
          name="note"
          defaultValue={savedNote ?? ""}
          placeholder="e.g. Blue gate next to the church, house behind the tuck shop"
        />
      </Field>

      <FormMessage message={state.status === "error" ? state.message : undefined} />

      <Button type="submit" className="w-full" disabled={!pin || pending}>
        {pending ? "Saving…" : "Confirm my location"}
      </Button>
    </form>
  );
}
