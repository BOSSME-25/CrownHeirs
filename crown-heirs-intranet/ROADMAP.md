# Crown Heirs Team Hub — Roadmap / Backlog

Running list of features to build later. Not in priority order.

## Requested (not yet built)

### Team profiles — "About me"
- Add personal/get-to-know-you fields to each team member's profile:
  - Five-year plan / goals
  - Why Crown Heirs
  - Favorite thing to do away from the salon
  - (room for more "about" fields over time)
- **Visible to all team members, not just admins**, so the team can get to
  know one another. (Today profiles are roster-style and pay/notes are
  admin-only; this adds a shared, social profile view.)

### Role-specific required training
- Required videos should display **"Required"** and **for whom**.
- Some training is **role-specific** (e.g. stylists vs. front desk), so
  required-training should be assignable by role (and/or by individual),
  not only org-wide.
- Completion dashboard + "My required training" should respect role scoping.

### KPI dashboard
- A metrics/KPI dashboard for the business.
- **Likely needs Square integration** (sales, services, tips, etc.).
- Will need to scope which KPIs matter and Square API/auth setup.

### Team communication
- **Messaging between team members** — direct (1:1) and likely group/channels.
- **Virtual meetings** — ability to hold a video meeting. Easiest path is
  generating a **Google Meet** link (ties into the calendar Meetings feature)
  rather than building video from scratch.

### Meeting notes
- Upload/store **team meeting notes** (from all-staff meetings).
- Store **1:1 meeting notes** between management and an individual employee.
  - These are sensitive: visible only to **management + that employee**,
    not the whole team.

### Virtual suggestion box
- A place for staff to submit suggestions to management.
- Consider an **anonymous** submission option.

## Earlier ideas still open
- **Google Calendar sync** — published shifts appear in staff Google Calendars.
- **Email notifications** — schedule published, time-off/swap decisions, etc.
  (send via Google Workspace / Gmail).
- **Mobile navigation menu** — the grouped dropdown nav is desktop-only right
  now; add a phone-friendly menu since staff are mostly on mobile.

## Done (for reference)
- Auth (Google, org-locked), roles (admin vs staff)
- Knowledge base: handbook, policies, documents (Vercel Blob uploads)
- Team roster + profile photos + birthdays
- Scheduling: weekly shifts, duties checklist, publish, swaps
- Time off: staff requests + admin approve/deny + admin-entered
- Training: YouTube videos, sections, assessments/quizzes, watch tracking,
  required + due dates, completion dashboard, printable certificates
- Calendar: meetings + birthdays + who's off; dashboard meeting banner
- Grouped dropdown navigation
