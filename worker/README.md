# Megaganky Lab authentication Worker

This Cloudflare Worker validates one supplied fictional identity and issues
short-lived ES256 JWTs for Glia Direct ID testing.

## Endpoints

- `GET /health`
- `POST /login`
- `POST /refresh`
- `POST /logout`

Public registration is intentionally unsupported.

## Development

```bash
npm install
npx wrangler deploy --dry-run
```

## Deployment

Authenticate Wrangler and preserve dashboard-managed secrets:

```bash
npx wrangler deploy --keep-vars
```

Required encrypted secrets are `PRIVATE_KEY`, `PUBLIC_KEY`, and
`SHEETS_API_URL`. Never place their values in tracked files or command-line
arguments.
