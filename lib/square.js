// Square payment links for deposits.
//
// Configured with SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID (SQUARE_ENV
// 'sandbox' or 'production', default production). Without them, no link
// is made and the desk collects deposits by hand (Square terminal, cash, or
// a link sent from Square), marking them paid on the appointment.
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

module.exports = { configured, createPaymentLink, orderPaid, _setFetch: f => { _fetch = f; } };
