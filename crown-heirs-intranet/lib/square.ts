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
  team_member_id?: string;
  customer_id?: string;
};

async function fetchPayments(
  beginTimeISO: string,
  revalidateSeconds = 0,
): Promise<SquarePayment[]> {
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
      ...(revalidateSeconds > 0 ? { next: { revalidate: revalidateSeconds } } : { cache: "no-store" }),
    });
    if (!res.ok) throw new Error(`Square API error ${res.status}`);
    const data = (await res.json()) as { payments?: SquarePayment[]; cursor?: string };
    out.push(...(data.payments ?? []));
    cursor = data.cursor;
  } while (cursor);

  return out;
}

export type SquareTeamMember = { id: string; name: string };

// Lists active Square team members so an admin can map them to employees.
export async function listTeamMembers(): Promise<SquareTeamMember[]> {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch(BASE + "/v2/team-members/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Square-Version": "2024-10-17",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { filter: { status: "ACTIVE" } }, limit: 200 }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      team_members?: { id: string; given_name?: string; family_name?: string }[];
    };
    return (data.team_members ?? []).map((m) => ({
      id: m.id,
      name: [m.given_name, m.family_name].filter(Boolean).join(" ") || m.id,
    }));
  } catch {
    return [];
  }
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

// ── Per-employee KPIs ──

export type EmployeeKpi = {
  label: string;
  tips: number;
  clients: number;
  /** Repeat-client rate (0–1), or null when no identified clients. */
  retention: number | null;
};

function dayOf(iso: string) {
  return iso.slice(0, 10);
}

export async function getEmployeeKpis(
  teamMemberId: string,
): Promise<
  | { configured: false }
  | { configured: true; periods: EmployeeKpi[] }
  | { configured: true; error: string }
> {
  if (!process.env.SQUARE_ACCESS_TOKEN) return { configured: false };
  try {
    const now = new Date();
    const begin90 = new Date(now);
    begin90.setDate(begin90.getDate() - 90);
    // Cached for 15 min — this is read on every staffer's dashboard.
    const all = await fetchPayments(begin90.toISOString(), 900);
    const mine = all.filter(
      (p) => p.status === "COMPLETED" && p.team_member_id === teamMemberId,
    );

    // How many distinct days each identified client visited (over 90 days),
    // used to decide who is a "returning" client.
    const visitDays = new Map<string, Set<string>>();
    for (const p of mine) {
      if (!p.customer_id || !p.created_at) continue;
      const set = visitDays.get(p.customer_id) ?? new Set<string>();
      set.add(dayOf(p.created_at));
      visitDays.set(p.customer_id, set);
    }

    function periodKpi(label: string, days: number): EmployeeKpi {
      const since = new Date(now);
      since.setDate(since.getDate() - days);
      const sinceISO = since.toISOString();
      let tipCents = 0;
      const clients = new Set<string>();
      let returning = 0;
      for (const p of mine) {
        if (!p.created_at || p.created_at < sinceISO) continue;
        tipCents += p.tip_money?.amount ?? 0;
        if (p.customer_id && !clients.has(p.customer_id)) {
          clients.add(p.customer_id);
          if ((visitDays.get(p.customer_id)?.size ?? 0) >= 2) returning += 1;
        }
      }
      return {
        label,
        tips: tipCents / 100,
        clients: clients.size,
        retention: clients.size ? returning / clients.size : null,
      };
    }

    return {
      configured: true,
      periods: [
        periodKpi("Last 7 days", 7),
        periodKpi("Last 30 days", 30),
        periodKpi("Last 90 days", 90),
      ],
    };
  } catch (err) {
    return { configured: true, error: err instanceof Error ? err.message : "Square request failed" };
  }
}
