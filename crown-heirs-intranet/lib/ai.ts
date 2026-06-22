import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Drafts or polishes a short, first-person staff bio with Claude.
export async function generateBio(opts: {
  name?: string | null;
  role?: string | null;
  notes?: string | null;
  current?: string | null;
}): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const facts: string[] = [];
  if (opts.name) facts.push(`Name: ${opts.name}`);
  if (opts.role) facts.push(`Role / title: ${opts.role}`);
  if (opts.notes) facts.push(`A few words from them: ${opts.notes}`);
  if (opts.current) facts.push(`Their current draft (improve on this): ${opts.current}`);

  const prompt =
    "Write a warm, genuine, first-person staff bio for a salon team directory. " +
    "Two to four sentences. Friendly and professional — no clichés, buzzwords, or hashtags. " +
    "Return only the bio text, nothing else.\n\n" +
    facts.join("\n");

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text.trim() : null;
  } catch (err) {
    console.error("AI bio generation failed:", err);
    return null;
  }
}
