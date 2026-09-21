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
| `/admin` | **Bethany's editor** — password-protected. Add/swap photos and short videos (≤100 MB, direct-to-storage upload), mark any as an Instagram-style post, edit memberships, products, announcements, the IG handle, and slide timing. Works great from a phone. |

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
2. Open **`/admin`** → **Booking database → Set up / refresh**. That creates
   the tables and loads the catalog. It's safe to press again any time; it
   never overwrites edited rows.

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

### Not built yet (natural next steps)

Staff calendar/admin for appointments and hours · SMS/email confirmations
and reminders · deposits · per-stylist pricing · reschedule-by-code.
