import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Per-field writing instructions for the profile assistant.
const FIELD_PROMPTS: Record<string, string> = {
  bio: "Write a warm, genuine, first-person staff bio for a salon team directory. Two to four sentences.",
  why: "Write a warm, sincere first-person answer to “Why do you love working here?” for a salon team profile. Two to three sentences.",
  plan: "Write an aspirational but grounded first-person answer about this person's goals and five-year plan, for a salon team profile. Two to three sentences.",
  away: "Write a friendly, first-person answer to “What's your favorite thing to do away from the salon?” for a team profile. One to three sentences.",
};

// Drafts or polishes a short, first-person profile answer with Claude.
export async function generateProfileText(opts: {
  field?: string;
  name?: string | null;
  role?: string | null;
  notes?: string | null;
  current?: string | null;
}): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const instruction = FIELD_PROMPTS[opts.field ?? "bio"] ?? FIELD_PROMPTS.bio;
  const facts: string[] = [];
  if (opts.name) facts.push(`Name: ${opts.name}`);
  if (opts.role) facts.push(`Role / title: ${opts.role}`);
  if (opts.notes) facts.push(`A few words from them: ${opts.notes}`);
  if (opts.current) facts.push(`Their current draft (improve on this): ${opts.current}`);

  const prompt =
    instruction +
    " Friendly and professional — no clichés, buzzwords, or hashtags. " +
    "Return only the text, nothing else.\n\n" +
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
    console.error("AI profile text generation failed:", err);
    return null;
  }
}
