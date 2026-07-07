"use client";

import { useTransition } from "react";
import { toggleDuty } from "@/app/schedule/actions";

export default function DutyToggle({
  shiftId,
  dutyId,
  done,
  description,
  canToggle,
}: {
  shiftId: string;
  dutyId: string;
  done: boolean;
  description: string;
  canToggle: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <label className={`duty${done ? " done" : ""}`}>
      <input
        type="checkbox"
        checked={done}
        disabled={!canToggle || pending}
        onChange={() => start(() => toggleDuty(shiftId, dutyId, !done))}
      />
      <span>{description}</span>
    </label>
  );
}
