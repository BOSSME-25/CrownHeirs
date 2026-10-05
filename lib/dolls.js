// Crown Heirs Dolls: a client builds their doll on /dolls (yarn shade, hair
// colour, hair style, outfit wishes) and sends the request. The desk sees it
// under its Dolls tab, quotes it, and moves it along: new → quoted → making →
// ready → done. Outfit wishes are kept as notes: considered, never promised.
const crypto = require('crypto');
const { query } = require('./db');
const { BookingError, normalizePhone } = require('./booking');
const notify = require('./notify');

const SHADES = [
  { id: 'espresso', name: 'Espresso', hex: '#3e261b' },
  { id: 'cocoa',    name: 'Cocoa',    hex: '#5a3a2a' },
  { id: 'mocha',    name: 'Mocha',    hex: '#704a35' },
  { id: 'caramel',  name: 'Caramel',  hex: '#8c5c3c' },
  { id: 'honey',    name: 'Honey',    hex: '#a97850' },
  { id: 'almond',   name: 'Almond',   hex: '#c4986c' },
  { id: 'sand',     name: 'Sand',     hex: '#d9b88f' },
  { id: 'cream',    name: 'Cream',    hex: '#ecd6b8' }
];
const HAIR_COLORS = [
  { id: 'black',        name: 'Black',        hex: '#1b1b1b' },
  { id: 'dark-brown',   name: 'Dark brown',   hex: '#3b2418' },
  { id: 'brown',        name: 'Brown',        hex: '#5c3a21' },
  { id: 'auburn',       name: 'Auburn',       hex: '#7a3b1e' },
  { id: 'honey-blonde', name: 'Honey blonde', hex: '#c9963e' },
  { id: 'blonde',       name: 'Blonde',       hex: '#e6c87a' },
  { id: 'burgundy',     name: 'Burgundy',     hex: '#6b1f3a' },
  { id: 'red',          name: 'Red',          hex: '#b2321f' },
  { id: 'blue',         name: 'Blue',         hex: '#2f4f9e' },
  { id: 'purple',       name: 'Purple',       hex: '#6a3fa0' },
  { id: 'pink',         name: 'Pink',         hex: '#d26a9a' },
  { id: 'silver',       name: 'Silver',       hex: '#a8a8a8' },
  { id: 'mixed',        name: 'Mixed, tell us', hex: 'linear-gradient(135deg,#6b1f3a,#c9963e,#2f4f9e)' }
];
const HAIR_STYLES = [
  { id: 'locs',        name: 'Locs' },
  { id: 'box-braids',  name: 'Box braids' },
  { id: 'twists',      name: 'Twists' },
  { id: 'cornrows',    name: 'Cornrows' },
  { id: 'afro-puffs',  name: 'Afro puffs' },
  { id: 'curly-afro',  name: 'Curly afro' },
  { id: 'bantu-knots', name: 'Bantu knots' },
  { id: 'straight',    name: 'Straight / silk press' },
  { id: 'ponytail',    name: 'Ponytail' },
  { id: 'bun',         name: 'Top bun' }
];
const STATUSES = ['new', 'quoted', 'making', 'ready', 'done', 'cancelled'];
const MAX_QTY = 5;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => 'DL-' + Array.from({ length: 5 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
const byId = (list, id) => list.find(x => x.id === id);
const clean = (v, max) => String(v || '').trim().slice(0, max);

function options() { return { shades: SHADES, hairColors: HAIR_COLORS, hairStyles: HAIR_STYLES, maxQuantity: MAX_QTY }; }

function describe(d) {
  const shade = byId(SHADES, d.shade), hc = byId(HAIR_COLORS, d.hair_color), hs = byId(HAIR_STYLES, d.hair_style);
  const o = d.outfit || {};
  const wishes = [o.top && `top/dress: ${o.top}`, o.bottom && `bottoms: ${o.bottom}`, o.shoes && `shoes: ${o.shoes}`, o.colors && `colours: ${o.colors}`].filter(Boolean).join(', ');
  return {
    doll: `${shade ? shade.name : d.shade} yarn, ${hc ? hc.name : d.hair_color} ${hs ? hs.name.toLowerCase() : d.hair_style}`,
    wishes: wishes || 'no outfit wishes'
  };
}

function shape(r) {
  const desc = describe(r);
  return {
    code: r.code, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
    client: { name: r.name, phone: r.phone, email: r.email },
    shade: r.shade, hairColor: r.hair_color, hairStyle: r.hair_style, quantity: r.quantity, outfit: r.outfit || {},
    notes: r.notes, forWhom: r.for_whom, quote: r.quote, summary: desc.doll, wishes: desc.wishes
  };
}

async function create(input) {
  const name = clean(input.name, 80); if (name.length < 2) throw new BookingError(400, 'Please enter your name');
  const phone = normalizePhone(input.phone);
  const email = clean(input.email, 120).toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BookingError(400, "That email doesn't look right");
  if (!byId(SHADES, input.shade)) throw new BookingError(400, 'Pick a yarn shade');
  if (!byId(HAIR_COLORS, input.hairColor)) throw new BookingError(400, 'Pick a hair colour');
  if (!byId(HAIR_STYLES, input.hairStyle)) throw new BookingError(400, 'Pick a hair style');
  const quantity = Math.max(1, Math.min(MAX_QTY, Number(input.quantity) || 1));
  const o = input.outfit || {};
  const outfit = { top: clean(o.top, 120), bottom: clean(o.bottom, 120), shoes: clean(o.shoes, 120), colors: clean(o.colors, 120) };
  const notes = clean(input.notes, 600), forWhom = clean(input.forWhom, 80);
  let row;
  for (let i = 0; ; i++) {
    try {
      ({ rows: [row] } = await query(
        `INSERT INTO doll_orders (code, name, phone, email, shade, hair_color, hair_style, quantity, outfit, notes, for_whom)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [newCode(), name, phone, email, input.shade, input.hairColor, input.hairStyle, quantity, JSON.stringify(outfit), notes, forWhom]));
      break;
    } catch (e) { if (e.code === '23505' && i < 3) continue; throw e; }
  }
  const d = shape(row);
  await notify.safely(sendNew(d));
  return d;
}

async function sendNew(d) {
  const c = notify.config();
  const what = `${d.quantity > 1 ? d.quantity + ' dolls' : 'a doll'}: ${d.summary}`;
  const jobs = [
    notify.sendSms({ to: d.client.phone, body: `${c.salonName}: we have your doll request (${what}). Code ${d.code}. We'll text you a quote and a timeline. Outfit wishes are considered but can't be promised.` }),
    notify.sendEmail({ to: d.client.email, subject: `Your Crown Heirs doll — ${d.code}`, text: `Hi ${d.client.name},\n\nWe have your request for ${what}.\nOutfit wishes: ${d.wishes}.${d.notes ? '\nNotes: ' + d.notes : ''}\n\nCode ${d.code}. We'll be in touch with a quote and a timeline. Outfit wishes are considered but can't be promised.\n\n${c.salonName}` }),
    notify.sendSms({ to: c.salonSms, body: `New doll request ${d.code}: ${what}. ${d.client.name} (${d.client.phone}). Wishes: ${d.wishes}.` }),
    notify.sendEmail({ to: c.salonEmail, subject: `New doll request ${d.code}`, text: `${d.client.name} (${d.client.phone}${d.client.email ? ', ' + d.client.email : ''}) asked for ${what}.\nFor: ${d.forWhom || 'not said'}\nOutfit wishes: ${d.wishes}\nNotes: ${d.notes || 'none'}\n\nSee /admin/desk → Dolls.` })
  ];
  const r = await Promise.allSettled(jobs);
  return r.map(x => x.status === 'fulfilled' ? x.value : { error: String(x.reason) });
}

async function list({ status = null, limit = 200 } = {}) {
  const { rows } = status
    ? await query(`SELECT * FROM doll_orders WHERE status = $1 ORDER BY created_at DESC LIMIT $2`, [status, limit])
    : await query(`SELECT * FROM doll_orders ORDER BY (status IN ('done','cancelled')), created_at DESC LIMIT $1`, [limit]);
  return rows.map(shape);
}

async function lookup(code) {
  const { rows: [r] } = await query(`SELECT * FROM doll_orders WHERE code = $1`, [String(code || '').trim().toUpperCase()]);
  if (!r) throw new BookingError(404, 'No doll request with that code');
  return shape(r);
}

// The desk moves a request along and can attach the quote; the client is told.
async function setStatus(code, { status, quote = null, tell = true }) {
  if (!STATUSES.includes(status)) throw new BookingError(400, 'Status must be one of ' + STATUSES.join(', '));
  const q = quote == null || quote === '' ? null : clean(quote, 120);
  const { rows: [r] } = await query(
    `UPDATE doll_orders SET status = $2, quote = COALESCE($3, quote), updated_at = now() WHERE code = $1 RETURNING *`,
    [String(code || '').trim().toUpperCase(), status, q]);
  if (!r) throw new BookingError(404, 'No doll request with that code');
  const d = shape(r);
  if (tell) await notify.safely(sendStatus(d));
  return d;
}

async function sendStatus(d) {
  const c = notify.config();
  const line = {
    quoted:  `your doll (${d.summary}) is quoted at ${d.quote || 'the price we discussed'}. Reply or call ${c.salonPhone} to confirm and we'll start.`,
    making:  `your doll (${d.summary}) is being made. We'll text when it's ready.`,
    ready:   `your doll is ready to pick up at the Den! ${c.salonPhone}`,
    done:    `thank you for your doll order. We hope they love it!`,
    cancelled: `your doll request has been cancelled. Questions? ${c.salonPhone}`
  }[d.status];
  if (!line) return [];
  const r = await Promise.allSettled([
    notify.sendSms({ to: d.client.phone, body: `${c.salonName}: ${line} Code ${d.code}.` }),
    notify.sendEmail({ to: d.client.email, subject: `Your doll ${d.code}: ${d.status}`, text: `Hi ${d.client.name},\n\n${line.charAt(0).toUpperCase() + line.slice(1)}\n\nCode ${d.code}\n\n${c.salonName}` })
  ]);
  return r.map(x => x.status === 'fulfilled' ? x.value : { error: String(x.reason) });
}

module.exports = { options, create, list, lookup, setStatus, describe, SHADES, HAIR_COLORS, HAIR_STYLES, STATUSES, MAX_QTY };
