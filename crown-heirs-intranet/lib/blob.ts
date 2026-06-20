import { list } from "@vercel/blob";
import type { DocumentItem } from "@/lib/documents";

const PREFIX = "documents/";

// Turn a Blob pathname like "documents/handbook/welcome.pdf"
// into the structured shape the UI expects.
function toDocument(blob: {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
}): DocumentItem {
  const rest = blob.pathname.slice(PREFIX.length); // "handbook/welcome.pdf"
  const slash = rest.indexOf("/");
  const category = slash === -1 ? "general" : rest.slice(0, slash);
  const filename = slash === -1 ? rest : rest.slice(slash + 1);
  return {
    url: blob.url,
    pathname: blob.pathname,
    filename,
    category,
    size: blob.size,
    uploadedAt: new Date(blob.uploadedAt).toISOString(),
  };
}

/** List uploaded documents, optionally filtered to one category. */
export async function listDocuments(category?: string): Promise<DocumentItem[]> {
  const prefix = category ? `${PREFIX}${category}/` : PREFIX;
  const { blobs } = await list({ prefix });
  return blobs
    .map(toDocument)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}
