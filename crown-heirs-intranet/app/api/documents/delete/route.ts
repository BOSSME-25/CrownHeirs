import { del } from "@vercel/blob";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { deleteLink } from "@/lib/documentLinks";

// Delete a document (admins only): an uploaded file by its blob `url`, or an
// externally-hosted link by its `linkId`.
export async function POST(request: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  if (typeof body.linkId === "string" && body.linkId) {
    await deleteLink(body.linkId);
    return Response.json({ ok: true });
  }

  // Uploaded files: delete by pathname (works for the private store) or url.
  const target = typeof body.pathname === "string" && body.pathname
    ? body.pathname
    : typeof body.url === "string" ? body.url : "";
  if (!target) {
    return Response.json({ error: "Missing pathname" }, { status: 400 });
  }
  await del(target);
  return Response.json({ ok: true });
}
