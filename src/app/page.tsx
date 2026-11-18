import Link from "next/link";
import { Logo } from "@/components/ui";

const features = [
  {
    title: "Every drop confirmed",
    body: "Photo, GPS and a one-time PIN from the customer prove each delivery.",
  },
  {
    title: "No more lost cash",
    body: "Drivers record what they collect, and you see it per driver, per day.",
  },
  {
    title: "Customers on WhatsApp",
    body: "Customers confirm their location and get updates without downloading an app.",
  },
  {
    title: "Works without signal",
    body: "The driver app keeps working offline and uploads when signal returns.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="bg-ink text-chalk">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
          <Logo inverted />
          <Link
            href="/login"
            className="rounded-xl px-4 py-2 text-sm font-semibold text-chalk hover:bg-ink-2"
          >
            Log in
          </Link>
        </header>

        <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-12 sm:pt-20">
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] sm:text-6xl">
            Every drop, confirmed.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-chalk/80">
            Layisha runs your deliveries in one place: orders, drivers, proof of delivery and
            cash, built for South African roads, addresses and signal.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex rounded-xl bg-hivis px-6 py-3.5 font-semibold text-ink hover:bg-hivis-dark"
            >
              Get started free
            </Link>
            <Link
              href="/login"
              className="inline-flex rounded-xl border border-ink-2 px-6 py-3.5 font-semibold text-chalk hover:bg-ink-2"
            >
              I rent out vehicles
            </Link>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="h-3 w-full bg-[repeating-linear-gradient(135deg,#FFB020_0_18px,#14181F_18px_36px)]"
        />
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-16">
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-[20px] border border-line bg-white p-6">
              <h2 className="text-xl font-bold">{f.title}</h2>
              <p className="mt-2 text-kerb">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
