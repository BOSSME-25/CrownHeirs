import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import Avatar from "@/components/Avatar";
import { ensureCalendarToken, updateMyProfile } from "@/app/me/actions";
import { getEmployeeByEmail } from "@/lib/employees";
import { APP_URL } from "@/lib/email";
import { aiConfigured } from "@/lib/ai";
import BioAssist from "@/components/BioAssist";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Profile — Crown Heirs Team Hub" };

export default async function MyProfilePage() {
  const session = await auth();
  const email = session?.user?.email ?? "";
  const aiOn = aiConfigured();

  let me;
  let setupNeeded = false;
  try {
    me = await getEmployeeByEmail(email);
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">My Profile</div>
          <h1 className="title">Edit my profile</h1>
          <p className="lede">Your bio and answers are visible to the whole team — help everyone get to know you.</p>
        </div>

        {setupNeeded ? (
          <div className="notice">The database isn’t set up yet. Ask an admin to finish setup.</div>
        ) : !me ? (
          <div className="notice">You’re not on the team roster yet. Ask an admin to add you under Team.</div>
        ) : (
          <form className="prose" action={updateMyProfile}>
            <div className="field">
              <label htmlFor="photo">Profile photo</label>
              {me.photoUrl && (
                <Avatar name={me.fullName} src={me.photoUrl} size={64} />
              )}
              <input id="photo" name="photo" type="file" accept="image/*" style={{ marginTop: 8 }} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="phone">Phone</label>
                <input id="phone" name="phone" defaultValue={me.phone ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="birthday">Birthday</label>
                <input id="birthday" name="birthday" type="date" defaultValue={me.birthday ?? ""} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="bio">Short bio</label>
              <textarea id="bio" name="bio" rows={2} defaultValue={me.bio ?? ""} spellCheck />
              {aiOn && <BioAssist name={me.fullName} role={me.jobTitle} />}
            </div>
            <div className="field">
              <label htmlFor="whyCrownHeirs">Why Crown Heirs?</label>
              <textarea id="whyCrownHeirs" name="whyCrownHeirs" rows={2} defaultValue={me.whyCrownHeirs ?? ""} spellCheck />
            </div>
            <div className="field">
              <label htmlFor="fiveYearPlan">Five-year plan / goals</label>
              <textarea id="fiveYearPlan" name="fiveYearPlan" rows={2} defaultValue={me.fiveYearPlan ?? ""} spellCheck />
            </div>
            <div className="field">
              <label htmlFor="favoriteAway">Favorite thing to do away from the salon</label>
              <textarea id="favoriteAway" name="favoriteAway" rows={2} defaultValue={me.favoriteAway ?? ""} spellCheck />
            </div>
            <button className="btn" type="submit">Save my profile</button>
          </form>
        )}

        {me && (
          <div className="prose" style={{ marginTop: 24 }}>
            <h2>Sync to your calendar</h2>
            <p className="muted" style={{ marginBottom: 12 }}>
              Subscribe to get your shifts, meetings, and approved time off in Google
              Calendar (or Apple Calendar) — it updates automatically.
            </p>
            {me.calendarToken ? (
              <>
                <p style={{ marginBottom: 8 }}>Your private subscription link:</p>
                <code style={{ display: "block", wordBreak: "break-all", background: "var(--surface-dim)", padding: "10px 12px", borderRadius: "var(--r-s)", fontSize: "0.82rem" }}>
                  {APP_URL}/api/calendar/{me.calendarToken}
                </code>
                <p className="muted" style={{ marginTop: 10 }}>
                  In Google Calendar: <strong>Other calendars → + → From URL</strong>, paste the link, and add.
                  Keep this link private — anyone with it can see your schedule.
                </p>
              </>
            ) : (
              <form action={ensureCalendarToken}>
                <button className="btn btn-ghost" type="submit">Create my calendar link</button>
              </form>
            )}
          </div>
        )}
      </main>
    </>
  );
}
