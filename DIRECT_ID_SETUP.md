# Glia Direct ID test setup

Megaganky Lab uses Glia Direct ID only to identify the supplied fictional
visitor during integration testing.

## Request flow

1. `login.html` sends the supplied test identity to the Cloudflare Worker.
2. The Worker asks a private Google Apps Script adapter to validate it.
3. On success, the Worker signs a short-lived ES256 identity token.
4. `assets/js/auth.js` stores the token locally and refreshes it before expiry.
5. `window.getGliaContext()` exposes the valid token to Glia.
6. Logout removes both the local profile and token.

## Public API surface

- `GET /health` — liveness check
- `POST /login` — validate the supplied fictional identity
- `POST /refresh` — rotate a still-valid identity token
- `POST /logout` — acknowledge logout; browser state is cleared locally

There is intentionally no public registration endpoint.

## Secrets

The Worker requires these encrypted Cloudflare secrets:

- `PRIVATE_KEY` — PKCS8 ES256 signing key
- `PUBLIC_KEY` — SPKI ES256 verification key
- `SHEETS_API_URL` — private Apps Script adapter URL

Never commit keys, API URLs, or real user data. The repository ignores PEM,
key, environment, and Wrangler local-state files.

## Deployment

Authenticate Wrangler, then deploy from `worker/`:

```bash
npx wrangler deploy --keep-vars
```

After deployment, verify login, refresh, logout, and Glia identification with
the supplied fictional identity. Never test with credentials from another
service.
