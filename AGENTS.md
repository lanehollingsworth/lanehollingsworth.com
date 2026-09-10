# Agent notes — lanehollingsworth.com

## Purpose

Personal journal for Lane Hollingsworth. Minimal cream/brown early-2000s blog aesthetic. Content must live in git as Markdown under `src/content/posts/`.

## Career context (always on)

Lane is a **Senior Product Manager** building toward **Lead Product Manager**. This site is not only a journal — it is deliberate practice with modern product/tech workflows in free time.

When recommending changes, updates, or process:

- Frame work in **PM / Lead PM vernacular** Lane can reuse at work (discovery, delivery, MVP, rollback, observability, ownership, stakeholder trust, system design tradeoffs, etc.).
- Treat explanations as **teaching moments**, especially for a sharp mid-career learner (~40): clear, respectful, no condescension; connect “why this exists” to product judgment, not just syntax.
- Prefer **modern defaults** (git-backed content, preview → production, PRs, static hosting, infra-as-config) over nostalgia stacks unless Lane explicitly wants them for craft reasons.
- If Lane proposes something **antiquated or high-risk** (e.g. “just FTP it,” “edit live prod,” “one shared CMS password,” “AI publish with no review”), **call it out plainly**, explain what teams do instead now, and offer the modern path.
- Call out transferable skills: version control as audit trail, environments, blast radius, progressive delivery, content as product, instrumentation, writing RFCs/ADRs lightly, pairing with engineering agents.
- Do **not** invent biography/resume claims on the public site. Career coaching stays in chat / agent notes unless Lane provides copy to publish.

## Structure (non-negotiable)

- **Single page only.** One scrollable home page. No `/posts/...` detail routes, no multi-page IA.
- Posts render inline on the home page in reverse chronological order.
- Optional later: same-page month filter / sidebar — only if Lane asks.

## Do

- Keep the established palette and typography (cream `#F5F1E8`, browns, EB Garamond / Georgia).
- Prefer small, durable changes over platform sprawl.
- Add new posts as Markdown files with validated frontmatter from `src/content.config.ts` — **only when Lane provides the words**.
- Preserve brand-first header: “Lane Hollingsworth” is the hero signal.
- When Lane asks “how do I post?”, compare to old WordPress mental models and map to git → review → deploy (and offer agent-assisted drafting of *his* words into files).

## Don’t

- **Never write copy for Lane.** No taglines, bios, placeholder posts, sample journal entries, marketing blurbs, or invented post bodies. Use only text Lane supplies.
- Don’t add extra pages (About/Blog/Projects/etc.) unless Lane explicitly asks.
- Don’t reintroduce Hostinger / PocketBase / Horizons.
- Don’t put posts only in a remote CMS without a git backup.
- Don’t optimize for “admin dashboard nostalgia” at the cost of durability — unless Lane wants a private write UI *with* git as source of truth.

## Publishing (git is truth)

Three private front doors, one path into git → Vercel redeploy. Details in `PUBLISHING.md`.

| Front door | URL | Auth |
|------------|-----|------|
| Write page | `/write` | `WRITE_PASSWORD` |
| iOS Shortcut | `POST /api/publish` | same password |
| Decap CMS | `/admin/` | GitHub OAuth |

Required Vercel env vars: `WRITE_PASSWORD`, `GITHUB_TOKEN`, `GITHUB_REPO`, `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET`.

`/write` and `/admin` are private tooling (noindex) — exceptions to the single public page rule.

## Command Center (not part of the site)

`command-center/` is private relocation planning tooling — a decision engine, financial model and dated execution planner for the Orlando → Los Angeles move. It renders no pages, adds no dependencies, and `astro build` never touches it.

```bash
npm run cc -- readiness      # gate-aware status
npm run cc -- pulse          # weekly relocation-readiness pulse
npm run cc -- why <id>       # why the model believes a value
npm run cc -- validate       # canonical-state rule check
npm run cc -- help           # everything else
npm run cc:test              # Phase 1 acceptance tests
```

Rules that live in code there and should not be softened: liquidity is never reported as cost, employer relocation coverage is never assumed in either direction, unpriced items stay out of every total, windfalls stay out of the base case, and recruiting threads are never merged. State carries three orthogonal fields — `evidence_type` (what kind of evidence), `canonical_state` (what role it plays now), `verification_state` (confirmed by anyone outside) — and collapsing them is a regression, not a cleanup. Details in `command-center/README.md`.

## Dev

```bash
npm run dev
npm run build
```

When starting the Astro dev server in the background, use the project’s usual background-process workflow and stop it when finished.
