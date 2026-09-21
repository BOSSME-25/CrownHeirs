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

CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('time_zone',      'America/Phoenix'),
  ('lead_min',       '120'),   -- earliest booking is 2h from now
  ('max_days_ahead', '60'),
  ('step_min',       '15')
ON CONFLICT (key) DO NOTHING;
