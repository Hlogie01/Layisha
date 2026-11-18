import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Card, Logo } from "@/components/ui";
import { getMembership, homeFor } from "@/lib/dal";
import { CompanyForm } from "./company-form";

export const metadata: Metadata = { title: "Set up your account" };

async function OnboardingGate() {
  const membership = await getMembership();
  if (membership) redirect(homeFor(membership.company));
  return <CompanyForm />;
}

export default function OnboardingPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Logo className="text-3xl" />
          <h1 className="mt-3 text-lg font-semibold">Set up your account</h1>
          <p className="mt-1 text-sm text-stone-600">
            Tell us a bit about you so we can set up the right tools.
          </p>
        </div>
        <Card>
          <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
            <OnboardingGate />
          </Suspense>
        </Card>
      </div>
    </main>
  );
}
