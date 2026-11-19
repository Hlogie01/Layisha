"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { ChatNavBadge } from "./chat-nav-badge";

const links = [
  { href: "/dashboard", label: "Dispatch" },
  { href: "/dashboard/orders/new", label: "New order" },
  { href: "/dashboard/chat", label: "Chat" },
  { href: "/dashboard/drivers", label: "Drivers" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/activity", label: "Activity" },
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
              "inline-flex items-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium",
              active ? "bg-ink text-chalk" : "text-kerb hover:bg-line/60",
            )}
          >
            {l.label}
            {l.href === "/dashboard/chat" ? <ChatNavBadge /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
