-- Booking schema. Idempotent: safe to run on every deploy.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS services (
  id               serial PRIMARY KEY,
  slug             text UNIQUE NOT NULL,
  name             text NOT NULL,
  category         text NOT NULL,
  description      text NOT NULL DEFAULT '',
  price_from_cents integer,
  duration_min     integer NOT NULL CHECK (duration_min > 0),
  buffer_min       integer NOT NULL DEFAULT 15 CHECK (buffer_min >= 0),
  requires_consult boolean NOT NULL DEFAULT false,
  active           boolean NOT NULL DEFAULT true,
  sort             integer NOT NULL DEFAULT 0
);

-- A service's sizes/lengths/client types ("Small 24in", "New Client"), each
-- with its own duration. The customer books a variation; the service is the
-- grouping they browse. `bookable=false` mirrors Square's "not bookable
-- online": kept for the record, never offered in the flow.
CREATE TABLE IF NOT EXISTS service_variations (
  id           serial PRIMARY KEY,
  service_id   integer NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name         text NOT NULL,
  duration_min integer NOT NULL CHECK (duration_min > 0),
  bookable     boolean NOT NULL DEFAULT true,
  sort         integer NOT NULL DEFAULT 0,
  UNIQUE (service_id, name)
);

CREATE TABLE IF NOT EXISTS stylists (
  id     serial PRIMARY KEY,
  slug   text UNIQUE NOT NULL,
  name   text NOT NULL,
  title  text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort   integer NOT NULL DEFAULT 0
);

-- Work email is the join key to Team Hub; hours_source 'hub' takes this
-- stylist's shifts and time off from the hub instead of `schedules`.
ALTER TABLE stylists ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE stylists ADD COLUMN IF NOT EXISTS hours_source text NOT NULL DEFAULT 'local'
  CHECK (hours_source IN ('local', 'hub'));

-- Which stylists perform which services.
CREATE TABLE IF NOT EXISTS stylist_services (
  stylist_id integer NOT NULL REFERENCES stylists(id) ON DELETE CASCADE,
  service_id integer NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (stylist_id, service_id)
);

-- Recurring weekly hours, as local minutes-from-midnight. 0 = Sunday.
CREATE TABLE IF NOT EXISTS schedules (
  id         serial PRIMARY KEY,
  stylist_id integer NOT NULL REFERENCES stylists(id) ON DELETE CASCADE,
  weekday    smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_min  smallint NOT NULL CHECK (start_min BETWEEN 0 AND 1440),
  end_min    smallint NOT NULL CHECK (end_min BETWEEN 0 AND 1440),
  CHECK (end_min > start_min)
);
CREATE INDEX IF NOT EXISTS schedules_stylist_idx ON schedules (stylist_id, weekday);

-- Vacations, sick days, blocked-out afternoons.
CREATE TABLE IF NOT EXISTS time_off (
  id         serial PRIMARY KEY,
  stylist_id integer NOT NULL REFERENCES stylists(id) ON DELETE CASCADE,
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  reason     text NOT NULL DEFAULT '',
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS time_off_stylist_idx ON time_off (stylist_id, starts_at);

CREATE TABLE IF NOT EXISTS clients (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  phone      text NOT NULL UNIQUE,   -- normalised digits; the identity of a returning client
  email      text,
  notes      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
  id         serial PRIMARY KEY,
  code       text UNIQUE NOT NULL,   -- confirmation code the client keeps, e.g. CH-7K3M9
  stylist_id integer NOT NULL REFERENCES stylists(id),
  service_id integer NOT NULL REFERENCES services(id),
  client_id  integer NOT NULL REFERENCES clients(id),
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,   -- service end, what the client sees
  busy_until timestamptz NOT NULL,   -- ends_at + cleanup buffer; what blocks the chair
  status     text NOT NULL DEFAULT 'confirmed'
             CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  notes      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at AND busy_until >= ends_at),
  -- The invariant that matters most: one stylist, one client at a time.
  -- Enforced by the database itself, so two people booking the same slot
  -- in the same second can't both succeed — the second insert is rejected.
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist
    (stylist_id WITH =, tstzrange(starts_at, busy_until) WITH &&)
    WHERE (status = 'confirmed')
);
-- Which variation was booked, plus its name as a snapshot so history reads
-- correctly even if the catalog is renamed later.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS variation_id integer REFERENCES service_variations(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS variation_name text NOT NULL DEFAULT '';
-- 'online' (customer at /book) or 'staff' (entered at /staff, e.g. a phone booking).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'online';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
-- Whether Team Hub has this appointment (see lib/teamhub.js).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS hub_synced_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS hub_error text;
CREATE INDEX IF NOT EXISTS appointments_stylist_time_idx ON appointments (stylist_id, starts_at);
CREATE INDEX IF NOT EXISTS appointments_client_idx ON appointments (client_id);

-- ── Point of sale ─────────────────────────────────────────────────────────
-- The ticket is the system of record for revenue. Every line carries the
-- employee who delivered it (never inferred), with the till operator kept
-- separately on the ticket. Money is integer cents; a line with no price
-- stays NULL and blocks payment rather than being treated as zero.

CREATE TABLE IF NOT EXISTS retail_items (
  id          serial PRIMARY KEY,
  sku         text UNIQUE,
  name        text NOT NULL,
  price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),
  taxable     boolean NOT NULL DEFAULT true,
  active      boolean NOT NULL DEFAULT true,
  sort        integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tickets (
  id             serial PRIMARY KEY,
  code           text UNIQUE NOT NULL,                       -- e.g. T-7K3M9
  appointment_id integer REFERENCES appointments(id),
  client_id      integer REFERENCES clients(id),
  rung_by        integer REFERENCES stylists(id),            -- till operator, NOT the provider
  status         text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'paid', 'voided', 'refunded', 'partially_refunded')),
  opened_at      timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz,
  voided_at      timestamptz,
  tender         text CHECK (tender IS NULL OR tender IN ('card', 'cash', 'other')),
  tender_ref     text,                                       -- e.g. the Square payment id
  tip_cents      integer NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
  subtotal_cents integer NOT NULL DEFAULT 0,                 -- gross of all lines
  discount_cents integer NOT NULL DEFAULT 0,
  tax_cents      integer NOT NULL DEFAULT 0,
  total_cents    integer NOT NULL DEFAULT 0,                 -- subtotal - discount + tax (tip excluded)
  note           text NOT NULL DEFAULT '',
  hub_synced_at  timestamptz,
  hub_error      text
);
CREATE INDEX IF NOT EXISTS tickets_paid_idx ON tickets (paid_at);
CREATE INDEX IF NOT EXISTS tickets_appt_idx ON tickets (appointment_id);

CREATE TABLE IF NOT EXISTS ticket_lines (
  id              serial PRIMARY KEY,
  ticket_id       integer NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('service', 'retail')),
  provider_id     integer NOT NULL REFERENCES stylists(id),  -- who delivered THIS line
  service_id      integer REFERENCES services(id),
  variation_id    integer REFERENCES service_variations(id),
  retail_item_id  integer REFERENCES retail_items(id),
  name            text NOT NULL,
  quantity        integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  gross_cents     integer CHECK (gross_cents IS NULL OR gross_cents >= 0),  -- NULL = not priced yet
  discount_cents  integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  discount_reason text NOT NULL DEFAULT '',
  tax_cents       integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  sort            integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ticket_lines_ticket_idx ON ticket_lines (ticket_id);
CREATE INDEX IF NOT EXISTS ticket_lines_provider_idx ON ticket_lines (provider_id);

CREATE TABLE IF NOT EXISTS ticket_refunds (
  id           serial PRIMARY KEY,
  ticket_id    integer NOT NULL REFERENCES tickets(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  reason       text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   text
);

-- Per-integration credentials with named scopes (the hub reads; nothing writes).
CREATE TABLE IF NOT EXISTS api_tokens (
  id           serial PRIMARY KEY,
  name         text NOT NULL,
  token_hash   text UNIQUE NOT NULL,                          -- sha256 of the token
  prefix       text NOT NULL,                                 -- first 8 chars, for display
  scopes       text[] NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('time_zone',      'America/Phoenix'),
  ('lead_min',       '120'),   -- earliest booking is 2h from now
  ('max_days_ahead', '60'),
  ('step_min',       '15'),
  ('tax_rate_bps',   '0')     -- retail sales tax, basis points (860 = 8.6%); services untaxed
ON CONFLICT (key) DO NOTHING;
