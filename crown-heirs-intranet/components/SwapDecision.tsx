"use client";

import { decideSwap } from "@/app/schedule/actions";

export default function SwapDecision({
  swapId,
  employees,
  defaultTarget,
}: {
  swapId: string;
  employees: { id: string; fullName: string }[];
  defaultTarget: string | null;
}) {
  return (
    <form className="swap-decide">
      <select name="targetEmployeeId" defaultValue={defaultTarget ?? ""}>
        <option value="">Assign to…</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.fullName}</option>
        ))}
      </select>
      <button className="btn btn-ghost" formAction={decideSwap.bind(null, swapId, true)}>
        Approve &amp; assign
      </button>
      <button className="btn btn-danger" formAction={decideSwap.bind(null, swapId, false)}>
        Deny
      </button>
    </form>
  );
}
