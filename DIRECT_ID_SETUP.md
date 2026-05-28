# Direct ID Authentication Setup — Collaboration Plan

This doc tracks the work to wire **Glia Direct ID** into Ahoura's
Megagankybank. Direct ID lets Glia know which visitor on our site is
authenticated, by verifying a short-lived ES256-signed JWT we hand it.

---

## TL;DR of how Direct ID works

```
[browser]                [our backend]           [Glia]
   │                          │                    │
   ├─ POST /login ───────────▶│                    │
   │                          ├─ verify in Sheet   │
   │                          ├─ mint ES256 JWT    │
   │◀─ JWT (cookie or body) ──┤                    │
   │                                               │
   ├─ window.getGliaContext = () => ({ idToken })  │
   │                                               │
   ├─ Glia script reads context, sends JWT ───────▶│
   │                                               ├─ verify w/ our public key
   │                                               ├─ link visitor by `sub`
```

---

## Architectural shift required

Our current site is:

- Static HTML/CSS/JS on GitHub Pages
- Google Apps Script as a thin "API" backed by a Google Sheet

That won't work for Direct ID because:

- **The private key can never reach the browser.** Anyone who can read
  it can impersonate any user. This kills any client-side-only approach.
- **Google Apps Script doesn't natively support ES256 (ECDSA P-256).**
  It has RSA signing utilities (`Utilities.computeRsaSha256Signature`)
  but not the elliptic-curve algorithm Glia requires.

So we need a third piece of infrastructure: a **JWT-signing backend**
running on a platform that has ECDSA-P-256 in its crypto library.

---

## Why Cloudflare Workers

The recommended platform for this project is **Cloudflare Workers**.

| Feature | Why it matters here |
|---|---|
| Free tier: 100K req/day | We'll use ~50/day for a demo |
| `crypto.subtle` with ES256 native | No external JWT library needed |
| Zero cold start | Snappy login UX |
| `wrangler secret put PRIVATE_KEY` | Keeps the key out of code & git |
| Built-in CORS handling | Easy to allow our GitHub Pages origin |
| Free `*.workers.dev` subdomain | No domain purchase needed |
| Deploys in seconds | Fast iteration |

The whole thing should fit comfortably in the free tier indefinitely.

---

## Decisions to lock in before we start

| # | Decision | Default / proposal | Notes |
|---|---|---|---|
| 1 | Signing backend platform | **Cloudflare Workers** | This doc assumes this choice |
| 2 | User storage | **Keep Google Sheet** | Worker calls the existing Apps Script to validate creds |
| 3 | Token transport | **Response body** (in-memory on client) | Simpler than cookies; no extra CORS pain |
| 4 | Token TTL | **5 minutes** | Glia's recommended max |
| 5 | Worker subdomain | _TBD — your CF account name_ | e.g. `gigabank.aradpey.workers.dev` |

If you want to override any default, say so before Phase 3.

---

## Phased plan

### Phase 0 — Prep & decisions (you)

- [ ] Confirm the 5 decisions above (or pick alternatives)
- [ ] Confirm you have a Glia Hub account with admin access
- [ ] Sign up for a free Cloudflare account at https://dash.cloudflare.com/sign-up

### Phase 1 — Generate the ES256 key pair (you, locally)

Run these on your machine. Never commit these files. The extra `pkcs8`
step is required because Web Crypto in the Worker only accepts the
PKCS8 format — the default `ecparam` output is the older SEC1 format
and would fail to import at runtime.

```bash
openssl ecparam -genkey -name prime256v1 -out private-sec1.pem
openssl pkcs8   -topk8 -nocrypt -in private-sec1.pem -out private.pem
openssl ec      -in private.pem -pubout -out public.pem
rm private-sec1.pem
```

Then:

- [x] Add `*.pem` patterns to `.gitignore` (done)
- [ ] Save both files somewhere outside the repo (password manager,
      `~/.glia-keys/`, etc.) — you'll need them again for re-deploys
      and for the Glia Hub paste

### Phase 2 — Register the public key in Glia Hub (you)

1. Admin Console → **Integrations → Authentication → Add Authentication Provider**
2. **Type**: Direct ID Token
3. **Fetch Keys Automatically**: No
4. **JWT Verification Key 1**: paste the contents of `public.pem`
5. **Save**, then attach the provider to your playground site

Confirm:

- [ ] Provider shows as "Active" in Glia Hub
- [ ] Provider is attached to the site

### Phase 3 — Stand up the signing backend (collaborative)

The `worker/` directory is now scaffolded with:

- `worker/wrangler.toml` — config (name, entry point, compatibility date)
- `worker/package.json` — Wrangler dev dep + handy npm scripts
- `worker/src/index.js` — request router (`/health`, `/login`, `/signup`,
  `/refresh`, `/logout`) with CORS preflight and structured error handling
- `worker/src/jwt.js` — ES256 sign + verify via `crypto.subtle`, no libs
- `worker/src/sheets.js` — wrapper that POSTs to the existing Apps Script
- `worker/README.md` — step-by-step deploy guide

Claim mapping inside `mintToken()` already produces a Direct ID payload
with `sub`, `iat`, `exp` (TTL = 5 min), `name`, `given_name`,
`family_name`, `email`, and `lookup_id` — all per Glia's spec.

**You do** (full walkthrough in `worker/README.md`):

1. `cd worker && npm install`
2. `npx wrangler secret put PRIVATE_KEY`  — paste your PKCS8 `private.pem`
3. `npx wrangler secret put PUBLIC_KEY`   — paste your `public.pem`
4. `npx wrangler secret put SHEETS_API_URL` — paste the Apps Script URL
5. `npx wrangler deploy`  →  capture the `*.workers.dev` URL
6. Smoke test:
   ```bash
   curl https://YOUR-WORKER.workers.dev/health
   curl -X POST https://YOUR-WORKER.workers.dev/login \
     -H "Content-Type: application/json" \
     -d '{"email":"demo@megagankybank.com","password":"demo1234"}'
   ```
   You should see `{ ok: true, user: {...}, idToken: "eyJ...", expiresAt: ... }`.

Phase 3 done when:

- [ ] Worker URL captured: `https://_____.workers.dev`
- [ ] `/health` returns 200
- [ ] curl `/login` returns a valid JWT

### Phase 4 — Update frontend auth flow (me)

- [ ] Add a new `WORKER_API_URL` constant to `assets/js/auth.js`
- [ ] Change `login()` and `signup()` to POST to the Worker instead of
      Apps Script directly
- [ ] On success the Worker returns `{ ok, user, idToken, expiresAt }`:
  - `user` keeps going into localStorage (so the nav personalization
    still works)
  - `idToken` + `expiresAt` go into a **non-persistent in-memory
    variable** — they should be lost on page refresh and re-fetched
- [ ] Expose `MGBAuth.getIdToken()` so other code can read it

### Phase 5 — Glia integration script (me + you)

**You:** copy the Glia site integration script tag from your Glia site
config (it'll look like `<script src="https://api.glia.com/site/.../glia.js"></script>`).

**I:**

- [ ] Add the script tag to every public HTML page + the dashboard
- [ ] Define `window.getGliaContext` **before** the Glia script loads,
      so it's ready when Glia polls:
  ```js
  window.getGliaContext = () => {
    const idToken = window.MGBAuth?.getIdToken?.();
    return idToken ? { idToken } : {};
  };
  ```

Phase 5 done when:

- [ ] Open the site with a Glia operator logged in
- [ ] Confirm the visitor shows as **identified** in the Visitor Panel
      with their name/email after they log in

### Phase 6 — Token refresh loop (me)

The 5-min `exp` means we need to refresh silently in the background or
the visitor will drop back to anonymous after 5 minutes idle.

- [ ] Add `refreshIdToken()` to `auth.js` — calls the Worker's
      `/refresh` endpoint, which validates the current token and
      issues a new one
- [ ] After each successful login/refresh, schedule the next refresh at
      `expiresAt - 60s` using `setTimeout`
- [ ] On refresh failure (e.g., Worker error or rejected token),
      force-logout the user with a friendly toast

### Phase 7 — Logout (me)

- [ ] Sign-out button calls Worker `/logout` (mostly symbolic since
      we're not using cookies — it's a no-op on the server)
- [ ] Clear in-memory `idToken` + `expiresAt`
- [ ] Clear the localStorage session as before
- [ ] Glia detects `getGliaContext()` no longer returns `idToken` and
      ends the authenticated session

### Phase 8 — End-to-end test (collaborative)

- [ ] Log in → verify a "Hi, [name]" chip appears in our nav AND the
      Glia Visitor Panel shows an identified visitor
- [ ] Wait 6+ minutes with the tab open → confirm refresh worked and
      visitor stays identified
- [ ] Log out → confirm visitor drops back to anonymous in the panel
- [ ] Sign up a brand-new user → confirm same flow works
- [ ] Open in incognito → confirm we haven't accidentally persisted
      the JWT anywhere

---

## Open questions (we can revisit later)

- **Token storage**: an `HttpOnly; Secure; SameSite=Strict` cookie is the
  textbook safe choice, but adds CORS complexity. For a personal demo,
  an in-memory variable on the JS side is acceptable and simpler — and
  what this plan assumes.
- **CORS**: the Worker will need
  `Access-Control-Allow-Origin: https://aradpeyglia.github.io` (and
  `http://localhost:8000` for local dev). I'll set this up in Phase 3.
- **JWE encryption** of the JWT payload: skipping for v1 per Glia's
  docs.
- **`access_token` claim**: skipping for v1.
- **Password hashing in the Sheet**: still plain-text. Not specific to
  Direct ID, but worth fixing before we ever onboard real users.

---

## Reference materials

- Glia's official Ruby/Sinatra reference: the `test-app` repo in the
  Glia org. The key files are:
  - `lib/id_token.rb` — JWT minting with ES256, cookie set/unset
  - `views/login.slim` — login form fields
  - `app.rb:154-199` — `/login`, `/logout`, `/refresh_id_token` routes
  - `assets/javascripts/views/login/auth-handler.js` — refresh loop
  - `private-key-es256.pem` / `public-key-es256.pem` — committed
    test-only key pair (do NOT reuse for production)
- Glia docs portal: **"Implementing Direct ID Authentication"** how-to

---

## Security checklist — must all be ✅ before considering this "done"

- [ ] `private.pem` never committed to git
- [ ] Private key only in Cloudflare secret, never in code
- [ ] All endpoints enforce HTTPS (Workers do this by default)
- [ ] CORS allow-list pinned to actual prod + localhost (no `*`)
- [ ] Token TTL ≤ 5 minutes
- [ ] Refresh endpoint requires an existing valid token (rotation, not
      free renewal)
- [ ] Sign-out endpoint always returns 200 (don't leak auth state)
- [ ] Passwords in the Sheet are still plain-text — separate TODO,
      but flag it in the main README

---

## Status

| Phase | Status | Owner | Notes |
|---|---|---|---|
| 0 — Decisions | ✅ done | you | Cloudflare Workers chosen |
| 1 — Generate keys | ✅ done | you | Regenerated after the leak; convert to PKCS8 before uploading |
| 2 — Register in Glia Hub | _todo_ | you | Paste `public.pem` into Hub before Phase 5 |
| 3 — Worker scaffold + deploy | 🟡 in progress | both | Scaffold done — you handle `npm install` → `secret put` → `wrangler deploy` |
| 4 — Frontend auth changes | _todo_ | me | After Phase 3 URL is in hand |
| 5 — Glia script wiring | _todo_ | both | |
| 6 — Refresh loop | _todo_ | me | |
| 7 — Logout | _todo_ | me | |
| 8 — End-to-end test | _todo_ | both | |
