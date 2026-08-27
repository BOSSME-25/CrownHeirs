# Crown Heirs — Public Site

The **public, customer-facing** Crown Heirs site, deployed on Vercel from the
root of this repo.

The internal employee Team Hub lives in its own **private** repository,
`BOSSME-25/CrownTeam` — the Vercel `crown_team_hub` project deploys from there.

## What's here

| Path | What it is |
|---|---|
| `/` | The "Find Your Service" experience |
| `/tv` | **Salon TV display** — full-screen auto-rotating slideshow (photos & videos of work, Instagram-framed posts, a "Follow us" slide, memberships, products, announcements). AirPlay or open this URL on the TV and leave it. |
| `/admin` | **Bethany's editor** — password-protected. Add/swap photos and short videos (≤100 MB, direct-to-storage upload), mark any as an Instagram-style post, edit memberships, products, announcements, the IG handle, and slide timing. Works great from a phone. |

The TV re-checks for new content every 3 minutes, so saves in `/admin` show up
on screen without touching the TV.

## One-time setup on Vercel (required before /admin can save)

1. **Blob storage** — in the Vercel dashboard for this project: **Storage →
   Create → Blob**, and connect it to this project. This is where uploaded
   photos and the edited content live. (Free tier is plenty.)
2. **Admin password** — **Settings → Environment Variables**, add
   `ADMIN_PASSWORD` with the password Bethany will use, then redeploy.

Until both are done: `/tv` still works (it shows the built-in starter
content), and `/admin` will say what's missing when you try to sign in or
save.

## Putting it on the TV

- **Apple TV**: AirPlay-mirror an iPad/iPhone showing `/tv` in Safari, or use
  the TV's browser if it has one.
- **Any smart TV / Fire Stick with a browser**: open `https://<your-domain>/tv`
  and go full-screen.
- The page keeps the screen awake where the browser allows it and shows a
  small clock so it's useful at checkout.
