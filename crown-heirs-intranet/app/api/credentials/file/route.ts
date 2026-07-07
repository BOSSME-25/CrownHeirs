import { get } from "@vercel/blob";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { getEmployeeByEmail } from "@/lib/employees";
import { getCredential } from "@/lib/credentials";

export const runtime = "nodejs";

// Streams a certificate to its owner or a manager. Certificates live in the
// private Blob store, so they're served through here after an auth check.
export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const which = url.searchParams.get("which") === "pending" ? "pending" : "current";

  const cred = await getCredential(id);
  if (!cred) return new Response("Not found", { status: 404 });

  // Owner or a manager may view.
  const access = await getAccess(email);
  if (!access.canApprove) {
    const me = await getEmployeeByEmail(email);
    if (!me || me.id !== cred.employeeId) return new Response("Forbidden", { status: 403 });
  }

  const pathname = which === "pending" ? cred.pendingPathname : cred.certificatePathname;
  if (!pathname) return new Response("Not found", { status: 404 });

  try {
    const res = await get(pathname, { access: "private" });
    if (!res || res.statusCode !== 200 || !res.stream) return new Response("Not found", { status: 404 });
    const name = pathname.split("/").pop() || "certificate";
    return new Response(res.stream, {
      headers: {
        "content-type": res.blob.contentType || "application/octet-stream",
        "content-disposition": `inline; filename="${name.replace(/"/g, "")}"`,
        "cache-control": "private, max-age=60",
      },
    });
  } catch {
    return new Response("Could not load file", { status: 500 });
  }
}
