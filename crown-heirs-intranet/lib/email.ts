import "server-only";
import nodemailer from "nodemailer";

// Sends via Google Workspace SMTP using an App Password.
// If SMTP isn't configured yet, sends become no-ops (so nothing breaks
// before setup is finished).
function transporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

export const APP_URL = process.env.APP_URL ?? "https://crownteamhub.vercel.app";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function sendEmail(opts: { to: string | string[]; subject: string; html: string }) {
  const t = transporter();
  const to = Array.isArray(opts.to) ? opts.to.filter(Boolean) : [opts.to];
  if (!t || to.length === 0) return;
  const from = process.env.NOTIFY_FROM || process.env.SMTP_USER!;
  try {
    await t.sendMail({ from, to: to.join(","), subject: opts.subject, html: opts.html });
  } catch (err) {
    // Never let a failed email break the underlying action.
    console.error("Email send failed:", err);
  }
}

// Simple branded wrapper for notification emails.
export function emailLayout(heading: string, body: string, ctaPath = "/") {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1816">
    <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a0624a;margin:0 0 8px">Crown Heirs Team Hub</p>
    <h2 style="font-weight:normal;margin:0 0 12px">${heading}</h2>
    <div style="font-size:15px;line-height:1.5;color:#4a4540">${body}</div>
    <p style="margin:22px 0 0">
      <a href="${APP_URL}${ctaPath}" style="background:#a0624a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:100px;font-size:14px">Open Team Hub</a>
    </p>
  </div>`;
}
