import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import { getOrgSettings, FONT_PRESETS } from "@/lib/orgConfig";
import { canEncrypt } from "@/lib/crypto";
import { saveSettings } from "@/app/admin/settings/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Crown Heirs Team Hub" };

export default async function SettingsPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canSystem) redirect("/");

  let setupNeeded = false;
  let settings: Awaited<ReturnType<typeof getOrgSettings>>["settings"] = {};
  try {
    settings = (await getOrgSettings()).settings;
  } catch {
    setupNeeded = true;
  }
  const hasToken = !!settings.pos?.squareTokenEnc;
  const provider = settings.pos?.provider ?? (process.env.SQUARE_ACCESS_TOKEN ? "square" : "none");

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Admin · Settings</div>
          <h1 className="title">Business Settings</h1>
          <p className="lede">Branding, notifications, and your point-of-sale integration.</p>
        </div>

        {setupNeeded ? (
          <div className="notice">Run <strong>Admin → Set up / update database</strong> first.</div>
        ) : (
          <form action={saveSettings} className="prose">
            <h2>Business</h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="businessName">Business name</label>
                <input id="businessName" name="businessName" defaultValue={settings.businessName ?? ""} placeholder="Crown Heirs" />
              </div>
              <div className="field">
                <label htmlFor="accent">Primary color (hex)</label>
                <input id="accent" name="accent" defaultValue={settings.accent ?? ""} placeholder="#a0624a" />
              </div>
              <div className="field">
                <label htmlFor="accent2">Secondary color (hex)</label>
                <input id="accent2" name="accent2" defaultValue={settings.accent2 ?? ""} placeholder="#c8952a" />
              </div>
              <div className="field">
                <label htmlFor="font">Font style</label>
                <select id="font" name="font" defaultValue={settings.font ?? "crown"}>
                  {Object.entries(FONT_PRESETS).map(([key, f]) => (
                    <option key={key} value={key}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="notifyFrom">Notification “from” address</label>
                <input id="notifyFrom" name="notifyFrom" defaultValue={settings.notifyFrom ?? ""} placeholder="Team Hub <admin@…>" />
              </div>
              <div className="field">
                <label htmlFor="logo">Logo {settings.logoUrl && "(uploaded — choose a file to replace)"}</label>
                {settings.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={settings.logoUrl} alt="" style={{ height: 40, display: "block", marginBottom: 6 }} />
                )}
                <input id="logo" name="logo" type="file" accept="image/*" />
              </div>
              <div className="field">
                <label htmlFor="favicon">Favicon {settings.faviconUrl && "(set — replace)"}</label>
                <input id="favicon" name="favicon" type="file" accept="image/*,.ico" />
              </div>
              <div className="field">
                <label htmlFor="loginImage">Login background {settings.loginImageUrl && "(set — replace)"}</label>
                <input id="loginImage" name="loginImage" type="file" accept="image/*" />
              </div>
            </div>

            <h2 style={{ marginTop: 18 }}>Point of Sale (KPIs)</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              KPIs and tip/retention tracking pull from your POS. Everything else in the app works without one.
            </p>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="provider">Provider</label>
                <select id="provider" name="provider" defaultValue={provider}>
                  <option value="square">Square</option>
                  <option value="manual">Manual / CSV (any POS)</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="squareEnv">Square environment</label>
                <select id="squareEnv" name="squareEnv" defaultValue={settings.pos?.squareEnv ?? "production"}>
                  <option value="production">Production</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="squareLocationId">Square location ID</label>
                <input id="squareLocationId" name="squareLocationId" defaultValue={settings.pos?.squareLocationId ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="squareToken">Square access token {hasToken && <span className="muted">(saved — leave blank to keep)</span>}</label>
                <input id="squareToken" name="squareToken" type="password" placeholder={hasToken ? "••••••••" : "Paste to connect"} autoComplete="off" />
              </div>
            </div>
            {!canEncrypt() && (
              <div className="notice" style={{ marginTop: 4 }}>
                To store a POS token in the app, set <code>APP_ENCRYPTION_KEY</code> in Vercel first.
                (Crown Heirs can keep using the existing environment variables instead.)
              </div>
            )}

            <button className="btn" type="submit" style={{ marginTop: 12 }}>Save settings</button>
          </form>
        )}
      </main>
    </>
  );
}
