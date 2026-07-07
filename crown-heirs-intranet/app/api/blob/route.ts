import { get } from "@vercel/blob";
import { auth } from "@/auth";

export const runtime = "nodejs";

// Branding (logo/favicon/login image) must be visible before sign-in; the rest
// require a signed-in user. Only these prefixes are ever served — the private
// store also holds sensitive files (e.g. credentials/) that must never be
// reachable here.
const PUBLIC_PREFIXES = ["branding/"];
const AUTHED_PREFIXES = ["avatars/", "notes/", "messages/", "compliance/"];

export async function GET(request: Request): Promise<Response> {
  const pathname = new URL(request.url).searchParams.get("p") ?? "";
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthed = AUTHED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isPublic && !isAuthed) return new Response("Forbidden", { status: 403 });

  if (!isPublic) {
    const session = await auth();
    if (!session?.user?.email) return new Response("Unauthorized", { status: 401 });
  }

  try {
    const res = await get(pathname, { access: "private" });
    if (!res || res.statusCode !== 200 || !res.stream) return new Response("Not found", { status: 404 });
    return new Response(res.stream, {
      headers: {
        "content-type": res.blob.contentType || "application/octet-stream",
        "cache-control": isPublic ? "public, max-age=3600" : "private, max-age=300",
      },
    });
  } catch {
    return new Response("Could not load file", { status: 500 });
  }
}
