"use client";

import { useState } from "react";

// "Help me write" button that drafts/polishes the bio textarea (id="bio") via AI.
export default function BioAssist({ name, role }: { name?: string | null; role?: string | null }) {
  const [loading, setLoading] = useState(false);

  async function go() {
    const ta = document.getElementById("bio") as HTMLTextAreaElement | null;
    const current = ta?.value ?? "";
    const notes = window.prompt(
      "A few words about you to work from (specialty, interests, vibe) — optional:",
      "",
    );
    if (notes === null && !current) return; // cancelled with nothing to work from
    setLoading(true);
    try {
      const res = await fetch("/api/ai/bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role, notes: notes ?? "", current }),
      });
      const data = await res.json();
      if (data.bio && ta) ta.value = data.bio;
      else alert(data.error ?? "Couldn’t generate a bio right now.");
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={go} disabled={loading} style={{ marginTop: 6 }}>
      {loading ? "Writing…" : "✨ Help me write"}
    </button>
  );
}
