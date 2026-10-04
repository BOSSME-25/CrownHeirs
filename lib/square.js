// Square: payment links for deposits, and the Terminal at the till.
//
// Configured with SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID (SQUARE_ENV
// 'sandbox' or 'production', default production). Without them, no link
// is made and the desk collects deposits by hand (Square terminal, cash, or
// a link sent from Square), marking them paid on the appointment; and the
// till records card payments by hand instead of pushing them to a Terminal.
//
//   createPaymentLink({ amountCents, name, note, reference, redirectUrl })
//     → { url, orderId, id }           Square Checkout API: POST /v2/online-checkout/payment-links
//   orderPaid(orderId) → true | false | null (unknown / not configured)
let _fetch = (...a) => fetch(...a);

function cfg() {
  const env = process.env.SQUARE_ENV === 'sandbox' ? 'sandbox' : 'production';
  return {
    token: process.env.SQUARE_ACCESS_TOKEN || '', location: process.env.SQUARE_LOCATION_ID || '',
    base: env === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com'
  };
}
const configured = () => { const c = cfg(); return Boolean(c.token && c.location); };

async function api(path, { method = 'GET', body } = {}) {
  const c = cfg();
  const r = await _fetch(c.base + path, {
    method, headers: { 'Authorization': 'Bearer ' + c.token, 'Content-Type': 'application/json', 'Square-Version': '2025-01-23' },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Square ${r.status}: ${(j.errors || []).map(e => e.detail || e.code).join('; ') || 'request failed'}`);
  return j;
}

async function createPaymentLink({ amountCents, name, note = '', reference, redirectUrl }) {
  if (!configured()) return null;
  const c = cfg();
  const j = await api('/v2/online-checkout/payment-links', { method: 'POST', body: {
    idempotency_key: `dep-${reference}-${amountCents}`,
    quick_pay: { name: String(name).slice(0, 255), price_money: { amount: Math.round(amountCents), currency: 'USD' }, location_id: c.location },
    payment_note: String(note).slice(0, 500),
    checkout_options: redirectUrl ? { redirect_url: redirectUrl } : undefined,
    pre_populated_data: undefined
  } });
  const pl = j.payment_link || {};
  return { url: pl.url || pl.long_url || null, orderId: pl.order_id || null, id: pl.id || null };
}

// Has the order behind a payment link been paid? Square marks a paid order
// state COMPLETED (quick pay orders complete on payment).
async function orderPaid(orderId) {
  if (!configured() || !orderId) return null;
  const j = await api('/v2/orders/' + encodeURIComponent(orderId));
  const o = j.order || {};
  const paid = (o.tenders || []).some(t => t.amount_money && t.amount_money.amount > 0) || o.state === 'COMPLETED';
  return Boolean(paid);
}

// ── Square Terminal (card present, at the till) ──────────────────────────
// Pairing: a device code is created here, typed into the Terminal
// (Settings → Terminal API), and polled until PAIRED; the device id is kept
// in settings. A checkout is then pushed to that device for the amount due;
// the Terminal takes the card (and the tip, on its own screen) and the
// checkout reports COMPLETED with a payment id, which the ticket records.

async function createDeviceCode({ name = 'Crown Heirs till' } = {}) {
  const c = cfg();
  const j = await api('/v2/devices/codes', { method: 'POST', body: {
    idempotency_key: 'dc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    device_code: { name: String(name).slice(0, 128), product_type: 'TERMINAL_API', location_id: c.location }
  } });
  const d = j.device_code || {};
  return { id: d.id, code: d.code, status: d.status, name: d.name, deviceId: d.device_id || null };
}

async function getDeviceCode(id) {
  const j = await api('/v2/devices/codes/' + encodeURIComponent(id));
  const d = j.device_code || {};
  return { id: d.id, code: d.code, status: d.status, name: d.name, deviceId: d.device_id || null };
}

// Terminals already paired to the account (Devices API).
async function listDevices() {
  const j = await api('/v2/devices?limit=100');
  return (j.devices || []).map(d => ({
    id: d.id, name: (d.attributes && d.attributes.name) || d.name || d.id,
    model: (d.attributes && (d.attributes.model || d.attributes.type)) || '',
    status: (d.status && d.status.category) || ''
  }));
}

async function createTerminalCheckout({ amountCents, deviceId, reference, note = '', allowTipping = true }) {
  const j = await api('/v2/terminals/checkouts', { method: 'POST', body: {
    idempotency_key: `tc-${reference}-${Date.now()}`,
    checkout: {
      amount_money: { amount: Math.round(amountCents), currency: 'USD' },
      reference_id: String(reference).slice(0, 40),
      note: String(note).slice(0, 250),
      device_options: {
        device_id: deviceId, skip_receipt_screen: false, collect_signature: false,
        tip_settings: { allow_tipping: Boolean(allowTipping), separate_tip_screen: true, custom_tip_field: true }
      },
      payment_type: 'CARD_PRESENT',
      deadline_duration: 'PT10M'
    }
  } });
  return shapeCheckout(j.checkout || {});
}

function shapeCheckout(ch) {
  return {
    id: ch.id, status: ch.status, paymentIds: ch.payment_ids || [],
    amountCents: ch.amount_money ? ch.amount_money.amount : null,
    cancelReason: ch.cancel_reason || null, deviceId: ch.device_options && ch.device_options.device_id
  };
}

async function getTerminalCheckout(id) {
  const j = await api('/v2/terminals/checkouts/' + encodeURIComponent(id));
  return shapeCheckout(j.checkout || {});
}

async function cancelTerminalCheckout(id) {
  const j = await api('/v2/terminals/checkouts/' + encodeURIComponent(id) + '/cancel', { method: 'POST', body: {} });
  return shapeCheckout(j.checkout || {});
}

async function getPayment(id) {
  const j = await api('/v2/payments/' + encodeURIComponent(id));
  const p = j.payment || {};
  const card = (p.card_details && p.card_details.card) || {};
  return {
    id: p.id, status: p.status,
    amountCents: p.amount_money ? p.amount_money.amount : 0,
    tipCents: p.tip_money ? p.tip_money.amount : 0,
    totalCents: p.total_money ? p.total_money.amount : 0,
    card: card.card_brand ? `${card.card_brand} ${card.last_4 || ''}`.trim() : '',
    receiptNumber: p.receipt_number || '', receiptUrl: p.receipt_url || ''
  };
}

module.exports = {
  configured, createPaymentLink, orderPaid,
  createDeviceCode, getDeviceCode, listDevices, createTerminalCheckout, getTerminalCheckout, cancelTerminalCheckout, getPayment,
  _setFetch: f => { _fetch = f; }
};
