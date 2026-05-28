/* =========================================================================
   AHOURA'S MEGAGANKYBANK — auth.js
   -------------------------------------------------------------------------
   This file handles four things:
     1) Configuration of the Cloudflare Worker URL ("gigabank-api")
     2) Login / signup form submission (POST JSON to the Worker)
     3) Session helpers used by dashboard.js + nav
     4) ID-token lifecycle: storage, automatic refresh, logout

   How auth works now (post-Direct-ID rewrite):

       browser ── POST /login {email,password} ──▶ Worker
                                                    │
                                                    ├─ verify in Sheet
                                                    ├─ mint ES256 JWT
                                                    ▼
       browser ◀── {user, idToken, expiresAt} ────  Worker

     • `user` is stashed in localStorage so the nav stays personalized.
     • `idToken` + `expiresAt` are stashed in localStorage too so a quick
       page navigation (login → dashboard) doesn't lose them. The TTL is
       only ~5 minutes anyway, so the blast radius if it ever leaks is
       tiny — and the next refresh tick can detect a stolen token because
       the legitimate session would also keep refreshing.
     • A timer is scheduled to call /refresh ~60s before expiry; if the
       refresh fails we force-logout the user.

   The README has step-by-step instructions for the Worker deploy + Sheet
   + Apps Script.
   ========================================================================= */


/* =========================================================================
   CONFIG — the deployed Worker URL. Empty string falls back to demo mode.
   ========================================================================= */
const WORKER_API_URL = 'https://gigabank-api.ahoura-radpey.workers.dev';

/* If WORKER_API_URL is left empty we fall back to a built-in DEMO mode so
   the site still "works" without any backend. The demo credentials below
   are used in that case. Demo mode does NOT issue real JWTs, which means
   Glia won't see the visitor as identified — that's expected, demo is
   purely for visual / UX testing of the rest of the site.                 */
const DEMO_USERS = [
  {
    email: 'demo@megagankybank.com',
    password: 'demo1234',
    name: 'Ahoura Radpey',
    accountId: 'MGB-0001-DEMO',
    balance: 42819.55,
  },
  {
    email: 'jane@megagankybank.com',
    password: 'password',
    name: 'Jane Doe',
    accountId: 'MGB-0002-DEMO',
    balance: 18250.10,
  },
];


/* =========================================================================
   SESSION HELPERS — small wrappers around localStorage
   We use localStorage (NOT cookies) because GitHub Pages is static and we
   don't have server-side sessions. The Worker is stateless; localStorage
   carries everything the next page needs.
   ========================================================================= */
const SESSION_KEY = 'mgb_session';   // user profile (name, email, etc.)
const TOKEN_KEY   = 'mgb_id_token';  // { idToken, expiresAt } JSON

function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  // Wiping the session always wipes the token too — they're co-issued.
  clearIdToken();
}


/* =========================================================================
   ID-TOKEN HELPERS — store, fetch, expire
   Stored as JSON in its own key so we can update it independently of the
   user profile (e.g. on /refresh).
   ========================================================================= */
function saveIdToken(idToken, expiresAt) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ idToken, expiresAt }));
  scheduleRefresh(expiresAt);
}

function readStoredToken() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY));
  } catch {
    return null;
  }
}

/**
 * Return the current ID token IF it's still valid (with a small safety
 * margin so we don't hand Glia a token that's about to expire mid-flight).
 * Returns null otherwise — caller can treat that as "anonymous".
 */
function getIdToken() {
  const stored = readStoredToken();
  if (!stored) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  // 10s safety buffer
  if (stored.expiresAt && stored.expiresAt - 10 < nowSec) return null;
  return stored.idToken;
}

function clearIdToken() {
  localStorage.removeItem(TOKEN_KEY);
  cancelRefresh();
}


/* =========================================================================
   REFRESH LOOP — keep the token alive while the user is active
   We use a single window-scoped setTimeout handle so re-scheduling is
   trivial. Refresh fires at (expiresAt - 60s) so we always have plenty
   of margin even if the request itself takes a couple of seconds.
   ========================================================================= */
let refreshTimerId = null;

function cancelRefresh() {
  if (refreshTimerId !== null) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }
}

function scheduleRefresh(expiresAt) {
  cancelRefresh();
  const nowSec = Math.floor(Date.now() / 1000);
  const secondsUntilRefresh = Math.max(5, expiresAt - nowSec - 60);
  refreshTimerId = setTimeout(refreshIdToken, secondsUntilRefresh * 1000);
}

async function refreshIdToken() {
  if (!isWorkerConfigured()) return;
  const stored = readStoredToken();
  if (!stored?.idToken) return;

  try {
    const res = await fetch(WORKER_API_URL + '/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: stored.idToken }),
    });
    const data = await res.json();
    if (res.ok && data.ok && data.idToken) {
      saveIdToken(data.idToken, data.expiresAt);
    } else {
      // The Worker rejected the refresh (likely expired). Force re-login.
      forceLogout('Your session has expired. Please sign in again.');
    }
  } catch (err) {
    // Network blip — try once more in a bit instead of nuking the session.
    console.warn('Refresh failed transiently, will retry:', err);
    refreshTimerId = setTimeout(refreshIdToken, 30_000);
  }
}

function forceLogout(message) {
  clearSession();
  if (message && typeof window.toast === 'function') {
    window.toast(message, 'error');
  }
  // Only kick to login if we're not already there
  if (!/login\.html$/i.test(window.location.pathname)) {
    setTimeout(() => { window.location.href = 'login.html'; }, 600);
  }
}


/* =========================================================================
   isWorkerConfigured — true once WORKER_API_URL points at a real Worker.
   ========================================================================= */
function isWorkerConfigured() {
  return WORKER_API_URL && /^https:\/\/.+\.workers\.dev/i.test(WORKER_API_URL);
}


/* =========================================================================
   PUBLIC SURFACE — exposed so dashboard.js, main.js, and Glia integration
   can use them without reaching into module internals.
   ========================================================================= */
window.MGBAuth = {
  getSession,
  saveSession,
  clearSession,
  getIdToken,
  refreshIdToken,
  logout: () => logout(),
};


/* =========================================================================
   LOGIN — talk to the Worker (or fall back to demo)
   ========================================================================= */
async function login(email, password) {
  if (!isWorkerConfigured()) {
    return demoLogin(email, password);
  }

  try {
    // The Worker accepts JSON. Browsers send a CORS preflight for JSON
    // bodies; the Worker handles OPTIONS and the matching CORS headers.
    const res = await fetch(WORKER_API_URL + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Login request failed:', err);
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

function demoLogin(email, password) {
  // Simulate a small async delay so the spinner shows up
  return new Promise((resolve) => {
    setTimeout(() => {
      const user = DEMO_USERS.find(
        (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
      );
      if (user) {
        // Strip the password before storing in session — never persist it
        const { password: _pw, ...safe } = user;
        resolve({ ok: true, user: safe });   // no idToken in demo mode
      } else {
        resolve({ ok: false, error: 'Invalid email or password.' });
      }
    }, 700);
  });
}


/* =========================================================================
   SIGNUP — POST {name,email,password} to the Worker's /signup
   ========================================================================= */
async function signup(name, email, password) {
  if (!isWorkerConfigured()) {
    return demoSignup(name, email, password);
  }

  try {
    const res = await fetch(WORKER_API_URL + '/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Signup request failed:', err);
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

function demoSignup(name, email, password) {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Reject duplicates so the UX matches the real backend
      const exists = DEMO_USERS.some(
        (u) => u.email.toLowerCase() === email.toLowerCase()
      );
      if (exists) {
        resolve({ ok: false, error: 'An account with that email already exists.' });
        return;
      }
      // Auto-generate a new account ID in the MGB-XXXX format
      const newId = 'MGB-' + String(DEMO_USERS.length + 1).padStart(4, '0') + '-DEMO';
      const newUser = { name, email, accountId: newId, balance: 0 };
      DEMO_USERS.push({ ...newUser, password });   // remember in-memory
      resolve({ ok: true, user: newUser });
    }, 700);
  });
}


/* =========================================================================
   LOGOUT — best-effort hit to /logout (it's a no-op server-side today,
   but we keep the call so future cookie clearing has somewhere to live)
   then wipe local state and bounce to the login page.
   ========================================================================= */
async function logout() {
  if (isWorkerConfigured()) {
    try {
      await fetch(WORKER_API_URL + '/logout', { method: 'POST' });
    } catch {
      // Ignore — we still want to log out locally regardless
    }
  }
  clearSession();
  window.location.href = 'login.html';
}


/* =========================================================================
   FORM WIRING — only runs if a #login-form exists on the current page
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  if (!form) return;

  const emailInput = form.querySelector('[name="email"]');
  const passwordInput = form.querySelector('[name="password"]');
  const submitBtn = form.querySelector('[type="submit"]');
  const errorBox = form.querySelector('.form-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.remove('show');
    errorBox.textContent = '';

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    // Front-end validation — quick & cheap
    if (!email || !password) {
      errorBox.textContent = 'Please fill in both fields.';
      errorBox.classList.add('show');
      return;
    }

    // Disable button + show spinner so user knows something is happening
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Signing in…';

    const result = await login(email, password);

    if (result.ok) {
      saveSession(result.user);
      // Store the freshly minted JWT so Glia can pick it up via
      // getGliaContext() on the next page. Demo mode returns no token.
      if (result.idToken && result.expiresAt) {
        saveIdToken(result.idToken, result.expiresAt);
      }
      window.toast(`Welcome back, ${result.user.name}!`, 'success');
      // Slight delay so the toast is visible before redirect
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 700);
    } else {
      errorBox.textContent = result.error || 'Login failed.';
      errorBox.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  // Quick "fill demo creds" button if present
  const demoBtn = document.getElementById('fill-demo');
  if (demoBtn) {
    demoBtn.addEventListener('click', () => {
      emailInput.value = DEMO_USERS[0].email;
      passwordInput.value = DEMO_USERS[0].password;
      window.toast('Demo credentials filled in.', '');
    });
  }
});


/* =========================================================================
   AUTH VIEW TOGGLE — flip between #auth-view-login and #auth-view-signup
   when the user clicks an .auth-toggle link. Two separate forms keep
   their own state cleanly without us having to micro-manage attributes.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const loginView  = document.getElementById('auth-view-login');
  const signupView = document.getElementById('auth-view-signup');
  if (!loginView || !signupView) return;

  document.querySelectorAll('.auth-toggle').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const wantSignup = link.dataset.view === 'signup';
      loginView.classList.toggle('hidden', wantSignup);
      signupView.classList.toggle('hidden', !wantSignup);

      // Update the page title for a polished touch
      document.title = (wantSignup ? 'Create account' : 'Sign In')
        + " — Ahoura's Megagankybank";
    });
  });
});


/* =========================================================================
   SIGNUP FORM WIRING — only runs if a #signup-form exists on the page.
   On success we save the session and redirect straight to the dashboard
   (auto-login UX — saves the new user a second step).
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('signup-form');
  if (!form) return;

  const nameInput     = form.querySelector('[name="name"]');
  const emailInput    = form.querySelector('[name="email"]');
  const passwordInput = form.querySelector('[name="password"]');
  const confirmInput  = form.querySelector('[name="confirm"]');
  const termsInput    = form.querySelector('[name="terms"]');
  const submitBtn     = form.querySelector('[type="submit"]');
  const errorBox      = form.querySelector('.form-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.remove('show');
    errorBox.textContent = '';

    // Pull values for validation
    const name     = nameInput.value.trim();
    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    const confirm  = confirmInput.value;

    // Lightweight client-side validation — accumulate errors first, then
    // show the first one (clearer UX than throwing one at a time).
    const errors = [];
    if (!name) errors.push('Please enter your full name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('Please enter a valid email address.');
    if (password.length < 6) errors.push('Password must be at least 6 characters.');
    if (password !== confirm) errors.push("Passwords don't match.");
    if (!termsInput.checked) errors.push('Please agree to the Terms of Service.');

    if (errors.length > 0) {
      errorBox.textContent = errors[0];
      errorBox.classList.add('show');
      return;
    }

    // Disable button + show spinner during the network call
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Creating account…';

    const result = await signup(name, email, password);

    if (result.ok) {
      // Auto-login the freshly created user
      saveSession(result.user);
      if (result.idToken && result.expiresAt) {
        saveIdToken(result.idToken, result.expiresAt);
      }
      window.toast(`Welcome aboard, ${result.user.name.split(' ')[0]}!`, 'success');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 900);
    } else {
      errorBox.textContent = result.error || 'Signup failed.';
      errorBox.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
});


/* =========================================================================
   BOOTSTRAP — runs once per page load:
   if we have a still-valid token, schedule its refresh; if we have a
   session but the token already expired, kick off a refresh immediately
   to try to recover it.
   ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const stored = readStoredToken();
  if (!stored) return;
  const nowSec = Math.floor(Date.now() / 1000);
  if (stored.expiresAt > nowSec) {
    scheduleRefresh(stored.expiresAt);
  } else {
    // Token expired while the tab was closed — try once to recover. If
    // the Worker rejects (because it really is past exp), we'll log out.
    refreshIdToken();
  }
});


/* =========================================================================
   GLIA DIRECT ID — window.getGliaContext is defined as a tiny inline
   <script> in the <head> of every HTML page (see e.g. index.html) so the
   async Glia integration script can read the token on its very first
   poll, even before this file has parsed. We deliberately DON'T redefine
   it here, so there's a single source of truth for that function.
   ========================================================================= */
