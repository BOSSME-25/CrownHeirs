import Link from "next/link";
import { EMPLOYMENT_TYPES, ROLES, WAGE_TYPES } from "@/lib/employees";
import type { Employee } from "@/lib/db/schema";

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function Options({ list }: { list: { value: string; label: string }[] }) {
  return (
    <>
      {list.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </>
  );
}

export default function EmployeeForm({
  action,
  employee,
}: {
  action: (formData: FormData) => void;
  employee?: Employee;
}) {
  const e = employee;
  return (
    <form className="prose" action={action}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="fullName">Full name *</label>
          <input id="fullName" name="fullName" defaultValue={e?.fullName ?? ""} required />
        </div>
        <div className="field">
          <label htmlFor="email">Email (their Google login) *</label>
          <input id="email" name="email" type="email" defaultValue={e?.email ?? ""} required />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" defaultValue={e?.phone ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="jobTitle">Job title</label>
          <input id="jobTitle" name="jobTitle" defaultValue={e?.jobTitle ?? ""} placeholder="Stylist, Receptionist…" />
        </div>
        <div className="field">
          <label htmlFor="employmentType">Employment type</label>
          <select id="employmentType" name="employmentType" defaultValue={e?.employmentType ?? ""}>
            <option value="">—</option>
            <Options list={EMPLOYMENT_TYPES} />
          </select>
        </div>
        <div className="field">
          <label htmlFor="role">Access role</label>
          <select id="role" name="role" defaultValue={e?.role ?? "staff"}>
            <Options list={ROLES} />
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={e?.status ?? "active"}>
            <Options list={STATUSES} />
          </select>
        </div>
        <div className="field">
          <label htmlFor="startDate">Start date</label>
          <input id="startDate" name="startDate" type="date" defaultValue={e?.startDate ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="wage">Pay rate (admins only)</label>
          <input id="wage" name="wage" type="number" step="0.01" defaultValue={e?.wage ?? ""} placeholder="e.g. 22.50" />
        </div>
        <div className="field">
          <label htmlFor="wageType">Pay type</label>
          <select id="wageType" name="wageType" defaultValue={e?.wageType ?? ""}>
            <option value="">—</option>
            <Options list={WAGE_TYPES} />
          </select>
        </div>
        <div className="field">
          <label htmlFor="emergencyContactName">Emergency contact</label>
          <input id="emergencyContactName" name="emergencyContactName" defaultValue={e?.emergencyContactName ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="emergencyContactPhone">Emergency contact phone</label>
          <input id="emergencyContactPhone" name="emergencyContactPhone" defaultValue={e?.emergencyContactPhone ?? ""} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="notes">Notes (admins only)</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={e?.notes ?? ""} />
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button className="btn" type="submit">{e ? "Save changes" : "Add team member"}</button>
        <Link className="btn btn-ghost" href="/team">Cancel</Link>
      </div>
    </form>
  );
}
