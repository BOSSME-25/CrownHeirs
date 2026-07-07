import Link from "next/link";
import type { Shift } from "@/lib/db/schema";

export default function ShiftForm({
  action,
  employees,
  shift,
  defaultDate,
  backHref,
  showDuties,
}: {
  action: (formData: FormData) => void;
  employees: { id: string; fullName: string }[];
  shift?: Shift;
  defaultDate?: string;
  backHref: string;
  showDuties?: boolean;
}) {
  const s = shift;
  return (
    <form className="prose" action={action}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="employeeId">Team member *</label>
          <select id="employeeId" name="employeeId" defaultValue={s?.employeeId ?? ""} required>
            <option value="">Choose…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.fullName}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="shiftDate">Date *</label>
          <input id="shiftDate" name="shiftDate" type="date" required defaultValue={s?.shiftDate ?? defaultDate ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="startTime">Start *</label>
          <input id="startTime" name="startTime" type="time" required defaultValue={s?.startTime ?? "09:00"} />
        </div>
        <div className="field">
          <label htmlFor="endTime">End *</label>
          <input id="endTime" name="endTime" type="time" required defaultValue={s?.endTime ?? "17:00"} />
        </div>
        <div className="field">
          <label htmlFor="position">Position / station</label>
          <input id="position" name="position" defaultValue={s?.position ?? ""} placeholder="Front desk, Color, Cuts…" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={2} defaultValue={s?.notes ?? ""} />
      </div>
      {showDuties && (
        <div className="field">
          <label htmlFor="duties">Duties (one per line, optional)</label>
          <textarea id="duties" name="duties" rows={4} placeholder={"Open register\nRestock towels\nSweep stations"} />
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button className="btn" type="submit">{s ? "Save shift" : "Add shift"}</button>
        <Link className="btn btn-ghost" href={backHref}>Cancel</Link>
      </div>
    </form>
  );
}
