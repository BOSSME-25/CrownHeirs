# Crown Heirs Team Hub — Roadmap / Backlog

Running list of features. Not in priority order.

## Still needs your authorization / external setup

### Email notifications
- Auto-emails: schedule published, time-off/swap decisions, new required
  training, new message, etc. Send via Google Workspace / Gmail or a service
  like Resend. **Needs an email API key / sender setup.**

### Google Calendar sync
- Published shifts (and meetings) appear in staff Google Calendars.
- **Needs Google Calendar API access / scopes.** (Virtual meeting *links* are
  already supported by pasting a Meet/Zoom URL on an event.)

### KPI dashboard
- Metrics/KPI dashboard for the business.
- **Likely needs Square integration** (sales, services, tips). Needs Square
  API authorization + scoping which KPIs matter.

## Nice-to-have / later
- Messaging: group channels (current build is 1:1 direct messages).
- Auto-generate Google Meet links for meetings (vs. pasting a link).
- Real-time message delivery + push notifications (current is refresh-based).

## Done
- Auth (Google, org-locked), roles (admin vs staff)
- Knowledge base: handbook, policies, documents (Vercel Blob uploads)
- Team roster + profile photos + birthdays
- **Social "about me" profiles** (bio, why Crown Heirs, 5-year plan, favorite
  away) — visible to all staff; self-editable via My Profile
- Scheduling: weekly shifts, duties checklist, publish, swaps
- Time off: staff requests + admin approve/deny + admin-entered
- Training: YouTube videos, sections, assessments/quizzes, watch tracking,
  required + due dates, **role-specific required training**, completion
  dashboard, printable certificates
- Calendar: meetings + birthdays + **who's off**; **virtual meeting links**;
  dashboard meeting banner
- **Meeting notes**: team notes (all) + confidential 1:1 notes
- **Suggestion box** (with anonymous option)
- **1:1 team messaging** with unread badges
- **Mobile navigation menu**
- Grouped dropdown navigation
