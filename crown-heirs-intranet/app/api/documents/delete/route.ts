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

  const url = typeof body.url === "string" ? body.url : "";
  if (!url) {
    return Response.json({ error: "Missing url" }, { status: 400 });
  }
  await del(url);
  return Response.json({ ok: true });
}
