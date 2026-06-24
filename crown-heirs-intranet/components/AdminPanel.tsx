"use client";

import { useCallback, useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { CATEGORIES, type DocumentItem } from "@/lib/documents";

const ALLOWED_EXT = [
  ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
  ".txt", ".md", ".png", ".jpg", ".jpeg", ".mp4",
];
const MAX_BYTES = 25 * 1024 * 1024;

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminPanel() {
  const [category, setCategory] = useState<string>(CATEGORIES[0].id);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [docs, setDocs] = useState<DocumentItem[]>([]);

  const refresh = useCallback(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((d) => setDocs(d.documents ?? []))
      .catch(() => setDocs([]));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setMsg({ type: "err", text: "Choose a file first." });
      return;
    }
    const lower = file.name.toLowerCase();
    if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
      setMsg({ type: "err", text: "Unsupported file type." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setMsg({ type: "err", text: "File exceeds the 25 MB limit." });
      return;
    }
    setBusy(true);
    setProgress(0);
    setMsg(null);
    try {
      // Upload straight from the browser to Blob (no 4.5 MB function-body limit).
      // multipart = resilient chunked upload (better for big PDFs / phone networks);
      // onUploadProgress drives the visible percentage so a slow upload doesn't
      // look like a hang.
      await upload(`documents/${category}/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        clientPayload: JSON.stringify({ category }),
        multipart: true,
        onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
      });
      setMsg({ type: "ok", text: `Uploaded “${file.name}”.` });
      setFile(null);
      const input = document.getElementById("file-input") as HTMLInputElement | null;
      if (input) input.value = "";
      refresh();
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function onDelete(url: string, name: string) {
    if (!confirm(`Delete “${name}”? This can’t be undone.`)) return;
    try {
      const res = await fetch("/api/documents/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error();
      setMsg({ type: "ok", text: `Deleted “${name}”.` });
      refresh();
    } catch {
      setMsg({ type: "err", text: "Could not delete that file." });
    }
  }

  return (
    <>
      <form className="prose" onSubmit={onUpload}>
        <h2>Upload a document</h2>

        <div className="field">
          <label htmlFor="category-select">Category</label>
          <select
            id="category-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="file-input">File (PDF, Word, PowerPoint, images, video · max 25 MB)</label>
          <input
            id="file-input"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <button className="btn" type="submit" disabled={busy}>
          {busy ? (progress !== null ? `Uploading… ${progress}%` : "Uploading…") : "Upload"}
        </button>

        {busy && progress !== null && (
          <div aria-hidden style={{ marginTop: 10, height: 8, borderRadius: 4, background: "var(--line,#e7ded5)", overflow: "hidden" }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "var(--olive,#5b7a4b)", transition: "width .2s" }} />
          </div>
        )}

        {msg && <div className={`notice ${msg.type}`}>{msg.text}</div>}
      </form>

      <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 36 }}>Current Documents</h2>
      {docs.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>Nothing uploaded yet.</p>
      ) : (
        <div className="doc-list">
          {docs.map((doc) => (
            <div className="doc" key={doc.url}>
              <div className="doc-main">
                <div className="doc-ico">{doc.category.slice(0, 3)}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="doc-name">{doc.filename}</div>
                  <div className="doc-meta">
                    {doc.category} · {fmtSize(doc.size)} · {new Date(doc.uploadedAt).toLocaleDateString("en-US", { timeZone: "America/Phoenix" })}
                  </div>
                </div>
              </div>
              <div className="doc-actions">
                <a className="btn btn-ghost" href={doc.url} target="_blank" rel="noopener noreferrer">Open</a>
                <button className="btn btn-danger" onClick={() => onDelete(doc.url, doc.filename)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
