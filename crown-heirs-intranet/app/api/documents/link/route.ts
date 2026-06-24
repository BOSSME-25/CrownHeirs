import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { isCategory } from "@/lib/documents";
import { addLink } from "@/lib/documentLinks";

// Add an externally-hosted document link (admins only). No file upload — just
// a URL to a PDF/doc hosted elsewhere (Google Drive, Dropbox, etc.).
export async function POST(request: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const category = typeof body.category === "string" ? body.category : "general";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";

  if (!isCategory(category)) {
    return Response.json({ error: "Unknown category." }, { status: 400 });
  }
  if (!title) {
    return Response.json({ error: "Give the link a name." }, { status: 400 });
  }
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return Response.json({ error: "Enter a valid link starting with http:// or https://" }, { status: 400 });
  }

  await addLink({ category, title, url, createdBy: session?.user?.email ?? null });
  return Response.json({ ok: true });
}
