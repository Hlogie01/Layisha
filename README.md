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
2. **Set up the database.** In the Supabase dashboard, open **SQL Editor** and run each file in `supabase/migrations/` in order (`0001_init.sql`, `0002_location_requests.sql`, `0003_driver_app.sql`, `0004_account_types.sql`, `0005_security_hardening.sql`, then `0006_live_chat.sql`). Paste the contents and click **Run**.
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

## Live chat

Dispatchers and drivers chat in real time: **Chat** in the dashboard menu, and the **Chat** button in the driver app.

- One conversation per driver, with sent and read ticks
- Tag a message with an order (**Message driver** on an order card, or **Message dispatch about this stop** in the driver app)
- One-tap quick replies for drivers ("Customer is not answering", "Running about 20 minutes late"…)
- **Message all drivers** broadcasts to every active driver
- Unread counts in the menu, the browser tab title and the driver app, with a sound on the dashboard and vibration on the driver's phone
- Drivers can send with no signal: messages wait on the phone and send when signal returns

**How "live" works:** when a message is sent or read, the database sends a tiny ping through Supabase Realtime Broadcast to a secret topic for that driver and company. The ping contains no message text: the app then fetches new messages through its normal permission-checked routes. If Realtime can't connect, the apps fall back to checking every 20–30 seconds. Keep public Broadcast channels allowed in your Supabase Realtime settings (switching to private-only channels stops live updates).

Push notifications when the app is closed will come with the Android and iPhone apps.

## Security

- **Each company's data is walled off** with Postgres row-level security. Vehicle-only accounts can't reach delivery data.
- **Driver and customer links** are random secrets stored only as SHA-256 hashes. Unused driver links expire after 48 hours; customer links after 7 days.
- **Delivery PIN** locks after 5 wrong tries. The dispatcher creates a new one from the order card.
- **Rate limits** on login, sign-up, customer links, driver links and driver uploads (stored in Postgres, needs `SUPABASE_SERVICE_ROLE_KEY`).
- **Photos** are checked before upload (the stop must be open and assigned to that driver; the file must really be an image) and stored privately.
- **Security headers:** Content Security Policy, no framing, HSTS, nosniff, strict referrer policy, camera and location only.
- **Error messages** shown to users never include database details.
- **Audit log** (Activity page, owners only): orders, PIN locks and resets, driver links, account changes, POPIA removals. Entries can't be edited or deleted.
- **POPIA:** owners can remove a customer's personal details from the Customers page. `/privacy` is a draft privacy notice to complete and have reviewed.

Run the database security tests (52 checks) on a local Postgres:

```bash
PGHOST=localhost PGUSER=postgres supabase/tests/run-local.sh
```

## Launch checklist

- [ ] Supabase: **Authentication → Email**: turn **Confirm email** back ON
- [ ] Supabase: Authentication → Passwords: minimum length 8+, and turn on leaked-password protection if your plan offers it
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_APP_URL` in the hosting environment (never in browser code)
- [ ] Run all 6 migrations in order
- [ ] Complete `/privacy` (company details, Information Officer, data region, retention) and have it reviewed
- [ ] Register your Information Officer with the Information Regulator
- [ ] Check which region Supabase stores data in, and POPIA's rules on cross-border transfers
- [ ] Later, before large contracts: two-step login for owners, dispatcher permissions, automated tests in CI, an independent penetration test

## Next up (from the MVP spec)

1. Cash and payment ledger with end-of-shift reconciliation
2. Live tracking and automatic WhatsApp updates
3. Bulk order import (CSV)
