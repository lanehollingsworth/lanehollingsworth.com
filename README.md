# lanehollingsworth.com

Personal journal site for **Lane Hollingsworth** — a quiet replacement for social media.

Built with [Astro](https://astro.build). Posts are Markdown files in git, so content cannot be wiped by a bad “publish” click the way it was on Hostinger.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL Astro prints (usually `http://localhost:4321`).

```bash
npm run build
npm run preview
```

## Writing a post

1. Add a file under `src/content/posts/` (e.g. `a-walk-after-dinner.md`).
2. Use this frontmatter:

```md
---
title: Your title
description: One short sentence for search and sharing.
pubDate: 2026-07-15
tags:
  - journal
photos:
  - src: /images/your-photo.jpg
    alt: Short description
    caption: Optional caption
---

Your writing goes here.
```

3. Put images in `public/images/` and reference them as `/images/...`.
4. Commit and push. The live site updates after deploy.

### Book reviews

```md
---
title: Notes on a book
pubDate: 2026-07-15
contentType: book_review
bookTitle: The Book
bookAuthor: The Author
bookRating: 4
---
```

See `src/content/posts/_example-book-review.md` (kept as a draft template).

### Writing prompts

- Reflect on something you learned this week.
- Write about a moment that surprised you.
- What’s on your mind about your career?
- Share something you added to your gallery wall.
- Write about a conversation that stuck with you.
- What are you thinking about regarding the future?
- Document a simple moment from this week.
- Reflect on how you’re feeling.
- Write about someone in your life you’re grateful for.
- What’s a recent discovery you’ve made?

Or ask Cursor: “Help me write a new journal post from this note: …”

## Design notes

Carried over from the original Claude / Hostinger design:

- Cream paper background (`#F5F1E8`) and brown ink accents
- Serif body (EB Garamond / Georgia)
- Single scrollable journal feed
- Month archive filter in the sidebar
- Title and words first; photos below

## Deploy

See **[NEXT_STEPS.md](./NEXT_STEPS.md)** for the click-by-click path (Vercel or GitHub Pages + Squarespace DNS).

Repo already includes:

- `.github/workflows/ci.yml` — build check on PRs
- `.github/workflows/deploy-pages.yml` — GitHub Pages deploy from `main`
- `vercel.json` — Vercel project defaults
- `public/CNAME` — `lanehollingsworth.com`

## What’s intentionally not in v1

Comments with social login, PocketBase admin, Google Calendar prompts, and the oversized analytics schema from Hostinger are deferred. Foundation first: durable posts, clean design, SEO, RSS, and your existing Google Analytics ID (`G-XVL839YKPD`).

## Recovering old posts

The Hostinger chat export confirms three posts existed but does not include their full text. If you have email drafts, screenshots, Notes app copies, or phone photo captions, paste them into a Cursor chat and we can turn them into Markdown posts here.
