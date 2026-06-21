import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import ShiftForm from "@/components/ShiftForm";
import { createShift } from "@/app/schedule/actions";
import { activeEmployees } from "@/lib/schedule";

export const metadata = { title: "Add shift — Crown Heirs Team Hub" };

export default async function NewShiftPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) redirect("/schedule");

  const { date } = await searchParams;
  const employees = await activeEmployees();
  const backHref = date ? `/schedule?week=${date}` : "/schedule";

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Schedule</div>
          <h1 className="title">Add a shift</h1>
        </div>
        {employees.length === 0 ? (
          <div className="notice">Add team members first (Team → Add team member), then assign shifts.</div>
        ) : (
          <ShiftForm action={createShift} employees={employees} defaultDate={date} backHref={backHref} />
        )}
      </main>
    </>
  );
}
