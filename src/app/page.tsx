import Link from "next/link";
import { Logo } from "@/components/ui";

const features = [
  {
    title: "Every drop confirmed",
    body: "Photo, GPS and a one-time PIN from the customer prove each delivery.",
  },
  {
    title: "No more lost cash",
    body: "Drivers record what they collect, and you reconcile each shift in minutes.",
  },
  {
    title: "Customers on WhatsApp",
    body: "Customers confirm their location and get updates without downloading an app.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Logo />
        <Link
          href="/login"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          Log in
        </Link>
      </header>

      <section className="mx-auto w-full max-w-5xl px-4 pb-16 pt-10 sm:pt-20">
        <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          Run your deliveries in one place.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-stone-600">
          Layisha helps South African businesses manage orders, drivers, proof of delivery and
          cash, even where addresses are vague and signal drops.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-flex rounded-lg bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-800"
        >
          Get started free
        </Link>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-stone-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
