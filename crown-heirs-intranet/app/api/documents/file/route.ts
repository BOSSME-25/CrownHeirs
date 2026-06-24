import { get } from "@vercel/blob";
import { auth } from "@/auth";

export const runtime = "nodejs";

// Streams a private document to any signed-in employee. Files are stored in a
// private Blob store (not publicly reachable), so they're served through here
// after an auth check instead of via a raw URL.
export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const pathname = new URL(request.url).searchParams.get("pathname") ?? "";
  // Only ever serve uploaded documents.
  if (!pathname.startsWith("documents/")) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const res = await get(pathname, { access: "private" });
    if (!res || res.statusCode !== 200 || !res.stream) {
      return new Response("Not found", { status: 404 });
    }
    const name = pathname.split("/").pop() || "file";
    return new Response(res.stream, {
      headers: {
        "content-type": res.blob.contentType || "application/octet-stream",
        "content-disposition": `inline; filename="${name.replace(/"/g, "")}"`,
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    return new Response("Could not load file", { status: 500 });
  }
}
