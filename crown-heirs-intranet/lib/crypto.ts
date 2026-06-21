import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// Encrypts tenant secrets (e.g. POS access tokens) at rest using AES-256-GCM.
// The key is derived from APP_ENCRYPTION_KEY; without it, secrets can't be
// stored in the DB (the owner uses environment variables instead).
function key(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

export function canEncrypt(): boolean {
  return !!process.env.APP_ENCRYPTION_KEY;
}

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) throw new Error("APP_ENCRYPTION_KEY is not set — can’t store secrets.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "v1:" + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(blob: string | null | undefined): string | null {
  const k = key();
  if (!k || !blob || !blob.startsWith("v1:")) return null;
  try {
    const raw = Buffer.from(blob.slice(3), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const d = createDecipheriv("aes-256-gcm", k, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
