import { auth } from "@/auth";
import { generateBio, aiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return new Response("Unauthorized", { status: 401 });
  if (!aiConfigured()) return Response.json({ error: "AI assistant isn’t set up yet." });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string; role?: string; notes?: string; current?: string;
  };
  const bio = await generateBio({
    name: body.name,
    role: body.role,
    notes: body.notes,
    current: body.current,
  });
  if (!bio) return Response.json({ error: "Couldn’t generate a bio right now." });
  return Response.json({ bio });
}
