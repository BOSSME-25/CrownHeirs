"use client";

import { decideTimeOff } from "@/app/time-off/actions";

export default function TimeOffDecision({ id }: { id: string }) {
  return (
    <div className="decide-row">
      <form action={decideTimeOff.bind(null, id, "approved")} style={{ display: "inline" }}>
        <button className="btn btn-ghost" type="submit">Approve</button>
      </form>
      <form action={decideTimeOff.bind(null, id, "denied")} style={{ display: "inline" }}>
        <button className="btn btn-danger" type="submit">Deny</button>
      </form>
    </div>
  );
}
