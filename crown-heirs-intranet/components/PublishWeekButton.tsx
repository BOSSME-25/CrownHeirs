"use client";

import { publishWeek } from "@/app/schedule/actions";

export default function PublishWeekButton({ weekStart }: { weekStart: string }) {
  return (
    <form
      action={publishWeek.bind(null, weekStart)}
      onSubmit={(e) => {
        if (!confirm("Publish this week? Staff will be able to see all shifts.")) e.preventDefault();
      }}
    >
      <button type="submit" className="btn btn-ghost">Publish week</button>
    </form>
  );
}
