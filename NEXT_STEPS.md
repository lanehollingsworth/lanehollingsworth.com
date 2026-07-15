# Next steps

## Done

- Site deployed on Vercel: **https://lanehollingsworth-com.vercel.app**
- Custom domains attached: `lanehollingsworth.com` + `www` (www redirects to apex)
- Project: https://vercel.com/lanehollingsworth/lanehollingsworth-com

## You still need: fix DNS (Squarespace or wherever nameservers are managed)

Right now the domain uses Hostinger parking nameservers:

- `atlas.dns-parking.com`
- `hyperion.dns-parking.com`

Vercel will not serve `lanehollingsworth.com` until DNS changes.

### Recommended (simplest): A + CNAME records

At your DNS provider (Squarespace Domains, or wherever you can edit DNS for this domain):

| Type | Name / Host | Value |
|------|-------------|-------|
| **A** | `@` (or blank / apex) | `76.76.21.21` |
| **CNAME** | `www` | `cname.vercel-dns.com` |

Remove old Hostinger / Horizons records that conflict.

### Alternate: point nameservers at Vercel

If you prefer nameserver delegation instead of records:

- `ns1.vercel-dns.com`
- `ns2.vercel-dns.com`

DNS often updates within an hour; can take up to 48 hours.

When ready, tell me and I can re-check: `vercel domains inspect lanehollingsworth.com`.

## Optional follow-ups

1. **Merge PR #1** so GitHub `main` matches what’s live: https://github.com/lanehollingsworth/lanehollingsworth.com/pull/1
2. **Connect GitHub ↔ Vercel** (auto-deploys on push): in Vercel, add a GitHub Login Connection, then link `lanehollingsworth/lanehollingsworth.com` to the project. CLI deploy already works without that.
3. **Revoke the Vercel token** you pasted in chat after we’re done: https://vercel.com/account/tokens
4. **Restore old posts** — paste any drafts/screenshots/notes and I’ll add Markdown files.
5. **MCP auth in Cursor Desktop** (Linear / Composio) if you want those tools usable from Cloud later.
