import { auth } from "@/auth";
import { listDocuments } from "@/lib/blob";
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

  try {
    const documents = await listDocuments(category);
    return Response.json({ documents });
  } catch {
    // Most commonly: Blob store not connected yet.
    return Response.json({ documents: [], storeMissing: true });
  }
}
