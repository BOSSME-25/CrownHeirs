import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import DutyToggle from "@/components/DutyToggle";
import DutyDeleteButton from "@/components/DutyDeleteButton";
import SwapDecision from "@/components/SwapDecision";
import { addDuty, requestSwap } from "@/app/schedule/actions";
import { activeEmployees, dayLabel, formatTime, getDuties, getShiftWithEmployee } from "@/lib/schedule";
import { pendingSwapForShift } from "@/lib/requests";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shift — Crown Heirs Team Hub" };

export default async function ShiftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const admin = (await getAccess(session?.user?.email)).canApprove;
  const myEmail = session?.user?.email?.toLowerCase();

  const { id } = await params;
  const shift = await getShiftWithEmployee(id);
  if (!shift) notFound();

  // Drafts are admin-only.
  if (!shift.published && !admin) redirect("/schedule");

  const duties = await getDuties(id);
  const canToggle = admin || shift.employeeEmail.toLowerCase() === myEmail;
  const isAssignee = shift.employeeEmail.toLowerCase() === myEmail;
  const { dow, short } = dayLabel(shift.shiftDate);
  const doneCount = duties.filter((d) => d.done).length;

  const pendingSwap = await pendingSwapForShift(id);
  const employees = admin || isAssignee ? await activeEmployees() : [];
  const others = employees.filter((e) => e.id !== shift.employeeId);

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

        {/* Shift swap */}
        <div className="prose" style={{ marginTop: 24 }}>
          <h2>Shift swap</h2>
          {pendingSwap ? (
            <>
              <p>
                <strong>{pendingSwap.requesterName}</strong> requested to hand off this shift
                {pendingSwap.targetName ? <> to <strong>{pendingSwap.targetName}</strong></> : <> (no one chosen yet)</>}.
                {pendingSwap.reason ? <><br />“{pendingSwap.reason}”</> : null}
              </p>
              {admin ? (
                <SwapDecision swapId={pendingSwap.id} employees={others} defaultTarget={pendingSwap.targetEmployeeId} />
              ) : (
                <p className="muted">Pending an admin’s decision.</p>
              )}
            </>
          ) : isAssignee || admin ? (
            <form action={requestSwap.bind(null, shift.id)}>
              <p className="muted" style={{ marginBottom: 12 }}>
                Need someone else to take this shift? Request a swap and an admin will approve it.
              </p>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="targetEmployeeId">Swap to (optional)</label>
                  <select id="targetEmployeeId" name="targetEmployeeId" defaultValue="">
                    <option value="">No preference</option>
                    {others.map((e) => (
                      <option key={e.id} value={e.id}>{e.fullName}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="reason">Reason (optional)</label>
                <input id="reason" name="reason" placeholder="e.g. doctor’s appointment" />
              </div>
              <button className="btn" type="submit">Request swap</button>
            </form>
          ) : (
            <p className="muted">No swap requested for this shift.</p>
          )}
        </div>
      </main>
    </>
  );
}
