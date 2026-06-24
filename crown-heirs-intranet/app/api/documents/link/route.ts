import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { isCategory } from "@/lib/documents";
import { addLink, updateLink } from "@/lib/documentLinks";

function readLink(body: Record<string, unknown>) {
  const category = typeof body.category === "string" ? body.category : "general";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!isCategory(category)) return { error: "Unknown category." as const };
  if (!title) return { error: "Give the link a name." as const };
  if (!/^https?:\/\/\S+$/i.test(url)) return { error: "Enter a valid link starting with http:// or https://" as const };
  return { category, title, url };
}

// Add an externally-hosted document link (admins only). No file upload — just
// a URL to a PDF/doc hosted elsewhere (Google Drive, Dropbox, etc.).
export async function POST(request: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = readLink(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  await addLink({ ...parsed, createdBy: session?.user?.email ?? null });
  return Response.json({ ok: true });
}

// Edit an existing link (admins only).
export async function PATCH(request: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return Response.json({ error: "Missing link id." }, { status: 400 });
  }
  const parsed = readLink(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  await updateLink(id, parsed);
  return Response.json({ ok: true });
}
