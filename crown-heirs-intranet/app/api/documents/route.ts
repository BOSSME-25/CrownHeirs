import { auth } from "@/auth";
import { listDocuments } from "@/lib/blob";
import { listLinks } from "@/lib/documentLinks";
import { isCategory } from "@/lib/documents";

// List documents (any signed-in employee). Optional ?category= filter.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") ?? undefined;
  if (category && !isCategory(category)) {
    return Response.json({ error: "Unknown category" }, { status: 400 });
  }

  // Uploaded files (Blob) — may be unavailable if no store is connected.
  let uploaded: Awaited<ReturnType<typeof listDocuments>> = [];
  let storeMissing = false;
  try {
    uploaded = await listDocuments(category);
  } catch {
    storeMissing = true;
  }

  // Externally-hosted links (DB) — independent of Blob.
  const links = await listLinks(category).catch(() => []);

  const documents = [...uploaded, ...links].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  // Only flag the store as missing when there's nothing else to show, so links
  // still appear when Blob isn't connected.
  return Response.json({ documents, storeMissing: storeMissing && links.length === 0 });
}
