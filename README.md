# Layisha

Run your deliveries in one place. Layisha helps South African businesses manage orders, drivers, proof of delivery and cash, even where addresses are vague and signal drops.

Logistics companies sign up and run their daily operations here. Later, vehicle vendors will be able to list vans, bakkies and trucks for monthly rent (Phase 2).

## What works so far

- Sign up, log in and log out (email and password)
- Create your business on first login
- Add drivers, and deactivate or reactivate them
- Create orders (customer, WhatsApp number, items, amount, payment type, delivery date)
- Dispatch board: pick a day, see orders grouped by driver, assign drivers and change status
- Daily totals: orders, delivered, failed and cash to collect
- **WhatsApp location confirmation:** tap "Ask for location" on an order, and the customer gets a private link on WhatsApp. They share their GPS pin and a landmark note without installing anything, and the order shows "Location confirmed · Open map"
- Every business only sees its own data (enforced in the database with row-level security)

## Tech

- [Next.js 16](https://nextjs.org) (App Router, Server Functions, Cache Components)
- [Supabase](https://supabase.com) (Postgres, auth, row-level security)
- Tailwind CSS 4

## Run it locally

You need Node.js 20 or newer and a free Supabase project.

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Set up the database.** In the Supabase dashboard, open **SQL Editor** and run each file in `supabase/migrations/` in order (`0001_init.sql`, then `0002_location_requests.sql`). Paste the contents and click **Run**.
3. **For quick testing, turn off email confirmation:** **Authentication → Sign In / Providers → Email**, switch off "Confirm email". Switch it back on before going live.
4. **Add your keys.** Copy `.env.example` to `.env.local` and fill in the values from **Project Settings → API**.
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
src/app/onboarding/    Create your business
src/app/dashboard/     Dispatch board, new order, drivers
src/app/c/[token]/     Public page where customers confirm their location
src/lib/whatsapp.ts    WhatsApp sending (Cloud API or tap-to-send links)
```

## WhatsApp

By default, Layisha creates a **tap-to-send** WhatsApp link: the dispatcher taps "Open WhatsApp to send" and presses send in their own WhatsApp. This is free and needs no setup.

To send automatically instead, set up the [WhatsApp Business Platform (Cloud API)](https://developers.facebook.com/docs/whatsapp/cloud-api), get a message template approved with three variables (customer first name, business name, link), and fill in the `WHATSAPP_*` values in `.env.local`. Meta charges per business-initiated message, so check current South African rates first.

Customer location links expire after 7 days and only work for that one customer. When testing on your phone, the app must be reachable from the internet (deploy it, or use a tunnel), because `localhost` links won't open on the customer's phone.

## Next up (from the MVP spec)

1. Driver app with offline mode
2. Proof of delivery (photo, GPS, one-time PIN)
3. Cash and payment ledger with end-of-shift reconciliation
4. Live tracking and automatic WhatsApp updates
5. Bulk order import (CSV)
