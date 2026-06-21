import "server-only";

const BASE =
  process.env.SQUARE_ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";

type SquarePayment = {
  status?: string;
  created_at?: string;
  amount_money?: { amount?: number };
  tip_money?: { amount?: number };
};

async function fetchPayments(beginTimeISO: string): Promise<SquarePayment[]> {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  const location = process.env.SQUARE_LOCATION_ID;
  const out: SquarePayment[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(BASE + "/v2/payments");
    url.searchParams.set("begin_time", beginTimeISO);
    url.searchParams.set("limit", "100");
    if (location) url.searchParams.set("location_id", location);
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "Square-Version": "2024-10-17" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Square API error ${res.status}`);
    const data = (await res.json()) as { payments?: SquarePayment[]; cursor?: string };
    out.push(...(data.payments ?? []));
    cursor = data.cursor;
  } while (cursor);

  return out;
}

export type Kpi = { label: string; sales: number; tips: number; count: number; avg: number };

function sumSince(payments: SquarePayment[], sinceISO: string): Kpi {
  let salesCents = 0;
  let tipCents = 0;
  let count = 0;
  for (const p of payments) {
    if (p.status !== "COMPLETED") continue;
    if (!p.created_at || p.created_at < sinceISO) continue;
    salesCents += p.amount_money?.amount ?? 0;
    tipCents += p.tip_money?.amount ?? 0;
    count += 1;
  }
  const sales = salesCents / 100;
  return { label: "", sales, tips: tipCents / 100, count, avg: count ? sales / count : 0 };
}

export async function getKpis(): Promise<
  { configured: false } | { configured: true; periods: Kpi[] } | { configured: true; error: string }
> {
  if (!process.env.SQUARE_ACCESS_TOKEN) return { configured: false };
  try {
    const now = new Date();
    const begin30 = new Date(now);
    begin30.setDate(begin30.getDate() - 30);
    const payments = await fetchPayments(begin30.toISOString());

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const begin7 = new Date(now);
    begin7.setDate(begin7.getDate() - 7);

    return {
      configured: true,
      periods: [
        { ...sumSince(payments, startOfToday.toISOString()), label: "Today" },
        { ...sumSince(payments, begin7.toISOString()), label: "Last 7 days" },
        { ...sumSince(payments, begin30.toISOString()), label: "Last 30 days" },
      ],
    };
  } catch (err) {
    return { configured: true, error: err instanceof Error ? err.message : "Square request failed" };
  }
}
