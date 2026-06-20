# Crown Heirs — Team Hub (Internal Intranet)

A private knowledge base and training site for Crown Heirs staff: employee
handbook, policies & procedures, and training materials. Built with Next.js,
gated behind Google sign-in, with an admin area for uploading documents.

> This is the **internal** site. The public customer-facing site lives in
> `../crown-heirs-deploy`. Keep them as separate Vercel projects.

## What it does

- **Google sign-in** — only staff on the allowlist can get in.
- **Roles** — admins (Emily, Bethany) can upload and delete documents; everyone
  else has read-only access.
- **Sections** — Handbook, Policies, Training, and an All-Documents library.
  Each uploaded file is tagged with a category so it appears in the right place.
- **Document storage** — files are stored in Vercel Blob.
- **Not indexed** — the site sends `noindex` and every route is behind login.

## Tech

- Next.js 14 (App Router) · Auth.js v5 (Google) · Vercel Blob · TypeScript

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

## Environment variables

| Variable | What it is |
| --- | --- |
| `AUTH_SECRET` | Session encryption key. Generate with `npx auth secret`. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth credentials (see below). |
| `ALLOWED_DOMAINS` | Comma-separated domains allowed to sign in (e.g. `crownheirs.com`). |
| `ALLOWED_EMAILS` | Extra individual emails allowed to sign in (optional). |
| `ADMIN_EMAILS` | Comma-separated admins who can upload/manage (`emily@crownheirs.com,bethany@crownheirs.com`). |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token. Auto-set in Vercel once a Blob store is connected. |

To change who has access or who is an admin, just edit these variables in
Vercel — no code change needed.

## One-time setup

### 1. Google OAuth
1. Go to **Google Cloud Console → APIs & Services → Credentials**.
2. Create an **OAuth client ID** of type *Web application*.
3. Add an authorized redirect URI:
   - Production: `https://YOUR-DOMAIN/api/auth/callback/google`
   - Local: `http://localhost:3000/api/auth/callback/google`
4. Copy the client ID/secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

### 2. Deploy to Vercel
1. Create a **new, separate** Vercel project pointing at this folder
   (`crown-heirs-intranet`) — do **not** reuse the public site's project.
2. Add all the environment variables above in **Project → Settings →
   Environment Variables**.
3. In **Storage**, create a **Blob** store and connect it to the project. This
   sets `BLOB_READ_WRITE_TOKEN` automatically.

## Security notes

- Every page and the document/upload APIs require a signed-in, allowlisted user;
  uploads and deletes additionally require an admin email.
- Vercel Blob URLs are public but use a random suffix, so they’re unguessable.
  For most internal handbook/training content this is fine. If you ever need to
  store something truly sensitive (e.g. signed contracts, SSNs), tell me and we
  can switch documents behind an authenticated proxy route instead.
