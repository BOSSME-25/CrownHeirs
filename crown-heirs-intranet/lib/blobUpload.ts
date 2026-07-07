import "server-only";
import { put } from "@vercel/blob";

// Uploads a file to the private blob store under `prefix/` and returns a URL
// that serves it back through our authenticated proxy (/api/blob). The store
// is private, so files are never publicly addressable — they stream through
// the proxy after an access check.
export async function putPrivate(prefix: string, file: File): Promise<string> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
  const blob = await put(`${prefix}/${safe}`, file, {
    access: "private",
    addRandomSuffix: true,
    contentType: file.type || undefined,
  });
  return `/api/blob?p=${encodeURIComponent(blob.pathname)}`;
}
