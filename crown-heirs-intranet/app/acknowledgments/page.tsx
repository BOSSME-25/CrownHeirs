import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import StatusPill from "@/components/StatusPill";
import { getAccess } from "@/lib/perms";
import { getEmployeeByEmail } from "@/lib/employees";
import {
  ackState,
  ackWhen,
  ensurePolicyAssignments,
  listAssignments,
  listMyPolicies,
  policyCategoryLabel,
  POLICY_CATEGORIES,
  type AssignmentRow,
  type PolicyWithAck,
} from "@/lib/policies";
import { acknowledgePolicy, addPolicy, confirmAck, deactivatePolicy, editPolicy, pushUpdate } from "@/app/acknowledgments/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acknowledgments — Crown Heirs Team Hub" };

// Where a document is read: the handbook has its own page; everything else
// links to its uploaded file.
function readHref(category: string, fileUrl: string | null): string | null {
  if (category === "handbook") return "/handbook";
  return fileUrl;
}

export default async function AcknowledgmentsPage() {
  const session = await auth();
  const email = session?.user?.email ?? "";
  const access = await getAccess(email);
  const canManageDocs = access.canManageTeam;
  const canConfirm = access.canApprove;

  let setupNeeded = false;
  let mine: PolicyWithAck[] = [];
  let assignments: AssignmentRow[] = [];
  try {
    const me = await getEmployeeByEmail(email);
    await ensurePolicyAssignments();
    if (me) mine = await listMyPolicies(me.id);
    if (canConfirm) assignments = await listAssignments();
  } catch {
    setupNeeded = true;
  }

  // Manager confirmation queue (someone else's signed-but-unconfirmed sign-offs).
  const confirmQueue = assignments.filter((a) => {
    const s = ackState(a.ack, a.policy.version);
    return s.needsManager && a.employeeEmail.toLowerCase() !== email.toLowerCase();
  });

  // Per-document completion for the manager overview.
  const byPolicy = new Map<string, AssignmentRow[]>();
  for (const a of assignments) {
    if (!byPolicy.has(a.policy.id)) byPolicy.set(a.policy.id, []);
    byPolicy.get(a.policy.id)!.push(a);
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Acknowledgments</div>
          <h1 className="title">Documents to Sign</h1>
          <p className="lede">
            Read each document and sign to confirm you understand it. A manager then confirms your
            sign-off. When a document is updated, you’ll be asked to sign the new version.
          </p>
        </div>

        {setupNeeded ? (
          <div className="notice">
            The documents tables aren’t set up yet. Run <strong>Admin → “Set up / update database”</strong>, then come back.
          </div>
        ) : (
          <>
            {/* ── My documents ── */}
            {mine.length === 0 ? (
              <p className="muted">No documents to sign right now.</p>
            ) : (
              <div className="prose" style={{ marginBottom: 8 }}>
                {mine.map(({ policy, ack }) => {
                  const s = ackState(ack, policy.version);
                  const href = readHref(policy.category, policy.fileUrl);
                  return (
                    <div key={policy.id} className="card" style={{ cursor: "default", padding: "14px 16px", marginBottom: 10 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, flex: 1, minWidth: 180 }}>
                          {policy.title}
                          <span className="muted" style={{ fontWeight: 400, fontSize: "0.8rem" }}> · {policyCategoryLabel(policy.category)}{policy.version > 1 ? ` · v${policy.version}` : ""}</span>
                        </span>
                        <StatusPill label={s.label} tone={s.tone} />
                      </div>
                      {policy.body && <p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", fontSize: "0.9rem" }}>{policy.body}</p>}
                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
                        {href && (
                          <a href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">
                            Read the document →
                          </a>
                        )}
                        {s.needsEmployee ? (
                          <form action={acknowledgePolicy.bind(null, policy.id)}>
                            <button className="btn" type="submit">I’ve read &amp; agree</button>
                          </form>
                        ) : s.needsManager ? (
                          <span className="muted" style={{ fontSize: "0.82rem" }}>
                            Signed {ackWhen(ack?.acknowledgedAt ?? null)} — waiting on a manager to confirm.
                          </span>
                        ) : (
                          <span className="muted" style={{ fontSize: "0.82rem" }}>
                            ✓ Confirmed {ackWhen(ack?.confirmedAt ?? null)}.
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Manager: confirmation queue ── */}
            {canConfirm && confirmQueue.length > 0 && (
              <section className="card" style={{ cursor: "default", margin: "22px 0", borderLeft: "3px solid var(--gold,#c8a04a)" }}>
                <h3 style={{ marginTop: 0 }}>Sign-offs to confirm ({confirmQueue.length})</h3>
                {confirmQueue.map((a) => (
                  <div key={a.ack.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--line,#e7ded5)", paddingTop: 10, marginTop: 10 }}>
                    <span style={{ flex: 1, minWidth: 200 }}>
                      <strong>{a.employeeName}</strong> signed “{a.policy.title}”
                      <span className="muted"> · {ackWhen(a.ack.acknowledgedAt)}</span>
                    </span>
                    <form action={confirmAck} style={{ display: "flex", gap: 8 }}>
                      <input type="hidden" name="ackId" value={a.ack.id} />
                      <button className="btn" type="submit" name="decision" value="confirm">Confirm</button>
                      <button className="btn btn-ghost" type="submit" name="decision" value="reject" style={{ color: "var(--terra,#a0624a)" }}>Return</button>
                    </form>
                  </div>
                ))}
              </section>
            )}

            {/* ── Manager: per-document completion ── */}
            {canConfirm && byPolicy.size > 0 && (
              <section style={{ marginTop: 22 }}>
                <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.25rem", margin: "0 0 12px" }}>
                  Team completion
                </h2>
                {[...byPolicy.entries()].map(([pid, list]) => {
                  const policy = list[0].policy;
                  const done = list.filter((a) => ackState(a.ack, policy.version).complete).length;
                  const outstanding = list
                    .filter((a) => !ackState(a.ack, policy.version).complete)
                    .map((a) => a.employeeName);
                  return (
                    <details key={pid} className="card" style={{ cursor: "default", padding: "12px 14px", marginBottom: 8 }}>
                      <summary style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, flex: 1, minWidth: 180 }}>
                          {policy.title}
                          <span className="muted" style={{ fontWeight: 400, fontSize: "0.8rem" }}> · {policyCategoryLabel(policy.category)} · v{policy.version}</span>
                        </span>
                        <StatusPill
                          label={`${done}/${list.length} complete`}
                          tone={done === list.length ? "ok" : "warn"}
                        />
                      </summary>
                      {outstanding.length > 0 ? (
                        <p className="muted" style={{ fontSize: "0.85rem", margin: "10px 0 0" }}>
                          Still outstanding: {outstanding.join(", ")}.
                        </p>
                      ) : (
                        <p className="muted" style={{ fontSize: "0.85rem", margin: "10px 0 0" }}>Everyone is signed and confirmed. 🎉</p>
                      )}

                      {canManageDocs && (
                        <div style={{ marginTop: 12, borderTop: "1px solid var(--line,#e7ded5)", paddingTop: 12 }}>
                          <details>
                            <summary className="btn-link" style={{ cursor: "pointer" }}>Edit / push update…</summary>
                            <form action={editPolicy} style={{ marginTop: 10 }}>
                              <input type="hidden" name="policyId" value={policy.id} />
                              <div className="field">
                                <label>Title</label>
                                <input name="title" defaultValue={policy.title} required />
                              </div>
                              <div className="field" style={{ marginTop: 8 }}>
                                <label>Category</label>
                                <select name="category" defaultValue={policy.category}>
                                  {POLICY_CATEGORIES.map((c) => (
                                    <option key={c.id} value={c.id}>{c.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="field" style={{ marginTop: 8 }}>
                                <label>Text (optional)</label>
                                <textarea name="body" rows={3} defaultValue={policy.body ?? ""} />
                              </div>
                              <div className="field" style={{ marginTop: 8 }}>
                                <label>Document link (optional)</label>
                                <input name="fileUrl" defaultValue={policy.fileUrl ?? ""} placeholder="Link to a PDF in Documents" />
                              </div>
                              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                                <button className="btn btn-ghost" type="submit">Save (no re-sign)</button>
                                <button className="btn" type="submit" formAction={pushUpdate}>Push update — require re-sign</button>
                                <button className="btn-link" type="submit" formAction={deactivatePolicy.bind(null, policy.id)} style={{ color: "var(--terra,#a0624a)" }}>Archive</button>
                              </div>
                            </form>
                          </details>
                        </div>
                      )}
                    </details>
                  );
                })}
              </section>
            )}

            {/* ── Manage: add a document ── */}
            {canManageDocs && (
              <form action={addPolicy} className="prose card" style={{ cursor: "default", padding: "16px 18px", marginTop: 28 }}>
                <h2 style={{ marginTop: 0 }}>Add a document to sign</h2>
                <div className="field">
                  <label htmlFor="title">Title *</label>
                  <input id="title" name="title" required placeholder="e.g. Code of Conduct" />
                </div>
                <div className="field">
                  <label htmlFor="category">Type</label>
                  <select id="category" name="category" defaultValue="policy">
                    {POLICY_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="body">Text (optional)</label>
                  <textarea id="body" name="body" rows={4} />
                </div>
                <div className="field">
                  <label htmlFor="fileUrl">Document link (optional)</label>
                  <input id="fileUrl" name="fileUrl" placeholder="Link to a PDF in Documents" />
                </div>
                <button className="btn" type="submit">Add &amp; send to the team</button>
              </form>
            )}
          </>
        )}
      </main>
    </>
  );
}
