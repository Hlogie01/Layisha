import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy notice" };

/**
 * TEMPLATE. Have this reviewed by someone qualified in POPIA before launch,
 * and fill in every [PLACEHOLDER].
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link href="/">
        <Logo />
      </Link>
      <article className="mt-8 space-y-6 text-[15px] leading-relaxed">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Privacy notice</h1>
          <p className="rounded-lg bg-hivis-soft px-3 py-2 text-sm text-hivis-ink">
            Draft template: to be reviewed before launch. Last updated [DATE].
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">Who we are</h2>
          <p>
            Layisha is operated by [LEGAL ENTITY NAME], [REGISTRATION NUMBER], [ADDRESS]. Our
            Information Officer is [NAME], reachable at [EMAIL]. We process personal information
            in line with the Protection of Personal Information Act (POPIA).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">What we collect and why</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Business users:</strong> email address, business name, phone number and
              town, to run your account.
            </li>
            <li>
              <strong>Drivers:</strong> name, phone number and vehicle, plus GPS position and time
              when a delivery is recorded, to prove deliveries.
            </li>
            <li>
              <strong>Customers receiving deliveries:</strong> name, WhatsApp number, address or
              directions, the location pin you choose to share, delivery photos and the name of
              who received the goods. The business delivering to you uses this to get your order
              to you.
            </li>
            <li>
              <strong>Vehicle owners:</strong> name, phone number, vehicle types and areas served.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">Who can see it</h2>
          <p>
            Each business only sees its own drivers, customers and orders. A customer&apos;s
            location is only shared with the business delivering to them and its driver. We use
            [HOSTING PROVIDER AND REGION] to store data and WhatsApp to send messages. We do not
            sell personal information.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">How long we keep it</h2>
          <p>[RETENTION PERIOD, e.g. order records for X years for tax purposes].</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">Your rights</h2>
          <p>
            You may ask to see, correct or delete your personal information. Customers can ask the
            business that delivered to them, or contact us at [EMAIL]. You may also complain to
            the Information Regulator (South Africa).
          </p>
        </section>
      </article>
    </main>
  );
}
