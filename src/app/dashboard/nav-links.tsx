"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const links = [
  { href: "/dashboard", label: "Dispatch" },
  { href: "/dashboard/orders/new", label: "New order" },
  { href: "/dashboard/drivers", label: "Drivers" },
  { href: "/vendor", label: "Vehicles" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2">
      {links.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cx(
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium",
              active ? "bg-brand-50 text-brand-800" : "text-stone-600 hover:bg-stone-100",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
