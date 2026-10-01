/* =========================================================================
   MEGAGANKY LAB — TEST-ONLY AUTHENTICATION
   -------------------------------------------------------------------------
   This file deliberately supports LOGIN ONLY. Public registration
   code was removed to keep the sandbox from accepting arbitrary identities.
   The existing Worker, Sheet validation, token refresh, and Glia Direct ID
   behavior remain intact for the single supplied fictional test identity.
   ========================================================================= */

/* Existing Worker endpoint retained so the established integration keeps
   working. Its legacy hostname is infrastructure, not public-facing copy. */
const WORKER_API_URL = 'https://gigabank-api.ahoura-radpey.workers.dev';

/* The only identity presented by the public interface. */
const DEMO_USER = {
  email: 'demo@megaganky-lab.test',
  password: 'demo1234',
  name: 'Ahoura Demo',
};

/* Separate keys let profile and short-lived token refresh independently. */
const SESSION_KEY = 'mgb_session';
const TOKEN_KEY = 'mgb_id_token';
let refreshTimerId = null;

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

function readStoredToken() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY));
  } catch {
    return null;
  }
}

function cancelRefresh() {
  if (refreshTimerId !== null) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }
}

function clearIdToken() {
  localStorage.removeItem(TOKEN_KEY);
  cancelRefresh();
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  clearIdToken();
}

function getIdToken() {
  const stored = readStoredToken();
  if (!stored) return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return stored.expiresAt - 10 > nowSeconds ? stored.idToken : null;
}

function scheduleRefresh(expiresAt) {
  cancelRefresh();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const delaySeconds = Math.max(5, expiresAt - nowSeconds - 60);
  refreshTimerId = setTimeout(refreshIdToken, delaySeconds * 1000);
}

function saveIdToken(idToken, expiresAt) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ idToken, expiresAt }));
  scheduleRefresh(expiresAt);
}

function isWorkerConfigured() {
  return /^https:\/\/.+\.workers\.dev/i.test(WORKER_API_URL);
}

async function refreshIdToken() {
  const stored = readStoredToken();
  if (!isWorkerConfigured() || !stored?.idToken) return;

  try {
    const response = await fetch(WORKER_API_URL + '/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: stored.idToken }),
    });
    const result = await response.json();
    if (response.ok && result.ok && result.idToken) {
      saveIdToken(result.idToken, result.expiresAt);
      return;
    }
    forceLogout('The demo session expired. Please restart the test.');
  } catch (error) {
    console.warn('Token refresh failed; retrying in 30 seconds.', error);
    refreshTimerId = setTimeout(refreshIdToken, 30_000);
  }
}

function forceLogout(message) {
  clearSession();
  if (message && typeof window.toast === 'function') window.toast(message, 'error');
  if (!/login\.html$/i.test(window.location.pathname)) {
    setTimeout(() => { window.location.href = 'login.html'; }, 600);
  }
}

async function login(email, password) {
  try {
    const response = await fetch(WORKER_API_URL + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return await response.json();
  } catch (error) {
    console.error('Demo login request failed:', error);
    return { ok: false, error: 'The test service is unavailable. Please try again.' };
  }
}

async function logout() {
  try {
    await fetch(WORKER_API_URL + '/logout', { method: 'POST' });
  } catch {
    // Local state must still clear if the no-op remote endpoint is unavailable.
  }
  clearSession();
  window.location.href = 'login.html';
}

/* Shared scripts use this small public surface for personalization/logout. */
window.MGBAuth = {
  getSession,
  saveSession,
  clearSession,
  getIdToken,
  refreshIdToken,
  logout,
};

/* Wire the one public test-login form. */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  if (!form) return;

  const emailInput = form.querySelector('[name="email"]');
  const passwordInput = form.querySelector('[name="password"]');
  const submitButton = form.querySelector('[type="submit"]');
  const errorBox = form.querySelector('.form-error');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.remove('show');
    errorBox.textContent = '';

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      errorBox.textContent = 'Fill both demo credential fields.';
      errorBox.classList.add('show');
      return;
    }

    const originalLabel = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner"></span> Starting test…';
    const result = await login(email, password);

    if (result.ok) {
      saveSession(result.user);
      if (result.idToken && result.expiresAt) {
        saveIdToken(result.idToken, result.expiresAt);
      }
      window.toast(`Demo session started for ${result.user.name}.`, 'success');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 700);
      return;
    }

    errorBox.textContent = result.error || 'The supplied demo credentials were rejected.';
    errorBox.classList.add('show');
    submitButton.disabled = false;
    submitButton.innerHTML = originalLabel;
  });

  const fillButton = document.getElementById('fill-demo');
  fillButton?.addEventListener('click', () => {
    emailInput.value = DEMO_USER.email;
    passwordInput.value = DEMO_USER.password;
    window.toast('Supplied fictional credentials filled in.', '');
  });
});

/* Resume refresh scheduling after ordinary page navigation. */
document.addEventListener('DOMContentLoaded', () => {
  const stored = readStoredToken();
  if (!stored) return;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (stored.expiresAt > nowSeconds) scheduleRefresh(stored.expiresAt);
  else refreshIdToken();
});
