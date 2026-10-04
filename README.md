# Crown Heirs — Public Site

The **public, customer-facing** Crown Heirs site, deployed on Vercel from the
root of this repo.

The internal employee Team Hub lives in its own **private** repository,
`BOSSME-25/CrownTeam` — the Vercel `crown_team_hub` project deploys from there.

## What's here

| Path | What it is |
|---|---|
| `/` | The home page: hero from the team shoot, the five ways in (the "Find Your Service" finder), service tiles, About, Team, notes from clients, memberships and products from `/admin/tv`, Visit |
| `/tv` | **Salon TV display** — full-screen auto-rotating slideshow (photos & videos of work, Instagram-framed posts, a "Follow us" slide, memberships, products, announcements). AirPlay or open this URL on the TV and leave it. |
| `/book` | **Online booking** for customers. |
| `/admin` | **The admin site** — one sign-in (`ADMIN_PASSWORD`) for everything below. Home shows today at a glance. |
| `/admin/desk` | Front desk: today's book, phone bookings, time off. `?tab=team` for the roster. |
| `/admin/tv` | What plays on the salon TV and feeds the home page: photos and short videos (≤100 MB), Instagram-style posts, memberships, products, notes from clients, announcements, timing. |
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

**Visits: families and stacked services.** One confirmation code
(`CF-XXXXX`) can cover several appointments booked together:

- *A family.* The holder books under their own name and phone and adds the
  others by first name, each with their own service(s). They choose whether
  everyone must be in a chair *at the same time* (every first appointment
  starts within the salon's `family_window_min`, default 60 minutes) or
  whether *the same day* is fine (any times that day). After a day is shown,
  the page says which day is the soonest for that choice, and offers to look
  for a sooner day where everyone is seen at different times.
- *A stack.* One person, several services in the order they add them, done
  back to back: loc color, then the retwist. Each leg lands only on a
  stylist qualified for that service (the stylist's services list); the
  same stylist may do every leg when qualified.

The engine (`lib/family.js`) places every leg against the live book, one
chair at a time, and books all legs in one transaction: if any is taken,
nothing is booked. Each leg is still its own appointment row, so each
stylist sees their own, Team Hub gets each one, and the till opens one
ticket for the holder with a line per leg under the stylist who did it.
The holder gets one confirmation, one reminder and one lookup/cancel code.
Dependents live in the holder's household without a phone; one who later
books alone just gets a phone of their own.

**Deposits and policies.** Set under *Deposits and policies* in
`/admin/settings`: the deposit as a percentage of the starting price with
a floor (a service can carry its own `deposit_cents`; consultations and
unpriced services hold nothing), the cancellation notice in hours, the
late grace in minutes, and optional wording. Every online booking shows
the policy and needs the box ticked (`policyAck`); the desk never does.
The deposit is recorded on each appointment (`deposit_cents`,
`deposit_status`: due → paid / waived / forfeited / refunded) and the
confirmation says what is due. With `SQUARE_ACCESS_TOKEN` and
`SQUARE_LOCATION_ID` set, each booking gets a Square payment link (the
Checkout API's quick pay); when the client looks the booking up after
paying, the order is checked and the deposit marked paid. Without Square
the desk takes the deposit by hand and marks it *Deposit received*.
Cancelling inside the notice forfeits a paid deposit; a no-show forfeits;
a client marked *Member* (fees waived) never forfeits. The till applies a
paid deposit as credit on the ticket ("Due today"). The day view flags a
confirmed booking past its grace as *Late*.

**Theme days.** Family Fridays, Zin Saturdays, Mother's Day Saturday. Set
them up under *Theme days* in `/admin/settings`: a weekly rule or a single
date, an audience (families and children, adults, everyone), a headline
and "what to expect". The booking calendar marks the day and shows the
theme before the client picks a time; the TV announces it (`/tv` asks
`/api/book/themes?date=` for today); the confirmation carries it. A client
outside the audience (a solo adult on Family Friday, a Tiny Heirs service
on Zin Saturday) must tick that they understand their appointment may be
moved; the front desk sees those bookings flagged *Move?* and can **Move**
one to a new time, which tells the client. Front-desk bookings are never
gated. A dated theme can open its date for booking before the usual
60-day window (*open for booking this many days early*).

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
window are listed, not moved). *New appointment* books one appointment, or
— under **Family or stacked services** — a whole visit: several people each
with their services, or one person with services back to back, seated
either together (first appointments within the family window) or on the
same day at whatever times fit. *Find times* lists the fits for the chosen
day; *Soonest day* walks forward to the first day with one. The client
named below holds the visit and pays; the desk never ticks the policy box,
and theme days don't block it. **Team** tab: stylists, weekly hours, and
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
refunds are linked to their ticket; voids close it.

**Cards on the Square Terminal (Phase 2).** With `SQUARE_ACCESS_TOKEN` and
`SQUARE_LOCATION_ID` set, `/admin/settings` → Till pairs a Terminal: *Pair a
Terminal* shows a code to type on the device (Settings → Terminal API), and
the device is remembered once it pairs (or pick one already paired to the
account). The ticket's **Charge on Terminal** then pushes what is due today
(total less any deposit credit) to the device; the client taps and adds the
tip on the Terminal's own screen; the desk polls and, when Square reports
the checkout complete, pays the ticket as *card* with the Square payment id
and card in the reference and the tip recorded. *Take it back off the
Terminal* cancels; a checkout left alone times out after ten minutes.
Without a paired Terminal the card is taken on the Square app as before
and the ticket records the tender and reference by hand.

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
- **Hours down.** Each stylist's schedule is either *Set here* or *Live from
  Team Hub*. Live takes their published shifts and approved time off from the
  hub's schedule feed (`/api/integrations/schedule`), matched by work email;
  local weekly hours are ignored for them. If the hub can't be reached, local
  hours stand in rather than closing the book, and Settings shows the hub
  status. *Set here* can still be seeded from the hub: **Import from Team
  Hub** in the stylist editor reads the next four weeks of published shifts,
  takes the newest shift for each weekday (split shifts merge into one
  block), fills the weekly table, and leaves it editable.

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

Per-stylist pricing · reschedule-by-code · refunds pushed back to Square
(today a refund is recorded on the ticket and issued from the Square app).
