"use client";

import { deleteShift } from "@/app/schedule/actions";

export default function DeleteShiftButton({ id }: { id: string }) {
  return (
    <form
      action={deleteShift.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm("Delete this shift?")) e.preventDefault();
      }}
      style={{ display: "inline" }}
    >
      <button type="submit" className="shift-del" title="Delete shift">×</button>
    </form>
  );
}
