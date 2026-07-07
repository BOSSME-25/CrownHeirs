import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { getOrgSettings } from "@/lib/orgConfig";

export const metadata = { title: "Sign in — Team Hub" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { error } = await searchParams;

  let businessName = "Crown Heirs";
  let logoUrl: string | undefined;
  let loginImageUrl: string | undefined;
  try {
    const { settings } = await getOrgSettings();
    if (settings.businessName) businessName = settings.businessName;
    logoUrl = settings.logoUrl;
    loginImageUrl = settings.loginImageUrl;
  } catch {
    // defaults
  }

  return (
    <main
      className="login-shell"
      style={loginImageUrl ? { backgroundImage: `url(${loginImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      <div className="login-card">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={businessName} style={{ height: 48, margin: "0 auto 8px", display: "block" }} />
        ) : (
          <div className="mark">{businessName}</div>
        )}
        <h1>Team Hub</h1>
        <p>This is a private space for {businessName} staff. Sign in with your work Google account to continue.</p>

        {error && (
          <div className="notice err">
            That account isn’t on the staff list. Ask Emily or Bethany to add you.
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button type="submit" className="btn" style={{ width: "100%", justifyContent: "center" }}>
            Sign in with Google
          </button>
        </form>
      </div>
    </main>
  );
}
