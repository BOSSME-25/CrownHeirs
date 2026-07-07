"use client";

import { useState } from "react";
import { addNote } from "@/app/notes/actions";

export default function AddNoteForm({ employees }: { employees: { id: string; fullName: string }[] }) {
  const [kind, setKind] = useState("team");

  return (
    <form className="prose" action={addNote} style={{ marginBottom: 28 }}>
      <h2>Add meeting notes</h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="kind">Type</label>
          <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="team">Team meeting (everyone can see)</option>
            <option value="one_on_one">1:1 (private to that employee + management)</option>
          </select>
        </div>
        {kind === "one_on_one" && (
          <div className="field">
            <label htmlFor="employeeId">Employee</label>
            <select id="employeeId" name="employeeId" defaultValue="">
              <option value="">Choose…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.fullName}</option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" required placeholder="e.g. August all-staff meeting" />
        </div>
        <div className="field">
          <label htmlFor="meetingDate">Date</label>
          <input id="meetingDate" name="meetingDate" type="date" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="body">Notes</label>
        <textarea id="body" name="body" rows={5} placeholder="Type the notes here…" />
      </div>
      <div className="field">
        <label htmlFor="file">Attach a file (optional, max 25 MB)</label>
        <input id="file" name="file" type="file" />
      </div>
      <button className="btn" type="submit">Save notes</button>
    </form>
  );
}
