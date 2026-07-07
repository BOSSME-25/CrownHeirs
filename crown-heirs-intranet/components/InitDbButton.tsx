"use client";

import { useState } from "react";

export default function InitDbButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/init-db", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Setup failed (${res.status})`);
      setMsg({ type: "ok", text: "Database is set up and ready. You can now add team members." });
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Setup failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prose" style={{ marginBottom: 24 }}>
      <h2>Database setup</h2>
      <p className="muted" style={{ marginBottom: 14 }}>
        Run this once after connecting the database (and again any time we add new
        features). It’s safe to click more than once.
      </p>
      <button className="btn btn-ghost" onClick={run} disabled={busy}>
        {busy ? "Setting up…" : "Set up / update database"}
      </button>
      {msg && <div className={`notice ${msg.type}`}>{msg.text}</div>}
    </div>
  );
}
