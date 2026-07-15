# Next steps

## Done

- Site deployed on Vercel: **https://lanehollingsworth-com.vercel.app**
- Custom domains attached: `lanehollingsworth.com` + `www` (www redirects to apex)
- Project: https://vercel.com/lanehollingsworth/lanehollingsworth-com

## DNS: point the domain at Vercel

Squarespace has no public DNS API for normal accounts. Vercel already has the domain attached; the missing piece is Squarespace (or current nameservers) publishing the records.

### Option A — Playwright automation (in this repo)

```bash
cp .env.example .env
# put SQUARESPACE_EMAIL and SQUARESPACE_PASSWORD in .env
npm run dns:squarespace
```

Script: `scripts/set-squarespace-dns.mjs`  
It logs into Squarespace and tries to set:

| Type | Name | Value |
|------|------|-------|
| **A** | `@` | `76.76.21.21` |
| **CNAME** | `www` | `cname.vercel-dns.com` |

If Squarespace asks for 2FA, the script stops and saves a screenshot under `scripts/output/`.

### Option B — Permanent API control (Cloudflare)

Move nameservers from Squarespace → Cloudflare (free), then DNS can be changed via API/MCP forever. That still needs one nameserver change at the registrar.

### Manual fallback records

| Type | Name / Host | Value |
|------|-------------|-------|
| **A** | `@` | `76.76.21.21` |
| **CNAME** | `www` | `cname.vercel-dns.com` |

## Optional follow-ups

1. **Merge PR #1** so GitHub `main` matches what’s live: https://github.com/lanehollingsworth/lanehollingsworth.com/pull/1
2. **Connect GitHub ↔ Vercel** (auto-deploys on push): in Vercel, add a GitHub Login Connection, then link `lanehollingsworth/lanehollingsworth.com` to the project. CLI deploy already works without that.
3. **Revoke the Vercel token** you pasted in chat after we’re done: https://vercel.com/account/tokens
4. **Restore old posts** — paste any drafts/screenshots/notes and I’ll add Markdown files.
5. **MCP auth in Cursor Desktop** (Linear / Composio) if you want those tools usable from Cloud later.
