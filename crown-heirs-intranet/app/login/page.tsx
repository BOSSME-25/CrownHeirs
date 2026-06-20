import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export const metadata = { title: "Sign in — Crown Heirs Team Hub" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { error } = await searchParams;

  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="mark">Crown Heirs</div>
        <h1>Team Hub</h1>
        <p>This is a private space for Crown Heirs staff. Sign in with your work Google account to continue.</p>

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
