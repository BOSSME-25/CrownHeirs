// Crown Heirs Doll Maker: a guest builds their Crown Heir on /dolls (base,
// complexion, hair, the look) and asks us to bring them home. The desk sees
// the request under its Dolls tab, quotes it, and moves it along: new →
// quoted → making → ready → done. Every doll is handmade, so the look is
// what we aim for and anything extra in the notes is considered, never promised.
//
// The option ids here are the ones in the page's share links and in the
// layer-art manifest (public/doll-maker/manifest.json); keep them stable.
const crypto = require('crypto');
const { query } = require('./db');
const { BookingError, normalizePhone } = require('./booking');
const notify = require('./notify');

const BASES = [
  { id: 'girl', name: 'Girl', defaults: { hairStyle: 'locs',        hairColor: 'black', top: 'ch-hoodie',  bottom: 'joggers', bottomColor: 'pink',  shoes: 'sneakers-pink' } },
  { id: 'boy',  name: 'Boy',  defaults: { hairStyle: 'short-curls', hairColor: 'black', top: 'ch-sweater', bottom: 'jeans',   bottomColor: 'denim', shoes: 'sneakers-black' } }
];
// The yarn for the skin. Called `shade` in requests, as it always has been.
const SHADES = [
  { id: 'rich-espresso', name: 'Rich Espresso', hex: '#4a2a1d' },
  { id: 'deep-brown',    name: 'Deep Brown',    hex: '#5f3722' },
  { id: 'warm-brown',    name: 'Warm Brown',    hex: '#7d4a2c' },
  { id: 'golden-brown',  name: 'Golden Brown',  hex: '#96603a' },
  { id: 'caramel',       name: 'Caramel',       hex: '#b37a4c' }
];
// Shades offered before the Doll Maker, so older requests still read right.
const PAST_SHADES = { espresso: 'Espresso', cocoa: 'Cocoa', mocha: 'Mocha', honey: 'Honey', almond: 'Almond', sand: 'Sand', cream: 'Cream' };
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
  { id: 'silver',       name: 'Silver',       hex: '#a8a8a8' }
];
// Two colours: the client picks a highlight colour from the same list; whole
// strands of it, root to tip, are mixed through the first colour.
const HAIR_STYLES = [
  { id: 'locs',        name: 'Locs' },
  { id: 'box-braids',  name: 'Box braids' },
  { id: 'afro-puffs',  name: 'Afro puffs' },
  { id: 'twists',      name: 'Twists' },
  { id: 'curly-afro',  name: 'Curly fro' },
  { id: 'cornrows',    name: 'Cornrows' },
  { id: 'short-curls', name: 'Short curls / fade' },
  { id: 'straight',    name: 'Silk press' },
  { id: 'loose-curls', name: 'Loose curls' },
  { id: 'bantu-knots', name: 'Bantu knots' },
  { id: 'ponytail',    name: 'Ponytail' },
  { id: 'bun',         name: 'Top bun' }
];

// The look. A garment with more than one colour takes one of its `colors`
// (the first is the default); `{c}` in its name is where the colour goes.
const GARMENT_COLORS = [
  { id: 'black',    name: 'Black',      hex: '#1f1d1b' },
  { id: 'white',    name: 'White',      hex: '#f7f4ee' },
  { id: 'ivory',    name: 'Ivory',      hex: '#ece2cf' },
  { id: 'grey',     name: 'Grey',       hex: '#8f8c88' },
  { id: 'pink',     name: 'Pink',       hex: '#e58fb0' },
  { id: 'blush',    name: 'Blush',      hex: '#f0bfcb' },
  { id: 'red',      name: 'Red',        hex: '#c0392b' },
  { id: 'gold',     name: 'Gold',       hex: '#d9a93a' },
  { id: 'yellow',   name: 'Yellow',     hex: '#e9bf3c' },
  { id: 'sage',     name: 'Sage',       hex: '#9aae8c' },
  { id: 'lavender', name: 'Lavender',   hex: '#b49ad8' },
  { id: 'royal',    name: 'Royal blue', hex: '#2a4fa8' },
  { id: 'denim',    name: 'Blue',       hex: '#4a6a94' },
  { id: 'khaki',    name: 'Khaki',      hex: '#b8a06e' },
  { id: 'brown',    name: 'Brown',      hex: '#6b4a32' }
];
const TOPS = [
  { id: 'ch-hoodie',    name: 'Pink Crown Heirs hoodie',          look: 'hoodie',   colors: ['pink'],  brand: true, group: 'Crown Heirs' },
  { id: 'ch-sweater',   name: 'Royal blue Crown Heirs sweater',   look: 'sweater',  colors: ['royal'], brand: true, group: 'Crown Heirs' },
  { id: 'tee',          name: '{c} tee',                          look: 'tee',      colors: ['red', 'white', 'black', 'yellow', 'lavender'], group: 'Casual' },
  { id: 'denim-jacket', name: 'Denim jacket over a {c} tee',      look: 'jacket',   colors: ['white', 'pink', 'black'], group: 'Casual' },
  { id: 'cardigan',     name: '{c} fuzzy cardigan',               look: 'cardigan', colors: ['blush', 'ivory', 'lavender'], group: 'Dressy' },
  { id: 'flannel',      name: '{c} plaid flannel',                look: 'flannel',  colors: ['red', 'sage'], group: 'Seasonal' }
];
const BOTTOMS = [
  { id: 'joggers',     name: '{c} joggers',     look: 'joggers', colors: ['pink', 'black', 'grey', 'lavender', 'sage'] },
  { id: 'jeans',       name: '{c} jeans',       look: 'jeans',   colors: ['denim', 'black', 'white'] },
  { id: 'shorts',      name: '{c} shorts',      look: 'shorts',  colors: ['denim', 'khaki', 'pink', 'black'] },
  { id: 'skirt',       name: '{c} skirt',       look: 'skirt',   colors: ['black', 'pink', 'gold', 'denim'] },
  { id: 'dress-pants', name: '{c} dress pants', look: 'wide',    colors: ['black', 'ivory', 'blush'] }
];
const SHOES = [
  { id: 'sneakers-pink',  name: 'Pink and white sneakers',  look: 'sneakers', main: '#e58fb0', trim: '#f7f4ee' },
  { id: 'sneakers-black', name: 'Black and white sneakers', look: 'sneakers', main: '#1f1d1b', trim: '#f7f4ee' },
  { id: 'sneakers-white', name: 'White sneakers',           look: 'sneakers', main: '#f7f4ee', trim: '#f7f4ee' },
  { id: 'boots',          name: '{c} boots',                look: 'boots',    colors: ['brown', 'black', 'white'] },
  { id: 'dress-shoes',    name: '{c} dress shoes',          look: 'flats',    colors: ['black', 'white', 'pink'] }
];
// `clashes`: hair it can't sit on. `excludes`: another accessory it can't be
// worn with. `available: false` shows it as coming soon.
const ACCESSORIES = [
  { id: 'bag',     name: 'Crossbody bag' },
  { id: 'glasses', name: 'Glasses' },
  { id: 'hat',     name: 'Bucket hat', clashes: ['afro-puffs', 'curly-afro', 'bun', 'bantu-knots'], excludes: ['crown'] },
  { id: 'bow',     name: 'Hair bow' },
  { id: 'jewelry', name: 'Gold hoops and necklace' },
  // Placed only from the approved Crown Heirs crown file, never drawn.
  { id: 'crown',   name: 'Crown Heirs crown', excludes: ['hat'] }
];
const BACKGROUNDS = [
  { id: 'throne',  name: 'Signature throne' },
  { id: 'neutral', name: 'Crown Heirs reveal' }
];
const STATUSES = ['new', 'quoted', 'making', 'ready', 'done', 'cancelled'];
const MAX_QTY = 5;
// Pricing is by quote, per doll; turnaround is set by the salon. Shown on the
// page and in every message, from here.
const TURNAROUND = '4–6 weeks';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => 'DL-' + Array.from({ length: 5 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
const byId = (list, id) => list.find(x => x.id === id);
const lower = n => String(n).toLowerCase().replace(/crown heirs/g, 'Crown Heirs');   // the name keeps its capitals mid-sentence
const clean = (v, max) => String(v || '').trim().slice(0, max);

function options() {
  return { bases: BASES, shades: SHADES, hairColors: HAIR_COLORS, hairStyles: HAIR_STYLES, garmentColors: GARMENT_COLORS,
    tops: TOPS, bottoms: BOTTOMS, shoes: SHOES, accessories: ACCESSORIES, backgrounds: BACKGROUNDS, maxQuantity: MAX_QTY, pricing: 'quote', turnaround: TURNAROUND };
}

// "Red tee", "Pink Crown Heirs hoodie": the garment's name with its colour.
function itemName(list, id, color) {
  const it = byId(list, id); if (!it) return id || '';
  const c = byId(GARMENT_COLORS, color || (it.colors || [])[0]);
  const n = it.name.replace('{c}', c ? c.name.toLowerCase() : '').trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function describe(d) {
  const shade = byId(SHADES, d.shade), hc = byId(HAIR_COLORS, d.hair_color), hs = byId(HAIR_STYLES, d.hair_style);
  const hc2 = d.hair_color2 ? byId(HAIR_COLORS, d.hair_color2) : null;
  const highlights = d.hair_color2 ? ` with ${(hc2 ? hc2.name : d.hair_color2).toLowerCase()} highlights` : '';
  const o = d.outfit || {};
  const style = hs ? hs.name.toLowerCase() : d.hair_style, color = hc ? hc.name : d.hair_color;
  if (o.base) {                                   // built in the Doll Maker
    const base = byId(BASES, o.base);
    const look = [o.top && itemName(TOPS, o.top, o.topColor), o.bottom && itemName(BOTTOMS, o.bottom, o.bottomColor), o.shoes && itemName(SHOES, o.shoes, o.shoesColor)].filter(Boolean);
    const extras = (o.accessories || []).map(a => lower((byId(ACCESSORIES, a) || { name: a }).name));
    return {
      doll: `${shade ? shade.name : d.shade} ${base ? base.name.toLowerCase() : o.base}, ${color.toLowerCase()} ${style}${highlights}`,
      wishes: (look.join(', ') || 'no outfit picked') + (extras.length ? `; with ${extras.join(', ')}` : '')
    };
  }
  // Requests from before the Doll Maker: typed outfit wishes.
  const wishes = [o.top && `top/dress: ${o.top}`, o.bottom && `bottoms: ${o.bottom}`, o.shoes && `shoes: ${o.shoes}`, o.colors && `colours: ${o.colors}`].filter(Boolean).join(', ');
  return {
    doll: `${shade ? shade.name : PAST_SHADES[d.shade] || d.shade} yarn, ${color} ${style}${highlights}`,
    wishes: wishes || 'no outfit wishes'
  };
}

// One garment pick: a real option, and one of its colours (or its default).
function garment(list, id, color, what) {
  if (!id) throw new BookingError(400, `Pick the ${what}`);
  const it = byId(list, String(id)); if (!it) throw new BookingError(400, `Pick the ${what} from the list`);
  if (!it.colors) return { id: it.id, color: null };
  if (color && !it.colors.includes(String(color))) throw new BookingError(400, `That colour isn't offered for the ${what}`);
  return { id: it.id, color: color ? String(color) : it.colors[0] };
}

function lookOf(input) {
  const base = byId(BASES, String(input.base || ''));
  if (!base) throw new BookingError(400, 'Pick a base: girl or boy');
  const top = garment(TOPS, input.top, input.topColor, 'top');
  const bottom = garment(BOTTOMS, input.bottom, input.bottomColor, 'bottoms');
  const shoes = garment(SHOES, input.shoes, input.shoesColor, 'shoes');
  const accessories = [...new Set(Array.isArray(input.accessories) ? input.accessories.map(String) : [])].slice(0, ACCESSORIES.length);
  for (const id of accessories) {
    const a = byId(ACCESSORIES, id);
    if (!a) throw new BookingError(400, 'Pick accessories from the list');
    if (a.available === false) throw new BookingError(400, `The ${lower(a.name)} isn't available yet`);
    if ((a.clashes || []).includes(input.hairStyle)) throw new BookingError(400, `The ${lower(a.name)} can't sit on ${byId(HAIR_STYLES, input.hairStyle).name.toLowerCase()}. Pick another style or leave it off`);
    const both = (a.excludes || []).find(x => accessories.includes(x));
    if (both) throw new BookingError(400, `Pick the ${lower(a.name)} or the ${lower(byId(ACCESSORIES, both).name)}, not both`);
  }
  // The share link that reopens this look on /dolls, for the desk.
  const look = /^[a-z0-9=&,._-]{0,400}$/i.test(String(input.look || '')) ? String(input.look || '') : '';
  return { base: base.id, top: top.id, topColor: top.color, bottom: bottom.id, bottomColor: bottom.color, shoes: shoes.id, shoesColor: shoes.color, accessories, look };
}

function shape(r) {
  const desc = describe(r);
  return {
    code: r.code, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
    client: { name: r.name, phone: r.phone, email: r.email },
    shade: r.shade, hairColor: r.hair_color, hairColor2: r.hair_color2 || null, hairStyle: r.hair_style, quantity: r.quantity, outfit: r.outfit || {},
    notes: r.notes, forWhom: r.for_whom, quote: r.quote, summary: desc.doll, wishes: desc.wishes
  };
}

async function create(input) {
  const name = clean(input.name, 80); if (name.length < 2) throw new BookingError(400, 'Please enter your name');
  const phone = normalizePhone(input.phone);
  const email = clean(input.email, 120).toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BookingError(400, "That email doesn't look right");
  if (!byId(SHADES, input.shade)) throw new BookingError(400, 'Pick a complexion');
  if (!byId(HAIR_COLORS, input.hairColor)) throw new BookingError(400, 'Pick a hair colour');
  const hairColor2 = input.hairColor2 ? String(input.hairColor2) : null;
  if (hairColor2 && !byId(HAIR_COLORS, hairColor2)) throw new BookingError(400, 'Pick the highlight colour (the second hair colour) from the list');
  if (hairColor2 && hairColor2 === input.hairColor) throw new BookingError(400, 'Pick a highlight colour that differs from the main hair colour');
  if (!byId(HAIR_STYLES, input.hairStyle)) throw new BookingError(400, 'Pick a hair style');
  const quantity = Math.max(1, Math.min(MAX_QTY, Number(input.quantity) || 1));
  const outfit = lookOf(input);
  const notes = clean(input.notes, 600), forWhom = clean(input.forWhom, 80);
  let row;
  for (let i = 0; ; i++) {
    try {
      ({ rows: [row] } = await query(
        `INSERT INTO doll_orders (code, name, phone, email, shade, hair_color, hair_color2, hair_style, quantity, outfit, notes, for_whom)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [newCode(), name, phone, email, input.shade, input.hairColor, hairColor2, input.hairStyle, quantity, JSON.stringify(outfit), notes, forWhom]));
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
    notify.sendSms({ to: d.client.phone, body: `${c.salonName}: we have your doll request (${what}). Code ${d.code}. Price is by quote: we'll text you one before anything is made. Turnaround is ${TURNAROUND}. Outfit wishes are considered but can't be promised.` }),
    notify.sendEmail({ to: d.client.email, subject: `Your Crown Heirs doll — ${d.code}`, text: `Hi ${d.client.name},\n\nWe have your request for ${what}.\nOutfit wishes: ${d.wishes}.${d.notes ? '\nNotes: ' + d.notes : ''}\n\nCode ${d.code}. Price is by quote: we'll text you one before anything is made. Turnaround is ${TURNAROUND}. Outfit wishes are considered but can't be promised.\n\n${c.salonName}` }),
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
    quoted:  `your doll (${d.summary}) is quoted at ${d.quote || 'the price we discussed'}. Turnaround is ${TURNAROUND}. Reply or call ${c.salonPhone} to confirm and we'll start.`,
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

module.exports = { options, create, list, lookup, setStatus, describe, itemName, BASES, SHADES, HAIR_COLORS, HAIR_STYLES, GARMENT_COLORS, TOPS, BOTTOMS, SHOES, ACCESSORIES, BACKGROUNDS, STATUSES, MAX_QTY, TURNAROUND };
