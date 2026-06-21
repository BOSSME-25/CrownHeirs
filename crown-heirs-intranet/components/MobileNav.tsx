"use client";

import { useState } from "react";
import Link from "next/link";
import { signOutAction } from "@/app/signout-action";

export default function MobileNav({ isAdmin, email }: { isAdmin?: boolean; email?: string | null }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="mobile-nav">
      <button className="hamburger" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
        {open ? "✕" : "☰"}
      </button>
      {open && (
        <div className="mobile-panel" onClick={close}>
          <div className="m-group">Calendar</div>
          <Link href="/calendar">Overview</Link>
          <Link href="/schedule">Schedule</Link>
          <Link href="/time-off">Time Off</Link>

          <div className="m-group">Training</div>
          <Link href="/training">Videos &amp; Courses</Link>
          {isAdmin && <Link href="/training/dashboard">Completion Dashboard</Link>}

          <div className="m-group">Team</div>
          <Link href="/team">Directory</Link>
          <Link href="/notes">Meeting Notes</Link>
          <Link href="/suggestions">Suggestion Box</Link>

          <div className="m-group">Resources</div>
          <Link href="/handbook">Handbook</Link>
          <Link href="/policies">Policies</Link>
          <Link href="/documents">Documents</Link>

          <div className="m-group">You</div>
          <Link href="/me">My Profile</Link>
          {isAdmin && <Link href="/admin">Admin</Link>}
          {email && <div className="m-email">{email}</div>}
          <form action={signOutAction}>
            <button type="submit" className="btn-link" style={{ marginTop: 6 }}>Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
