import { del } from "@vercel/blob";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";

// Delete a document by its blob URL (admins only).
export async function POST(request: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { url } = await request.json().catch(() => ({ url: undefined }));
  if (!url || typeof url !== "string") {
    return Response.json({ error: "Missing url" }, { status: 400 });
  }

  await del(url);
  return Response.json({ ok: true });
}
