"use client";

import { deleteMeeting } from "@/app/calendar/actions";

export default function DeleteMeetingButton({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deleteMeeting.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm(`Delete “${title}”?`)) e.preventDefault();
      }}
      style={{ display: "inline" }}
    >
      <button type="submit" className="shift-del" title="Delete meeting">×</button>
    </form>
  );
}
