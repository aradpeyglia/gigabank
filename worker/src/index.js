/* =========================================================================
   index.js — Gigabank API Worker entry point
   -------------------------------------------------------------------------
   Routes requests to per-endpoint handlers. The shape of this file is the
   "Module Worker" format Cloudflare prefers:
       export default { async fetch(request, env, ctx) { ... } }

   `env` carries our secrets + vars:
     env.PRIVATE_KEY       — PKCS8 PEM, set via `wrangler secret put`
     env.PUBLIC_KEY        — SPKI PEM,  set via `wrangler secret put`
     env.SHEETS_API_URL    — Apps Script Web App URL, also a secret

   Endpoints:
     GET  /health   → liveness ping (no auth)
     POST /login    → { email, password } → { ok, user, idToken, expiresAt }
     POST /signup   → { name, email, password } → same as /login
     POST /refresh  → { idToken } → { ok, idToken, expiresAt }
     POST /logout   → no-op success (placeholder for future cookie clear)
   ========================================================================= */

import { signES256Jwt, verifyES256Jwt } from './jwt.js';
import { callSheetsAction } from './sheets.js';


/* ---------------------------------------------------------------- CONFIG */

// How long a freshly-issued ID token is valid for, in seconds. Glia
// recommends keeping this short (5 minutes max). The frontend's refresh
// loop will quietly rotate it before it expires.
const TOKEN_TTL_SECONDS = 300;

// Origins allowed to call this API. We pin to the GitHub Pages domain in
// production plus a couple of localhost ports for local dev. Never use
// `*` here — that would let any site on the internet mint tokens.
const ALLOWED_ORIGINS = [
  'https://aradpeyglia.github.io',
  'http://localhost:8000',
  'http://localhost:8765',
  // wrangler dev defaults to this:
  'http://localhost:8787',
];


/* ---------------------------------------------------------------- CORS */

/** Build the CORS headers for this specific request's Origin. */
function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  // Echo back the origin only if it's on the allow-list; otherwise echo
  // the first allow-list entry (which a stray request can't usefully use).
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',         // cache the preflight for a day
    'Vary': 'Origin',                          // tell caches the response depends on Origin
  };
}

/** Shortcut: JSON response with proper CORS + status. */
function json(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request),
    },
  });
}


/* ---------------------------------------------------------------- TOKEN MINTER */

/**
 * Build a Direct ID JWT payload from a "user" object (as returned by the
 * Apps Script) and sign it. Returns { idToken, expiresAt }.
 *
 * The claim set follows Glia's Direct ID spec:
 *   sub         — stable visitor ID (we use email)
 *   iat         — issued-at, seconds since epoch
 *   exp         — expires-at, seconds since epoch
 *   name        — full display name (shown in operator's Visitor Panel)
 *   given_name  — first name
 *   family_name — surname
 *   email       — email address (also goes into Visitor Panel)
 *   lookup_id   — id Glia uses to merge anonymous + identified visitors
 */
async function mintToken(user, env) {
  const now = Math.floor(Date.now() / 1000);
  const nameParts = String(user.name || '').trim().split(/\s+/);

  const payload = {
    sub:         user.email,
    iat:         now,
    exp:         now + TOKEN_TTL_SECONDS,
    name:        user.name,
    given_name:  nameParts[0] || '',
    family_name: nameParts.slice(1).join(' '),
    email:       user.email,
    lookup_id:   user.email,
  };

  const idToken = await signES256Jwt(payload, env.PRIVATE_KEY);
  return { idToken, expiresAt: payload.exp };
}


/* ---------------------------------------------------------------- HANDLERS */

/** POST /login — validate credentials in the Sheet, mint a token on success. */
async function handleLogin(request, env) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return json({ ok: false, error: 'Email and password are required.' }, 400, request);
  }

  const result = await callSheetsAction(env.SHEETS_API_URL, 'login', { email, password });
  if (!result.ok) {
    // 401 because the failure is auth-related (wrong creds)
    return json(result, 401, request);
  }

  const { idToken, expiresAt } = await mintToken(result.user, env);
  return json({ ok: true, user: result.user, idToken, expiresAt }, 200, request);
}


/** POST /signup — create a new user in the Sheet, auto-login on success. */
async function handleSignup(request, env) {
  const { name, email, password } = await request.json();
  if (!name || !email || !password) {
    return json({ ok: false, error: 'Name, email, and password are required.' }, 400, request);
  }

  const result = await callSheetsAction(env.SHEETS_API_URL, 'signup', { name, email, password });
  if (!result.ok) {
    // 400 because duplicate-email is the typical failure (user error)
    return json(result, 400, request);
  }

  const { idToken, expiresAt } = await mintToken(result.user, env);
  return json({ ok: true, user: result.user, idToken, expiresAt }, 200, request);
}


/**
 * POST /refresh — given a still-valid JWT, verify it and issue a fresh one
 * with the same identity claims and a new 5-min lifetime.
 *
 * Importantly we DON'T re-query the sheet — the existing token's payload
 * is our source of truth. If the token is expired or tampered with we
 * reject; the client must then log in again from scratch.
 */
async function handleRefresh(request, env) {
  const { idToken: currentToken } = await request.json();
  if (!currentToken) {
    return json({ ok: false, error: 'idToken is required.' }, 400, request);
  }

  let payload;
  try {
    payload = await verifyES256Jwt(currentToken, env.PUBLIC_KEY);
  } catch (err) {
    return json({ ok: false, error: 'Token is invalid or expired.' }, 401, request);
  }

  // Reconstruct a user object from the existing claims so mintToken can
  // re-issue with the same identity.
  const user = { name: payload.name, email: payload.email };
  const { idToken: newToken, expiresAt } = await mintToken(user, env);
  return json({ ok: true, idToken: newToken, expiresAt }, 200, request);
}


/* ---------------------------------------------------------------- ROUTER */

export default {
  async fetch(request, env) {
    // CORS preflight — browsers send OPTIONS before any cross-origin POST
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);

    // We wrap everything in try/catch so any unhandled error becomes a
    // clean 500 JSON response instead of a cryptic "Error 1101"-style page.
    try {
      switch (url.pathname) {
        case '/health':
          return json(
            { ok: true, service: 'gigabank-api', message: 'alive 🎉' },
            200,
            request
          );

        case '/login':
          if (request.method !== 'POST') return methodNotAllowed(request);
          return await handleLogin(request, env);

        case '/signup':
          if (request.method !== 'POST') return methodNotAllowed(request);
          return await handleSignup(request, env);

        case '/refresh':
          if (request.method !== 'POST') return methodNotAllowed(request);
          return await handleRefresh(request, env);

        case '/logout':
          // No-op for now since we're not using server-side sessions or
          // cookies — the client just throws away its in-memory token.
          // Returning 200 unconditionally avoids leaking auth state.
          return json({ ok: true }, 200, request);

        default:
          return json({ ok: false, error: 'Not found' }, 404, request);
      }
    } catch (err) {
      // Log to wrangler tail for debugging; don't leak details to the client
      console.error('Unhandled worker error:', err);
      return json({ ok: false, error: 'Internal server error.' }, 500, request);
    }
  },
};

function methodNotAllowed(request) {
  return json({ ok: false, error: 'Method not allowed.' }, 405, request);
}
