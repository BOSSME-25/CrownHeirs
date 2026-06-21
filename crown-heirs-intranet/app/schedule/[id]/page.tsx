import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import DutyToggle from "@/components/DutyToggle";
import DutyDeleteButton from "@/components/DutyDeleteButton";
import { addDuty } from "@/app/schedule/actions";
import { dayLabel, formatTime, getDuties, getShiftWithEmployee } from "@/lib/schedule";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shift — Crown Heirs Team Hub" };

export default async function ShiftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const admin = isAdmin(session?.user?.email);
  const myEmail = session?.user?.email?.toLowerCase();

  const { id } = await params;
  const shift = await getShiftWithEmployee(id);
  if (!shift) notFound();

  // Drafts are admin-only.
  if (!shift.published && !admin) redirect("/schedule");

  const duties = await getDuties(id);
  const canToggle = admin || shift.employeeEmail.toLowerCase() === myEmail;
  const { dow, short } = dayLabel(shift.shiftDate);
  const doneCount = duties.filter((d) => d.done).length;

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">
            <Link href={`/schedule?week=${shift.shiftDate}`} style={{ color: "var(--terra)", textDecoration: "none" }}>← Back to schedule</Link>
          </div>
          <h1 className="title">{shift.employeeName}</h1>
          <p className="lede">
            {dow}, {short} · {formatTime(shift.startTime)}–{formatTime(shift.endTime)}
            {shift.position ? ` · ${shift.position}` : ""}
            {!shift.published ? " · Draft" : ""}
          </p>
        </div>

        <div className="prose">
          <h2>Duties {duties.length > 0 && <span className="muted" style={{ fontSize: "0.9rem" }}>({doneCount}/{duties.length} done)</span>}</h2>

          {duties.length === 0 ? (
            <p className="muted">No duties assigned to this shift yet.</p>
          ) : (
            <div className="duty-list">
              {duties.map((d) => (
                <div className="duty-row" key={d.id}>
                  <DutyToggle
                    shiftId={shift.id}
                    dutyId={d.id}
                    done={d.done}
                    description={d.description}
                    canToggle={canToggle}
                  />
                  {admin && <DutyDeleteButton shiftId={shift.id} dutyId={d.id} />}
                </div>
              ))}
            </div>
          )}

          {admin && (
            <form action={addDuty.bind(null, shift.id)} className="duty-add-form">
              <input name="description" placeholder="Add a duty…" required />
              <button className="btn btn-ghost" type="submit">Add</button>
            </form>
          )}

          {!canToggle && duties.length > 0 && (
            <p className="muted" style={{ marginTop: 14 }}>
              Only the person assigned to this shift can check off duties.
            </p>
          )}

          {shift.notes && (
            <>
              <h2>Notes</h2>
              <p>{shift.notes}</p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
