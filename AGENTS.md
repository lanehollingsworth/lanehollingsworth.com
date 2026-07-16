# Agent notes — lanehollingsworth.com

## Purpose

Personal journal for Lane Hollingsworth. Minimal cream/brown early-2000s blog aesthetic. Content must live in git as Markdown under `src/content/posts/`.

## Do

- Keep the established palette and typography (cream `#F5F1E8`, browns, EB Garamond / Georgia).
- Prefer small, durable changes over platform sprawl.
- Add new posts as Markdown files with validated frontmatter from `src/content.config.ts` — **only when Lane provides the words**.
- Preserve brand-first header: “Lane Hollingsworth” is the hero signal.

## Don’t

- **Never write copy for Lane.** No taglines, bios, placeholder posts, sample journal entries, marketing blurbs, or invented post bodies. Use only text Lane supplies.
- Don’t reintroduce Hostinger / PocketBase / Horizons.
- Don’t put posts only in a remote CMS without a git backup.

## Dev

```bash
npm run dev
npm run build
```

When starting the Astro dev server in the background, use the project’s usual background-process workflow and stop it when finished.
