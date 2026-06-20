import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { isCategory } from "@/lib/documents";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXT = [
  ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
  ".txt", ".md", ".png", ".jpg", ".jpeg", ".mp4",
];

// Upload a document (admins only).
export async function POST(request: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return new Response("Forbidden", { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const category = String(form.get("category") ?? "general");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }
  if (!isCategory(category)) {
    return Response.json({ error: "Unknown category" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File exceeds 25 MB limit" }, { status: 400 });
  }
  const lower = file.name.toLowerCase();
  if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
    return Response.json({ error: "Unsupported file type" }, { status: 400 });
  }

  // Random suffix keeps blob URLs unguessable and avoids name collisions.
  const blob = await put(`documents/${category}/${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  return Response.json({ ok: true, url: blob.url, pathname: blob.pathname });
}
