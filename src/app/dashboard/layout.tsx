import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/ui";
import { requireMembership } from "@/lib/dal";
import { signOut } from "../login/actions";
import { NavLinks } from "./nav-links";

async function CompanyName() {
  const { company } = await requireMembership();
  return <span className="truncate text-sm text-stone-500">{company.name}</span>;
}

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <Link href="/dashboard">
              <Logo />
            </Link>
            <Suspense fallback={null}>
              <CompanyName />
            </Suspense>
          </div>
          <form action={signOut}>
            <button className="text-sm font-medium text-stone-500 hover:text-stone-800">
              Log out
            </button>
          </form>
        </div>
        <NavLinks />
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
