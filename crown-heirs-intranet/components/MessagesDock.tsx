"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Convo = {
  employeeId: string;
  name: string;
  photoUrl: string | null;
  lastBody: string | null;
  unread: number;
};
type ThreadMsg = { id: string; mine: boolean; body: string; at: string | null };

function fmtTime(at: string | null) {
  if (!at) return "";
  return new Date(at).toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function MessagesDock() {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [active, setActive] = useState<{ id: string; name: string } | null>(null);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = active?.id ?? null;

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/state", { cache: "no-store" });
      const data = await res.json();
      setReady(true);
      if (!data.me) {
        setEnabled(false);
        return;
      }
      setEnabled(true);
      setConvos(data.conversations ?? []);
      setTotalUnread(data.totalUnread ?? 0);
    } catch {
      setReady(true);
    }
  }, []);

  const loadThread = useCallback(async (otherId: string) => {
    const res = await fetch(`/api/messages/thread/${otherId}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setThread(data.messages ?? []);
    // marking read changes unread counts
    refreshState();
  }, [refreshState]);

  // Initial load + polling.
  useEffect(() => {
    refreshState();
    const t = setInterval(() => {
      refreshState();
      if (activeRef.current) loadThread(activeRef.current);
    }, 20000);
    return () => clearInterval(t);
  }, [refreshState, loadThread]);

  // Scroll thread to bottom when it changes.
  useEffect(() => {
    if (active) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread, active]);

  function openConvo(c: { employeeId: string; name: string }) {
    setActive({ id: c.employeeId, name: c.name });
    setThread([]);
    loadThread(c.employeeId);
  }

  async function send() {
    const text = draft.trim();
    if (!text || !active || sending) return;
    setSending(true);
    setDraft("");
    // optimistic
    setThread((t) => [...t, { id: `tmp-${Date.now()}`, mine: true, body: text, at: new Date().toISOString() }]);
    try {
      await fetch(`/api/messages/thread/${active.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      await loadThread(active.id);
    } finally {
      setSending(false);
    }
  }

  if (!ready || !enabled) return null;

  return (
    <div className="msgdock">
      {open && (
        <div className="msgdock-panel">
          <div className="msgdock-head">
            {active ? (
              <>
                <button className="msgdock-back" onClick={() => setActive(null)} aria-label="Back">‹</button>
                <span className="msgdock-title">{active.name}</span>
              </>
            ) : (
              <span className="msgdock-title">Messages</span>
            )}
            <button className="msgdock-x" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </div>

          {!active ? (
            <div className="msgdock-list">
              {convos.length === 0 && <p className="msgdock-empty">No teammates to message yet.</p>}
              {convos.map((c) => (
                <button className="msgdock-conv" key={c.employeeId} onClick={() => openConvo(c)}>
                  {c.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="msgdock-ava" src={c.photoUrl} alt="" />
                  ) : (
                    <span className="msgdock-ava msgdock-ava-fallback">{initials(c.name)}</span>
                  )}
                  <span className="msgdock-conv-body">
                    <span className="msgdock-conv-name">{c.name}</span>
                    <span className="msgdock-conv-preview">{c.lastBody ?? "Start a conversation"}</span>
                  </span>
                  {c.unread > 0 && <span className="msgdock-badge">{c.unread}</span>}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="msgdock-thread">
                {thread.map((m) => (
                  <div key={m.id} className={`msgdock-bubble ${m.mine ? "mine" : "theirs"}`}>
                    <span>{m.body}</span>
                    <time>{fmtTime(m.at)}</time>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <form
                className="msgdock-compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a message…"
                  spellCheck
                  autoFocus
                />
                <button type="submit" disabled={sending || !draft.trim()}>Send</button>
              </form>
            </>
          )}
        </div>
      )}

      <button
        className="msgdock-fab"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) refreshState();
        }}
        aria-label="Messages"
      >
        💬
        {totalUnread > 0 && <span className="msgdock-fab-badge">{totalUnread}</span>}
      </button>
    </div>
  );
}
