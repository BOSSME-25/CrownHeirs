# Crown Heirs — Public Site

The **public, customer-facing** Crown Heirs site, deployed on Vercel from the
root of this repo.

The internal employee Team Hub lives in its own **private** repository,
`BOSSME-25/CrownTeam` — the Vercel `crown_team_hub` project deploys from there.

## What's here

| Path | What it is |
|---|---|
| `/` | The "Find Your Service" experience |
| `/tv` | **Salon TV display** — full-screen auto-rotating slideshow (photos & videos of work, Instagram-framed posts, a "Follow us" slide, memberships, products, announcements). AirPlay or open this URL on the TV and leave it. |
| `/book` | **Online booking** for customers. |
| `/admin` | **The admin site** — one sign-in (`ADMIN_PASSWORD`) for everything below. Home shows today at a glance. |
| `/admin/desk` | Front desk: today's book, phone bookings, time off. `?tab=team` for the roster. |
| `/admin/tv` | What plays on the salon TV: photos and short videos (≤100 MB), Instagram-style posts, memberships, products, announcements, timing. |
| `/admin/settings` | Booking database setup, notification variables, run reminders now. |

The TV re-checks for new content every 3 minutes, so saves in `/admin` show up
on screen without touching the TV.

## One-time setup on Vercel (required before /admin can save)

1. **Blob storage** — in the Vercel dashboard for this project: **Storage →
   Create → Blob**, and connect it to this project. This is where uploaded
   photos and the edited content live. (Free tier is plenty.)
2. **Admin password** — **Settings → Environment Variables**, add
   `ADMIN_PASSWORD` with the password Bethany will use, then redeploy.

Until both are done: `/tv` still works (it shows the built-in starter
content), and `/admin` will say what's missing when you try to sign in or
save.

## Putting it on the TV

- **Apple TV**: AirPlay-mirror an iPad/iPhone showing `/tv` in Safari, or use
  the TV's browser if it has one.
- **Any smart TV / Fire Stick with a browser**: open `https://<your-domain>/tv`
  and go full-screen.
- The page keeps the screen awake where the browser allows it and shows a
  small clock so it's useful at checkout.

## Booking mode — Square until switch-over

`BOOKING_MODE` decides where bookings happen. **`square`** (the default): a
customer reaching `/book` — including every "Book now" in the finder — is
sent to Square, to the specific service where a deep link is known
(`lib/square-links.json`); nothing is booked here, so making the site public
for the TV can't open a second booking system. **`site`**: switch-over —
bookings are taken here, confirmations go out, Team Hub is fed. Set it in
Vercel and redeploy; Settings shows which mode is live.

## Online booking (`/book`)

A self-hosted booking system — no Square, HighLevel, or Google in the loop.
Customers pick a service → stylist (or first available) → date & time →
enter their details, and get a confirmation code they can use at
`/book?code=CH-XXXXX` to look up or cancel.

**What's underneath**

| Piece | Where |
|---|---|
| Scheduling engine (pure, unit-tested) | `lib/availability.js` |
| Time-zone handling (Phoenix, no DST) | `lib/tz.js` |
| Schema — with a DB-level guard against double-booking | `lib/schema.sql` |
| Booking operations | `lib/booking.js` |
| HTTP routes | `api/book/*.js` |
| Catalog — from the Square export: 66 services, 322 variations, **real durations** | `lib/seed-data.json` |

**Variations.** A service is what the customer browses ("Braids (Knotless)");
a variation is what they book ("Medium 24in", "New Client"), and each carries
its own duration from Square. Services with one option skip that step.
Variations Square marks *not bookable online* are stored but never offered;
a service with none left is hidden from `/book` entirely (Threading, Classes,
the Back II School menu, …).

Double-booking is impossible by construction: `appointments` carries an
exclusion constraint on `(stylist, time range)`, so if two people submit the
same slot in the same instant, the database accepts one and rejects the other.

### One-time setup on Vercel

1. **Postgres** — in the Vercel dashboard: **Storage → Create Database →
   Postgres (Neon)**, connect it to `crown-heirs` for all environments, then
   **redeploy**. This adds `DATABASE_URL` (or `POSTGRES_URL`) automatically.
2. Open **`/admin/settings`** → **Set up / refresh booking database**. That
   creates the tables and loads the catalog. It's safe to press again any
   time (and needed after any update that changes the schema); it never
   overwrites edited prices or deletes appointments.

Until step 1 is done, `/book` shows a plain "not connected yet" message
instead of the flow.

**Which Vercel project?** Two projects (`crown-heirs`, `crown-heirs-booking`)
deploy this same repo, so the code is identical on both — only environment
variables differ. `crown-heirs` already holds the Blob store and
`ADMIN_PASSWORD` that `/tv` and `/admin` use, so connect Postgres **there**
and treat it as the one live project. `crown-heirs-booking` can be ignored or
deleted; if you'd rather it serve booking on its own URL, it needs all three
(`ADMIN_PASSWORD`, the Blob store, Postgres) added to it as well.

### Things to review after setup

- **Durations come from Square** per variation, so slots are offered the way
  you already book. If you change one in Square, re-export and re-run Set up
  — the catalog file is the authority for durations and bookability.
- **Prices** are still the site's "From $" figures, matched to 31 of the 66
  services by name (the export has no price column). The rest show "Ask us"
  until filled in (`services.price_from_cents`); Set up never overwrites a
  price that's already there.
- Cleanup **buffer** between clients defaults to 15 min (0 for add-ons and
  consultations): `services.buffer_min`.
- The seed creates **one stylist, "Bethany", Tue–Sat 9–6, offering
  everything**. Add the real team and their hours in `stylists`,
  `stylist_services`, and `schedules` (minutes from midnight; weekday 0 =
  Sunday). Vacations go in `time_off`.
- `settings` holds the time zone, the 2-hour lead time, the 60-day booking
  window and the 15-minute slot grid.

### Running the tests

```
npm test                                   # engine tests only
TEST_DATABASE_URL=postgres://… npm test    # + integration and API tests against a real Postgres
```

## Front desk (`/admin/desk`)

**Book** tab: the day's appointments per stylist
(complete / no-show / cancel / restore), phone or walk-in bookings with no
lead time, and time blocking (lunch, days off — existing bookings inside the
window are listed, not moved). **Team** tab: stylists, weekly hours, and
which services each offers — this is where the placeholder "Bethany" gets
replaced with the real team. Only active stylists with hours are bookable.

## Till — tickets (POS Phase 1)

This site is becoming the system of record for revenue, per the Square
contract (`SQUARE-CONTRACT.md`). A **ticket** is opened from an appointment
(Book tab → Checkout) or as a walk-in, and holds one line per service or
retail item. **Every line names the employee who delivered it**, stored,
never inferred; the till operator is kept separately. Gross, discount (with
reason) and tax are separate amounts per line; commission is paid on gross,
KPIs use net. A line with no price stays unpriced and **blocks payment**
rather than becoming $0. Paying a ticket marks its appointment completed;
refunds are linked to their ticket; voids close it. In this phase the card
is taken on the Square terminal and the ticket records the tender and
reference — capturing the card from here is Phase 2.

Retail items and the retail tax rate live in `/admin/settings`.

### Read API for integrations — `/api/v1/`

Per-integration tokens with named scopes, created and revoked in
`/admin/settings` (shown once; only a hash is stored). `Authorization:
Bearer ch_…`.

| Resource | Scope | Notes |
|---|---|---|
| `whoami` | — | The token's name and scopes |
| `appointments?from&to[&status]` | `appointments:read` | One segment per booking today, with the ticket id when one exists |
| `tickets?from&to[&status]` | `tickets:read` | Lines with `employee_id`, `gross_cents`, `discount_cents`, `tax_cents`, `net_cents`; refunds |
| `catalog` | `catalog:read` | Services (`product_type: service`) with variations and durations; retail items |
| `schedule?from&to` | `schedule:read` | Local shifts and time off per employee |
| `employees` | `employees:read` | Stable ids that survive departure |

Ranges are salon-local days, up to 366 days per call, any distance back.
Money is integer cents with a `_cents` suffix.

## Team Hub

Team Hub (the private `CrownTeam` app) reconciles payroll against Square and
runs the salon; it used to take appointments from HighLevel. This site now
takes that seat, using the two surfaces the hub already exposes for a client
site — nothing changes on the hub side.

- **Appointments up.** Every booking, cancellation, completion and no-show is
  POSTed to the hub's appointment webhook (`/api/webhooks/highlevel`) with
  our stylist **id** as the "calendar id" and their **work email** as the
  "user id". In the hub's Admin → HighLevel table, paste those two values
  against each employee once, and appointments are credited to them. Each
  appointment here records whether the hub accepted it (`Hub ✓ / ✗` on the
  front desk); a day or the next 60 days can be resynced from the front desk
  or Settings.
- **Hours down.** A stylist with "Hours come from Team Hub" ticked takes their
  published shifts and approved time off from the hub's schedule feed
  (`/api/integrations/schedule`), matched by work email; local weekly hours
  are ignored for them. If the hub can't be reached, local hours stand in
  rather than closing the book, and Settings shows the hub status.

| Variable | Purpose |
|---|---|
| `TEAMHUB_URL` | e.g. `https://team.crownheirs.com` |
| `TEAMHUB_SECRET` | The shared secret shown on the hub's Admin → HighLevel page |

## Notifications

Sent on booking and cancellation (client + salon) and as a next-day
reminder (client only). Each channel is silent until its keys exist, so the
booking flow works with none of them set.

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` | Email via Resend. The from-address needs a verified domain in Resend (e.g. `Crown Heirs <book@crownheirs.com>`). |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS via Twilio. US business texting needs A2P 10DLC registration in Twilio before messages deliver reliably. |
| `NOTIFY_EMAIL`, `NOTIFY_SMS_TO` | Where the salon's copies go. |
| `CRON_SECRET` | Any long random string. Enables the daily reminder run (`vercel.json` cron, 16:00 UTC = 9 AM Phoenix). |
| `SITE_URL` | Used in message links; defaults to the vercel.app URL. |

Reminders can also be triggered by hand from `/admin/settings`.

### Not built yet (natural next steps)

Deposits · per-stylist pricing · reschedule-by-code · the homepage finder
handing off to `/book` with the service pre-selected.
