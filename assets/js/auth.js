/* =========================================================================
   AHOURA'S MEGAGANKYBANK — auth.js
   -------------------------------------------------------------------------
   This file handles three things:
     1) Configuration of the Google Apps Script URL used as our "backend"
     2) The login form submission flow (POST to Apps Script, then redirect)
     3) Session helpers used by dashboard.js + nav (logged-in/logout)

   IMPORTANT — How the Google Sheet login works:
     • A Google Apps Script Web App reads a Google Sheet of users.
     • We send {action: 'login', email, password} as a POST request.
     • The Apps Script returns JSON like
         { ok: true, user: { name, email, accountId, balance } }
       or { ok: false, error: 'Invalid credentials' }.
     • On success we stash the user in localStorage and redirect to the
       dashboard. The dashboard reads localStorage to greet them.

   The README has step-by-step instructions for the Sheet + Apps Script.
   ========================================================================= */


/* =========================================================================
   CONFIG — paste your deployed Google Apps Script Web App URL here.
   It will look like:
   https://script.google.com/macros/s/AKfycby.................../exec
   ========================================================================= */
const SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbxPyfej86SXABravRee4_qiPdTVYGSTi2OfGID_xKptiNTHadylIfgHSxvVThKi0CNmOw/exec';

/* If SHEETS_API_URL is left unset we fall back to a built-in DEMO mode so
   the site still "works" on GitHub Pages without any backend. The demo
   credentials below are used in that case.                                  */
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
   don't have server-side sessions. This is fine for a personal demo.
   ========================================================================= */
const SESSION_KEY = 'mgb_session';

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
}

// Expose so dashboard.js can use them
window.MGBAuth = { getSession, clearSession, saveSession };


/* =========================================================================
   isBackendConfigured — true once the user has pasted a real Apps Script
   URL into SHEETS_API_URL. We use it in a few places to decide whether to
   hit the network or fall back to local demo mode.
   ========================================================================= */
function isBackendConfigured() {
  return SHEETS_API_URL && !SHEETS_API_URL.startsWith('PASTE_');
}


/* =========================================================================
   LOGIN — talk to the Apps Script (or fall back to demo)
   ========================================================================= */
async function login(email, password) {
  if (!isBackendConfigured()) {
    return demoLogin(email, password);
  }

  try {
    // Important: Google Apps Script Web Apps require a POST without custom
    // headers for the fetch to avoid a CORS preflight. We send form-encoded
    // data because Apps Script reads it cleanly from e.parameter.
    const formBody = new URLSearchParams();
    formBody.append('action', 'login');
    formBody.append('email', email);
    formBody.append('password', password);

    const res = await fetch(SHEETS_API_URL, {
      method: 'POST',
      body: formBody,
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
        resolve({ ok: true, user: safe });
      } else {
        resolve({ ok: false, error: 'Invalid email or password.' });
      }
    }, 700);
  });
}


/* =========================================================================
   SIGNUP — create a new account. Calls the Apps Script's `signup` action
   which appends a row to the Users sheet and returns the new user record.
   In demo mode it just pushes to the in-memory DEMO_USERS array (which
   resets on page reload — but it's enough to verify the UX).
   ========================================================================= */
async function signup(name, email, password) {
  if (!isBackendConfigured()) {
    return demoSignup(name, email, password);
  }

  try {
    const formBody = new URLSearchParams();
    formBody.append('action', 'signup');
    formBody.append('name', name);
    formBody.append('email', email);
    formBody.append('password', password);

    const res = await fetch(SHEETS_API_URL, {
      method: 'POST',
      body: formBody,
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
