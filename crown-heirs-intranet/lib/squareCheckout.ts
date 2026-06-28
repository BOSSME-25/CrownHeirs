import "server-only";
import { getSquareCreds } from "@/lib/orgConfig";

function base(env: "production" | "sandbox") {
  return env === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
}

// True when Square is set up well enough to accept payments (needs a location).
export async function squareCheckoutAvailable(): Promise<boolean> {
  const creds = await getSquareCreds();
  return !!(creds && creds.locationId);
}

// Creates a Square-hosted payment link for a one-off amount. Returns null if
// Square isn't configured or the request fails (caller falls back gracefully).
export async function createPaymentLink(opts: {
  amountCents: number;
  name: string;
  buyerEmail?: string | null;
  redirectUrl: string;
}): Promise<{ url: string; orderId: string | null; linkId: string | null } | null> {
  const creds = await getSquareCreds();
  if (!creds || !creds.locationId || opts.amountCents <= 0) return null;
  try {
    const res = await fetch(base(creds.env) + "/v2/online-checkout/payment-links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Square-Version": "2024-10-17",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        quick_pay: {
          name: opts.name,
          price_money: { amount: opts.amountCents, currency: "USD" },
          location_id: creds.locationId,
        },
        checkout_options: { redirect_url: opts.redirectUrl },
        ...(opts.buyerEmail ? { pre_populated_data: { buyer_email: opts.buyerEmail } } : {}),
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { payment_link?: { url?: string; order_id?: string; id?: string } };
    const pl = data.payment_link;
    if (!pl?.url) return null;
    return { url: pl.url, orderId: pl.order_id ?? null, linkId: pl.id ?? null };
  } catch {
    return null;
  }
}

// Checks whether a Square order has been paid (used on the post-checkout return).
export async function isSquareOrderPaid(orderId: string): Promise<boolean> {
  const creds = await getSquareCreds();
  if (!creds) return false;
  try {
    const res = await fetch(base(creds.env) + `/v2/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${creds.token}`, "Square-Version": "2024-10-17" },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      order?: { state?: string; tenders?: unknown[]; net_amount_due_money?: { amount?: number } };
    };
    const o = data.order;
    if (!o) return false;
    if (o.state === "COMPLETED") return true;
    const due = o.net_amount_due_money?.amount;
    if (Array.isArray(o.tenders) && o.tenders.length > 0 && (due == null || due === 0)) return true;
    return false;
  } catch {
    return false;
  }
}
