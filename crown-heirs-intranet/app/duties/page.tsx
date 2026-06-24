import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import { getAccess } from "@/lib/perms";
import { getEmployeeByEmail, jobTitles } from "@/lib/employees";
import { activeEmployees } from "@/lib/schedule";
import {
  acknowledgeTask,
  addDuty,
  applyTemplate,
  cancelReassign,
  decideReassign,
  deleteDuty,
  requestReassign,
  respondReassign,
  setAssignee,
  unacknowledgeTask,
} from "@/app/duties/actions";
import {
  activeReassignments,
  getTasksForDate,
  listTemplateMeta,
  listTemplates,
  resolveAutoAssignees,
  type AutoAssignees,
  type ReassignRow,
  type TaskRow,
} from "@/lib/duties";
import {
  ASSIGN_ROLES,
  assignRoleLabel,
  DUTY_SECTIONS,
  normalizeRole,
  prettyDate,
  reassignStatusLabel,
  salonToday,
  shiftDate,
} from "@/lib/duties-constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily Duties — Crown Heirs Team Hub" };

type Roster = { id: string; fullName: string }[];

function isValidDate(s?: string): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function ackTime(d: Date | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function DutiesPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; ok?: string }>;
}) {
  const { d } = await searchParams;
  const session = await auth();
  const email = session?.user?.email ?? "";
  const canManage = (await getAccess(email)).canApprove;
  const date = isValidDate(d) ? d : salonToday();

  let setupNeeded = false;
  let me: Awaited<ReturnType<typeof getEmployeeByEmail>>;
  let tasks: TaskRow[] = [];
  let reassigns: ReassignRow[] = [];
  let roster: Roster = [];
  let templates: Awaited<ReturnType<typeof listTemplates>> = [];
  let templateMeta: Awaited<ReturnType<typeof listTemplateMeta>> = [];
  let auto: AutoAssignees = { opener: null, closer: null, configured: false };
  let titles: string[] = [];
  try {
    me = await getEmployeeByEmail(email);
    tasks = await getTasksForDate(date);
    reassigns = await activeReassignments(tasks.map((t) => t.task.id));
    roster = await activeEmployees();
    templateMeta = await listTemplateMeta();
    // Only hit Square if the day actually has auto-assigned duties.
    if (tasks.some((t) => t.task.autoRole)) auto = await resolveAutoAssignees(date);
    if (canManage) {
      templates = await listTemplates();
      titles = await jobTitles();
    }
  } catch {
    setupNeeded = true;
  }

  const myTitle = me?.jobTitle ?? null;
  const myRole = me ? normalizeRole(me.role) : null;

  // The live person behind an opener/closer duty.
  const autoFor = (role: string | null) =>
    role === "opener" ? auto.opener : role === "closer" ? auto.closer : null;

  // Checklist descriptions, keyed by the template they came from.
  const metaById = new Map(templateMeta.map((m) => [m.id, m]));

  const myId = me?.id ?? null;
  const reassignByTask = new Map<string, ReassignRow>();
  for (const r of reassigns) reassignByTask.set(r.r.taskId, r);

  // Action queues surfaced at the top of the page.
  const toAccept = reassigns.filter((r) => r.r.status === "pending_accept" && r.r.targetEmployeeId === myId);
  const toApprove = canManage ? reassigns.filter((r) => r.r.status === "accepted") : [];

  const total = tasks.length;
  const done = tasks.filter((t) => t.task.status === "done").length;

  const prev = shiftDate(date, -1);
  const next = shiftDate(date, 1);
  const today = salonToday();

  function TaskCard({ row }: { row: TaskRow }) {
    const t = row.task;
    // Shared duty for anyone with a job title or access role.
    const sharedLabel = t.assigneeTitle
      ? `Any ${t.assigneeTitle}`
      : t.assigneeRole
        ? `Any ${assignRoleLabel(t.assigneeRole)}`
        : null;
    const autoPerson = autoFor(t.autoRole);
    // Effective assignee: a fixed person, or the live opener/closer.
    const effId = t.assigneeId ?? autoPerson?.id ?? null;
    const effName = t.assigneeId ? row.assigneeName : autoPerson?.name ?? null;
    const roleLabel = t.autoRole === "opener" ? "Opening stylist" : t.autoRole === "closer" ? "Closing stylist" : null;
    const mine = !sharedLabel && !!myId && effId === myId;
    const iAmInShared =
      (!!t.assigneeTitle && !!myTitle && myTitle.trim().toLowerCase() === t.assigneeTitle.trim().toLowerCase()) ||
      (!!t.assigneeRole && !!myRole && myRole === normalizeRole(t.assigneeRole));
    const canComplete = canManage || mine || iAmInShared;
    const ra = reassignByTask.get(t.id);
    const doneFlag = t.status === "done";

    return (
      <div className="card" style={{ cursor: "default", padding: "14px 16px", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span
            aria-hidden
            style={{
              fontSize: "1.1rem",
              lineHeight: 1.4,
              color: doneFlag ? "var(--olive, #5b7a4b)" : "var(--muted, #9a8f86)",
            }}
          >
            {doneFlag ? "☑" : "☐"}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, textDecoration: doneFlag ? "line-through" : "none" }}>{t.title}</div>
            {t.detail && <div className="muted" style={{ fontSize: "0.85rem", marginTop: 2 }}>{t.detail}</div>}
            <div className="muted" style={{ fontSize: "0.82rem", marginTop: 4 }}>
              {sharedLabel ? (
                <>
                  <span className="tag" style={{ marginRight: 6 }}>{sharedLabel}</span>
                  {!doneFlag && <em>anyone with this role can complete</em>}
                </>
              ) : roleLabel ? (
                <>
                  <span className="tag" style={{ marginRight: 6 }}>{roleLabel} · auto</span>
                  {effName ? <>→ <strong>{effName}</strong></> : auto.configured ? <em>no appointment booked yet</em> : <em>link Square to resolve</em>}
                </>
              ) : effId ? (
                <>Assigned to <strong>{effName ?? "—"}</strong></>
              ) : (
                <em>Unassigned</em>
              )}
              {doneFlag && row.ackName && <> · ✓ acknowledged by {row.ackName} {ackTime(t.acknowledgedAt)}</>}
            </div>

            {/* In-flight handoff status */}
            {ra && (
              <div className="notice" style={{ marginTop: 8, padding: "6px 10px", fontSize: "0.83rem" }}>
                {reassignStatusLabel(ra.r.status, ra.targetName)}
                {ra.r.reason && <> — “{ra.r.reason}”</>}
                {ra.r.requestedById === myId && (
                  <form action={cancelReassign} style={{ display: "inline", marginLeft: 8 }}>
                    <input type="hidden" name="reassignId" value={ra.r.id} />
                    <input type="hidden" name="taskDate" value={date} />
                    <button className="btn-link" type="submit">Cancel</button>
                  </form>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
              {canComplete && !doneFlag && (
                <form action={acknowledgeTask}>
                  <input type="hidden" name="taskId" value={t.id} />
                  <input type="hidden" name="taskDate" value={date} />
                  <button className="btn" type="submit">Mark done</button>
                </form>
              )}
              {canComplete && doneFlag && (
                <form action={unacknowledgeTask}>
                  <input type="hidden" name="taskId" value={t.id} />
                  <input type="hidden" name="taskDate" value={date} />
                  <button className="btn btn-ghost" type="submit">Reopen</button>
                </form>
              )}

              {/* Staff hand-off request (only on their own, not-done duty, no active handoff) */}
              {mine && !doneFlag && !ra && roster.length > 1 && (
                <details>
                  <summary className="btn btn-ghost" style={{ display: "inline-block" }}>Hand off…</summary>
                  <form action={requestReassign} style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <input type="hidden" name="taskId" value={t.id} />
                    <input type="hidden" name="taskDate" value={date} />
                    <select name="targetEmployeeId" required defaultValue="">
                      <option value="" disabled>Hand to…</option>
                      {roster.filter((r) => r.id !== myId).map((r) => (
                        <option key={r.id} value={r.id}>{r.fullName}</option>
                      ))}
                    </select>
                    <input name="reason" placeholder="Reason (optional)" style={{ minWidth: 160 }} />
                    <button className="btn" type="submit">Request</button>
                  </form>
                </details>
              )}

              {/* Manager: approve an accepted handoff inline */}
              {canManage && ra?.r.status === "accepted" && (
                <>
                  <form action={decideReassign}>
                    <input type="hidden" name="reassignId" value={ra.r.id} />
                    <input type="hidden" name="taskDate" value={date} />
                    <input type="hidden" name="decision" value="approve" />
                    <button className="btn" type="submit">Approve handoff</button>
                  </form>
                  <form action={decideReassign}>
                    <input type="hidden" name="reassignId" value={ra.r.id} />
                    <input type="hidden" name="taskDate" value={date} />
                    <input type="hidden" name="decision" value="deny" />
                    <button className="btn btn-ghost" type="submit">Deny</button>
                  </form>
                </>
              )}
            </div>

            {/* Manager controls */}
            {canManage && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
                <form action={setAssignee} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="hidden" name="taskId" value={t.id} />
                  <input type="hidden" name="taskDate" value={date} />
                  <select name="assigneeId" defaultValue={t.assigneeId ?? (t.autoRole ? `__${t.autoRole}__` : t.assigneeTitle ? `__title_shared__:${t.assigneeTitle}` : t.assigneeRole ? `__role_shared__:${t.assigneeRole}` : "")}>
                    <option value="">— Unassigned —</option>
                    <option value="__opener__">Opening stylist (auto)</option>
                    <option value="__closer__">Closing stylist (auto)</option>
                    {roster.map((r) => (
                      <option key={r.id} value={r.id}>{r.fullName}</option>
                    ))}
                    {titles.length > 0 && (
                      <optgroup label="Any with job title (shared)">
                        {titles.map((jt) => (
                          <option key={jt} value={`__title_shared__:${jt}`}>Any {jt}</option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Any with access role (shared)">
                      {ASSIGN_ROLES.map((r) => (
                        <option key={r.id} value={`__role_shared__:${r.id}`}>Any {r.label}</option>
                      ))}
                    </optgroup>
                  </select>
                  <button className="btn btn-ghost" type="submit">Set</button>
                </form>
                <form action={deleteDuty}>
                  <input type="hidden" name="taskId" value={t.id} />
                  <input type="hidden" name="taskDate" value={date} />
                  <button className="btn-link" type="submit" style={{ color: "var(--terra,#a0624a)" }}>Remove</button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Daily Duties</div>
          <h1 className="title">Roles &amp; Checklists</h1>
          <p className="lede">
            Opening and closing checklists and the day’s responsibilities — each item is
            assigned and acknowledged when it’s done.
          </p>
        </div>

        {setupNeeded ? (
          <div className="notice">
            The duties tables aren’t set up yet. {canManage
              ? "Go to Admin → “Set up / update database”, then come back."
              : "An admin needs to finish setup."}
          </div>
        ) : (
          <>
            {/* The day — heading + progress */}
            <div
              className="card"
              style={{ cursor: "default", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}
            >
              <div>
                <div style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.25rem" }}>
                  {prettyDate(date)}
                  {date === today && <span className="tag ok" style={{ marginLeft: 8, verticalAlign: "middle" }}>Today</span>}
                </div>
                <div className="muted" style={{ fontSize: "0.85rem", marginTop: 2 }}>
                  {total === 0 ? "No duties yet" : `${done} of ${total} done`}
                </div>
              </div>
              {total > 0 && (
                <div aria-hidden style={{ minWidth: 120, flex: "0 0 auto" }}>
                  <div style={{ height: 8, borderRadius: 4, background: "var(--line,#e7ded5)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.round((done / total) * 100)}%`, height: "100%", background: "var(--olive,#5b7a4b)" }} />
                  </div>
                </div>
              )}
            </div>

            {/* Date navigation */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
              <Link className="btn btn-ghost" href={`/duties?d=${prev}`}>←</Link>
              <Link className="btn btn-ghost" href={`/duties?d=${next}`}>→</Link>
              {date !== today && <Link className="btn btn-ghost" href="/duties">Today</Link>}
              <form method="get" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {/* key forces the native input to reset to the current day on Prev/Next */}
                <input key={date} type="date" name="d" defaultValue={date} aria-label="Jump to date" />
                <button className="btn btn-ghost" type="submit">Go</button>
              </form>
              <span style={{ flex: 1 }} />
              {canManage && <Link className="btn btn-ghost" href="/duties/templates">Checklists</Link>}
            </div>

            {/* Things needing my action */}
            {toAccept.length > 0 && (
              <div className="card" style={{ cursor: "default", marginBottom: 18, borderLeft: "3px solid var(--gold,#c8a04a)" }}>
                <h3>Handoffs waiting on you</h3>
                {toAccept.map((r) => (
                  <div key={r.r.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <span>
                      <strong>{r.requesterName}</strong> wants to hand you “{r.taskTitle}”
                      {r.r.reason && <> — “{r.r.reason}”</>}
                    </span>
                    <form action={respondReassign}>
                      <input type="hidden" name="reassignId" value={r.r.id} />
                      <input type="hidden" name="taskDate" value={date} />
                      <input type="hidden" name="decision" value="accept" />
                      <button className="btn" type="submit">Accept</button>
                    </form>
                    <form action={respondReassign}>
                      <input type="hidden" name="reassignId" value={r.r.id} />
                      <input type="hidden" name="taskDate" value={date} />
                      <input type="hidden" name="decision" value="decline" />
                      <button className="btn btn-ghost" type="submit">Decline</button>
                    </form>
                  </div>
                ))}
              </div>
            )}

            {toApprove.length > 0 && (
              <div className="card" style={{ cursor: "default", marginBottom: 18, borderLeft: "3px solid var(--gold,#c8a04a)" }}>
                <h3>Handoffs to approve</h3>
                {toApprove.map((r) => (
                  <div key={r.r.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <span>
                      <strong>{r.requesterName}</strong> → <strong>{r.targetName}</strong> for “{r.taskTitle}”
                      {" "}(accepted)
                    </span>
                    <form action={decideReassign}>
                      <input type="hidden" name="reassignId" value={r.r.id} />
                      <input type="hidden" name="taskDate" value={date} />
                      <input type="hidden" name="decision" value="approve" />
                      <button className="btn" type="submit">Approve</button>
                    </form>
                    <form action={decideReassign}>
                      <input type="hidden" name="reassignId" value={r.r.id} />
                      <input type="hidden" name="taskDate" value={date} />
                      <input type="hidden" name="decision" value="deny" />
                      <button className="btn btn-ghost" type="submit">Deny</button>
                    </form>
                  </div>
                ))}
              </div>
            )}

            {/* Manager: build the day */}
            {canManage && (
              <details className="card" style={{ cursor: "default", marginBottom: 22 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Assign duties for this day</summary>

                {templates.length > 0 && (
                  <form action={applyTemplate} style={{ marginTop: 14 }}>
                    <input type="hidden" name="taskDate" value={date} />
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="tpl">Add a checklist</label>
                        <select id="tpl" name="templateId" defaultValue="" required>
                          <option value="" disabled>Choose a checklist…</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>{t.name} ({t.items.length})</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="tpl-assignee">Assign all to</label>
                        <select id="tpl-assignee" name="assigneeId" defaultValue="__default__">
                          <option value="__default__">Use checklist&apos;s default</option>
                          <option value="">Auto (Opening→opener, Closing→closer)</option>
                          <option value="__opener__">Opening stylist (first appt)</option>
                          <option value="__closer__">Closing stylist (last appt)</option>
                          {roster.map((r) => (
                            <option key={r.id} value={r.id}>{r.fullName}</option>
                          ))}
                          {titles.length > 0 && (
                            <>
                              <optgroup label="By job title — each does their own">
                                {titles.map((jt) => (
                                  <option key={`e-${jt}`} value={`__title_each__:${jt}`}>All {jt} (each)</option>
                                ))}
                              </optgroup>
                              <optgroup label="By job title — shared (anyone)">
                                {titles.map((jt) => (
                                  <option key={`s-${jt}`} value={`__title_shared__:${jt}`}>Any {jt} (shared)</option>
                                ))}
                              </optgroup>
                            </>
                          )}
                          <optgroup label="By access role — each does their own">
                            {ASSIGN_ROLES.map((r) => (
                              <option key={`re-${r.id}`} value={`__role_each__:${r.id}`}>All {r.label} (each)</option>
                            ))}
                          </optgroup>
                          <optgroup label="By access role — shared (anyone)">
                            {ASSIGN_ROLES.map((r) => (
                              <option key={`rs-${r.id}`} value={`__role_shared__:${r.id}`}>Any {r.label} (shared)</option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                    </div>
                    <p className="muted" style={{ fontSize: "0.8rem", margin: "8px 0 0" }}>
                      Leave on Auto and the Opening checklist follows the first appointment of the day and Closing the last — updating as the schedule changes.
                    </p>
                    <button className="btn" type="submit" style={{ marginTop: 10 }}>Add checklist to {prettyDate(date)}</button>
                  </form>
                )}

                <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid var(--line,#e7ded5)" }} />

                <form action={addDuty}>
                  <input type="hidden" name="taskDate" value={date} />
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="duty-title">Single duty / role</label>
                      <input id="duty-title" name="title" placeholder="e.g. Front desk lead" required />
                    </div>
                    <div className="field">
                      <label htmlFor="duty-section">Section</label>
                      <select id="duty-section" name="section" defaultValue="role">
                        {DUTY_SECTIONS.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="duty-assignee">Assign to</label>
                      <select id="duty-assignee" name="assigneeId" defaultValue="">
                        <option value="">— Unassigned —</option>
                        <option value="__opener__">Opening stylist (first appt)</option>
                        <option value="__closer__">Closing stylist (last appt)</option>
                        {roster.map((r) => (
                          <option key={r.id} value={r.id}>{r.fullName}</option>
                        ))}
                        {titles.length > 0 && (
                          <>
                            <optgroup label="By job title — each does their own">
                              {titles.map((jt) => (
                                <option key={`e-${jt}`} value={`__title_each__:${jt}`}>All {jt} (each)</option>
                              ))}
                            </optgroup>
                            <optgroup label="By job title — shared (anyone)">
                              {titles.map((jt) => (
                                <option key={`s-${jt}`} value={`__title_shared__:${jt}`}>Any {jt} (shared)</option>
                              ))}
                            </optgroup>
                          </>
                        )}
                        <optgroup label="By access role — each does their own">
                          {ASSIGN_ROLES.map((r) => (
                            <option key={`re-${r.id}`} value={`__role_each__:${r.id}`}>All {r.label} (each)</option>
                          ))}
                        </optgroup>
                        <optgroup label="By access role — shared (anyone)">
                          {ASSIGN_ROLES.map((r) => (
                            <option key={`rs-${r.id}`} value={`__role_shared__:${r.id}`}>Any {r.label} (shared)</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                  <div className="field" style={{ marginTop: 10 }}>
                    <label htmlFor="duty-detail">Notes (optional)</label>
                    <input id="duty-detail" name="detail" placeholder="Any extra detail" />
                  </div>
                  <button className="btn" type="submit" style={{ marginTop: 10 }}>Add duty</button>
                </form>
              </details>
            )}

            {/* The board */}
            {total === 0 ? (
              <div className="notice">
                No duties for {prettyDate(date)} yet.
                {canManage && <> Use <strong>Assign duties for this day</strong> above to add the opening/closing checklists.</>}
              </div>
            ) : (
              DUTY_SECTIONS.map((sec) => {
                const rows = tasks.filter((t) => t.task.section === sec.id);
                if (rows.length === 0) return null;
                const secDone = rows.filter((r) => r.task.status === "done").length;
                // Descriptions of the checklist(s) that fed this section today.
                const descs = [...new Set(rows.map((r) => r.task.templateId).filter(Boolean) as string[])]
                  .map((id) => metaById.get(id))
                  .filter((m): m is NonNullable<typeof m> => !!m?.description);
                return (
                  <section key={sec.id} style={{ marginBottom: 26 }}>
                    <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.25rem", margin: "0 0 6px" }}>
                      {sec.label}{" "}
                      <span className="muted" style={{ fontSize: "0.9rem", fontWeight: 400 }}>· {secDone}/{rows.length}</span>
                    </h2>
                    {descs.map((m) => (
                      <p key={m.id} className="muted" style={{ fontStyle: "italic", margin: "0 0 12px", fontSize: "0.88rem" }}>
                        {m.description}
                      </p>
                    ))}
                    {rows.map((row, i) => {
                      const prevGroup = i > 0 ? rows[i - 1].task.groupLabel : undefined;
                      const showGroup = (row.task.groupLabel ?? "") !== (prevGroup ?? "");
                      return (
                        <div key={row.task.id}>
                          {showGroup && row.task.groupLabel && (
                            <div className="muted" style={{ fontWeight: 600, margin: "10px 0 6px", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.06em" }}>
                              {row.task.groupLabel}
                            </div>
                          )}
                          <TaskCard row={row} />
                        </div>
                      );
                    })}
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
