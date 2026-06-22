import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import { getAccess } from "@/lib/perms";
import { listTemplates } from "@/lib/duties";
import { TEMPLATE_SECTIONS } from "@/lib/duties-constants";
import {
  addItem,
  createTemplate,
  deleteItem,
  deleteTemplate,
  moveItem,
  renameTemplate,
  updateItem,
} from "@/app/duties/templates/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checklists — Daily Duties" };

const sectionLabel = (id: string) => TEMPLATE_SECTIONS.find((s) => s.id === id)?.label ?? "Other";

export default async function TemplatesPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canApprove) redirect("/duties");

  let setupNeeded = false;
  let templates: Awaited<ReturnType<typeof listTemplates>> = [];
  try {
    templates = await listTemplates();
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow"><Link href="/duties">Daily Duties</Link> · Checklists</div>
          <h1 className="title">Checklist Templates</h1>
          <p className="lede">
            Build the reusable Opening and Closing checklists (and any others). Drop a
            checklist onto a day from the Daily Duties board, then assign each item.
          </p>
        </div>

        {setupNeeded ? (
          <div className="notice">
            The duties tables aren’t set up yet. Go to Admin → “Set up / update database”, then come back.
          </div>
        ) : (
          <>
            {templates.map((tpl) => (
              <div key={tpl.id} className="card" style={{ cursor: "default", marginBottom: 20 }}>
                <form action={renameTemplate} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input type="hidden" name="templateId" value={tpl.id} />
                  <input name="name" defaultValue={tpl.name} style={{ fontWeight: 600, minWidth: 200 }} required />
                  <select name="section" defaultValue={tpl.section}>
                    {TEMPLATE_SECTIONS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <button className="btn btn-ghost" type="submit">Save</button>
                  <span style={{ flex: 1 }} />
                  <span className="tag">{sectionLabel(tpl.section)}</span>
                </form>

                <ol style={{ margin: "14px 0 0", paddingLeft: 22 }}>
                  {tpl.items.map((it, idx) => (
                    <li key={it.id} style={{ marginBottom: 8 }}>
                      <form action={updateItem} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <input type="hidden" name="itemId" value={it.id} />
                        <input name="title" defaultValue={it.title} style={{ minWidth: 240, flex: 1 }} required />
                        <button className="btn btn-ghost" type="submit">Save</button>
                      </form>
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <form action={moveItem}>
                          <input type="hidden" name="itemId" value={it.id} />
                          <input type="hidden" name="dir" value="up" />
                          <button className="btn-link" type="submit" disabled={idx === 0}>↑</button>
                        </form>
                        <form action={moveItem}>
                          <input type="hidden" name="itemId" value={it.id} />
                          <input type="hidden" name="dir" value="down" />
                          <button className="btn-link" type="submit" disabled={idx === tpl.items.length - 1}>↓</button>
                        </form>
                        <form action={deleteItem}>
                          <input type="hidden" name="itemId" value={it.id} />
                          <button className="btn-link" type="submit" style={{ color: "var(--terra,#a0624a)" }}>Remove</button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ol>
                {tpl.items.length === 0 && <p className="muted" style={{ marginTop: 10 }}>No items yet.</p>}

                <form action={addItem} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                  <input type="hidden" name="templateId" value={tpl.id} />
                  <input name="title" placeholder="Add a checklist item…" style={{ minWidth: 240, flex: 1 }} required />
                  <button className="btn" type="submit">Add item</button>
                </form>

                <form action={deleteTemplate} style={{ marginTop: 12 }}>
                  <input type="hidden" name="templateId" value={tpl.id} />
                  <button className="btn-link" type="submit" style={{ color: "var(--terra,#a0624a)" }}>Delete this checklist</button>
                </form>
              </div>
            ))}

            <div className="card" style={{ cursor: "default" }}>
              <h3>New checklist</h3>
              <form action={createTemplate} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                <input name="name" placeholder="Checklist name" style={{ minWidth: 220 }} required />
                <select name="section" defaultValue="other">
                  {TEMPLATE_SECTIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                <button className="btn" type="submit">Create</button>
              </form>
            </div>
          </>
        )}
      </main>
    </>
  );
}
