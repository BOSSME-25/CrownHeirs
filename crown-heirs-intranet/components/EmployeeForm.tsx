import Link from "next/link";
import PhotoCropField from "@/components/PhotoCropField";
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
  squareTeamMembers,
  locations,
  roleOptions = ROLES,
}: {
  action: (formData: FormData) => void;
  employee?: Employee;
  squareTeamMembers?: { id: string; name: string }[];
  locations?: { id: string; name: string }[];
  roleOptions?: { value: string; label: string }[];
}) {
  const e = employee;
  return (
    <form className="prose" action={action}>
      <PhotoCropField currentUrl={e?.photoUrl} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="fullName">Full name *</label>
          <input id="fullName" name="fullName" defaultValue={e?.fullName ?? ""} required />
        </div>
        <div className="field">
          <label htmlFor="email">Email (their Google login) *</label>
          <input id="email" name="email" type="email" defaultValue={e?.email ?? ""} required spellCheck={false} autoCapitalize="none" />
        </div>
        <div className="field">
          <label htmlFor="personalEmail">Personal email (from import)</label>
          <input id="personalEmail" name="personalEmail" type="email" defaultValue={e?.personalEmail ?? ""} spellCheck={false} autoCapitalize="none" />
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
            <Options list={roleOptions} />
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={e?.status ?? "active"}>
            <Options list={STATUSES} />
          </select>
        </div>
        {locations && locations.length > 0 && (
          <div className="field">
            <label htmlFor="locationId">Home location</label>
            <select id="locationId" name="locationId" defaultValue={e?.locationId ?? ""}>
              <option value="">—</option>
              <Options list={locations.map((l) => ({ value: l.id, label: l.name }))} />
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="startDate">Start date</label>
          <input id="startDate" name="startDate" type="date" defaultValue={e?.startDate ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="birthday">Birthday</label>
          <input id="birthday" name="birthday" type="date" defaultValue={e?.birthday ?? ""} />
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

      {squareTeamMembers && (
        <div className="field">
          <label htmlFor="squareTeamMemberId">Square team member (for personal KPIs)</label>
          {squareTeamMembers.length === 0 ? (
            <input
              id="squareTeamMemberId"
              name="squareTeamMemberId"
              defaultValue={e?.squareTeamMemberId ?? ""}
              placeholder="Square team member ID"
            />
          ) : (
            <select id="squareTeamMemberId" name="squareTeamMemberId" defaultValue={e?.squareTeamMemberId ?? ""}>
              <option value="">— not linked —</option>
              <Options list={squareTeamMembers.map((m) => ({ value: m.id, label: m.name }))} />
            </select>
          )}
        </div>
      )}

      <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.3rem", margin: "8px 0 4px" }}>
        About (shown to the whole team)
      </h2>
      <div className="field">
        <label htmlFor="bio">Short bio</label>
        <textarea id="bio" name="bio" rows={2} defaultValue={e?.bio ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="whyCrownHeirs">Why Crown Heirs?</label>
        <textarea id="whyCrownHeirs" name="whyCrownHeirs" rows={2} defaultValue={e?.whyCrownHeirs ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="fiveYearPlan">Five-year plan / goals</label>
        <textarea id="fiveYearPlan" name="fiveYearPlan" rows={2} defaultValue={e?.fiveYearPlan ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="favoriteAway">Favorite thing to do away from the salon</label>
        <textarea id="favoriteAway" name="favoriteAway" rows={2} defaultValue={e?.favoriteAway ?? ""} />
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button className="btn" type="submit">{e ? "Save changes" : "Add team member"}</button>
        <Link className="btn btn-ghost" href="/team">Cancel</Link>
      </div>
    </form>
  );
}
