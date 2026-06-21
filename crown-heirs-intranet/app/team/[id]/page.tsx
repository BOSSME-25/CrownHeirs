import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getAccess, accessLabelFor } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import Avatar from "@/components/Avatar";
import { getEmployee, labelFor, EMPLOYMENT_TYPES, ROLES } from "@/lib/employees";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile — Crown Heirs Team Hub" };

function AboutBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <h2>{label}</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{value}</p>
    </>
  );
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  const { id } = await params;

  const e = await getEmployee(id);
  if (!e) notFound();

  const isMe = e.email.toLowerCase() === session?.user?.email?.toLowerCase();
  const hasAbout = e.bio || e.whyCrownHeirs || e.fiveYearPlan || e.favoriteAway;

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">
            <Link href="/team" style={{ color: "var(--terra)", textDecoration: "none" }}>← Back to team</Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 8 }}>
            <Avatar name={e.fullName} src={e.photoUrl} size={80} />
            <div>
              <h1 className="title" style={{ fontSize: "2rem" }}>
                {e.fullName}
                {(() => {
                  const b = accessLabelFor(e.email, e.role);
                  return b ? <span className={`role-badge role-${b.key}`}>{b.label}</span> : null;
                })()}
              </h1>
              <p style={{ color: "var(--terra)", fontSize: "1.05rem" }}>{e.jobTitle ?? ""}</p>
            </div>
          </div>
        </div>

        <div className="prose">
          <h2>Contact</h2>
          <p>
            {e.email}
            {e.phone ? <><br />{e.phone}</> : null}
            <br />
            <span className="muted">
              {labelFor(EMPLOYMENT_TYPES, e.employmentType)} · {labelFor(ROLES, e.role)}
            </span>
          </p>

          {access.canViewHr && (
            <>
              <h2>
                HR details{" "}
                <span className="muted" style={{ fontSize: "0.75rem", fontWeight: 400 }}>
                  (managers &amp; admins only)
                </span>
              </h2>
              <p>
                {e.personalEmail ? <>Personal email: {e.personalEmail}<br /></> : null}
                {e.emergencyContactName ? (
                  <>Emergency contact: {e.emergencyContactName}
                    {e.emergencyContactPhone ? ` · ${e.emergencyContactPhone}` : ""}<br /></>
                ) : null}
                {e.startDate ? <>Start date: {e.startDate}<br /></> : null}
                {!e.personalEmail && !e.emergencyContactName && !e.startDate && (
                  <span className="muted">None on file yet.</span>
                )}
              </p>
            </>
          )}

          {hasAbout ? (
            <>
              <AboutBlock label="Bio" value={e.bio} />
              <AboutBlock label="Why Crown Heirs" value={e.whyCrownHeirs} />
              <AboutBlock label="Five-year plan" value={e.fiveYearPlan} />
              <AboutBlock label="Favorite thing away from the salon" value={e.favoriteAway} />
            </>
          ) : (
            <p className="muted">No “about” info yet.{isMe ? " Add yours from My Profile." : ""}</p>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
            {isMe && <Link className="btn" href="/me">Edit my profile</Link>}
            {access.canManageTeam && <Link className="btn btn-ghost" href={`/team/${e.id}/edit`}>Edit</Link>}
          </div>
        </div>
      </main>
    </>
  );
}
