import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import StatusPill from "@/components/StatusPill";
import { getAccess } from "@/lib/perms";
import { getEmployeeByEmail } from "@/lib/employees";
import { activeEmployees } from "@/lib/schedule";
import {
  activeEmployeeTiers,
  canApproveProposal,
  capLevelFor,
  CAP_CATEGORIES,
  CAP_LEVELS,
  existingActionKeys,
  INFRACTIONS,
  infractionLabel,
  listByStatus,
  listCapActions,
  listOpenFlags,
  rosterBalances,
  TIER_LADDER,
} from "@/lib/cap";
import {
  confirmCapAction,
  createCapAction,
  decidePoint,
  dismissFlag,
  proposePoint,
  raiseFlag,
  removePoint,
  resolveDispute,
  setTier,
} from "@/app/cap/actions";

function levelLabel(key: string) {
  return CAP_LEVELS.find((l) => l.key === key)?.label ?? key;
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Corrective Action — Crown Heirs Team Hub" };

function InfractionSelect({ name, required }: { name: string; required?: boolean }) {
  return (
    <select name={name} defaultValue="" required={required}>
      <option value="" disabled>Choose an infraction…</option>
      {CAP_CATEGORIES.map((c) => (
        <optgroup key={c.id} label={c.label}>
          {INFRACTIONS.filter((i) => i.category === c.id).map((i) => (
            <option key={i.id} value={i.id}>{i.label} — {i.points} pt{i.points === 1 ? "" : "s"}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default async function CapPage() {
  const session = await auth();
  const email = session?.user?.email ?? "";
  const access = await getAccess(email);
  const me = email ? await getEmployeeByEmail(email) : undefined;
  const canManage = access.canApprove;

  let setupNeeded = false;
  let roster: { id: string; fullName: string }[] = [];
  try {
    roster = await activeEmployees();
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Corrective Action Program</div>
          <h1 className="title">Corrective Action</h1>
          <p className="lede">
            {canManage
              ? "Flags become proposed points; a leader one level up approves before anything reaches the employee."
              : "See something worth leadership’s attention? Send them a private observation. No points are applied unless a manager proposes and a leader approves."}
          </p>
        </div>

        {setupNeeded ? (
          <div className="notice">Run <strong>Admin → “Set up / update database”</strong> first.</div>
        ) : (
          <>
            {/* Report an observation — available to everyone on the roster */}
            {me && (
              <form action={raiseFlag} className="card" style={{ cursor: "default", padding: "14px 16px", marginBottom: 20 }}>
                <h3 style={{ marginTop: 0 }}>Report an observation to management</h3>
                <div className="form-grid">
                  <div className="field">
                    <label>Who is this about?</label>
                    <select name="subjectEmployeeId" defaultValue="" required>
                      <option value="" disabled>Choose a team member…</option>
                      {roster.filter((r) => r.id !== me.id).map((r) => (
                        <option key={r.id} value={r.id}>{r.fullName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Related to (optional)</label>
                    <InfractionSelect name="infractionType" />
                  </div>
                </div>
                <div className="field" style={{ marginTop: 8 }}>
                  <label>What did you observe?</label>
                  <textarea name="note" rows={2} required placeholder="Facts only — what happened, when." />
                </div>
                <button className="btn" type="submit" style={{ marginTop: 8 }}>Send to management</button>
              </form>
            )}

            {canManage && <ManagerConsole email={email} accessLevel={access.level} canManageTeam={access.canManageTeam} roster={roster} />}
          </>
        )}
      </main>
    </>
  );
}

async function ManagerConsole({
  email,
  accessLevel,
  canManageTeam,
  roster,
}: {
  email: string;
  accessLevel: string;
  canManageTeam: boolean;
  roster: { id: string; fullName: string }[];
}) {
  const flags = await listOpenFlags();
  const proposals = await listByStatus("proposed");
  const disputes = canManageTeam ? await listByStatus("disputed") : [];
  const balances = await rosterBalances();
  const rosterFull = await activeEmployeeTiers();
  const capActionRows = await listCapActions();
  const existingKeys = await existingActionKeys();

  // Which proposals can *this* leader approve?
  const issuerLevels = await Promise.all(proposals.map((p) => getAccess(p.row.issuedBy)));

  // Employees at a level with no corrective action yet started.
  const toStart = balances
    .map((b) => ({ b, level: capLevelFor(b.balance) }))
    .filter((x) => x.level && !existingKeys.has(`${x.b.id}:${x.level!.key}`));
  const awaitingAck = capActionRows.filter((a) => a.row.status === "pending_ack");
  const awaitingConfirm = capActionRows.filter((a) => a.row.status === "pending_confirm");

  return (
    <>
      {/* Flags queue */}
      {flags.length > 0 && (
        <section className="card" style={{ cursor: "default", marginBottom: 18, borderLeft: "3px solid var(--gold,#c8952a)" }}>
          <h3 style={{ marginTop: 0 }}>Observations to review ({flags.length})</h3>
          {flags.map(({ row, subjectName }) => (
            <div key={row.id} style={{ borderTop: "1px solid var(--border,#e7ded5)", paddingTop: 10, marginTop: 10 }}>
              <div><strong>{subjectName}</strong> {row.infractionType ? <span className="muted">· {infractionLabel(row.infractionType)}</span> : null}</div>
              <div className="muted" style={{ fontSize: "0.84rem", margin: "2px 0 8px" }}>{row.note} <span style={{ opacity: 0.7 }}>— from {row.reporterEmail}</span></div>
              <form action={proposePoint} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <input type="hidden" name="employeeId" value={row.subjectEmployeeId} />
                <input type="hidden" name="sourceFlagId" value={row.id} />
                <InfractionSelect name="infractionType" required />
                <input name="note" placeholder="Context (optional)" style={{ minWidth: 140 }} />
                <button className="btn" type="submit">Propose point</button>
                <button className="btn-link" type="submit" formAction={dismissFlag} name="flagId" value={row.id} style={{ color: "var(--terra,#a0624a)" }}>Dismiss</button>
              </form>
            </div>
          ))}
        </section>
      )}

      {/* Approval queue */}
      {proposals.length > 0 && (
        <section className="card" style={{ cursor: "default", marginBottom: 18, borderLeft: "3px solid var(--gold,#c8952a)" }}>
          <h3 style={{ marginTop: 0 }}>Proposed points awaiting approval ({proposals.length})</h3>
          {proposals.map(({ row, subjectName }, i) => {
            const approvable = canApproveProposal(issuerLevels[i].level, accessLevel, !!row.issuedBy && row.issuedBy.toLowerCase() === email.toLowerCase());
            return (
              <div key={row.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--border,#e7ded5)", paddingTop: 10, marginTop: 10 }}>
                <span style={{ flex: 1, minWidth: 200 }}>
                  <strong>{subjectName}</strong> · {infractionLabel(row.infractionType ?? "")} · {Number(row.points)} pt
                  <span className="muted" style={{ fontSize: "0.8rem" }}> — proposed by {row.issuedBy}</span>
                  {row.note ? <span className="muted"> · “{row.note}”</span> : null}
                </span>
                {approvable ? (
                  <form action={decidePoint} style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="pointId" value={row.id} />
                    <button className="btn" type="submit" name="decision" value="approve">Approve</button>
                    <button className="btn btn-ghost" type="submit" name="decision" value="reject" style={{ color: "var(--terra,#a0624a)" }}>Reject</button>
                  </form>
                ) : (
                  <span className="muted" style={{ fontSize: "0.82rem" }}>Awaiting a leader one level up</span>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Disputes (leadership) */}
      {disputes.length > 0 && (
        <section className="card" style={{ cursor: "default", marginBottom: 18, borderLeft: "3px solid var(--terra,#a0624a)" }}>
          <h3 style={{ marginTop: 0 }}>Disputes to resolve ({disputes.length})</h3>
          {disputes.map(({ row, subjectName }) => (
            <div key={row.id} style={{ borderTop: "1px solid var(--border,#e7ded5)", paddingTop: 10, marginTop: 10 }}>
              <div><strong>{subjectName}</strong> · {infractionLabel(row.infractionType ?? "")} · {Number(row.points)} pt</div>
              {row.disputeNote && <div className="muted" style={{ fontSize: "0.84rem", margin: "2px 0 8px" }}>“{row.disputeNote}”</div>}
              <form action={resolveDispute} style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="pointId" value={row.id} />
                <button className="btn" type="submit" name="decision" value="remove">Remove point</button>
                <button className="btn btn-ghost" type="submit" name="decision" value="uphold">Uphold</button>
              </form>
            </div>
          ))}
        </section>
      )}

      {/* Corrective actions */}
      {(toStart.length > 0 || awaitingAck.length > 0 || awaitingConfirm.length > 0) && (
        <section className="card" style={{ cursor: "default", marginBottom: 18, borderLeft: "3px solid var(--terra,#a0624a)" }}>
          <h3 style={{ marginTop: 0 }}>Corrective actions</h3>

          {toStart.map(({ b, level }) => (
            <details key={b.id} style={{ borderTop: "1px solid var(--border,#e7ded5)", paddingTop: 10, marginTop: 10 }}>
              <summary style={{ cursor: "pointer" }}>
                <strong>{b.name}</strong> reached <strong>{level!.label}</strong> ({b.balance} pts) — start a corrective action
              </summary>
              <p className="muted" style={{ fontSize: "0.84rem", margin: "8px 0" }}>{level!.response}</p>
              <form action={createCapAction} style={{ marginTop: 6 }}>
                <input type="hidden" name="employeeId" value={b.id} />
                <input type="hidden" name="levelKey" value={level!.key} />
                <div className="field">
                  <label>Documented plan</label>
                  <textarea name="plan" rows={3} placeholder="What happened, what change is expected, the check-in plan…" required />
                </div>
                <button className="btn" type="submit" style={{ marginTop: 8 }}>Start &amp; send to employee</button>
              </form>
            </details>
          ))}

          {awaitingAck.map(({ row, subjectName }) => (
            <div key={row.id} className="muted" style={{ fontSize: "0.84rem", borderTop: "1px solid var(--border,#e7ded5)", paddingTop: 8, marginTop: 8 }}>
              <strong>{subjectName}</strong> · {levelLabel(row.levelKey)} — awaiting the employee’s acknowledgment.
            </div>
          ))}

          {awaitingConfirm.map(({ row, subjectName }) => {
            const mine = row.createdBy && row.createdBy.toLowerCase() === email.toLowerCase();
            return (
              <div key={row.id} style={{ borderTop: "1px solid var(--border,#e7ded5)", paddingTop: 10, marginTop: 10 }}>
                <div><strong>{subjectName}</strong> · {levelLabel(row.levelKey)} — acknowledged, needs a second leader.</div>
                {row.plan && <div className="muted" style={{ fontSize: "0.84rem", margin: "2px 0 6px" }}>{row.plan}</div>}
                {canManageTeam && !mine ? (
                  <form action={confirmCapAction} style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="actionId" value={row.id} />
                    <button className="btn" type="submit" name="decision" value="confirm">Confirm</button>
                    <button className="btn-link" type="submit" name="decision" value="void" style={{ color: "var(--terra,#a0624a)" }}>Void</button>
                  </form>
                ) : (
                  <span className="muted" style={{ fontSize: "0.82rem" }}>{mine ? "You created this — a different leader must confirm." : "Awaiting a director or owner."}</span>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Roster balances + tier */}
      <section style={{ marginTop: 8 }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.2rem", margin: "0 0 10px" }}>Team standing</h2>
        {balances.map((b) => {
          const lvl = capLevelFor(b.balance);
          const emp = rosterFull.find((e) => e.id === b.id);
          return (
            <div key={b.id} className="card" style={{ cursor: "default", padding: "10px 14px", marginBottom: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, flex: 1, minWidth: 160 }}>{b.name}</span>
              <StatusPill label={`${b.balance} pt`} tone={b.balance >= 6 ? "bad" : b.balance >= 2 ? "warn" : "ok"} />
              {lvl && <span className="muted" style={{ fontSize: "0.8rem" }}>{lvl.label}</span>}
              {canManageTeam && (
                <form action={setTier} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input type="hidden" name="employeeId" value={b.id} />
                  <select name="tier" defaultValue={emp?.tier ?? ""}>
                    <option value="">— tier —</option>
                    {TIER_LADDER.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                  <button className="btn-link" type="submit">Set</button>
                </form>
              )}
              {canManageTeam && b.balance > 0 && (
                <PointRemover employeeId={b.id} />
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}

// Small helper: leadership can remove an active point directly from the roster.
async function PointRemover({ employeeId }: { employeeId: string }) {
  const active = (await listByStatus("active")).filter((p) => p.row.employeeId === employeeId);
  if (!active.length) return null;
  return (
    <details>
      <summary className="btn-link" style={{ cursor: "pointer" }}>Points…</summary>
      <div style={{ marginTop: 6 }}>
        {active.map(({ row }) => (
          <form key={row.id} action={removePoint} style={{ display: "flex", gap: 6, alignItems: "center", padding: "2px 0" }}>
            <input type="hidden" name="pointId" value={row.id} />
            <span className="muted" style={{ fontSize: "0.8rem", flex: 1 }}>{infractionLabel(row.infractionType ?? "")} · {Number(row.points)} pt</span>
            <button className="btn-link" type="submit" style={{ color: "var(--terra,#a0624a)" }}>Remove</button>
          </form>
        ))}
      </div>
    </details>
  );
}

