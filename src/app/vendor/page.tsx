import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, Logo } from "@/components/ui";
import { requireVendorAccess } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import { enableLogistics, enableVendor, updateVendorProfile } from "./actions";
import { VehicleProfileForm } from "./vehicle-profile-form";

export const metadata: Metadata = { title: "My vehicles" };

async function VendorHome() {
  const { company, role } = await requireVendorAccess();

  // A delivery company that hasn't switched on vehicle rental yet.
  if (!company.is_vendor) {
    return (
      <Card className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">Rent out your vehicles</h1>
          <p className="mt-1 text-sm text-kerb">
            Have a bakkie, van or truck standing idle? Soon you&apos;ll be able to list it for other
            delivery companies on Layisha to rent by the month. Tell us what you have and we&apos;ll
            let you know as soon as the marketplace opens.
          </p>
        </div>
        {role === "owner" ? (
          <VehicleProfileForm action={enableVendor} submitLabel="Switch on vehicle rental" />
        ) : (
          <p className="text-sm text-kerb">Ask your account owner to switch this on.</p>
        )}
      </Card>
    );
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("vendor_profiles")
    .select("vehicle_types, fleet_size, service_area")
    .eq("company_id", company.id)
    .maybeSingle();

  return (
    <div className="space-y-4">
      <Card className="space-y-3 border-hivis bg-hivis-soft">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink underline decoration-hivis decoration-2 underline-offset-4">Coming soon</p>
        <h1 className="text-xl font-bold">The vehicle marketplace is on its way</h1>
        <p className="text-sm text-ink">
          You&apos;re on the list. When it opens, you&apos;ll be able to list each vehicle with photos
          and a monthly price, get verified, and receive enquiries from delivery companies on
          Layisha. We&apos;ll contact you on {company.phone ?? "your phone number"} as soon as
          it&apos;s ready.
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Your vehicles</h2>
        <VehicleProfileForm
          action={updateVendorProfile}
          submitLabel="Save"
          defaults={{
            vehicle_types: profile?.vehicle_types ?? [],
            fleet_size: profile?.fleet_size ?? null,
            service_area: profile?.service_area ?? null,
          }}
        />
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Getting verified</h2>
        <p className="text-sm text-kerb">
          Before your vehicles go live, we&apos;ll ask for: your ID or company registration, each
          vehicle&apos;s registration papers, a valid licence disc or roadworthy, and proof of insurance
          that covers the vehicle while it&apos;s rented out. Start getting these ready.
        </p>
      </Card>

      {company.is_logistics ? (
        <Link href="/dashboard" className="block text-center text-sm font-semibold text-ink underline decoration-hivis decoration-2 underline-offset-4">
          Go to my deliveries →
        </Link>
      ) : role === "owner" ? (
        <form action={enableLogistics} className="text-center">
          <button className="text-sm font-semibold text-ink underline decoration-hivis decoration-2 underline-offset-4">
            Do you also deliver goods? Switch on delivery tools →
          </button>
        </form>
      ) : null}
    </div>
  );
}

async function CompanyName() {
  const { company } = await requireVendorAccess();
  return <span className="truncate text-sm text-kerb">{company.name}</span>;
}

export default function VendorPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <Logo />
            <Suspense fallback={null}>
              <CompanyName />
            </Suspense>
          </div>
          <form action={signOut}>
            <button className="text-sm font-medium text-kerb hover:text-ink">Log out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Suspense fallback={<p className="text-sm text-kerb">Loading…</p>}>
          <VendorHome />
        </Suspense>
      </main>
    </div>
  );
}
