# Next steps — what still needs a human click

The site code is ready in PR #1. These remaining steps need your account access (this Cloud Agent cannot open Vercel, Squarespace, Hostinger, or browser MCP tools yet).

## 1. Authenticate Linear MCP (optional)

Linear appears in this Cloud Agent as **needs authentication**. Interactive MCP login only works in the **Cursor desktop IDE**:

1. Open Cursor Desktop
2. Settings → MCP → Linear → Connect / Sign in
3. Come back to this Cloud Agent chat and ask me to create a project/issues checklist

Chrome / Control / Cloud-for-Chrome are **not visible** in this Cloud Agent environment at all (only `cursor-cloud` diagnostics + Linear). If you connected those in Desktop, they may not carry over here — reconnect them for the Cloud Agent / this environment, or we continue with click-by-click instructions.

## 2. Merge the PR

Merge: https://github.com/lanehollingsworth/lanehollingsworth.com/pull/1

## 3. Put the site online (pick one)

### Option A — Vercel (recommended)

1. Go to https://vercel.com → Continue with GitHub
2. **Add New Project** → import `lanehollingsworth/lanehollingsworth.com`
3. Framework: Astro (auto-detected) → Deploy
4. Project → Settings → Domains → add `lanehollingsworth.com` and `www`
5. Copy the DNS records Vercel shows

### Option B — GitHub Pages

A workflow is already in the repo (`.github/workflows/deploy-pages.yml`).

1. Repo → **Settings → Pages**
2. Source: **GitHub Actions**
3. Merge to `main` (or run the workflow manually)
4. Settings → Pages → Custom domain → `lanehollingsworth.com` → save
5. Enable “Enforce HTTPS” once DNS is ready

## 4. Point the domain (Squarespace)

Your domain is registered at Squarespace. After Vercel or GitHub Pages gives you DNS values:

1. Squarespace → Domains → `lanehollingsworth.com` → DNS
2. Remove Hostinger nameservers / leftover Horizons records
3. Add the A / CNAME records from Vercel **or** GitHub Pages
4. Wait for DNS (often under an hour, sometimes up to 48h)

## 5. Recover old posts

The Hostinger chat proves ~3 posts existed but does not include their text. Paste anything you still have (Notes, email drafts, screenshots, photo captions) into chat and I’ll turn them into Markdown posts under `src/content/posts/`.

## Already done in the repo

- Astro journal site with cream/brown design
- Markdown posts in git
- Month archive, SEO, RSS, sitemap, GA (`G-XVL839YKPD`)
- CI build workflow
- GitHub Pages deploy workflow
- `vercel.json` + `CNAME`
