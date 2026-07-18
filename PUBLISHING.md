# Publishing pipeline (Write page · iOS Shortcut · Decap Admin)

One git-backed path, three front doors. Content lands in GitHub → Vercel redeploys.

## 1) One-time secrets (Vercel)

Project → **Settings → Environment Variables** → add for Production:

| Name | Purpose |
|------|---------|
| `WRITE_PASSWORD` | Shared password for `/write` and iOS Shortcut |
| `GITHUB_TOKEN` | GitHub PAT with `contents: write` on this repo |
| `GITHUB_REPO` | `lanehollingsworth/lanehollingsworth.com` |
| `OAUTH_GITHUB_CLIENT_ID` | GitHub OAuth App client ID (Decap login) |
| `OAUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth App secret (Decap login) |

### Create the GitHub PAT
1. GitHub → Settings → Developer settings → Personal access tokens  
2. Fine-grained token on `lanehollingsworth/lanehollingsworth.com`  
3. Permissions: **Contents: Read and write**  
4. Paste into Vercel as `GITHUB_TOKEN`

### Create the GitHub OAuth App (for `/admin` Decap)
1. GitHub → Settings → Developer settings → **OAuth Apps** → New  
2. Homepage: `https://lanehollingsworth.com`  
3. Callback URL: `https://lanehollingsworth.com/api/callback`  
4. Copy Client ID + Secret into Vercel env vars above  
5. Redeploy after saving env vars

---

## 2) Website Write page

URL: https://lanehollingsworth.com/write

1. Enter `WRITE_PASSWORD`  
2. Title (+ optional words)  
3. Attach photos (order = carousel order)  
4. Publish  

Creates a commit on `main` and Vercel redeploys (~1 minute).

---

## 3) iOS Shortcut (same API)

1. iPhone **Shortcuts** → new Shortcut  
2. Actions roughly:
   - Ask for Text → “Post title”
   - (Optional) Ask for Text → “Caption”
   - Select Photos → get the images  
   - Get Contents of URL:
     - URL: `https://lanehollingsworth.com/api/publish`
     - Method: POST  
     - Request Body: **Form**  
       - `password` = your WRITE_PASSWORD  
       - `title` = Shortcut title variable  
       - `body` = caption (optional)  
       - `photos` = the selected images (File)  
3. Name it **Post to Lane’s site**  
4. In Photos → Share → that Shortcut  

---

## 4) Decap Admin CMS

URL: https://lanehollingsworth.com/admin/

1. Open `/admin/`  
2. Login with GitHub (OAuth App above)  
3. Create/edit posts and images in the UI  
4. Decap commits into the repo on `main`

---

## Product note

Old WordPress = database is truth.  
This setup = **git is truth**, with friendlier front doors. Same durability lesson as the Hostinger wipe, without the pain.
