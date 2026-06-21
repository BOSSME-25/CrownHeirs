import { buildIcs, getEmployeeByCalendarToken } from "@/lib/ical";

// Public (token-protected) iCal feed for subscribing in Google Calendar.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return new Response("Not found", { status: 404 });

  const employee = await getEmployeeByCalendarToken(token);
  if (!employee) return new Response("Not found", { status: 404 });

  const ics = await buildIcs(employee.id, employee.fullName);
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
