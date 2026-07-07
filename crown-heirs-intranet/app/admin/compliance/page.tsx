import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import StatusPill from "@/components/StatusPill";
import { getAccess } from "@/lib/perms";
import {
  CADENCES,
  cadenceLabel,
  complianceState,
  COMPLIANCE_LEVELS,
  evidenceFor,
  levelLabel,
  listAttestations,
  listComplianceItems,
  prettyDate,
  type AttestationSnapshot,
} from "@/lib/compliance";
import type { ComplianceAttestation, ComplianceItem, ComplianceEvidence } from "@/lib/db/schema";
import {
  addComplianceItem,
  addEvidence,
  attestCompliance,
  decideAttestation,
  deleteComplianceItem,
  removeEvidence,
  setComplianceStatus,
  updateComplianceItem,
} from "@/app/admin/compliance/actions";

function fmtWhen(d: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function countsLine(snap: AttestationSnapshot | null) {
  if (!snap?.counts) return "";
  const c = snap.counts;
  const need = c.attention + c.overdue + c.due;
  return `${c.total} items · ${c.compliant} compliant · ${need} need attention · ${c.na} N/A`;
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Compliance Center — Crown Heirs Team Hub" };

function LevelSelect({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue ?? "federal"}>
      {COMPLIANCE_LEVELS.map((l) => (
        <option key={l.id} value={l.id}>{l.label}</option>
      ))}
    </select>
  );
}
function CadenceSelect({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue ?? "annual"}>
      {CADENCES.map((c) => (
        <option key={c.id} value={c.id}>{c.label}</option>
      ))}
    </select>
  );
}

export default async function CompliancePage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canManageTeam) {
    return (
      <>
        <SiteHeader />
        <main className="wrap">
          <div className="page-head">
            <div className="eyebrow">Admin</div>
            <h1 className="title">Compliance Center</h1>
          </div>
          <div className="notice">This area is for directors and owners.</div>
        </main>
      </>
    );
  }

  const email = session?.user?.email ?? "";
  let setupNeeded = false;
  let items: ComplianceItem[] = [];
  let evidence = new Map<string, ComplianceEvidence[]>();
  let attestations: ComplianceAttestation[] = [];
  try {
    items = await listComplianceItems();
    evidence = await evidenceFor(items.map((i) => i.id));
    attestations = await listAttestations();
  } catch {
    setupNeeded = true;
  }
  const pendingAttestation = attestations.find((a) => a.attestedAt && !a.confirmedAt);
  const confirmedAttestations = attestations.filter((a) => a.confirmedAt);

  const states = items.map((i) => ({ item: i, s: complianceState({ status: i.status, dueAt: i.dueAt }) }));
  const attention = states.filter((x) => x.s.attention).length;
  const compliant = states.filter((x) => x.s.key === "compliant").length;
  const toVerify = items.filter((i) => i.needsVerification).length;

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Admin</div>
          <h1 className="title">Compliance Center</h1>
          <p className="lede">
            Track employer and Board obligations by level, attach evidence, and keep each one reviewed.
            Every change is written to the audit log.
          </p>
        </div>

        <div className="notice" style={{ marginBottom: 18 }}>
          <strong>This is a tracking tool, not legal advice.</strong> Starter items are marked
          “verify” — confirm the actual requirements with your employment counsel and the Arizona Board,
          then mark them reviewed.
        </div>

        {setupNeeded ? (
          <div className="notice">Run <strong>Admin → “Set up / update database”</strong> first.</div>
        ) : (
          <>
            {/* Summary */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
              <StatusPill label={`${attention} need attention`} tone={attention ? "bad" : "ok"} />
              <StatusPill label={`${compliant} compliant`} tone="ok" />
              {toVerify > 0 && <StatusPill label={`${toVerify} to verify`} tone="warn" />}
              <span style={{ flex: 1 }} />
              <Link className="btn btn-ghost" href="/admin/compliance/report">Report / export →</Link>
              <Link className="btn btn-ghost" href="/admin/audit">Audit log →</Link>
            </div>

            {/* Attestation — two-person sign-off */}
            <section className="card" style={{ cursor: "default", marginBottom: 24, borderLeft: "3px solid var(--gold,#c8952a)" }}>
              <h2 style={{ marginTop: 0, fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.15rem" }}>Attestation</h2>
              <p className="muted" style={{ fontSize: "0.83rem", marginTop: 0 }}>
                Periodically, one director/owner attests the register is accurate and a <em>different</em> one confirms — a recorded, two-person check.
              </p>

              {pendingAttestation ? (
                <div>
                  <p style={{ margin: "6px 0" }}>
                    <strong>Awaiting confirmation.</strong>{" "}
                    {pendingAttestation.periodLabel ? <>({pendingAttestation.periodLabel}) </> : null}
                    Attested by {pendingAttestation.attestedBy} on {fmtWhen(pendingAttestation.attestedAt)}.
                    {pendingAttestation.note ? <span className="muted"> — “{pendingAttestation.note}”</span> : null}
                  </p>
                  <p className="muted" style={{ fontSize: "0.82rem", margin: "0 0 8px" }}>{countsLine(pendingAttestation.snapshot as AttestationSnapshot | null)}</p>
                  {pendingAttestation.attestedBy && pendingAttestation.attestedBy.toLowerCase() === email.toLowerCase() ? (
                    <div className="notice" style={{ padding: "6px 10px", fontSize: "0.83rem" }}>
                      You attested this — a different director or owner must confirm it.
                    </div>
                  ) : (
                    <form action={decideAttestation} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input type="hidden" name="attestationId" value={pendingAttestation.id} />
                      <button className="btn" type="submit" name="decision" value="confirm">Confirm</button>
                      <button className="btn btn-ghost" type="submit" name="decision" value="reject" style={{ color: "var(--terra,#a0624a)" }}>Send back</button>
                    </form>
                  )}
                </div>
              ) : (
                <form action={attestCompliance} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div className="field" style={{ minWidth: 120 }}>
                    <label htmlFor="periodLabel">Period (optional)</label>
                    <input id="periodLabel" name="periodLabel" placeholder="e.g. Q3 2026" />
                  </div>
                  <div className="field" style={{ flex: 1, minWidth: 180 }}>
                    <label htmlFor="attnote">Note (optional)</label>
                    <input id="attnote" name="note" placeholder="Anything to record with this attestation" />
                  </div>
                  <button className="btn" type="submit">Attest register is accurate</button>
                </form>
              )}

              {confirmedAttestations.length > 0 && (
                <div style={{ marginTop: 14, borderTop: "1px solid var(--border,#e7ded5)", paddingTop: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>History</div>
                  {confirmedAttestations.slice(0, 6).map((a) => (
                    <div key={a.id} className="muted" style={{ fontSize: "0.8rem", padding: "3px 0" }}>
                      {a.periodLabel ? `${a.periodLabel} — ` : ""}attested by {a.attestedBy} {fmtWhen(a.attestedAt)}, confirmed by {a.confirmedBy} {fmtWhen(a.confirmedAt)} · {countsLine(a.snapshot as AttestationSnapshot | null)}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {COMPLIANCE_LEVELS.map((lvl) => {
              const rows = states.filter((x) => x.item.level === lvl.id);
              return (
                <section key={lvl.id} style={{ marginBottom: 28 }}>
                  <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.3rem", margin: "0 0 2px" }}>{lvl.label}</h2>
                  <p className="muted" style={{ fontSize: "0.82rem", margin: "0 0 12px" }}>{lvl.blurb}</p>
                  {rows.length === 0 ? (
                    <p className="muted" style={{ fontSize: "0.85rem" }}>No items yet.</p>
                  ) : (
                    rows.map(({ item, s }) => {
                      const ev = evidence.get(item.id) ?? [];
                      return (
                        <details key={item.id} className="card" style={{ cursor: "default", padding: "12px 14px", marginBottom: 8 }}>
                          <summary style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600, flex: 1, minWidth: 200 }}>
                              {item.title}
                              {item.needsVerification && <span className="muted" style={{ fontWeight: 400, fontSize: "0.76rem" }}> · verify</span>}
                            </span>
                            <StatusPill label={s.label} tone={s.tone} />
                            <span className="muted" style={{ fontSize: "0.8rem" }}>
                              {item.dueAt ? `Due ${prettyDate(item.dueAt)}` : cadenceLabel(item.cadence)}
                            </span>
                          </summary>

                          {item.description && (
                            <p className="muted" style={{ fontSize: "0.86rem", marginTop: 10, whiteSpace: "pre-wrap" }}>{item.description}</p>
                          )}
                          <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
                            {cadenceLabel(item.cadence)}
                            {item.responsibleEmail ? ` · owner: ${item.responsibleEmail}` : ""}
                            {item.lastReviewedAt ? ` · reviewed ${new Date(item.lastReviewedAt).toLocaleDateString("en-US")}` : " · not yet reviewed"}
                          </div>

                          {/* Status controls */}
                          <form action={setComplianceStatus} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                            <input type="hidden" name="itemId" value={item.id} />
                            <span className="muted" style={{ fontSize: "0.82rem" }}>Mark reviewed:</span>
                            <button className="btn-link" type="submit" name="status" value="compliant">Compliant</button>
                            <span className="muted">·</span>
                            <button className="btn-link" type="submit" name="status" value="attention">Needs attention</button>
                            <span className="muted">·</span>
                            <button className="btn-link" type="submit" name="status" value="na">N/A</button>
                          </form>

                          {/* Evidence */}
                          <div style={{ marginTop: 12, borderTop: "1px solid var(--border,#e7ded5)", paddingTop: 10 }}>
                            <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6 }}>Evidence</div>
                            {ev.length === 0 ? (
                              <p className="muted" style={{ fontSize: "0.82rem", margin: "0 0 8px" }}>Nothing attached yet.</p>
                            ) : (
                              ev.map((e) => (
                                <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "3px 0" }}>
                                  <span style={{ flex: 1, minWidth: 160, fontSize: "0.86rem" }}>
                                    {e.url ? (
                                      <a href={e.url} target="_blank" rel="noopener noreferrer">{e.label ?? "Open"}</a>
                                    ) : (
                                      e.label
                                    )}
                                    <span className="muted" style={{ fontSize: "0.75rem" }}> · {e.kind}</span>
                                  </span>
                                  <form action={removeEvidence}>
                                    <input type="hidden" name="evidenceId" value={e.id} />
                                    <button className="btn-link" type="submit" style={{ color: "var(--terra,#a0624a)" }}>Remove</button>
                                  </form>
                                </div>
                              ))
                            )}
                            <form action={addEvidence} style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              <input type="hidden" name="itemId" value={item.id} />
                              <input name="label" placeholder="Note or label" style={{ minWidth: 160, flex: 1 }} />
                              <input name="link" placeholder="Link (optional)" style={{ minWidth: 140 }} />
                              <input type="file" name="file" accept="application/pdf,image/*" style={{ maxWidth: 190 }} />
                              <button className="btn btn-ghost" type="submit">Add</button>
                            </form>
                          </div>

                          {/* Edit / remove */}
                          <details style={{ marginTop: 10 }}>
                            <summary className="btn-link" style={{ cursor: "pointer" }}>Edit / remove…</summary>
                            <form action={updateComplianceItem} style={{ marginTop: 10 }}>
                              <input type="hidden" name="itemId" value={item.id} />
                              <div className="form-grid">
                                <div className="field"><label>Title</label><input name="title" defaultValue={item.title} required /></div>
                                <div className="field"><label>Level</label><LevelSelect name="level" defaultValue={item.level} /></div>
                                <div className="field"><label>Cadence</label><CadenceSelect name="cadence" defaultValue={item.cadence} /></div>
                              </div>
                              <div className="form-grid" style={{ marginTop: 8 }}>
                                <div className="field"><label>Responsible (email)</label><input name="responsibleEmail" defaultValue={item.responsibleEmail ?? ""} /></div>
                                <div className="field"><label>Next due date</label><input type="date" name="dueAt" defaultValue={item.dueAt ?? ""} /></div>
                                <div className="field"><label>Category</label><input name="category" defaultValue={item.category ?? ""} /></div>
                              </div>
                              <div className="field" style={{ marginTop: 8 }}><label>Description</label><textarea name="description" rows={2} defaultValue={item.description ?? ""} /></div>
                              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                                <button className="btn btn-ghost" type="submit">Save</button>
                                <button className="btn-link" type="submit" formAction={deleteComplianceItem} style={{ color: "var(--terra,#a0624a)" }}>Remove item</button>
                              </div>
                            </form>
                          </details>
                        </details>
                      );
                    })
                  )}
                </section>
              );
            })}

            {/* Add item */}
            <form action={addComplianceItem} className="card" style={{ cursor: "default", padding: "16px 18px", marginTop: 8 }}>
              <h2 style={{ marginTop: 0 }}>Add a requirement</h2>
              <div className="form-grid">
                <div className="field"><label htmlFor="title">Title *</label><input id="title" name="title" required placeholder="e.g. Salon establishment license posted" /></div>
                <div className="field"><label htmlFor="level">Level</label><LevelSelect name="level" /></div>
                <div className="field"><label htmlFor="cadence">Cadence</label><CadenceSelect name="cadence" /></div>
              </div>
              <div className="form-grid" style={{ marginTop: 8 }}>
                <div className="field"><label htmlFor="responsibleEmail">Responsible (email)</label><input id="responsibleEmail" name="responsibleEmail" placeholder="who owns this" /></div>
                <div className="field"><label htmlFor="dueAt">Next due date</label><input id="dueAt" type="date" name="dueAt" /></div>
                <div className="field"><label htmlFor="category">Category</label><input id="category" name="category" placeholder="e.g. licensing, safety" /></div>
              </div>
              <div className="field" style={{ marginTop: 8 }}><label htmlFor="description">Description</label><textarea id="description" name="description" rows={2} /></div>
              <button className="btn" type="submit" style={{ marginTop: 10 }}>Add requirement</button>
            </form>
          </>
        )}
      </main>
    </>
  );
}
