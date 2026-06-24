import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { isCategory } from "@/lib/documents";

export const runtime = "nodejs";

// Server-side upload for normal-sized files. The browser POSTs the file here and
// we store it with the Blob server SDK — the upload finishes on the HTTP
// response, avoiding the client-upload completion handshake. Capped below the
// serverless body limit; larger files use the client-upload route instead.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: "Document storage isn’t connected yet. In Vercel, open this project → Storage → connect a Blob store, then redeploy." },
      { status: 503 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const category = String(form?.get("category") ?? "general");

  if (!isCategory(category)) {
    return Response.json({ error: "Unknown category." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "No file received." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File too large for this path." }, { status: 413 });
  }

  try {
    const blob = await put(`documents/${category}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type || undefined,
    });
    return Response.json({ ok: true, url: blob.url });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 },
    );
  }
}
