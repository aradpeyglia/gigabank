# Gigabank API Worker

A tiny Cloudflare Worker that issues short‑lived **ES256 JWTs** for [Glia Direct ID](https://docs.glia.com/glia-dev/docs/site-identification-via-direct-id). The static GitHub Pages site calls this Worker on login / signup / refresh; the Worker validates the user against the existing Google Apps Script + Sheet and returns a signed token.

```
Browser (GitHub Pages)
     │
     │  POST /login {email, password}
     ▼
Cloudflare Worker (this dir)
     │
     │  POST {action: 'login'} (form-urlencoded)
     ▼
Google Apps Script  ←→  Google Sheet
     │
     │  { ok, user }
     ▲
     │  { ok, user, idToken, expiresAt }
     │
Back to browser → stored in localStorage → handed to Glia.identify(...)
```

---

## 0. Prerequisites

- Node 18+ (`node --version`)
- An authorized Cloudflare account (you already did this during the first deploy attempt — `wrangler whoami` should show your email)
- Your ES256 key pair, **generated in PKCS8 format** (see step 1 below)

---

## 1. Generate / convert your keys (one time)

`crypto.subtle.importKey` in Workers wants **PKCS8** for the private key and **SPKI** for the public key. The default `openssl ecparam -genkey` output is the older **SEC1** format, which won't import. Convert it:

```bash
# from somewhere SAFE on your machine — NOT inside this repo:
openssl ecparam -genkey -name prime256v1 -out private-sec1.pem
openssl pkcs8   -topk8 -nocrypt -in private-sec1.pem -out private.pem
openssl ec      -in private.pem -pubout -out public.pem
rm private-sec1.pem   # don't need it anymore
```

You now have:
- `private.pem` — PKCS8, paste into the `PRIVATE_KEY` secret
- `public.pem`  — SPKI,  paste into the `PUBLIC_KEY` secret **and** upload to Glia Hub

> ⚠️  Never commit either file. `*.pem` is already in the repo's `.gitignore`.

---

## 2. Install Wrangler

From this `worker/` directory:

```bash
npm install
```

That installs Wrangler locally (so you'll prefix commands with `npx wrangler …`, or `npm run …` for the shortcuts in `package.json`).

---

## 3. Configure secrets

Run these **from this directory** (`worker/`). Each command opens a prompt where you paste the value:

```bash
npx wrangler secret put PRIVATE_KEY
# paste the FULL contents of private.pem (including BEGIN/END lines)

npx wrangler secret put PUBLIC_KEY
# paste the FULL contents of public.pem (including BEGIN/END lines)

npx wrangler secret put SHEETS_API_URL
# paste your Google Apps Script Web App URL
# (the one you used in assets/js/auth.js → const API_URL = '...')
```

Secrets are stored encrypted on Cloudflare and never appear in `wrangler.toml`, the git repo, or build logs.

---

## 4. Deploy

```bash
npx wrangler deploy
```

You'll get a public URL like:

```
https://gigabank-api.<your-subdomain>.workers.dev
```

Sanity check:

```bash
curl https://gigabank-api.<your-subdomain>.workers.dev/health
# → {"ok":true,"service":"gigabank-api","message":"alive 🎉"}
```

---

## 5. Tell the frontend about it

Edit `../assets/js/auth.js` and point it at the new Worker URL **instead of** the Apps Script URL. (We'll do this in the next phase — the front-end change is its own PR-sized chunk and intentionally not bundled into this scaffolding.)

---

## 6. Day‑to‑day commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the Worker locally on `http://localhost:8787` |
| `npm run deploy` | Push current code to production |
| `npm run tail` | Stream live logs from production |
| `npx wrangler secret list` | See which secrets are configured (values stay hidden) |
| `npx wrangler delete` | Tear the whole Worker down |

---

## Endpoints reference

All POST endpoints accept JSON and return JSON.

| Method | Path | Body | Response (success) |
|---|---|---|---|
| GET  | `/health`  | – | `{ok, service, message}` |
| POST | `/login`   | `{email, password}` | `{ok, user, idToken, expiresAt}` |
| POST | `/signup`  | `{name, email, password}` | `{ok, user, idToken, expiresAt}` |
| POST | `/refresh` | `{idToken}` | `{ok, idToken, expiresAt}` |
| POST | `/logout`  | – | `{ok:true}` |

All ID tokens are ES256‑signed and live for **5 minutes**. Refresh well before expiry from the browser.

---

## Troubleshooting

**`Error: Invalid key format` on the very first `/login` call**
→ Your `PRIVATE_KEY` secret is in SEC1 format. Re-run step 1 to convert it to PKCS8, then `wrangler secret put PRIVATE_KEY` again with the new file's contents.

**`Token is invalid or expired` from `/refresh`**
→ The frontend let the token age past 5 minutes. That's expected — drop the user back to the login screen.

**CORS errors in the browser console**
→ Add your origin to `ALLOWED_ORIGINS` in `src/index.js` and redeploy.

**Apps Script returns HTML, not JSON**
→ The script threw an uncaught error. Open the Apps Script editor → Executions tab → look at the failed run.
