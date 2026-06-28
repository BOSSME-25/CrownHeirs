import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import CredentialBadge from "@/components/CredentialBadge";
import { getAccess } from "@/lib/perms";
import {
  ensureUniversalCredentials,
  listAllCredentials,
  type CredentialRow,
} from "@/lib/credentials";
import {
  CREDENTIAL_TYPES,
  credentialLabel,
  credentialRenewUrl,
  credentialState,
  prettyDate,
} from "@/lib/credentials-constants";
import {
  assignCredential,
  confirmRenewal,
  removeCredential,
  reviewRenewal,
  setCredentialDates,
  submitRenewal,
} from "@/app/credentials/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Licenses & Certifications — Crown Heirs Team Hub" };

export default async function CredentialsPage() {
  const session = await auth();
  const email = session?.user?.email ?? "";
  const access = await getAccess(email);

  if (!access.canApprove) {
    return (
      <>
        <SiteHeader />
        <main className="wrap">
          <div className="page-head">
            <div className="eyebrow">Licenses &amp; Certifications</div>
            <h1 className="title">Compliance</h1>
          </div>
          <div className="notice">
            This page is for managers and owners. Your own licenses and certifications live on{" "}
            <Link href="/me">My Profile</Link>.
          </div>
        </main>
      </>
    );
  }

  let setupNeeded = false;
  let rows: CredentialRow[] = [];
  try {
    await ensureUniversalCredentials();
    rows = await listAllCredentials();
  } catch {
    setupNeeded = true;
  }

  // Group by employee for the roster view.
  const byEmployee = new Map<string, CredentialRow[]>();
  for (const r of rows) {
    const key = r.c.employeeId;
    if (!byEmployee.has(key)) byEmployee.set(key, []);
    byEmployee.get(key)!.push(r);
  }

  const reviewQueue = rows.filter((r) => r.c.status === "pending_review");
  const confirmQueue = rows.filter((r) => r.c.status === "pending_confirm");

  // Which credential types could still be assigned (i.e. non-universal — cosmetology).
  const assignableTypes = CREDENTIAL_TYPES.filter((t) => !t.universal);

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Licenses &amp; Certifications</div>
          <h1 className="title">Compliance</h1>
          <p className="lede">
            State licensing, Barbicide, First Aid, CPR, and lifesaving certifications for the team.
            Renewals are reviewed by one manager and confirmed by a second — checks and balances.
          </p>
        </div>

        {setupNeeded ? (
          <div className="notice">
            The credentials table isn’t set up yet. Go to <strong>Admin → “Set up / update database”</strong>, then come back.
          </div>
        ) : (
          <>
            {/* Queue 1 — needs first review */}
            {reviewQueue.length > 0 && (
              <section className="card" style={{ cursor: "default", marginBottom: 18, borderLeft: "3px solid var(--gold,#c8a04a)" }}>
                <h3 style={{ marginTop: 0 }}>Uploaded certificates to review ({reviewQueue.length})</h3>
                {reviewQueue.map((r) => (
                  <div key={r.c.id} style={{ borderTop: "1px solid var(--line,#e7ded5)", paddingTop: 12, marginTop: 12 }}>
                    <div style={{ fontWeight: 600 }}>
                      {r.employeeName} — {credentialLabel(r.c.type)}
                    </div>
                    <div className="muted" style={{ fontSize: "0.85rem", margin: "2px 0 8px" }}>
                      New expiration <strong>{prettyDate(r.c.pendingExpiresAt)}</strong>
                      {r.c.pendingIssuedAt ? <> · issued {prettyDate(r.c.pendingIssuedAt)}</> : null}
                      {r.c.pendingSubmittedBy ? <> · submitted by {r.c.pendingSubmittedBy}</> : null}
                      {" · "}
                      <a href={`/api/credentials/file?id=${r.c.id}&which=pending`} target="_blank" rel="noopener noreferrer">
                        View certificate
                      </a>
                    </div>
                    <form action={reviewRenewal} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <input type="hidden" name="credentialId" value={r.c.id} />
                      <input name="note" placeholder="Note (optional, sent if returned)" style={{ minWidth: 200, flex: 1 }} />
                      <button className="btn" type="submit" name="decision" value="approve">Approve → needs 2nd confirm</button>
                      <button className="btn btn-ghost" type="submit" name="decision" value="reject" style={{ color: "var(--terra,#a0624a)" }}>Return</button>
                    </form>
                  </div>
                ))}
              </section>
            )}

            {/* Queue 2 — needs confirmation by a different manager */}
            {confirmQueue.length > 0 && (
              <section className="card" style={{ cursor: "default", marginBottom: 18, borderLeft: "3px solid var(--gold,#c8a04a)" }}>
                <h3 style={{ marginTop: 0 }}>Reviewed — awaiting a second confirmation ({confirmQueue.length})</h3>
                {confirmQueue.map((r) => {
                  const iReviewed = !!r.c.reviewedBy && r.c.reviewedBy.toLowerCase() === email.toLowerCase();
                  return (
                    <div key={r.c.id} style={{ borderTop: "1px solid var(--line,#e7ded5)", paddingTop: 12, marginTop: 12 }}>
                      <div style={{ fontWeight: 600 }}>
                        {r.employeeName} — {credentialLabel(r.c.type)}
                      </div>
                      <div className="muted" style={{ fontSize: "0.85rem", margin: "2px 0 8px" }}>
                        New expiration <strong>{prettyDate(r.c.pendingExpiresAt)}</strong>
                        {r.c.reviewedBy ? <> · reviewed by {r.c.reviewedBy}</> : null}
                        {" · "}
                        <a href={`/api/credentials/file?id=${r.c.id}&which=pending`} target="_blank" rel="noopener noreferrer">
                          View certificate
                        </a>
                      </div>
                      {iReviewed ? (
                        <div className="notice" style={{ padding: "6px 10px", fontSize: "0.83rem" }}>
                          You reviewed this one. For checks and balances, a different manager or owner must confirm it.
                        </div>
                      ) : (
                        <form action={confirmRenewal} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                          <input type="hidden" name="credentialId" value={r.c.id} />
                          <button className="btn" type="submit" name="decision" value="confirm">Confirm</button>
                          <button className="btn btn-ghost" type="submit" name="decision" value="reject" style={{ color: "var(--terra,#a0624a)" }}>Send back for re-review</button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* The roster */}
            {byEmployee.size === 0 ? (
              <div className="notice">
                No active employees with credentials yet. Add team members under <Link href="/team">Team</Link>, then run setup again.
              </div>
            ) : (
              [...byEmployee.entries()].map(([empId, creds]) => {
                const name = creds[0].employeeName;
                const haveTypes = new Set(creds.map((c) => c.c.type));
                const canAdd = assignableTypes.filter((t) => !haveTypes.has(t.id));
                return (
                  <section key={empId} style={{ marginBottom: 26 }}>
                    <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.2rem", margin: "0 0 8px" }}>
                      {name}
                    </h2>
                    {creds.map((r) => {
                      const s = credentialState(r.c);
                      return (
                        <details key={r.c.id} className="card" style={{ cursor: "default", padding: "12px 14px", marginBottom: 8 }}>
                          <summary style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600, flex: 1, minWidth: 160 }}>{credentialLabel(r.c.type)}</span>
                            <CredentialBadge s={s} />
                            <span className="muted" style={{ fontSize: "0.82rem" }}>
                              {r.c.expiresAt ? `Expires ${prettyDate(r.c.expiresAt)}` : "No date on file"}
                            </span>
                          </summary>

                          <div style={{ marginTop: 12, fontSize: "0.86rem" }} className="muted">
                            {r.c.certificatePathname ? (
                              <a href={`/api/credentials/file?id=${r.c.id}&which=current`} target="_blank" rel="noopener noreferrer">View certificate on file</a>
                            ) : (
                              "No certificate on file."
                            )}
                            {r.c.confirmedBy ? <> · confirmed by {r.c.confirmedBy}</> : null}
                            {credentialRenewUrl(r.c.type) ? (
                              <> · <a href={credentialRenewUrl(r.c.type)} target="_blank" rel="noopener noreferrer">Renew site →</a></>
                            ) : null}
                          </div>

                          {/* Record / correct the dates directly (no review needed) */}
                          <form action={setCredentialDates} style={{ marginTop: 12 }}>
                            <input type="hidden" name="credentialId" value={r.c.id} />
                            <div className="form-grid">
                              <div className="field">
                                <label>Issued</label>
                                <input type="date" name="issuedAt" defaultValue={r.c.issuedAt ?? ""} />
                              </div>
                              <div className="field">
                                <label>Expires</label>
                                <input type="date" name="expiresAt" defaultValue={r.c.expiresAt ?? ""} />
                              </div>
                            </div>
                            <div className="field" style={{ marginTop: 8 }}>
                              <label>Certificate (optional)</label>
                              <input type="file" name="file" accept="application/pdf,image/*" />
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                              <button className="btn btn-ghost" type="submit">Save record</button>
                              {!CREDENTIAL_TYPES.find((t) => t.id === r.c.type)?.universal && (
                                <button className="btn-link" formAction={removeCredential} type="submit" style={{ color: "var(--terra,#a0624a)" }}>
                                  Remove credential
                                </button>
                              )}
                            </div>
                          </form>

                          {/* Manager can upload a renewal on the employee's behalf (still goes to review) */}
                          <details style={{ marginTop: 10 }}>
                            <summary className="btn-link" style={{ cursor: "pointer" }}>Upload a renewal for review…</summary>
                            <form action={submitRenewal} style={{ marginTop: 10 }}>
                              <input type="hidden" name="credentialId" value={r.c.id} />
                              <input type="hidden" name="returnTo" value="/credentials" />
                              <div className="field">
                                <label>New expiration</label>
                                <input type="date" name="expiresAt" required />
                              </div>
                              <div className="field" style={{ marginTop: 8 }}>
                                <label>Issued (optional)</label>
                                <input type="date" name="issuedAt" />
                              </div>
                              <div className="field" style={{ marginTop: 8 }}>
                                <label>Certificate</label>
                                <input type="file" name="file" accept="application/pdf,image/*" required />
                              </div>
                              <button className="btn" type="submit" style={{ marginTop: 10 }}>Submit for review</button>
                            </form>
                          </details>
                        </details>
                      );
                    })}

                    {/* Assign cosmetology (or any other non-universal credential) */}
                    {canAdd.length > 0 && (
                      <form action={assignCredential} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                        <input type="hidden" name="employeeId" value={empId} />
                        <select name="type" defaultValue="" required>
                          <option value="" disabled>Add a credential…</option>
                          {canAdd.map((t) => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </select>
                        <button className="btn btn-ghost" type="submit">Add</button>
                      </form>
                    )}
                  </section>
                );
              })
            )}
          </>
        )}
      </main>
    </>
  );
}
