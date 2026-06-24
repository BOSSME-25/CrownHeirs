// ───────────────────────────────────────────────
// Document categories. Uploads are stored in Vercel
// Blob under `documents/<category>/<filename>`, which
// lets each section page list only its own documents.
// ───────────────────────────────────────────────

export const CATEGORIES = [
  { id: "handbook", label: "Employee Handbook" },
  { id: "policies", label: "Policies & Procedures" },
  { id: "training", label: "Training Materials" },
  { id: "general", label: "General / Other" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[];

export function isCategory(value: string): value is CategoryId {
  return (CATEGORY_IDS as string[]).includes(value);
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Documents";
}

export type DocumentItem = {
  url: string;
  pathname: string;
  filename: string;
  category: string;
  size: number;
  uploadedAt: string;
  // Where the UI links to open the file. For uploaded (private) files this is an
  // authenticated proxy route; for links it's the external URL.
  openUrl: string;
  // Set for externally-hosted links (Drive/Dropbox); `id` is the link row id.
  isLink?: boolean;
  id?: string;
};
