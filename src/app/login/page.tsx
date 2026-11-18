import type { Metadata } from "next";
import Link from "next/link";
import { Card, Logo } from "@/components/ui";
import { AuthForm } from "./auth-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link href="/">
            <Logo size="lg" />
          </Link>
          <p className="mt-2 text-sm text-kerb">Run your deliveries in one place.</p>
        </div>
        <Card>
          <AuthForm />
        </Card>
      </div>
    </main>
  );
}
