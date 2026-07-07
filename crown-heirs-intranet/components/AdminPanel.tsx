"use client";

import { useCallback, useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { CATEGORIES, type DocumentItem } from "@/lib/documents";

const ALLOWED_EXT = [
  ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
  ".txt", ".md", ".png", ".jpg", ".jpeg", ".mp4",
];
const MAX_BYTES = 25 * 1024 * 1024;
const DIRECT_MAX = 4 * 1024 * 1024; // server-side path limit; larger uses client upload

// Reliable server-side upload for normal-sized files, with progress via XHR.
function uploadDirect(file: File, category: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload/direct");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { error?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(data.error || `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(fd);
  });
}

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
  // "Paste a link" form (externally-hosted files — Drive/Dropbox/etc.).
  const [linkCategory, setLinkCategory] = useState<string>(CATEGORIES[0].id);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  // Inline editing of an existing link.
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editCategory, setEditCategory] = useState<string>(CATEGORIES[0].id);

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
    const bump = (pct: number) => setProgress((p) => Math.max(p ?? 0, pct));
    try {
      if (file.size <= DIRECT_MAX) {
        // Normal-sized files: upload through our server (finishes on the HTTP
        // response — the most reliable path).
        await uploadDirect(file, category, bump);
      } else {
        // Large files must bypass the serverless body limit → client upload
        // straight to Blob (chunked).
        await upload(`documents/${category}/${file.name}`, file, {
          access: "private",
          handleUploadUrl: "/api/upload",
          clientPayload: JSON.stringify({ category }),
          multipart: true,
          onUploadProgress: (e) => bump(Math.round(e.percentage)),
        });
      }
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

  async function onAddLink(e: React.FormEvent) {
    e.preventDefault();
    const title = linkTitle.trim();
    const url = linkUrl.trim();
    if (!title || !url) {
      setMsg({ type: "err", text: "Add a name and a link." });
      return;
    }
    setLinkBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/documents/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: linkCategory, title, url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not add the link.");
      setMsg({ type: "ok", text: `Added link “${title}”.` });
      setLinkTitle("");
      setLinkUrl("");
      refresh();
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Could not add the link." });
    } finally {
      setLinkBusy(false);
    }
  }

  function startEdit(doc: DocumentItem) {
    setEditId(doc.id ?? null);
    setEditTitle(doc.filename);
    setEditUrl(doc.url);
    setEditCategory(doc.category);
    setMsg(null);
  }

  async function saveEdit() {
    if (!editId) return;
    const title = editTitle.trim();
    const url = editUrl.trim();
    if (!title || !url) {
      setMsg({ type: "err", text: "Add a name and a link." });
      return;
    }
    try {
      const res = await fetch("/api/documents/link", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editId, category: editCategory, title, url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the link.");
      setMsg({ type: "ok", text: "Link updated." });
      setEditId(null);
      refresh();
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Could not save the link." });
    }
  }

  async function onDelete(doc: DocumentItem) {
    const name = doc.filename;
    if (!confirm(`Delete “${name}”? This can’t be undone.`)) return;
    try {
      const res = await fetch("/api/documents/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(doc.isLink ? { linkId: doc.id } : { pathname: doc.pathname }),
      });
      if (!res.ok) throw new Error();
      setMsg({ type: "ok", text: `Deleted “${name}”.` });
      refresh();
    } catch {
      setMsg({ type: "err", text: "Could not delete that item." });
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
          <>
            <div aria-hidden style={{ marginTop: 10, height: 8, borderRadius: 4, background: "var(--line,#e7ded5)", overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: "100%", background: "var(--olive,#5b7a4b)", transition: "width .2s" }} />
            </div>
            {progress >= 40 && (
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
                If this stalls or keeps restarting, your connection is dropping mid-upload — try stronger Wi-Fi, upload from a computer, or use the “paste a link” option below instead.
              </p>
            )}
          </>
        )}

        {msg && <div className={`notice ${msg.type}`}>{msg.text}</div>}
      </form>

      <form className="prose" onSubmit={onAddLink} style={{ marginTop: 28 }}>
        <h2>…or paste a link</h2>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          For files hosted in Google Drive, Dropbox, etc. — no upload needed. Make sure the link is
          shared so the team can open it (“Anyone with the link”).
        </p>

        <div className="field">
          <label htmlFor="link-category">Category</label>
          <select id="link-category" value={linkCategory} onChange={(e) => setLinkCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="link-title">Name</label>
          <input id="link-title" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="e.g. Employee Handbook 2026" />
        </div>
        <div className="field">
          <label htmlFor="link-url">Link (URL)</label>
          <input id="link-url" type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://drive.google.com/…" />
        </div>
        <button className="btn" type="submit" disabled={linkBusy}>
          {linkBusy ? "Adding…" : "Add link"}
        </button>
      </form>

      <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 36 }}>Current Documents</h2>
      {docs.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>Nothing uploaded yet.</p>
      ) : (
        <div className="doc-list">
          {docs.map((doc) =>
            doc.isLink && editId === doc.id ? (
              <div className="doc" key={`link-${doc.id}`} style={{ display: "block" }}>
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>Name</label>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>Link (URL)</label>
                  <input type="url" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>Category</label>
                  <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={saveEdit}>Save</button>
                  <button className="btn btn-ghost" onClick={() => setEditId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="doc" key={doc.isLink ? `link-${doc.id}` : doc.url}>
                <div className="doc-main">
                  <div className="doc-ico">{doc.isLink ? "↗" : doc.category.slice(0, 3)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="doc-name">{doc.filename}</div>
                    <div className="doc-meta">
                      {doc.category} · {doc.isLink ? "Link" : fmtSize(doc.size)} · {new Date(doc.uploadedAt).toLocaleDateString("en-US", { timeZone: "America/Phoenix" })}
                    </div>
                  </div>
                </div>
                <div className="doc-actions">
                  <a className="btn btn-ghost" href={doc.openUrl} target="_blank" rel="noopener noreferrer">Open</a>
                  {doc.isLink && <button className="btn btn-ghost" onClick={() => startEdit(doc)}>Edit</button>}
                  <button className="btn btn-danger" onClick={() => onDelete(doc)}>Delete</button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </>
  );
}
