import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import PhotoCropField from "@/components/PhotoCropField";
import CredentialBadge from "@/components/CredentialBadge";
import { ensureCalendarToken, updateMyProfile } from "@/app/me/actions";
import { submitRenewal } from "@/app/credentials/actions";
import { getEmployeeByEmail } from "@/lib/employees";
import { listCredentialsFor } from "@/lib/credentials";
import { credentialLabel, credentialState, prettyDate } from "@/lib/credentials-constants";
import { APP_URL } from "@/lib/email";
import { aiConfigured } from "@/lib/ai";
import BioAssist from "@/components/BioAssist";
import type { Credential } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Profile — Crown Heirs Team Hub" };

export default async function MyProfilePage() {
  const session = await auth();
  const email = session?.user?.email ?? "";
  const aiOn = aiConfigured();

  let me;
  let setupNeeded = false;
  let creds: Credential[] = [];
  try {
    me = await getEmployeeByEmail(email);
    if (me) {
      try {
        creds = await listCredentialsFor(me.id);
      } catch {
        // credentials table not set up yet — skip the section
      }
    }
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
            <PhotoCropField currentUrl={me.photoUrl} />
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
              {aiOn && <BioAssist field="why" fieldId="whyCrownHeirs" name={me.fullName} role={me.jobTitle} promptText="A few words on why you love it here (optional):" />}
            </div>
            <div className="field">
              <label htmlFor="fiveYearPlan">Five-year plan / goals</label>
              <textarea id="fiveYearPlan" name="fiveYearPlan" rows={2} defaultValue={me.fiveYearPlan ?? ""} spellCheck />
              {aiOn && <BioAssist field="plan" fieldId="fiveYearPlan" name={me.fullName} role={me.jobTitle} promptText="A few words on your goals (optional):" />}
            </div>
            <div className="field">
              <label htmlFor="favoriteAway">Favorite thing to do away from the salon</label>
              <textarea id="favoriteAway" name="favoriteAway" rows={2} defaultValue={me.favoriteAway ?? ""} spellCheck />
              {aiOn && <BioAssist field="away" fieldId="favoriteAway" name={me.fullName} role={me.jobTitle} promptText="A few words on what you love doing (optional):" />}
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

        {me && creds.length > 0 && (
          <div className="prose" style={{ marginTop: 24 }}>
            <h2>Licenses &amp; Certifications</h2>
            <p className="muted" style={{ marginBottom: 12 }}>
              Keep these current. We’ll remind you starting 90 days before each one is due.
              Upload your renewed certificate here — a manager reviews it, and a second
              manager confirms it before it’s marked complete.
            </p>
            {creds.map((c) => {
              const s = credentialState({ status: c.status, expiresAt: c.expiresAt });
              const pending = c.status === "pending_review" || c.status === "pending_confirm";
              return (
                <div key={c.id} className="card" style={{ cursor: "default", padding: "12px 14px", marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, flex: 1, minWidth: 160 }}>{credentialLabel(c.type)}</span>
                    <CredentialBadge s={s} />
                    <span className="muted" style={{ fontSize: "0.82rem" }}>
                      {c.expiresAt ? `Expires ${prettyDate(c.expiresAt)}` : "No date on file"}
                    </span>
                  </div>
                  {c.certificatePathname && (
                    <div style={{ marginTop: 6 }}>
                      <a href={`/api/credentials/file?id=${c.id}&which=current`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.85rem" }}>
                        View certificate on file
                      </a>
                    </div>
                  )}
                  {pending ? (
                    <p className="muted" style={{ fontSize: "0.85rem", marginTop: 10, marginBottom: 0 }}>
                      {c.status === "pending_review"
                        ? "Your uploaded certificate is waiting for a manager to review."
                        : "Reviewed — waiting for a second manager to confirm. Almost there!"}
                    </p>
                  ) : (
                    <details style={{ marginTop: 10 }}>
                      <summary className="btn btn-ghost" style={{ display: "inline-block" }}>
                        {s.key === "current" ? "Upload an updated certificate…" : "Upload my renewed certificate…"}
                      </summary>
                      <form action={submitRenewal} style={{ marginTop: 12 }}>
                        <input type="hidden" name="credentialId" value={c.id} />
                        <input type="hidden" name="returnTo" value="/me" />
                        <div className="form-grid">
                          <div className="field">
                            <label>New expiration date</label>
                            <input type="date" name="expiresAt" required />
                          </div>
                          <div className="field">
                            <label>Issued (optional)</label>
                            <input type="date" name="issuedAt" />
                          </div>
                        </div>
                        <div className="field" style={{ marginTop: 8 }}>
                          <label>Certificate (PDF or photo)</label>
                          <input type="file" name="file" accept="application/pdf,image/*" required />
                        </div>
                        <button className="btn" type="submit" style={{ marginTop: 10 }}>Submit for review</button>
                      </form>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
