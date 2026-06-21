"use client";

import { deleteDuty } from "@/app/schedule/actions";

export default function DutyDeleteButton({ shiftId, dutyId }: { shiftId: string; dutyId: string }) {
  return (
    <form action={deleteDuty.bind(null, shiftId, dutyId)} style={{ display: "inline" }}>
      <button type="submit" className="shift-del" title="Remove duty">×</button>
    </form>
  );
}
