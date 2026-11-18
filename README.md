# Layisha

Run your deliveries in one place. Layisha helps South African businesses manage orders, drivers, proof of delivery and cash, even where addresses are vague and signal drops.

Logistics companies sign up and run their daily operations here. Later, vehicle vendors will be able to list vans, bakkies and trucks for monthly rent (Phase 2).

## What works so far

- **Two kinds of accounts.** At sign-up people choose **I deliver goods**, **I rent out vehicles**, or **both**. Delivery companies get the dispatch tools. Vehicle owners join the marketplace waitlist (vehicle types, how many, areas served) and see a "coming soon" page. Either can switch on the other role later. Vehicle-only accounts can never see delivery data (enforced in the database)
- Sign up, log in and log out (email and password)
- Create your business on first login
- Add drivers, and deactivate or reactivate them
- Create orders (customer, WhatsApp number, items, amount, payment type, delivery date)
- Dispatch board: pick a day, see orders grouped by driver, assign drivers and change status
- Daily totals: orders, delivered, failed and cash to collect
- **Driver app** (works offline): send each driver a personal link on WhatsApp from the Drivers page. They see today's stops in order, navigate with Google Maps, call or WhatsApp the customer, and record each delivery
- **Proof of delivery:** photo, GPS position, time and the customer's 4-digit PIN (sent to the customer with "Send delivery PIN on WhatsApp"). Failed deliveries need a reason. Cash, EFT or card collected is recorded. With no signal, everything is saved on the phone and uploads automatically later
- **WhatsApp location confirmation:** tap "Ask for location" on an order, and the customer gets a private link on WhatsApp. They share their GPS pin and a landmark note without installing anything, and the order shows "Location confirmed · Open map"
- Every business only sees its own data (enforced in the database with row-level security)

## Tech

- [Next.js 16](https://nextjs.org) (App Router, Server Functions, Cache Components)
- [Supabase](https://supabase.com) (Postgres, auth, row-level security)
- Tailwind CSS 4

## Run it locally

You need Node.js 20 or newer and a free Supabase project.

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Set up the database.** In the Supabase dashboard, open **SQL Editor** and run each file in `supabase/migrations/` in order (`0001_init.sql`, `0002_location_requests.sql`, `0003_driver_app.sql`, then `0004_account_types.sql`). Paste the contents and click **Run**.
3. **For quick testing, turn off email confirmation:** **Authentication → Sign In / Providers → Email**, switch off "Confirm email". Switch it back on before going live.
4. **Add your keys.** Copy `.env.example` to `.env.local` and fill in the values from **Project Settings → API**. The `service_role` key is needed for delivery photos; keep it secret.
5. **Install and start:**

   ```bash
   npm install
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000), create an account, set up your business, add a driver and create an order.

## Project layout

```
supabase/migrations/   Database schema, functions and security policies
src/proxy.ts           Keeps the login session fresh, redirects logged-out users
src/lib/dal.ts         Data access layer: who is signed in, which company they belong to
src/lib/supabase/      Supabase clients
src/app/login/         Log in and sign up
src/app/onboarding/    Create your account and choose: deliver goods, rent out vehicles, or both
src/app/vendor/        Vehicle owners: marketplace waitlist and vehicle details
src/app/dashboard/     Dispatch board, new order, drivers
src/app/c/[token]/     Public page where customers confirm their location
src/app/d/             Driver app (offline-first, installable)
src/app/api/driver/    Driver app API: today's stops, record delivery outcome
public/sw.js           Service worker that keeps the driver app on the phone
src/lib/whatsapp.ts    WhatsApp sending (Cloud API or tap-to-send links)
```

## WhatsApp

By default, Layisha creates a **tap-to-send** WhatsApp link: the dispatcher taps "Open WhatsApp to send" and presses send in their own WhatsApp. This is free and needs no setup.

To send automatically instead, set up the [WhatsApp Business Platform (Cloud API)](https://developers.facebook.com/docs/whatsapp/cloud-api), get a message template approved with three variables (customer first name, business name, link), and fill in the `WHATSAPP_*` values in `.env.local`. Meta charges per business-initiated message, so check current South African rates first.

Customer location links expire after 7 days and only work for that one customer. When testing on your phone, the app must be reachable from the internet (deploy it, or use a tunnel), because `localhost` links won't open on the customer's phone.

## Driver app

1. On **Drivers**, tap **Send app link** next to a driver and send the WhatsApp message.
2. The driver opens the link on their phone. It signs them in on that phone only (no password). They can tap **Add to Home screen**.
3. Sending a new link, deactivating the driver, or tapping **Switch off app** stops the old link working.

When a delivery is saved with signal, a wrong PIN is caught straight away. With no signal, the delivery is saved on the phone and checked when it uploads; if it's rejected then, the driver sees a message to phone the dispatcher.

## Next up (from the MVP spec)

1. Cash and payment ledger with end-of-shift reconciliation
2. Live tracking and automatic WhatsApp updates
3. Bulk order import (CSV)
