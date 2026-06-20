// ───────────────────────────────────────────────
// Access control — who can sign in, who is an admin.
// Driven entirely by environment variables so the
// staff/admin lists can change without a code edit.
// ───────────────────────────────────────────────

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

const adminEmails = () => parseList(process.env.ADMIN_EMAILS);
const allowedEmails = () => parseList(process.env.ALLOWED_EMAILS);
const allowedDomains = () => parseList(process.env.ALLOWED_DOMAINS);

/** Admins can upload and manage documents. */
export function isAdmin(email?: string | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/** Allowed users can view the intranet. Admins are always allowed. */
export function isAllowed(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase();
  if (isAdmin(normalized)) return true;
  if (allowedEmails().includes(normalized)) return true;
  const domain = normalized.split("@")[1];
  return domain ? allowedDomains().includes(domain) : false;
}
