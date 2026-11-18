import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Card, Logo } from "@/components/ui";
import { getMembership } from "@/lib/dal";
import { CompanyForm } from "./company-form";

export const metadata: Metadata = { title: "Set up your business" };

async function OnboardingGate() {
  if (await getMembership()) redirect("/dashboard");
  return <CompanyForm />;
}

export default function OnboardingPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Logo className="text-3xl" />
          <h1 className="mt-3 text-lg font-semibold">Set up your business</h1>
          <p className="mt-1 text-sm text-stone-600">
            This is the business your orders and drivers belong to.
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
