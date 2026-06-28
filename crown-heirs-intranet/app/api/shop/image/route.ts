import { get } from "@vercel/blob";
import { auth } from "@/auth";
import { getProduct } from "@/lib/shop";

export const runtime = "nodejs";

// Serves an uploaded product photo from the private blob store to any
// signed-in team member.
export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) return new Response("Unauthorized", { status: 401 });

  const id = new URL(request.url).searchParams.get("id") ?? "";
  const product = await getProduct(id);
  const pathname = product?.product.imagePathname;
  if (!pathname) return new Response("Not found", { status: 404 });

  try {
    const res = await get(pathname, { access: "private" });
    if (!res || res.statusCode !== 200 || !res.stream) return new Response("Not found", { status: 404 });
    return new Response(res.stream, {
      headers: {
        "content-type": res.blob.contentType || "application/octet-stream",
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    return new Response("Could not load image", { status: 500 });
  }
}
