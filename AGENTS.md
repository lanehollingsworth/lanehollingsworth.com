# Agent notes — lanehollingsworth.com

## Purpose

Personal journal for Lane Hollingsworth (social-media replacement). Minimal cream/brown early-2000s blog aesthetic. Content must live in git as Markdown under `src/content/posts/`.

## Do

- Keep the established palette and typography (cream `#F5F1E8`, browns, EB Garamond / Georgia).
- Prefer small, durable changes over platform sprawl.
- Add new posts as Markdown files with validated frontmatter from `src/content.config.ts`.
- Preserve brand-first header: “Lane Hollingsworth” is the hero signal.

## Don’t

- Don’t reintroduce Hostinger / PocketBase / Horizons.
- Don’t invent fake biography or nonsense homepage copy.
- Don’t put posts only in a remote CMS without a git backup.

## Dev

```bash
npm run dev
npm run build
```

When starting the Astro dev server in the background, use the project’s usual background-process workflow and stop it when finished.

## Context sources

- Hostinger Horizons chat export (PDF) describes the prior build, lost posts, and design evolution.
- Original Claude HTML prototype (cream journal + admin prompts) is the visual north star for v1.
