"use client";

import { useEffect, useState } from "react";
import type { DocumentItem } from "@/lib/documents";

function ext(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "DOC" : name.slice(dot + 1).toUpperCase();
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentList({ category }: { category?: string }) {
  const [docs, setDocs] = useState<DocumentItem[] | null>(null);
  const [storeMissing, setStoreMissing] = useState(false);

  useEffect(() => {
    const url = category ? `/api/documents?category=${category}` : "/api/documents";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setDocs(data.documents ?? []);
        setStoreMissing(!!data.storeMissing);
      })
      .catch(() => setDocs([]));
  }, [category]);

  if (docs === null) return <p className="muted" style={{ marginTop: 18 }}>Loading documents…</p>;

  if (storeMissing) {
    return (
      <div className="notice" style={{ marginTop: 18 }}>
        Document storage isn’t connected yet. Once a Vercel Blob store is linked
        to this project, uploaded files will appear here.
      </div>
    );
  }

  if (docs.length === 0) {
    return <p className="muted" style={{ marginTop: 18 }}>No documents here yet.</p>;
  }

  return (
    <div className="doc-list">
      {docs.map((doc) => (
        <div className="doc" key={doc.isLink ? `link-${doc.id}` : doc.url}>
          <div className="doc-main">
            <div className="doc-ico">{doc.isLink ? "↗" : ext(doc.filename)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="doc-name">{doc.filename}</div>
              <div className="doc-meta">
                {doc.isLink ? "Link" : fmtSize(doc.size)} · {new Date(doc.uploadedAt).toLocaleDateString("en-US", { timeZone: "America/Phoenix" })}
              </div>
            </div>
          </div>
          <div className="doc-actions">
            <a className="btn btn-ghost" href={doc.url} target="_blank" rel="noopener noreferrer">
              Open
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
